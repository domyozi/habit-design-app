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

# 同時に保留できる候補数の上限（決定負荷を抑える）。
# habit / task 合算でこの数を超えるなら新規抽出はスキップする。
MAX_PENDING_TOTAL = 5
# 1 回のジャーナル投稿あたり AI に依頼する最大件数。
MAX_PER_EXTRACTION = 2


def _fetch_active_todo_summary(user_id: str, supabase) -> tuple[list[str], int]:
    """ユーザーの有効な todo_definitions ラベルと habit カテゴリの数を返す。"""
    result = (
        supabase.table("todo_definitions")
        .select("label, section, is_active")
        .eq("user_id", user_id)
        .execute()
    )
    rows = [r for r in (result.data or []) if r.get("is_active")]
    labels = [(row.get("label") or "").strip() for row in rows]
    habit_count = sum(1 for row in rows if (row.get("section") or "").strip() == "habit")
    return labels, habit_count


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
    return query.execute().data or []


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


@router.post("/clear-pending")
async def clear_pending_suggestions(
    kind: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    """pending な候補を一括で rejected に変更する。kind 指定で対象を絞れる。"""
    if kind is not None and kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="invalid kind")
    supabase = get_supabase()
    query = (
        supabase.table("habit_suggestions")
        .update({"status": "rejected"})
        .eq("user_id", user_id)
        .eq("status", "pending")
    )
    if kind:
        query = query.eq("kind", kind)
    result = query.execute()
    return {"ok": True, "cleared": len(result.data or [])}


