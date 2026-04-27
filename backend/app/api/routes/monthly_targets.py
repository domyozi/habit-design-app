"""
月次目標 API

エンドポイント:
  GET /api/monthly-targets?year_month={YYYY-MM}  → {targets: Record<string,number>}
  PUT /api/monthly-targets                        → body: {year_month, targets}
"""
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/monthly-targets")


@router.get("")
async def get_monthly_targets(
    year_month: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    if not year_month:
        today = date_type.today()
        year_month = f"{today.year}-{str(today.month).zfill(2)}"

    result = (
        supabase.table("monthly_targets")
        .select("targets")
        .eq("user_id", user_id)
        .eq("year_month", year_month)
        .execute()
    )

    if result.data:
        return {"targets": result.data[0]["targets"]}
    return {"targets": {}}


@router.put("")
async def upsert_monthly_targets(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    today = date_type.today()
    year_month = payload.get("year_month", f"{today.year}-{str(today.month).zfill(2)}")

    data = {
        "user_id": user_id,
        "year_month": year_month,
        "targets": payload.get("targets", {}),
    }

    result = (
        supabase.table("monthly_targets")
        .upsert(data, on_conflict="user_id,year_month")
        .execute()
    )
    return result.data[0] if result.data else data
