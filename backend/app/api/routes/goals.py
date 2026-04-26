"""
長期目標 API
TASK-0006: Wanna Be・長期目標・ユーザープロフィールAPI実装
TASK-0030: KGI 属性 CRUD API 実装

【エンドポイント】:
  GET  /api/goals                      - アクティブな目標一覧（include_kgi=true で KGI フィールド付与）
  POST /api/goals                      - AI提案の目標を承認・保存（最大3件）
  PATCH /api/goals/{goal_id}/kgi       - 既存 Goal を KGI として設定
  PATCH /api/goals/{goal_id}/kgi/current-value - KGI 現在値更新

🔵 信頼性レベル: REQ-203/204・REQ-KGI-001〜007・api-endpoints.md より
"""
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core.exceptions import AppError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    Goal,
    GoalWithKgiResponse,
    SaveGoalsRequest,
    SetKgiRequest,
    UpdateKgiCurrentValueRequest,
)

# 【設計方針】:
# Pydantic の max_length=3 ではなくルーターで件数チェックを行う理由:
# - max_length=3 だと Pydantic が 422 を返す
# - 仕様書（REQ-204）は 400 VALIDATION_ERROR を要求している
# - このルーターでチェックすることで正確なエラーコードを返せる

router = APIRouter()

# 【目標最大件数】: REQ-204 に基づく制約値
MAX_GOALS = 3


def build_goal_with_kgi_response(goal_data: dict) -> GoalWithKgiResponse:
    """
    Goal データから KGI 計算フィールドを付与して GoalWithKgiResponse を構築する。
    🔵 信頼性レベル: REQ-KGI-006/007・EDGE-KPI-005 より
    """
    today = date_type.today()
    target_date = goal_data.get("target_date")
    target_value = goal_data.get("target_value")
    current_value = goal_data.get("current_value")

    # is_kgi: target_date が設定されている場合
    is_kgi = target_date is not None
    days_remaining = None
    is_expired = False
    achievement_rate = None

    if is_kgi:
        td = date_type.fromisoformat(target_date) if isinstance(target_date, str) else target_date
        days_remaining = (td - today).days
        is_expired = days_remaining < 0

    # 達成率の計算 (REQ-KGI-006)
    metric_type = goal_data.get("metric_type")
    if metric_type == "binary":
        achievement_rate = 100.0 if current_value == 1.0 else 0.0
    elif target_value and target_value != 0 and current_value is not None:
        achievement_rate = min(100.0, (current_value / target_value) * 100)

    return GoalWithKgiResponse(
        **goal_data,
        is_kgi=is_kgi,
        days_remaining=days_remaining,
        is_expired=is_expired,
        achievement_rate=achievement_rate,
    )


@router.get("/goals")
async def get_goals(
    include_kgi: bool = Query(False),
    user_id: str = Depends(get_current_user),
):
    """
    【GET /goals】: アクティブな長期目標一覧を取得
    include_kgi=true の場合は KGI 計算フィールド（達成率・残り日数・期限超過）を付与
    🔵 信頼性レベル: REQ-203・REQ-DASH-001・api-endpoints.md より
    """
    supabase = get_supabase()
    result = (
        supabase.table("goals")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )
    if include_kgi:
        goals = [build_goal_with_kgi_response(g) for g in result.data]
        return JSONResponse(
            content=APIResponse(success=True, data=goals).model_dump(mode="json"),
        )
    goals = [Goal(**g) for g in result.data]
    return JSONResponse(
        content=APIResponse(success=True, data=goals).model_dump(mode="json"),
    )


@router.post("/goals", status_code=201)
async def save_goals(
    request: SaveGoalsRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /goals】: AI提案の目標を承認・保存（最大3件）
    【件数制約】: REQ-204 に基づき3件を超える場合は VALIDATION_ERROR
    【上書き保存】: 既存目標を非活性化（is_active=false）してから新規保存
    【認証必須】: JWTから user_id を取得
    🔵 信頼性レベル: REQ-203/204・api-endpoints.md より
    """
    # 【件数バリデーション】: REQ-204 - 4件以上は保存不可
    # SaveGoalsRequest の max_length=3 で Pydantic バリデーションが走るが、
    # 仕様書のエラーメッセージ形式（VALIDATION_ERROR）に合わせて明示的にチェックする
    if len(request.goals) > MAX_GOALS:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"目標は最大{MAX_GOALS}件まで設定できます",
            status_code=400,
        )

    supabase = get_supabase()

    # 【既存目標の非活性化】: 現在 is_active=true の目標を全て false に更新
    # これにより新しい目標セットへの置き換えを実現する
    supabase.table("goals").update({"is_active": False}).eq("user_id", user_id).execute()

    # 【新目標の INSERT】: display_order を 0,1,2... で設定
    new_goals = [
        {
            "user_id": user_id,
            "wanna_be_id": request.wanna_be_id,
            "title": goal.title,
            "description": goal.description,
            "display_order": i,
            "is_active": True,
        }
        for i, goal in enumerate(request.goals)
    ]

    result = supabase.table("goals").insert(new_goals).execute()

    # 【レスポンス】: 保存した目標リストを返す
    saved_goals = [Goal(**g) for g in result.data]
    return JSONResponse(
        status_code=201,
        content=APIResponse(success=True, data=saved_goals).model_dump(mode="json"),
    )


@router.patch("/goals/{goal_id}/kgi")
async def set_goal_as_kgi(
    goal_id: str,
    request: SetKgiRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【PATCH /goals/{goal_id}/kgi】: 既存 Goal を KGI として設定する
    target_date・metric_type は必須。他ユーザーの Goal は 404 で拒否（RLS 兼用）
    🔵 信頼性レベル: REQ-KGI-001〜004・api-endpoints.md より
    """
    supabase = get_supabase()

    # 自分の Goal かを確認
    existing = (
        supabase.table("goals")
        .select("*")
        .eq("id", goal_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Goal not found")

    update_data = {
        "target_value": request.target_value,
        "unit": request.unit,
        "target_date": str(request.target_date),
        "metric_type": request.metric_type,
        "current_value": request.current_value,
    }
    result = (
        supabase.table("goals")
        .update(update_data)
        .eq("id", goal_id)
        .eq("user_id", user_id)
        .execute()
    )

    goal_response = build_goal_with_kgi_response(result.data[0])
    return JSONResponse(
        content=APIResponse(success=True, data=goal_response).model_dump(mode="json"),
    )


@router.patch("/goals/{goal_id}/kgi/current-value")
async def update_kgi_current_value(
    goal_id: str,
    request: UpdateKgiCurrentValueRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【PATCH /goals/{goal_id}/kgi/current-value】: KGI の現在値を更新する
    🔵 信頼性レベル: REQ-KGI-005 より
    """
    supabase = get_supabase()

    result = (
        supabase.table("goals")
        .update({"current_value": request.current_value})
        .eq("id", goal_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Goal not found or not a KGI")

    goal_response = build_goal_with_kgi_response(result.data[0])
    return JSONResponse(
        content=APIResponse(success=True, data=goal_response).model_dump(mode="json"),
    )
