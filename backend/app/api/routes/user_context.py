"""
ユーザーコンテキスト（AI コーチ用メモリ）API

エンドポイント:
  GET   /api/user-context          → UserContext | null
  PATCH /api/user-context          → body: Partial<UserContext> → upsert
"""
from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/user-context")


@router.get("")
async def get_user_context(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("user_context")
        .select("identity, values_keywords, goal_summary, patterns, insights, lang, granularity, display_name, avatar_url")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


@router.patch("")
async def patch_user_context(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    data = {"user_id": user_id}

    allowed_fields = {"identity", "values_keywords", "goal_summary", "patterns", "insights", "lang", "granularity", "display_name", "avatar_url"}
    for field in allowed_fields:
        if field in payload:
            data[field] = payload[field]

    result = (
        supabase.table("user_context")
        .upsert(data, on_conflict="user_id")
        .execute()
    )
    return result.data[0] if result.data else data
