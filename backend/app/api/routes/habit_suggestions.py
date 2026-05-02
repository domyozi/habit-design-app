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


def _label_overlaps(candidate: str, existing: list[str]) -> bool:
    """
    候補ラベルが既存ラベル群と意味的に重複するかを判定する。
    実装はシンプルな部分文字列の双方向チェック:
    - 既存ラベルが候補に含まれる    （例: '英語学習' ⊂ '英語学習を継続する'）
    - 候補が既存ラベルに含まれる    （例: '英語' ⊂ '英語学習'）
    どちらかの場合に重複とみなす。
    """
    cand = candidate.strip().lower()
    if not cand:
        return False
    for ex in existing:
        ex_norm = (ex or "").strip().lower()
        if not ex_norm:
            continue
        if ex_norm in cand or cand in ex_norm:
            return True
    return False


def _fetch_active_todo_labels(user_id: str, supabase) -> list[str]:
    """ユーザーの有効な todo_definitions ラベルを取得する。"""
    result = (
        supabase.table("todo_definitions")
        .select("label, is_active")
        .eq("user_id", user_id)
        .execute()
    )
    return [
        (row.get("label") or "").strip()
        for row in (result.data or [])
        if row.get("is_active")
    ]


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
    rows = query.execute().data or []

    # 採用済みの todo に重複する pending 候補は古いゴミの可能性が高いため、表示から除外する。
    # （extract 経由の cleanup を漏れたものへの安全網）
    if status == "pending":
        existing_labels = _fetch_active_todo_labels(user_id, supabase)
        if existing_labels:
            rows = [r for r in rows if not _label_overlaps(r.get("label") or "", existing_labels)]
    return rows


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

    # 1. 現在 active な todo_definitions ラベルを取得（既存の習慣・タスク）
    todo_labels = _fetch_active_todo_labels(user_id, supabase)

    # 2. 既存の pending 候補で「すでに todo に組み込まれているもの」は古いゴミなので reject 化
    pending_existing = (
        supabase.table("habit_suggestions")
        .select("id, label")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .execute()
    )
    stale_ids = [
        row["id"]
        for row in (pending_existing.data or [])
        if _label_overlaps(row.get("label") or "", todo_labels)
    ]
    if stale_ids:
        (
            supabase.table("habit_suggestions")
            .update({"status": "rejected"})
            .in_("id", stale_ids)
            .eq("user_id", user_id)
            .execute()
        )

    # 3. 残った pending / accepted 候補のラベルセット（重複防止）
    existing = (
        supabase.table("habit_suggestions")
        .select("label, status")
        .eq("user_id", user_id)
        .in_("status", ["pending", "accepted"])
        .execute()
    )
    existing_sugg_labels = {(row["label"] or "").strip().lower() for row in (existing.data or [])}

    # 4. 既存ラベル一覧（todo + サジェスト）を AI へコンテキストとして渡す
    avoid_list = list({*todo_labels, *(row["label"] for row in (existing.data or []) if row.get("label"))})

    candidates = await _ask_claude_for_suggestions(journal_text, avoid_list)

    # 5. 候補を後段でも再チェック（AI が重複を返したら捨てる）
    rows_to_insert = []
    for label, kind in candidates:
        norm = label.strip()
        if not norm or norm.lower() in existing_sugg_labels:
            continue
        if _label_overlaps(norm, todo_labels):
            continue
        if kind not in VALID_KINDS:
            kind = "habit"
        existing_sugg_labels.add(norm.lower())
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
async def _ask_claude_for_suggestions(
    journal_text: str,
    avoid_labels: Optional[list[str]] = None,
) -> list[tuple[str, str]]:
    """
    ジャーナル本文から行動候補を最大5つ抽出し、習慣化(habit) / 個別タスク(task) に分類する。
    avoid_labels に指定された既存ラベル（習慣・タスク・既出候補）と意味的に重複する候補は提案しない。
    返り値: [(label, kind), ...]
    """
    from app.services.ai_service import create_message  # type: ignore

    avoid_block = ""
    cleaned_avoid = [lbl.strip() for lbl in (avoid_labels or []) if lbl and lbl.strip()]
    if cleaned_avoid:
        # プロンプトを膨らませすぎない上限
        joined = "\n".join(f"- {lbl}" for lbl in cleaned_avoid[:30])
        avoid_block = (
            "\n\n**既に登録されている行動・候補（同じものや言い換えで再提案しないこと）:**\n"
            f"{joined}\n"
            "上記と意味が重複する場合は候補から除外してください。"
        )

    system = (
        "あなたは行動設計コーチです。ユーザーのジャーナル本文を読み、"
        "次の行動に役立ちそうな候補を最大5つ抽出し、それぞれを kind に分類してください。\n\n"
        "分類:\n"
        "- kind='habit' : 毎日や毎朝など、継続的に繰り返すことで価値が出るルーティン行動。"
        "（例: 早起き、瞑想、ストレッチ、英語学習）\n"
        "- kind='task'  : 一回限り、または期限のあるショット作業。"
        "（例: 書類を提出する、◯◯さんに連絡する、見積を作成する）"
        + avoid_block
        + "\n\n次の JSON 形式のみで返してください（説明文不要）：\n"
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
