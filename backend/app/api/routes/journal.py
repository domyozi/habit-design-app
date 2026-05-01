"""
ジャーナルエントリー CRUD API

エンドポイント:
  POST /api/journals        - ジャーナルを保存（日付+タイプで upsert）
  GET  /api/journals        - ジャーナル一覧取得（直近 N 件）
  GET  /api/journals/{date} - 特定日のジャーナル取得
"""
import uuid
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/journals")

ALLOWED_ENTRY_TYPES = {'journaling', 'daily_report', 'checklist', 'kpi_update', 'evening_feedback', 'evening_notes', 'morning_journal', 'user_context_snapshot'}


@router.post("", status_code=201)
async def upsert_journal(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    from fastapi import HTTPException
    supabase = get_supabase()
    entry_date = payload.get("entry_date") or str(date_type.today())
    entry_type = payload.get("entry_type", "journaling")
    if entry_type not in ALLOWED_ENTRY_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid entry_type: {entry_type}")

    existing = (
        supabase.table("journal_entries")
        .select("id")
        .eq("user_id", user_id)
        .eq("entry_date", entry_date)
        .eq("entry_type", entry_type)
        .execute()
    )

    data = {
        "user_id": user_id,
        "entry_date": entry_date,
        "content": payload.get("content", ""),
        "entry_type": entry_type,
        "raw_input": payload.get("raw_input"),
    }

    if existing.data:
        result = (
            supabase.table("journal_entries")
            .update(data)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        data["id"] = str(uuid.uuid4())
        result = supabase.table("journal_entries").insert(data).execute()

    return result.data[0] if result.data else {}


@router.get("")
async def list_journals(
    entry_type: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = Query(default=30, ge=1, le=200),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    query = (
        supabase.table("journal_entries")
        .select("*")
        .eq("user_id", user_id)
        .order("entry_date", desc=True)
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
    supabase = get_supabase()
    result = (
        supabase.table("journal_entries")
        .select("*")
        .eq("user_id", user_id)
        .eq("entry_date", entry_date)
        .eq("entry_type", entry_type)
        .execute()
    )
    return result.data[0] if result.data else None
