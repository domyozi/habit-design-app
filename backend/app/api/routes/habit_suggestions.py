"""
習慣候補（Habit suggestions）API

ジャーナル本文から AI が習慣化すべき項目を抽出し、ユーザーが採用 / 不要を選択する。
採用された候補は別途フロント側で TodoDefinition に変換される（section='habit'）。

エンドポイント:
  GET    /api/habit-suggestions                    → list（status フィルタ可）
  POST   /api/habit-suggestions/extract            → ジャーナルから抽出 → 保存 → 返却
  POST   /api/habit-suggestions                    → 手動追加（label, source='manual'）
  PATCH  /api/habit-suggestions/{id}               → status を accepted/rejected に変更
  DELETE /api/habit-suggestions/{id}               → 削除
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/habit-suggestions")


@router.get("")
async def list_habit_suggestions(
    status: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    query = (
        supabase.table("habit_suggestions")
        .select("id, label, status, source, source_date, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return result.data or []


@router.post("")
async def create_habit_suggestion(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    label = (payload.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    supabase = get_supabase()
    result = (
        supabase.table("habit_suggestions")
        .insert({
            "user_id": user_id,
            "label": label,
            "source": payload.get("source") or "manual",
            "source_date": payload.get("source_date"),
            "status": "pending",
        })
        .execute()
    )
    return result.data[0] if result.data else None


@router.post("/extract")
async def extract_habit_suggestions(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    """
    ジャーナル本文を受け取り、Claude で習慣候補を抽出。
    既存の pending/accepted な候補と重複しないものだけ DB に保存して返却。
    """
    journal_text = (payload.get("journal_text") or "").strip()
    if not journal_text:
        raise HTTPException(status_code=400, detail="journal_text is required")
    source = payload.get("source") or "manual"
    source_date = payload.get("source_date")

    supabase = get_supabase()

    # 既存の労働 (pending/accepted) ラベル集合を取得して重複排除に使う
    existing = (
        supabase.table("habit_suggestions")
        .select("label, status")
        .eq("user_id", user_id)
        .in_("status", ["pending", "accepted"])
        .execute()
    )
    existing_labels = {(row["label"] or "").strip().lower() for row in (existing.data or [])}

    # Claude で抽出
    candidates = await _ask_claude_for_habits(journal_text)

    # 重複・空文字を除外して挿入
    rows_to_insert = []
    for label in candidates:
        norm = label.strip()
        if not norm or norm.lower() in existing_labels:
            continue
        existing_labels.add(norm.lower())
        rows_to_insert.append({
            "user_id": user_id,
            "label": norm,
            "source": source,
            "source_date": source_date,
            "status": "pending",
        })

    if not rows_to_insert:
        return []

    inserted = (
        supabase.table("habit_suggestions")
        .insert(rows_to_insert)
        .execute()
    )
    return inserted.data or []


@router.patch("/{suggestion_id}")
async def update_habit_suggestion(
    suggestion_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    new_status = payload.get("status")
    if new_status not in {"pending", "accepted", "rejected"}:
        raise HTTPException(status_code=400, detail="invalid status")
    supabase = get_supabase()
    result = (
        supabase.table("habit_suggestions")
        .update({"status": new_status})
        .eq("id", suggestion_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


@router.delete("/{suggestion_id}")
async def delete_habit_suggestion(
    suggestion_id: str,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    (
        supabase.table("habit_suggestions")
        .delete()
        .eq("id", suggestion_id)
        .eq("user_id", user_id)
        .execute()
    )
    return {"ok": True}


# ─── 内部ヘルパー: Claude で候補抽出 ─────────────────────────────
async def _ask_claude_for_habits(journal_text: str) -> list[str]:
    """
    ジャーナル本文から習慣化すべき行動候補を最大3つ抽出する。
    既存の AI コーチ呼び出しと同じ Anthropic Messages API を使用。
    """
    from app.services.ai_service import create_message  # type: ignore

    system = (
        "あなたは習慣設計コーチです。ユーザーのジャーナル本文から、"
        "「継続的に取り組むことで人生にプラスになる」習慣化候補を最大3つ抽出してください。"
        "単発のタスクや一回限りの作業は除外し、繰り返し実行することで意味のある行動だけ選んでください。\n"
        "次のJSON形式のみで返してください（説明文不要）：\n"
        "```json\n"
        "{ \"candidates\": [\"候補1\", \"候補2\"] }\n"
        "```\n"
        "candidates は 0〜3件の配列。各要素は12文字以内の簡潔な行動ラベル（動詞含む）。"
    )

    try:
        response_text = await create_message(
            messages=[{"role": "user", "content": f"<journal>\n{journal_text}\n</journal>"}],
            system_prompt=system,
            max_tokens=300,
        )
    except Exception:
        return []

    # JSON ブロック抽出
    import json
    import re

    match = re.search(r"```json\s*(\{[\s\S]*?\})\s*```", response_text)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(1))
        candidates = parsed.get("candidates", [])
        return [c for c in candidates if isinstance(c, str)]
    except Exception:
        return []
