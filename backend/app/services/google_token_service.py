"""
Google OAuth token 管理サービス。

機能:
- exchange_code(code, redirect_uri) → access_token + refresh_token を取得
- refresh_access_token(refresh_token) → access_token を再発行
- get_valid_access_token(user_id) → DB を見て、必要なら refresh して有効な access_token を返す
- save_tokens(user_id, ...) → google_oauth_tokens に upsert
- delete_tokens(user_id) → 切断

Authorization Code Flow + offline access。Implicit Flow は使わない（refresh_token が要るため）。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.security import decrypt_token, encrypt_token
from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTHZ_URL = "https://accounts.google.com/o/oauth2/v2/auth"

# Calendar (events 読み書き) 用スコープ + openid（user 識別）
CALENDAR_SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

# 有効期限の 5 分前で「期限切れ扱い」して refresh する。
EXPIRY_SAFETY_MARGIN = timedelta(minutes=5)


class GoogleAuthError(Exception):
    """Google OAuth 失敗時に投げる。"""


def build_authorize_url(state: str, redirect_uri: Optional[str] = None) -> str:
    """OAuth 認可開始 URL を生成。"""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("GOOGLE_CLIENT_ID is not configured")
    redirect = redirect_uri or settings.GOOGLE_REDIRECT_URI
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": " ".join(CALENDAR_SCOPES),
        "access_type": "offline",
        "prompt": "consent",  # refresh_token を確実に得るため
        "include_granted_scopes": "true",
        "state": state,
    }
    encoded = "&".join(f"{k}={httpx.QueryParams({k: v})[k]}" for k, v in params.items())
    return f"{GOOGLE_AUTHZ_URL}?{encoded}"


async def exchange_code(code: str, redirect_uri: Optional[str] = None) -> dict[str, Any]:
    """authorization code を access/refresh token に交換する。"""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise GoogleAuthError("GOOGLE_CLIENT_ID/SECRET is not configured")
    redirect = redirect_uri or settings.GOOGLE_REDIRECT_URI
    body = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=body)
    if resp.status_code != 200:
        logger.warning("Google token exchange failed: %s %s", resp.status_code, resp.text)
        raise GoogleAuthError(f"token exchange failed: {resp.status_code}")
    return resp.json()


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    """refresh_token を使って access_token を再発行する。"""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise GoogleAuthError("GOOGLE_CLIENT_ID/SECRET is not configured")
    body = {
        "refresh_token": refresh_token,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=body)
    if resp.status_code != 200:
        logger.warning("Google token refresh failed: %s %s", resp.status_code, resp.text)
        raise GoogleAuthError(f"refresh failed: {resp.status_code}")
    return resp.json()


def _expires_at_from_now(expires_in_seconds: int) -> datetime:
    return datetime.now(tz=timezone.utc) + timedelta(seconds=int(expires_in_seconds or 3600))


def save_tokens(
    user_id: str,
    access_token: str,
    refresh_token: str,
    expires_in_seconds: int,
    scope: Optional[str],
) -> dict[str, Any]:
    """google_oauth_tokens に upsert する。token は Fernet で暗号化して保管する。"""
    supabase = get_supabase()
    payload = {
        "user_id": user_id,
        "access_token": encrypt_token(access_token),
        "refresh_token": encrypt_token(refresh_token),
        "expires_at": _expires_at_from_now(expires_in_seconds).isoformat(),
        "scope": scope or " ".join(CALENDAR_SCOPES),
    }
    res = supabase.table("google_oauth_tokens").upsert(payload, on_conflict="user_id").execute()
    return (res.data or [payload])[0]


def update_access_token(
    user_id: str,
    access_token: str,
    expires_in_seconds: int,
) -> None:
    supabase = get_supabase()
    supabase.table("google_oauth_tokens").update(
        {
            "access_token": encrypt_token(access_token),
            "expires_at": _expires_at_from_now(expires_in_seconds).isoformat(),
        }
    ).eq("user_id", user_id).execute()


def fetch_token_row(user_id: str) -> Optional[dict[str, Any]]:
    """DB から行を取得し、token カラムを復号して返す。"""
    supabase = get_supabase()
    res = (
        supabase.table("google_oauth_tokens")
        .select("user_id, access_token, refresh_token, expires_at, scope")
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        return None
    row = dict(res.data[0])
    row["access_token"] = decrypt_token(row.get("access_token"))
    row["refresh_token"] = decrypt_token(row.get("refresh_token"))
    return row


def delete_tokens(user_id: str) -> None:
    supabase = get_supabase()
    supabase.table("google_oauth_tokens").delete().eq("user_id", user_id).execute()


def _parse_iso(ts: str) -> datetime:
    # supabase は ISO8601。timezone 情報があるはずだが、保険で UTC を当てる。
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def get_valid_access_token(user_id: str) -> Optional[str]:
    """
    DB を見て、access_token が有効ならそれを返す。
    EXPIRY_SAFETY_MARGIN 内に切れるなら refresh して新しい token を返す。
    未連携 (row なし) なら None。
    """
    row = fetch_token_row(user_id)
    if not row:
        return None
    expires_at = _parse_iso(row["expires_at"])
    if expires_at - EXPIRY_SAFETY_MARGIN > datetime.now(tz=timezone.utc):
        return row["access_token"]
    # refresh
    try:
        result = await refresh_access_token(row["refresh_token"])
    except GoogleAuthError as e:
        logger.warning("get_valid_access_token: refresh failed for user_id=%s: %s", user_id, e)
        return None
    new_access = result.get("access_token")
    expires_in = int(result.get("expires_in", 3600))
    if not new_access:
        return None
    update_access_token(user_id, new_access, expires_in)
    return new_access
