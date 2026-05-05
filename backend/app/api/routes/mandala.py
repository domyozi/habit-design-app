"""
マンダラチャート API

【エンドポイント】:
  GET  /api/mandala                          - 最新マンダラを取得（未登録時 204）
  POST /api/mandala                          - マンダラを保存（upsert）
  GET  /api/mandala/daily-check?date=YYYY-MM-DD  - 当日のチェック状態を取得
  PATCH /api/mandala/daily-check?date=YYYY-MM-DD - チェック状態を更新
  GET  /api/mandala/tracked                  - 追跡アクション一覧を取得
  PATCH /api/mandala/tracked                 - 追跡アクション状態を更新

【DB要件】:
  ALTER TABLE public.mandala_charts
    ADD COLUMN IF NOT EXISTS daily_checks jsonb DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tracked_actions jsonb DEFAULT '{}';
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import APIResponse, MandalaChart, SaveMandalaRequest

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_mandala_id(supabase, user_id: str) -> str | None:
    result = (
        supabase.table("mandala_charts")
        .select("id")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0]["id"] if result.data else None


def _ensure_owned_wanna_be(supabase, wanna_be_id: str, user_id: str) -> None:
    result = (
        supabase.table("wanna_be")
        .select("id")
        .eq("id", wanna_be_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=422, detail="wanna_be_id is unknown or unauthorized")


@router.get("/mandala")
async def get_mandala(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("mandala_charts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return Response(status_code=204)
    return APIResponse(success=True, data=MandalaChart(**result.data[0]))


@router.post("/mandala")
async def save_mandala(
    request: SaveMandalaRequest,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    if request.wanna_be_id is not None:
        _ensure_owned_wanna_be(supabase, request.wanna_be_id, user_id)

    existing = (
        supabase.table("mandala_charts")
        .select("id")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if existing.data:
        record_id = existing.data[0]["id"]
        update_data: dict = {"cells": request.cells}
        if request.wanna_be_id is not None:
            update_data["wanna_be_id"] = request.wanna_be_id
        result = (
            supabase.table("mandala_charts")
            .update(update_data)
            .eq("id", record_id)
            .eq("user_id", user_id)
            .execute()
        )
        saved = result.data[0] if result.data else existing.data[0]
    else:
        insert_data: dict = {"user_id": user_id, "cells": request.cells}
        if request.wanna_be_id is not None:
            insert_data["wanna_be_id"] = request.wanna_be_id
        result = supabase.table("mandala_charts").insert(insert_data).execute()
        saved = result.data[0] if result.data else {}
    return APIResponse(success=True, data=MandalaChart(**saved))


# ─── F-18: Daily check API ────────────────────────────────────

@router.get("/mandala/daily-check")
async def get_daily_check(
    date: str = Query(..., description="YYYY-MM-DD"),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("mandala_charts")
        .select("daily_checks")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return {}
    all_checks: dict = result.data[0].get("daily_checks") or {}
    return all_checks.get(date, {})


@router.patch("/mandala/daily-check")
async def patch_daily_check(
    payload: dict,
    date: str = Query(..., description="YYYY-MM-DD"),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    record_id = _get_mandala_id(supabase, user_id)
    if not record_id:
        return Response(status_code=404)

    current = (
        supabase.table("mandala_charts")
        .select("daily_checks")
        .eq("id", record_id)
        .eq("user_id", user_id)
        .execute()
    )
    all_checks: dict = (current.data[0].get("daily_checks") or {}) if current.data else {}
    all_checks[date] = payload

    supabase.table("mandala_charts").update({"daily_checks": all_checks}).eq("id", record_id).eq("user_id", user_id).execute()
    return all_checks[date]


# ─── F-19: Tracked actions API ───────────────────────────────

@router.get("/mandala/tracked")
async def get_tracked(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("mandala_charts")
        .select("tracked_actions")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return {}
    return result.data[0].get("tracked_actions") or {}


@router.patch("/mandala/tracked")
async def patch_tracked(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    record_id = _get_mandala_id(supabase, user_id)
    if not record_id:
        return Response(status_code=404)

    current = (
        supabase.table("mandala_charts")
        .select("tracked_actions")
        .eq("id", record_id)
        .eq("user_id", user_id)
        .execute()
    )
    tracked: dict = (current.data[0].get("tracked_actions") or {}) if current.data else {}
    tracked.update(payload)

    supabase.table("mandala_charts").update({"tracked_actions": tracked}).eq("id", record_id).eq("user_id", user_id).execute()
    return tracked
