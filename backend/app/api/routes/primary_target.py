"""
Primary Target（ボス目標）API

エンドポイント:
  GET /api/primary-target     → {value, set_date, completed} | null
  PUT /api/primary-target     → body: {value, set_date, completed}
"""
from datetime import date as date_type

from fastapi import APIRouter, Depends

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
        .select("value, set_date, completed")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


@router.put("")
async def upsert_primary_target(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    data = {
        "user_id": user_id,
        "value": payload.get("value", ""),
        "set_date": payload.get("set_date", str(date_type.today())),
        "completed": payload.get("completed", False),
    }

    result = (
        supabase.table("primary_targets")
        .upsert(data, on_conflict="user_id")
        .execute()
    )
    return result.data[0] if result.data else data
