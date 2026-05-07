"""
Primary Target（ボス目標）API

エンドポイント:
  GET /api/primary-target     → {value, set_date, completed} | null
  PUT /api/primary-target     → body: {value, set_date, completed}
  GET /api/primary-target/history?from=YYYY-MM-DD&to=YYYY-MM-DD
"""
from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends, Query

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/primary-target")


@router.get("")
async def get_primary_target(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("primary_targets")
        .select("value, set_date, completed, completed_at")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


@router.get("/history")
async def get_primary_target_history(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("primary_target_days")
        .select("value, set_date, completed, completed_at")
        .eq("user_id", user_id)
        .gte("set_date", from_date)
        .lte("set_date", to_date)
        .order("set_date")
        .execute()
    )
    return result.data or []


@router.put("")
async def upsert_primary_target(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    completed = bool(payload.get("completed", False))
    now = datetime.now(timezone.utc).isoformat()

    data = {
        "user_id": user_id,
        "value": payload.get("value", ""),
        "set_date": payload.get("set_date", str(date_type.today())),
        "completed": completed,
        "completed_at": now if completed else None,
        "updated_at": now,
    }

    result = (
        supabase.table("primary_targets")
        .upsert(data, on_conflict="user_id")
        .execute()
    )
    current = result.data[0] if result.data else data
    supabase.table("primary_target_days").upsert(
        {
            "user_id": user_id,
            "set_date": data["set_date"],
            "value": data["value"],
            "completed": data["completed"],
            "completed_at": data["completed_at"],
            "updated_at": data["updated_at"],
        },
        on_conflict="user_id,set_date",
    ).execute()
    return current