# ─── 内部ヘルパー: 抽出 & 永続化（journal POST のフックからも呼ばれる） ───
async def _extract_and_persist_suggestions(
    user_id: str,
    journal_text: str,
    source: str,
    source_date: Optional[str],
) -> list[dict]:
    """ジャーナル本文を Claude で分析し、新規 habit / task 候補を DB に挿入する。

    重複・言い換え判定は AI に任せる（決定論的なテキストマッチは行わない）。
    pending 合計が MAX_PENDING_TOTAL を超えるなら新規抽出はスキップする。
    """
    supabase = get_supabase()

    # 1. 既存のアクティブな todo（habit / task 両方）と habit カテゴリの数を取得
    todo_labels, habit_count = _fetch_active_todo_summary(user_id, supabase)

    # 2. 既存の pending / accepted / rejected 候補のラベル
    #    rejected も含めることで、ユーザーが一度「× 不要」した label を AI が
    #    avoid_list で避け、万一 Claude が同じ label を返しても exact-match
    #    dedup で再 INSERT を弾けるようになる。
    existing = (
        supabase.table("habit_suggestions")
        .select("label, status")
        .eq("user_id", user_id)
        .in_("status", ["pending", "accepted", "rejected"])
        .execute()
    )
    existing_rows = existing.data or []
    pending_count = sum(1 for r in existing_rows if r.get("status") == "pending")

    # 3. pool 上限を超えていたら新規抽出しない（決定負荷の上限）
    available_slots = MAX_PENDING_TOTAL - pending_count
    if available_slots <= 0:
        return []
    max_count = min(MAX_PER_EXTRACTION, available_slots)

    # 4. AI へ渡す avoid-list（重複・言い換え判断は AI に任せる）
    avoid_list = list({*todo_labels, *(r["label"] for r in existing_rows if r.get("label"))})

    candidates = await _ask_claude_for_suggestions(
        journal_text=journal_text,
        avoid_labels=avoid_list,
        max_count=max_count,
        existing_habit_count=habit_count,
        user_id=user_id,
    )

    # 5. 純粋な exact-match dedup のみ（データ整合性の最低限）
    existing_lower = {(r["label"] or "").strip().lower() for r in existing_rows}

    rows_to_insert = []
    for label, kind in candidates:
        norm = label.strip()
        if not norm or norm.lower() in existing_lower:
            continue
        if kind not in VALID_KINDS:
            kind = "habit"
        existing_lower.add(norm.lower())
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
    max_count: int = MAX_PER_EXTRACTION,
    existing_habit_count: int = 0,
    *,
    user_id: str,
) -> list[tuple[str, str]]:
    """
    ジャーナル本文から行動候補を抽出し、習慣化(habit) / 個別タスク(task) に分類する。
    重複・言い換え判定は AI 側に完全に委ねる（Python 側でのテキストマッチは行わない）。
    返り値: [(label, kind), ...]（最大 max_count 件、0 件もあり得る）
    """
    from app.services.ai_service import create_message  # type: ignore

    if max_count <= 0:
        return []

    avoid_block = ""
    cleaned_avoid = [lbl.strip() for lbl in (avoid_labels or []) if lbl and lbl.strip()]
    if cleaned_avoid:
        # プロンプトを膨らませすぎない上限
        joined = "\n".join(f"- {lbl}" for lbl in cleaned_avoid[:30])
        avoid_block = (
            "\n\n**既に登録されている行動・候補:**\n"
            f"{joined}\n"
            "これらと同一概念のもの、表現を変えただけのバリエーション、"
            "同じ目的を達成する別の言い回しは絶対に提案しないこと。"
            "（例: 既存に「英語学習」がある場合、「英語学習を継続する」「毎日英語学習」「英語を勉強する」"
            "などはすべて重複扱い）"
        )

    capacity_note = (
        f"\n\nユーザーは現在 {existing_habit_count} 件の習慣を継続的に追跡しています。"
        "意思決定の負担を考慮し、ジャーナルから明確に読み取れる「今すぐ採用すべき」高優先度の候補だけを抽出してください。\n"
        f"- candidates は **0〜{max_count} 件**（ジャーナルに新しい行動意図が明確に書かれていなければ 0 件で構いません）\n"
        "- 同じ概念のバリエーションを複数提案しない（最も適切な 1 案だけ）\n"
        "- 既存と重複する/言い換えに過ぎないものは含めない"
    )

    system = (
        "あなたは行動設計コーチです。ユーザーのジャーナル本文を読み、"
        "次の行動に役立ちそうな候補を抽出して habit / task に分類してください。\n\n"
        "分類（厳密に従う）:\n"
        "- kind='habit' : **長期にわたり毎日/毎週など定期的に反復することで意味があり、"
        "かつ達成/未達を明確にトラッキングできるルーティン**。\n"
        "    ✅ 例: 「プロテインを飲む」「ランニング 5km」「筋トレ」「瞑想 10分」"
        "「早起き 6:00」「英語学習 30分」「水を 2L 飲む」\n"
        "    ❌ 例（これらは habit にしない）: 「ノートに開発記録を残す」「手書きで思考を整理する」"
        "「アイデアを発信する」「振り返りをする」「進捗を共有する」「Notion を使いこなす」\n"
        "      → これらは『毎日トラッキングする対象』として実用的でない/抽象度が高い。"
        "kind='task' に振るか、確信が持てない場合は **何も提案しない** こと。\n"
        "- kind='task'  : 一回限り、または期限のあるショット作業。"
        "（例: 書類を提出する、◯◯さんに連絡する、見積を作成する）\n"
        "判断に迷う場合は出力しない。**精度 > 件数**。"
        + avoid_block
        + capacity_note
        + "\n\n次の JSON 形式のみで返してください（説明文不要）：\n"
        "```json\n"
        "{ \"candidates\": [\n"
        "    { \"label\": \"...\", \"kind\": \"habit\" }\n"
        "] }\n"
        "```\n"
        "label は 16 文字以内の簡潔な行動ラベル（動詞含む）。"
    )

    try:
        response_text = await create_message(
            messages=[{"role": "user", "content": f"<journal>\n{journal_text}\n</journal>"}],
            user_id=user_id,
            feature="habit_suggest",
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
        if len(out) >= max_count:
            break
    return out
