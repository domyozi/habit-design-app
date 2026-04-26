"""
マンダラチャート API
Sprint 1: F-02/F-03 マンダラ保存・取得エンドポイント

【エンドポイント】:
  GET  /api/mandala  - 認証ユーザーの最新マンダラを取得（未登録時 204）
  POST /api/mandala  - マンダラを保存（upsert: 1ユーザー1レコード）

【設計方針】:
- user_id でユニークに管理（1ユーザー1レコード）
- 既存レコードがある場合は cells と wanna_be_id を更新（upsert）
- RLS により自分のレコードのみアクセス可能

🔵 信頼性レベル: Sprint Spec F-01/F-02/F-03 より
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import APIResponse, MandalaChart, SaveMandalaRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/mandala")
async def get_mandala(
    user_id: str = Depends(get_current_user),
):
    """
    【GET /mandala】: 認証ユーザーの最新マンダラを取得
    【204レスポンス】: マンダラ未登録の場合は 204 No Content
    【認証必須】: JWTから user_id を取得
    🔵 信頼性レベル: Sprint Spec F-03 より
    """
    supabase = get_supabase()

    # 【DB取得】: user_id でフィルタし、最新1件を取得
    result = (
        supabase.table("mandala_charts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    # 【未登録チェック】: レコードがない場合は 204 No Content を返す
    if not result.data:
        return Response(status_code=204)

    return APIResponse(success=True, data=MandalaChart(**result.data[0]))


@router.post("/mandala")
async def save_mandala(
    request: SaveMandalaRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /mandala】: マンダラを保存（upsert: 1ユーザー1レコード）
    【upsert設計】: 既存レコードがある場合は cells と wanna_be_id を更新
    【認証必須】: JWTから user_id を取得
    🔵 信頼性レベル: Sprint Spec F-02 より
    """
    supabase = get_supabase()

    # 【既存レコード確認】: user_id で最新レコードを取得
    existing = (
        supabase.table("mandala_charts")
        .select("id")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if existing.data:
        # 【UPDATE】: 既存レコードの cells と wanna_be_id を更新
        record_id = existing.data[0]["id"]
        update_data: dict = {"cells": request.cells}
        if request.wanna_be_id is not None:
            update_data["wanna_be_id"] = request.wanna_be_id

        result = (
            supabase.table("mandala_charts")
            .update(update_data)
            .eq("id", record_id)
            .execute()
        )
        saved = result.data[0] if result.data else existing.data[0]
    else:
        # 【INSERT】: 新規レコードを作成
        insert_data: dict = {
            "user_id": user_id,
            "cells": request.cells,
        }
        if request.wanna_be_id is not None:
            insert_data["wanna_be_id"] = request.wanna_be_id

        result = supabase.table("mandala_charts").insert(insert_data).execute()
        saved = result.data[0] if result.data else {}

    return APIResponse(success=True, data=MandalaChart(**saved))
