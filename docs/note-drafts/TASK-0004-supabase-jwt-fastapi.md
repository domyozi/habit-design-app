# Supabase Auth + FastAPI の JWT 検証をTDDで実装する

## この記事でわかること

- Supabase が発行する JWT の構造と FastAPI での検証方法
- TDD（テスト駆動開発）で認証ミドルウェアを作る手順
- python-jose の落とし穴と `exp` クレーム欠落への対処法

---

## 背景：認証は「動けばいい」では危ない

認証まわりのバグはセキュリティインシデントに直結する。
だからこそ TDD で「テストが先・実装が後」の順で作った。
テストを先に書くことで「何を保証しているか」が明確になり、
仕様漏れに気づきやすくなる。

---

## Supabase JWT の構造

Supabase Auth が発行する JWT には以下のクレームが含まれる。

```json
{
  "sub": "00000000-0000-0000-0000-000000000001",  // user_id
  "aud": "authenticated",                          // 固定値
  "exp": 1776083655,                               // 有効期限
  "iat": 1776080055,                               // 発行時刻
  "role": "authenticated"
}
```

**重要なポイント：**
- `sub` クレームが user_id（UUID形式）
- `aud` は必ず `"authenticated"`（固定値）
- アルゴリズムは `HS256`（署名に `SUPABASE_JWT_SECRET` を使用）

---

## TDD の流れ：8つのテストを先に書く

### Redフェーズ：先にテストを書いて失敗させる

```python
# backend/tests/test_security.py（実装前に書く）
from app.core.security import verify_token  # まだ存在しない

def test_valid_token_returns_user_id(valid_token):
    result = verify_token(valid_token)
    assert result == "00000000-0000-0000-0000-000000000001"

def test_invalid_signature_returns_none(invalid_token):
    result = verify_token(invalid_token)
    assert result is None
```

```
ModuleNotFoundError: No module named 'app.core.security'
```

この「赤いテスト」こそが TDD のスタートライン。
エラーメッセージが「何を作るべきか」の仕様書になる。

### Greenフェーズ：テストを通す最小実装

```python
# backend/app/core/security.py
from jose import JWTError, jwt
from typing import Optional
from app.core.config import settings

def verify_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        # expクレームの手動チェック（後述）
        if "exp" not in payload:
            return None
        return payload.get("sub")
    except JWTError:
        return None
```

---

## ハマったこと：python-jose は `exp` なしトークンを通してしまう

`options={"require": ["exp", "sub"]}` を渡しても、python-jose 3.3.0 では `exp` 欠落トークンを拒否しない挙動があった。

```python
# 期待した動作（動かなかった）
payload = jwt.decode(
    token,
    secret,
    algorithms=["HS256"],
    audience="authenticated",
    options={"require": ["exp", "sub"]},  # ← exp なしトークンを通してしまう
)

# 実際の解決策
payload = jwt.decode(...)
if "exp" not in payload:
    return None  # 手動で弾く
```

TDD があったから「TC-008: expクレームなしのJWTで None が返される」という
テストが失敗したことで即座に検知できた。テストなしだと本番まで気づかなかった可能性がある。

---

## FastAPI 依存関数パターン

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

http_bearer = HTTPBearer(auto_error=True)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
) -> str:
    user_id = verify_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )
    return user_id

# 使い方
@router.get("/habits")
async def get_habits(user_id: str = Depends(get_current_user)):
    # user_id は検証済みの UUID 文字列
    ...
```

**設計のポイント：**
- `Depends(get_current_user)` を付けるだけで全エンドポイントを保護できる
- `verify_token()` と `get_current_user()` を分離することで単体テストが書きやすい

---

## テスト用フィクスチャの設計

```python
# backend/tests/conftest.py
import os
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from jose import jwt

TEST_JWT_SECRET = "test-secret-key-for-unit-tests"
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

# テスト開始前に本番シークレットを上書き
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET

@pytest.fixture
def valid_token():
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": TEST_USER_ID,
        "aud": "authenticated",
        "exp": now + timedelta(hours=1),
    }, TEST_JWT_SECRET, algorithm="HS256")
```

**`os.environ` での上書きタイミング：**
`import` 前に環境変数を設定する必要がある。
`conftest.py` のモジュールトップレベルで書くことで、pydantic-settings の初期化より前に反映される。

---

## フロントエンドとの連携：authStore.ts

```typescript
// frontend/src/store/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const useAuthStore = create((set) => ({
  session: null,
  isLoading: true,

  initialize: () => {
    // ページリロード後もセッションを復元
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, isLoading: false })
    })
    // リアルタイムで認証状態変化を検知
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isLoading: false })
    })
  },
}))
```

`getSession()` + `onAuthStateChange()` の組み合わせで、
リロード後のセッション復元とリアルタイム更新の両方を担保する。

---

## 既知の残課題（後続タスクで対応）

1. **ログアウトボタンがUIにない** → TASK-0013（認証画面）で追加予定
2. **ヘッダーなし時が 403 → 401 が理想** → `HTTPBearer(auto_error=False)` に切り替えで解決可能
3. **onAuthStateChange の二重購読** → `useEffect` クリーンアップで `subscription.unsubscribe()` を呼ぶ

完璧を目指すより「動く状態で記録してから改善する」ほうが前に進む。
不具合は `followup-issues.md` に記録して次タスクへ申し送り。

---

## アーキテクト視点のまとめ

**TDD が真価を発揮した場面：**

> `exp` なしトークンを python-jose が通してしまうバグを、
> テスト TC-008 が即座に捕捉した。
> テストなしなら本番まで気づかなかったかもしれない。

認証まわりは特に「動いているように見えて穴がある」ことが多い。
テストで「何を保証しているか」を明文化することが、
チームで安全に開発するための共通言語になる。

**次回**: FastAPI 共通基盤（ルーター・エラーハンドリング・レスポンス統一）実装編
