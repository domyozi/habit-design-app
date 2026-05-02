"""
行動候補（Habit / Task suggestions）API

ジャーナル本文から AI が候補を抽出し、ユーザーが採用 / 不要を選択する。
- kind='habit' : 継続的に取り組むルーティン候補（採用 → TodoDefinition section='habit'）
- kind='task'  : 一回限りのショット作業候補（採用 → TodoDefinition section='task'）

エンドポイント:
  GET    /api/habit-suggestions                    → list（status / kind フィルタ可）
  POST   /api/habit-suggestions/extract            → ジャーナルから抽出 → 保存 → 返却
  POST   /api/habit-suggestions                    → 手動追加（label, kind, source='manual'）
  PATCH  /api/habit-suggestions/{id}               → status を accepted/rejected に変更
  DELETE /api/habit-suggestions/{id}               → 削除
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/habit-suggestions")

VALID_KINDS = {"habit", "task"}


@router.get("")
async def list_habit_suggestions(
    status: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    if kind is not None and kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="invalid kind")
    supabase = get_supabase()
    query = (
        supabase.table("habit_suggestions")
        .select("id, label, status, source, source_date, kind, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)
    if kind:
        query = query.eq("kind", kind)
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
    kind = payload.get("kind") or "habit"
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="invalid kind")
    supabase = get_supabase()
    result = (
        supabase.table("habit_suggestions")
        .insert({
            "user_id": user_id,
            "label": label,
            "kind": kind,
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
    ジャーナル本文を受け取り、Claude で習慣 / タスク候補を抽出。
    既存の pending/accepted な候補と重複しないものだけ DB に保存して返却。
    """
    journal_text = (payload.get("journal_text") or "").strip()
    if not journal_text:
        raise HTTPException(status_code=400, detail="journal_text is required")
    source = payload.get("source") or "manual"
    source_date = payload.get("source_date")

    inserted = await _extract_and_persist_suggestions(
        user_id=user_id,
        journal_text=journal_text,
        source=source,
        source_date=source_date,
    )
    return inserted


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


# ─── 内部ヘルパー: 抽出 & 永続化（journal POST のフックからも呼ばれる） ───
async def _extract_and_persist_suggestions(
    user_id: str,
    journal_text: str,
    source: str,
    source_date: Optional[str],
) -> list[dict]:
    """ジャーナル本文を Claude で分析し、新規 habit / task 候補を DB に挿入する。"""
    supabase = get_supabase()

    existing = (
        supabase.table("habit_suggestions")
        .select("label, status")
        .eq("user_id", user_id)
        .in_("status", ["pending", "accepted"])
        .execute()
    )
    existing_labels = {(row["label"] or "").strip().lower() for row in (existing.data or [])}

    candidates = await _ask_claude_for_suggestions(journal_text)

    rows_to_insert = []
    for label, kind in candidates:
        norm = label.strip()
        if not norm or norm.lower() in existing_labels:
            continue
        if kind not in VALID_KINDS:
            kind = "habit"
        existing_labels.add(norm.lower())
        rows_to_insert.append({
            "user_id": user_id,
            "label": norm,
            "kind": kind,
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


# ─── 内部ヘルパー: Claude で候補抽出 ─────────────────────────────
async def _ask_claude_for_suggestions(journal_text: str) -> list[tuple[str, str]]:
    """
    ジャーナル本文から行動候補を最大5つ抽出し、習慣化(habit) / 個別タスク(task) に分類する。
    返り値: [(label, kind), ...]
    """
    from app.services.ai_service import create_message  # type: ignore

    system = (
        "あなたは行動設計コーチです。ユーザーのジャーナル本文を読み、"
        "次の行動に役立ちそうな候補を最大5つ抽出し、それぞれを kind に分類してください。\n\n"
        "分類:\n"
        "- kind='habit' : 毎日や毎朝など、継続的に繰り返すことで価値が出るルーティン行動。"
        "（例: 早起き、瞑想、ストレッチ、英語学習）\n"
        "- kind='task'  : 一回限り、または期限のあるショット作業。"
        "（例: 書類を提出する、◯◯さんに連絡する、見積を作成する）\n\n"
        "次の JSON 形式のみで返してください（説明文不要）：\n"
        "```json\n"
        "{ \"candidates\": [\n"
        "    { \"label\": \"...\", \"kind\": \"habit\" },\n"
        "    { \"label\": \"...\", \"kind\": \"task\" }\n"
        "] }\n"
        "```\n"
        "label は 16 文字以内の簡潔な行動ラベル（動詞含む）。candidates は 0〜5 件。"
    )

    try:
        response_text = await create_message(
            messages=[{"role": "user", "content": f"<journal>\n{journal_text}\n</journal>"}],
            system_prompt=system,
            max_tokens=400,
        )
    except Exception:
        return []

    import json
    import re

    match = re.search(r"```json\s*(\{[\s\S]*?\})\s*```", response_text)
    raw = match.group(1) if match else response_text
    try:
        parsed = json.loads(raw)
        candidates = parsed.get("candidates", [])
    except Exception:
        return []

    out: list[tuple[str, str]] = []
    for c in candidates:
        if isinstance(c, dict):
            label = c.get("label", "")
            kind = c.get("kind", "habit")
            if isinstance(label, str) and label.strip():
                out.append((label, kind if isinstance(kind, str) else "habit"))
        elif isinstance(c, str) and c.strip():
            # 旧フォーマット互換: 文字列のみの場合は habit として扱う
            out.append((c, "habit"))
    return out
