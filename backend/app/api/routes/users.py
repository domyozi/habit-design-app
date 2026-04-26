"""
ユーザープロフィールAPI
TASK-0006: Wanna Be・長期目標・ユーザープロフィールAPI実装

【エンドポイント】:
  GET  /api/v1/users/me   - ログインユーザーのプロフィール取得
  PATCH /api/v1/users/me  - プロフィール部分更新

🔵 信頼性レベル: REQ-103・api-endpoints.md より
"""
from fastapi import APIRouter, Depends

from app.core.exceptions import NotFoundError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import APIResponse, UpdateUserProfileRequest, UserProfile

router = APIRouter()


@router.get("/users/me", response_model=APIResponse[UserProfile])
async def get_user_profile(
    user_id: str = Depends(get_current_user),
) -> APIResponse[UserProfile]:
    """
    【GET /users/me】: ログインユーザーのプロフィール取得
    【認証必須】: JWTから user_id を取得
    【DB操作】: user_profiles テーブルから該当レコードを取得
    🔵 信頼性レベル: REQ-103・api-endpoints.md より
    """
    # 【DB取得】: user_id でフィルタしてプロフィールを取得
    supabase = get_supabase()
    result = (
        supabase.table("user_profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )

    # 【存在チェック】: レコードが見つからない場合は 404
    if result.data is None:
        raise NotFoundError("ユーザープロフィール")

    return APIResponse(success=True, data=UserProfile(**result.data))


@router.patch("/users/me", response_model=APIResponse[UserProfile])
async def update_user_profile(
    request: UpdateUserProfileRequest,
    user_id: str = Depends(get_current_user),
) -> APIResponse[UserProfile]:
    """
    【PATCH /users/me】: プロフィール部分更新
    【部分更新】: 未指定フィールドは変更しない（None を除外して UPDATE）
    【認証必須】: JWTから user_id を取得
    🔵 信頼性レベル: REQ-701・api-endpoints.md より
    """
    # 【更新データ作成】: None のフィールドを除外して部分更新用辞書を作成
    update_data = request.model_dump(exclude_none=True)

    # 【DB更新】: user_id でフィルタして更新
    supabase = get_supabase()
    result = (
        supabase.table("user_profiles")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )

    # 【更新後データ取得】: レスポンス用に最新プロフィールを返す
    updated = result.data[0] if result.data else update_data
    return APIResponse(success=True, data=UserProfile(**updated))
