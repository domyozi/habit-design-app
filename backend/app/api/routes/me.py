"""
ユーザー情報エンドポイント
GET /api/v1/me - 認証済みユーザーの情報を返す

【実装方針】: TC-002 の統合テストを通すための最小実装
🔵 信頼性レベル: auth-flow-testcases.md TC-002 より
"""
from fastapi import APIRouter, Depends

from app.core.security import get_current_user

# 【ルーター定義】: /api/v1/me のルートグループ 🔵
router = APIRouter()


@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)):
    """
    【機能概要】: 認証済みユーザーのuser_idを返す
    【実装方針】: get_current_user依存関数でJWT検証を行い、user_idを返す
    【テスト対応】: TC-002（有効なBearerトークンで200とuser_idが返される）
    🔵 信頼性レベル: auth-flow-testcases.md TC-002・auth-flow-requirements.md より

    Returns:
        {"user_id": "<uuid>"}: 認証済みユーザーのID
    """
    # 【レスポンス返却】: 認証済みユーザーのuser_idをJSONで返す 🔵
    return {"user_id": user_id}
