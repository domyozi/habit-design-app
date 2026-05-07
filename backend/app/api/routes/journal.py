"""
ジャーナルエントリー CRUD API

エンドポイント:
  POST /api/journals        - ジャーナルを保存（日付+タイプで upsert）
  GET  /api/journals        - ジャーナル一覧取得（直近 N 件）
  GET  /api/journals/{date} - 特定日のジャーナル取得

【メモリ自動更新 + 行動候補抽出】:
  POST /api/journals では保存後にバックグラウンドで AI 抽出を 2 種類実行する:
    1. user_context のメモリ追記マージ
    2. habit_suggestions への habit / task 候補の追加
  どちらも失敗してもメインフローは成功させる。
"""
import logging
import time
import uuid
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.api.routes.habit_suggestions import _extract_and_persist_suggestions
from app.core.config import settings
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.services.ai_service import extract_memory_facts, merge_memory_patch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/journals")

# append-only 化に伴い、同 user が短時間に複数投稿しても抽出が
# 多重発火しないようデバウンスする（プロセス内のメモリのみ）。
_EXTRACTION_DEBOUNCE_SEC = 30.0
_last_extraction_at: dict[tuple[str, str], float] = {}


def _should_run_extraction(user_id: str, kind: str) -> bool:
    """直近 _EXTRACTION_DEBOUNCE_SEC 秒内に同 user/kind の抽出が起動済みなら False。"""
    key = (user_id, kind)
    now = time.monotonic()
    last = _last_extraction_at.get(key, 0.0)
    if now - last < _EXTRACTION_DEBOUNCE_SEC:
        return False
    _last_extraction_at[key] = now
    return True

ALLOWED_ENTRY_TYPES = {
    'journaling', 'daily_report', 'checklist', 'kpi_update',
    'evening_feedback', 'evening_notes', 'morning_journal',
    'user_context_snapshot',
    'coach_action_log',  # Sprint 7.4.7: ActionCard/Confirmation の判断履歴
}

# メモリ抽出を実行する entry_type（短文・構造化データ系は除外）
_MEMORY_EXTRACTION_TYPES = {'journaling', 'morning_journal', 'evening_notes', 'daily_report'}

# 候補抽出を実行する entry_type と source 名のマッピング
_SUGGESTION_SOURCE_MAP = {
    'morning_journal': 'morning',
    'evening_notes': 'evening',
    'journaling': 'manual',
    'daily_report': 'manual',
}


@router.post("", status_code=201)
async def upsert_journal(
    payload: dict,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    """ジャーナルエントリーを保存する。

    v3 の Flow が「会話ログ」として機能するよう **append-only**。
    1 投稿 = 1 row、`created_at` が常に新しく発行される。
    旧仕様（同日同 entry_type の upsert）は v2 時代の「1 日 1 ジャーナル」
    前提のもので、v3 の対話型 UI とは合わない。
    """
    from fastapi import HTTPException
    supabase = get_supabase()
    entry_date = payload.get("entry_date") or str(date_type.today())
    entry_type = payload.get("entry_type", "journaling")
    if entry_type not in ALLOWED_ENTRY_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid entry_type: {entry_type}")

    content = payload.get("content", "")
    data = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "entry_date": entry_date,
        "content": content,
        "entry_type": entry_type,
        "raw_input": payload.get("raw_input"),
    }
    result = supabase.table("journal_entries").insert(data).execute()

    # 旧バックグラウンド抽出。
    # v3 では Flow の Coach action Proposal（ユーザーが ADOPT/CONFIRM する経路）へ
    # 一本化するため、デフォルトOFF。ロールバック時だけ環境変数で再有効化する。
    # AI 失敗・空抽出はサイレントに無視する（メインフローを壊さない）。
    # append-only 化により短時間に複数投稿が来るので、同 user/kind で
    # デバウンスして重複起動を防ぐ。
    if entry_type in _MEMORY_EXTRACTION_TYPES and isinstance(content, str) and content.strip():
        if (
            settings.JOURNAL_BACKGROUND_MEMORY_EXTRACTION_ENABLED
            and _should_run_extraction(user_id, "memory")
        ):
            background_tasks.add_task(_process_memory_extraction, user_id, content)
        if (
            settings.JOURNAL_BACKGROUND_SUGGESTION_EXTRACTION_ENABLED
            and _should_run_extraction(user_id, "suggestion")
        ):
            background_tasks.add_task(
                _process_suggestion_extraction,
                user_id,
                content,
                _SUGGESTION_SOURCE_MAP.get(entry_type, "manual"),
                entry_date,
            )

    return result.data[0] if result.data else {}


async def _process_memory_extraction(user_id: str, session_text: str) -> None:
    """ジャーナル投稿後にメモリを抽出して user_context を更新する（バックグラウンド実行）。"""
    try:
        supabase = get_supabase()
        existing = (
            supabase.table("user_context")
            .select("identity, patterns, values_keywords, insights")
            .eq("user_id", user_id)
            .execute()
        )
        current_ctx = existing.data[0] if existing.data else None

        patch = await extract_memory_facts(session_text, current_ctx, user_id=user_id)
        if not patch:
            return

        merged = merge_memory_patch(current_ctx, patch)
        if not merged:
            return

        merged["user_id"] = user_id
        supabase.table("user_context").upsert(merged, on_conflict="user_id").execute()
    except Exception as e:  # noqa: BLE001 - バックグラウンド失敗をメインへ伝播させない
        logger.warning("メモリ自動更新失敗 user_id=%s: %s", user_id, e)


async def _process_suggestion_extraction(
    user_id: str,
    session_text: str,
    source: str,
    entry_date: str,
) -> None:
    """ジャーナル投稿後に habit / task 候補を habit_suggestions に追記する（バックグラウンド実行）。"""
    try:
        await _extract_and_persist_suggestions(
            user_id=user_id,
            journal_text=session_text,
            source=source,
            source_date=entry_date,
        )
    except Exception as e:  # noqa: BLE001 - バックグラウンド失敗をメインへ伝播させない
        logger.warning("候補抽出失敗 user_id=%s: %s", user_id, e)


@router.get("")
async def list_journals(
    entry_type: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = Query(default=30, ge=1, le=200),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    # append-only 化に伴い同日内に複数 row が並ぶため、entry_date だけでなく
    # created_at も降順にして「最新の発言が先頭」となる時系列を保証する。
    query = (
        supabase.table("journal_entries")
        .select("*")
        .eq("user_id", user_id)
        .order("entry_date", desc=True)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if entry_type:
        query = query.eq("entry_type", entry_type)
    if date:
        query = query.eq("entry_date", date)
    return query.execute().data


@router.get("/{entry_date}")
async def get_journal_by_date(
    entry_date: str,
    entry_type: str = "journaling",
    user_id: str = Depends(get_current_user),
):
    """指定日・指定 type の **最新 1 件** を返す（append-only に伴う互換 API）。"""
    supabase = get_supabase()
    result = (
        supabase.table("journal_entries")
        .select("*")
        .eq("user_id", user_id)
        .eq("entry_date", entry_date)
        .eq("entry_type", entry_type)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None
