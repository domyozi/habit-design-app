"""
JWT認証・セキュリティモジュール
TASK-0004: 認証フロー実装

【機能概要】:
- verify_token(): JWTトークンを検証してuser_idを返す
- get_current_user(): FastAPI依存関数（Bearer認証でuser_idを取得）
- encrypt_token() / decrypt_token(): Google OAuth トークンの対称暗号化（Fernet）

🔵 信頼性レベル: auth-flow-requirements.md セクション2・TASK-0004.md より
"""
import logging
import os
import time
from typing import Any, Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_production() -> bool:
    """`ENV=production` のときだけ True。strict モード判定に使う。
    main.py の IS_PRODUCTION とは独立に評価したいため関数化。"""
    return os.getenv("ENV", "").lower() == "production"

# 【HTTPBearerインスタンス】: Authorization: Bearer <token> ヘッダーを自動解析
# auto_error=True でヘッダーなしのリクエストには 403 を返す 🔵
http_bearer = HTTPBearer(auto_error=True)
http_bearer_optional = HTTPBearer(auto_error=False)

_JWKS_CACHE: dict[str, Any] = {"expires_at": 0.0, "keys": []}
_JWKS_CACHE_TTL_SECONDS = 300
_SUPPORTED_HS_ALGORITHMS = {"HS256"}
_SUPPORTED_JWKS_ALGORITHMS = {"RS256", "ES256"}


def _get_cached_jwks() -> list[dict[str, Any]]:
    """
    Supabase の JWKS を短時間キャッシュして、毎リクエストの外部取得を避ける。
    """
    now = time.monotonic()
    if _JWKS_CACHE["expires_at"] > now:
        return _JWKS_CACHE["keys"]

    if not settings.SUPABASE_URL:
        return []

    jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    response = httpx.get(jwks_url, timeout=5.0)
    response.raise_for_status()

    keys = response.json().get("keys", [])
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["expires_at"] = now + _JWKS_CACHE_TTL_SECONDS
    return keys


def _get_verification_key(token: str) -> tuple[str | dict[str, Any], list[str]]:
    """
    Supabase の旧HS256 secret と、新しい非対称署名JWKS の両方を受け入れる。
    """
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")

    if algorithm in _SUPPORTED_HS_ALGORITHMS:
        if not settings.SUPABASE_JWT_SECRET:
            raise JWTError("Missing JWT secret")
        return settings.SUPABASE_JWT_SECRET, ["HS256"]

    if algorithm not in _SUPPORTED_JWKS_ALGORITHMS:
        raise JWTError("Unsupported signing algorithm")

    key_id = header.get("kid")
    if not key_id:
        raise JWTError("Missing key id")

    for jwk in _get_cached_jwks():
        if jwk.get("kid") == key_id:
            return jwk, [algorithm]

    raise JWTError("Signing key not found")


def verify_token(token: str) -> Optional[str]:
    """
    【機能概要】: JWTトークンを検証してuser_id（subクレーム）を返す
    【実装方針】: python-jose の jwt.decode を使用して Supabase JWT を検証
    【テスト対応】: TC-001, TC-003, TC-004, TC-007, TC-008 を通すための実装
    🔵 信頼性レベル: auth-flow-requirements.md セクション2「verify_token()」より

    検証内容:
    - アルゴリズム: HS256 または Supabase JWKS の公開鍵
    - audience: "authenticated" (Supabase固定値)
    - 署名: SUPABASE_JWT_SECRET または Supabase JWKS で検証
    - 有効期限: exp クレームが現在時刻より未来
    - subクレームの存在確認

    Args:
        token: 検証するJWT文字列

    Returns:
        str: user_id（subクレームのUUID文字列）、検証失敗時は None
    """
    try:
        verification_key, algorithms = _get_verification_key(token)

        # 【JWT検証実行】: audience="authenticated" で署名と有効期限を検証 🔵
        payload = jwt.decode(
            token,
            verification_key,
            algorithms=algorithms,
            audience="authenticated",
        )

        # 【expクレーム確認】: expが欠落している場合は拒否 🔵
        # python-jose は exp がない場合でもエラーを出さないため手動で確認する
        # TC-008: expクレームなしトークンの拒否
        if "exp" not in payload:
            return None

        # 【user_id取得】: subクレームをuser_idとして返す 🔵
        # Supabase JWT仕様: subクレームがuser_id（UUID形式）
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            # 【subクレーム確認】: subが欠落している場合は拒否 (TC-007対応) 🟡
            return None

        return user_id

    except (JWTError, httpx.HTTPError):
        # 【例外処理】: 署名不正・期限切れ・クレーム不足など全てのJWTエラーを捕捉 🔵
        # NFR-101: 不正なトークンは全て拒否してNoneを返す
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
) -> str:
    """
    【機能概要】: FastAPI依存関数 - Bearer認証でuser_idを取得する
    【実装方針】: HTTPBearer() 経由でトークンを受け取り verify_token() で検証
    【テスト対応】: TC-002, TC-005, TC-006, TC-004ext を通すための実装
    🔵 信頼性レベル: auth-flow-requirements.md セクション2「get_current_user()」より

    使用方法:
        @router.get("/protected")
        async def protected_endpoint(user_id: str = Depends(get_current_user)):
            return {"user_id": user_id}

    Args:
        credentials: FastAPI HTTPBearer が解析した認証情報

    Returns:
        str: 認証済みユーザーのuser_id

    Raises:
        HTTPException(401): トークンが無効または期限切れの場合
        HTTPException(403): Authorizationヘッダーが存在しない場合（HTTPBearer自動処理）
    """
    # 【トークン検証】: BearerトークンをJWT検証にかける 🔵
    user_id = verify_token(credentials.credentials)

    if user_id is None:
        # 【認証エラー】: 無効・期限切れトークンは401を返す 🔵
        # NFR-102: 全APIエンドポイントでJWT検証必須
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    return user_id


