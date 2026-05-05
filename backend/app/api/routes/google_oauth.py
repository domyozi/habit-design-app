"""
Google OAuth (Calendar) 認可フロー。

エンドポイント (`/api/integrations/google` プレフィックス付与は __init__.py で行う):
  POST /oauth/start          - 認可 URL を生成して返す（FE がこの URL に遷移）
  GET  /oauth/callback       - Google からの redirect 受け取り。code → token 交換 → DB upsert → FE へ redirect
  GET  /token                 - 現在ユーザーの有効な access_token を返す（必要なら refresh）
  DELETE /token               - 連携解除（DB row 削除）

【設計方針】:
  - state は random + user_id の HMAC で検証する。CSRF 防止 + どのユーザーの callback か判別。
  - access_token は短命なので DB に保存しつつ、FE には GET /token 経由でしか渡さない。
  - refresh_token は FE には絶対に返さない。
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.security import get_current_user
from app.services.google_token_service import (
    GoogleAuthError,
    build_authorize_url,
    delete_tokens,
    exchange_code,
    fetch_token_row,
    get_valid_access_token,
    save_tokens,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations/google")


def _state_secret() -> bytes:
    # JWT secret を流用（追加 env を増やさない）。HS256 用なので bytes として使える。
    base = (settings.SUPABASE_JWT_SECRET or "dev-fallback-secret").encode("utf-8")
    # state 用の domain separation を加える
    return hashlib.sha256(b"google-oauth-state:" + base).digest()


def _make_state(user_id: str) -> str:
    nonce = secrets.token_urlsafe(16)
    payload = f"{user_id}.{nonce}".encode("utf-8")
    sig = hmac.new(_state_secret(), payload, hashlib.sha256).hexdigest()
    return f"{user_id}.{nonce}.{sig}"


def _verify_state(state: str) -> Optional[str]:
    try:
        user_id, nonce, sig = state.split(".")
    except ValueError:
        return None
    expected = hmac.new(_state_secret(), f"{user_id}.{nonce}".encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    return user_id


@router.post("/oauth/start")
async def oauth_start(user_id: str = Depends(get_current_user)) -> dict[str, str]:
    """認可 URL を返す。FE はこの URL に window.location を遷移させる。"""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on this server")
    state = _make_state(user_id)
    try:
        url = build_authorize_url(state)
    except GoogleAuthError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"authorize_url": url, "state": state}


@router.get("/oauth/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """Google からの redirect を受ける。state 検証 → token 交換 → DB upsert → FE へ戻す。"""
    fe_return = settings.GOOGLE_OAUTH_FE_RETURN_URL

    if error:
        return RedirectResponse(f"{fe_return}?gcal=error&reason={error}", status_code=302)
    if not code or not state:
        return RedirectResponse(f"{fe_return}?gcal=error&reason=missing_params", status_code=302)

    user_id = _verify_state(state)
    if not user_id:
        return RedirectResponse(f"{fe_return}?gcal=error&reason=bad_state", status_code=302)

    try:
        token_data = await exchange_code(code)
    except GoogleAuthError as e:
        logger.warning("oauth_callback: exchange failed user_id=%s: %s", user_id, e)
        return RedirectResponse(f"{fe_return}?gcal=error&reason=exchange_failed", status_code=302)

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = int(token_data.get("expires_in", 3600))
    scope = token_data.get("scope")

    if not access_token or not refresh_token:
        # refresh_token が来ないケース: 再連携を試した場合など。既存 row を保持しつつ access_token のみ更新。
        existing = fetch_token_row(user_id)
        if existing and access_token:
            save_tokens(
                user_id=user_id,
                access_token=access_token,
                refresh_token=existing["refresh_token"],
                expires_in_seconds=expires_in,
                scope=scope,
            )
            return RedirectResponse(f"{fe_return}?gcal=connected", status_code=302)
        return RedirectResponse(f"{fe_return}?gcal=error&reason=no_refresh_token", status_code=302)

    save_tokens(
        user_id=user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in_seconds=expires_in,
        scope=scope,
    )
    return RedirectResponse(f"{fe_return}?gcal=connected", status_code=302)


@router.get("/token")
async def get_token(user_id: str = Depends(get_current_user)) -> dict[str, object]:
    """有効な access_token を返す。連携してなければ connected=false で返す。"""
    access = await get_valid_access_token(user_id)
    if not access:
        return {"connected": False}
    return {"connected": True, "access_token": access}


@router.delete("/token")
async def disconnect(user_id: str = Depends(get_current_user)) -> dict[str, bool]:
    delete_tokens(user_id)
    return {"disconnected": True}


@router.get("/status")
async def status(user_id: str = Depends(get_current_user)) -> dict[str, bool]:
    """連携状態だけ返す（access_token を露出させずに済む軽量チェック）。"""
    row = fetch_token_row(user_id)
    return {"connected": bool(row)}
