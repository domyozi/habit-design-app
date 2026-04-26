"""
通知設定 API
TASK-0006: Wanna Be・長期目標・ユーザープロフィールAPI実装

【エンドポイント】:
  GET  /api/v1/notifications/settings  - 通知設定取得
  PATCH /api/v1/notifications/settings - 通知設定更新

【DB操作】: user_profiles テーブルの通知関連フィールドのみを操作

🔵 信頼性レベル: REQ-801/802・api-endpoints.md より
"""
from fastapi import APIRouter, Depends

from app.core.exceptions import NotFoundError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    NotificationSettings,
    UpdateNotificationSettingsRequest,
)

router = APIRouter()


@router.get("/notifications/settings", response_model=APIResponse[NotificationSettings])
async def get_notification_settings(
    user_id: str = Depends(get_current_user),
) -> APIResponse[NotificationSettings]:
    """
    【GET /notifications/settings】: 通知設定を取得
    【DB操作】: user_profiles の通知関連3フィールドのみ SELECT
    【認証必須】: JWTから user_id を取得
    🔵 信頼性レベル: REQ-801・api-endpoints.md より
    """
    # 【DB取得】: 通知設定フィールドのみ SELECT
    supabase = get_supabase()
    result = (
        supabase.table("user_profiles")
        .select("notification_enabled, notification_email, weekly_review_day")
        .eq("id", user_id)
        .single()
        .execute()
    )

    # 【存在チェック】: プロフィールがない場合は 404
    if result.data is None:
        raise NotFoundError("ユーザープロフィール")

    return APIResponse(success=True, data=NotificationSettings(**result.data))


@router.patch("/notifications/settings", response_model=APIResponse[NotificationSettings])
async def update_notification_settings(
    request: UpdateNotificationSettingsRequest,
    user_id: str = Depends(get_current_user),
) -> APIResponse[NotificationSettings]:
    """
    【PATCH /notifications/settings】: 通知設定を更新
    【部分更新】: 未指定フィールドは変更しない
    【REQ-802】: notification_enabled=false にすることでスケジューラーがスキップ
    🔵 信頼性レベル: REQ-802・api-endpoints.md より
    """
    # 【更新データ作成】: None のフィールドを除外して部分更新
    update_data = request.model_dump(exclude_none=True)

    # 【DB更新】: user_profiles の通知フィールドを更新
    supabase = get_supabase()
    result = (
        supabase.table("user_profiles")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )

    # 【更新後データ返却】: 更新後の通知設定を返す
    updated = result.data[0] if result.data else update_data
    return APIResponse(success=True, data=NotificationSettings(**updated))