async def get_current_user_from_header_or_query(
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer_optional),
) -> str:
    """
    Streaming endpoints are authenticated with Bearer headers only.
    JWTs in query strings are rejected to avoid leaking tokens through URLs.
    """
    raw_token = credentials.credentials if credentials else None

    if raw_token is None:
        raise HTTPException(
            status_code=403,
            detail="Not authenticated",
        )

    user_id = verify_token(raw_token)
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    return user_id


# ─── OAuth トークン対称暗号化（Fernet） ──────────────────────────────────
# Google OAuth の access_token / refresh_token を DB に保管する際、平文ではなく
# Fernet で暗号化してから格納する。鍵は settings.OAUTH_TOKEN_ENC_KEY（env 経由）。
# 鍵未設定（dev 想定）の場合は warning を出して平文をそのまま返す ＝ 後方互換動作。
# 復号失敗時は None を返し、呼び出し側で再連携を促す。

_FERNET_INSTANCE: Optional[Fernet] = None
_FERNET_WARNED_NO_KEY = False


def _get_fernet() -> Optional[Fernet]:
    """OAUTH_TOKEN_ENC_KEY からシングルトンの Fernet を返す。
    production では鍵未設定 / malformed は起動時に raise している前提（main.py で gate）
    だが、このモジュール単独使用に備え warning + None で防御的に動く。"""
    global _FERNET_INSTANCE, _FERNET_WARNED_NO_KEY
    if _FERNET_INSTANCE is not None:
        return _FERNET_INSTANCE
    key = settings.OAUTH_TOKEN_ENC_KEY
    if not key:
        if _is_production():
            raise RuntimeError(
                "OAUTH_TOKEN_ENC_KEY is required in production. "
                "Generate one with `python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
                "and set it in the deployment environment."
            )
        if not _FERNET_WARNED_NO_KEY:
            logger.warning(
                "OAUTH_TOKEN_ENC_KEY is not set. Google OAuth tokens are stored in plaintext. "
                "Set OAUTH_TOKEN_ENC_KEY before production deployment.",
            )
            _FERNET_WARNED_NO_KEY = True
        return None
    try:
        _FERNET_INSTANCE = Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:  # noqa: BLE001
        if _is_production():
            raise RuntimeError("OAUTH_TOKEN_ENC_KEY is malformed (must be a valid Fernet key)")
        logger.error("OAUTH_TOKEN_ENC_KEY is malformed (must be a valid Fernet key)")
        return None
    return _FERNET_INSTANCE


def encrypt_token(plaintext: str) -> str:
    """OAuth トークンを暗号化。
    - production: 鍵が無ければ _get_fernet が raise するので必ず暗号化される（fail-closed）
    - dev: 鍵未設定なら平文をそのまま返す（dev fallback）
    """
    if not plaintext:
        return plaintext
    f = _get_fernet()
    if f is None:
        # _is_production() なら _get_fernet が raise しているのでここに来ない
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(value: Optional[str]) -> Optional[str]:
    """暗号化トークンを復号。
    - production: 復号失敗 = 不正な値。**None を返す**（呼び出し側で再連携誘導）
    - dev: 復号失敗 = 旧 row の平文と判断し、そのまま返す（後方互換）
    """
    if value is None or value == "":
        return value
    f = _get_fernet()
    if f is None:
        # 鍵未設定なら value は平文として扱う（dev のみ。production では _get_fernet が raise）
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except InvalidToken:
        if _is_production():
            # production: 復号できない値は信頼しない。再連携を促すため None を返す。
            logger.warning("decrypt_token: invalid token in production, returning None to force re-auth")
            return None
        # dev: 旧 row（平文）の可能性を優先し、そのまま返す（後方互換）
        logger.warning("decrypt_token: invalid token, returning as-is (legacy plaintext, dev only)")
        return value
