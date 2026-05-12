"""
ユーザーコンテキスト（AI コーチ用メモリ）API

エンドポイント:
  GET   /api/user-context          → UserContext | null
  PATCH /api/user-context          → body: Partial<UserContext> → upsert
"""
from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.core.user_tz import is_valid_iana_tz

router = APIRouter(prefix="/user-context")


_SELECT_COLS = (
    "identity, values_keywords, goal_summary, patterns, insights, "
    "lang, granularity, display_name, avatar_url, profile, timezone"
)
_ALLOWED_FIELDS = {
    "identity",
    "values_keywords",
    "goal_summary",
    "patterns",
    "insights",
    "lang",
    "granularity",
    "display_name",
    "avatar_url",
    # Phase 6.5.3: profile (JSONB) — age / location / occupation / family ...
    "profile",
    # 2026-05-13: timezone (IANA name) — ユーザーの「今日」判定の基準
    "timezone",
}


@router.get("")
async def get_user_context(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("user_context")
        .select(_SELECT_COLS)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


@router.patch("")
async def patch_user_context(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    """
    部分更新で user_context を upsert する。
    profile (JSONB) は **既存値とのマージ** を行う:
      - FE は変更分のみ送れば良い (`{ profile: { age: 32 } }`)
      - 既存の profile と merge して保存
    """
    supabase = get_supabase()

    data: dict = {"user_id": user_id}
    for field in _ALLOWED_FIELDS:
        if field in payload:
            data[field] = payload[field]

    # timezone は IANA name 検証を入れる (不正値は DB に書き込ませない)
    if "timezone" in data and not is_valid_iana_tz(data["timezone"]):
        raise HTTPException(
            status_code=400,
            detail="timezone must be a valid IANA name (e.g., Asia/Tokyo)",
        )

    # profile は merge 動作にする
    if "profile" in data:
        existing = (
            supabase.table("user_context")
            .select("profile")
            .eq("user_id", user_id)
            .execute()
        )
        current = (existing.data[0].get("profile") or {}) if existing.data else {}
        patch = data["profile"] if isinstance(data["profile"], dict) else {}
        merged = {**current, **patch}
        data["profile"] = merged

    result = (
        supabase.table("user_context")
        .upsert(data, on_conflict="user_id")
        .execute()
    )
    return result.data[0] if result.data else data
