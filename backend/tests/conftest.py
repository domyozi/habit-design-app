"""
テスト共通フィクスチャ
TASK-0004: 認証フロー実装のテスト用共通設定
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt

# テスト用定数
# 【設定理由】: 本番のSUPABASE_JWT_SECRETとは異なるテスト専用シークレットを使用し、
#              テストが本番環境に影響しないよう分離する
TEST_JWT_SECRET = "test-secret-key-for-unit-tests"
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

# 【環境変数上書き】: テスト実行前にSUPABASE_JWT_SECRETをテスト用シークレットに上書き
# これにより verify_token() がテスト用トークンを正しく検証できる
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET


@pytest.fixture(scope="session")
def client():
    """
    【フィクスチャ目的】: FastAPI TestClientを提供する
    【使用理由】: HTTPリクエストをシミュレートして認証エンドポイントをテストするため
    """
    from app.main import app
    return TestClient(app)


@pytest.fixture
def valid_token():
    """
    【フィクスチャ目的】: 有効なJWTトークンを生成する
    【トークン仕様】:
    - アルゴリズム: HS256
    - audience: "authenticated" (Supabase固定値)
    - 有効期限: 現在時刻から1時間後
    - sub: TEST_USER_ID (UUID形式)
    - 署名: TEST_JWT_SECRET
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": TEST_USER_ID,
        "aud": "authenticated",
        "exp": now + timedelta(hours=1),
        "iat": now,
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


@pytest.fixture
def expired_token():
    """
    【フィクスチャ目的】: 有効期限切れのJWTトークンを生成する
    【トークン仕様】:
    - expが1時間前（期限切れ）
    - 署名は正しいTEST_JWT_SECRET
    【使用理由】: 期限切れトークンの拒否を確認するため
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": TEST_USER_ID,
        "aud": "authenticated",
        "exp": now - timedelta(hours=1),
        "iat": now - timedelta(hours=2),
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


@pytest.fixture
def invalid_token():
    """
    【フィクスチャ目的】: 不正な署名のJWTトークンを生成する
    【トークン仕様】:
    - 有効期限: 現在時刻から1時間後（有効）
    - 署名: "wrong-secret"（不正なシークレット）
    【使用理由】: 署名検証の失敗を確認するため (TC-003対応)
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": TEST_USER_ID,
        "aud": "authenticated",
        "exp": now + timedelta(hours=1),
        "iat": now,
    }
    return jwt.encode(payload, "wrong-secret", algorithm="HS256")


@pytest.fixture
def token_without_sub():
    """
    【フィクスチャ目的】: subクレームなしのJWTトークンを生成する
    【トークン仕様】:
    - subクレームを含まない
    - 有効期限: 現在時刻から1時間後
    【使用理由】: 不完全なJWTペイロードへの堅牢性確認 (TC-007対応)
    """
    now = datetime.now(timezone.utc)
    payload = {
        "aud": "authenticated",
        "exp": now + timedelta(hours=1),
        "iat": now,
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


@pytest.fixture
def token_without_exp():
    """
    【フィクスチャ目的】: expクレームなしのJWTトークンを生成する
    【トークン仕様】:
    - expクレームを含まない
    - subとaudは正常
    【使用理由】: 有効期限なしトークンの拒否確認 (TC-008対応)
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": TEST_USER_ID,
        "aud": "authenticated",
        "iat": now,
    }
    # python-joseはoptions={"verify_exp": False}なしでexpなしトークンを生成可能
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")
