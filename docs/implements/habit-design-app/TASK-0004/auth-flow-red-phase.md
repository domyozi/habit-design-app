# 認証フロー実装 Redフェーズ記録

**タスクID**: TASK-0004
**機能名**: auth-flow
**作成日**: 2026-04-13
**フェーズ**: Red（失敗するテスト作成）

---

## 作成したテストケース一覧

| テストID | テスト名 | テストクラス | 対応TC |
|---------|---------|------------|--------|
| TC-001 | valid_token_returns_user_id | TestVerifyToken | TC-001 |
| TC-003 | invalid_signature_returns_none | TestVerifyToken | TC-003 |
| TC-004 | expired_token_returns_none | TestVerifyToken | TC-004 |
| TC-007 | token_without_sub_returns_none | TestVerifyToken | TC-007 |
| TC-008 | token_without_exp_returns_none | TestVerifyToken | TC-008 |
| TC-002 | valid_bearer_token_returns_200 | TestAuthEndpoint | TC-002 |
| TC-005 | no_auth_header_returns_403 | TestAuthEndpoint | TC-005 |
| TC-006 | invalid_bearer_token_returns_401 | TestAuthEndpoint | TC-006 |
| TC-004ext | expired_bearer_token_returns_401 | TestAuthEndpoint | TC-004拡張 |

**合計**: 9テストケース

---

## テストファイル構成

```
backend/
└── tests/
    ├── __init__.py
    ├── conftest.py        # フィクスチャ: client, valid_token, expired_token, invalid_token, token_without_sub, token_without_exp
    └── test_security.py   # TC-001〜TC-008 (9テストケース)
```

---

## 期待される失敗内容

### 現在の失敗状態

```
ModuleNotFoundError: No module named 'app.core.security'
```

テストは `app.core.security` モジュールを `import` しようとしているが、ファイルが存在しないため失敗する。これはTDDのRedフェーズとして**正しい状態**。

### 実装後に期待される動作

Greenフェーズで以下を実装することでテストが通る：

1. `backend/app/core/security.py` - `verify_token()` と `get_current_user()` の実装
2. `backend/app/core/config.py` - `Settings` クラス（pydantic-settings使用）
3. `backend/app/api/routes/me.py` - `/api/v1/me` エンドポイントの実装
4. `backend/app/main.py` - ルーターのマウント

---

## Greenフェーズで実装すべき内容

### 1. `backend/app/core/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_JWT_SECRET: str
    # ...

    class Config:
        env_file = ".env"

settings = Settings()
```

### 2. `backend/app/core/security.py`

```python
from jose import jwt, JWTError
from typing import Optional
from .config import settings

def verify_token(token: str) -> Optional[str]:
    """JWTトークンを検証してuser_idを返す"""
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]}
        )
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return user_id
    except JWTError:
        return None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())):
    """FastAPI依存関数: Bearer認証でuser_idを取得"""
    user_id = verify_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id
```

### 3. `/api/v1/me` エンドポイント

```python
@router.get("/me")
async def get_me(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}
```

---

## テスト実行コマンド

```bash
cd backend && source .venv/bin/activate && pytest tests/test_security.py -v
```

---

## 品質評価

- **テスト実行**: 失敗確認済み（ModuleNotFoundError）✅ Redフェーズ正常
- **期待値**: 明確で具体的 ✅
- **アサーション**: 適切（status_code, response body, user_id確認） ✅
- **実装方針**: 明確（security.py, config.py, me エンドポイント） ✅
- **信頼性レベル**: 🔵 7件 (78%), 🟡 2件 (22%) → **高品質** ✅
