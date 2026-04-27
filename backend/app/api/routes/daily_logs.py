"""
日次ログ CRUD API

エンドポイント:
  GET  /api/daily-logs?date={YYYY-MM-DD}&slot={morning|evening}
       → [{slot, field, value}] の配列

  POST /api/daily-logs
       body: [{log_date, slot, field, value}]
       → upsert（バッチ対応）
"""
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/daily-logs")


@router.get("")
async def get_daily_logs(
    date: Optional[str] = None,
    slot: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    log_date = date or str(date_type.today())

    query = (
        supabase.table("daily_logs")
        .select("slot, field, value")
        .eq("user_id", user_id)
        .eq("log_date", log_date)
    )

    if slot:
        query = query.eq("slot", slot)

    result = query.execute()
    return result.data or []


@router.post("", status_code=201)
async def upsert_daily_logs(
    payload: List[dict],
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    rows = []
    for entry in payload:
        rows.append({
            "user_id": user_id,
            "log_date": entry.get("log_date", str(date_type.today())),
            "slot": entry["slot"],
            "field": entry["field"],
            "value": entry["value"],
        })

    if not rows:
        return []

    result = (
        supabase.table("daily_logs")
        .upsert(rows, on_conflict="user_id,log_date,slot,field")
        .execute()
    )
    return result.data or []
