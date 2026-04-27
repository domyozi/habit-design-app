# TASK-0004 開発コンテキストノート

## 1. 技術スタック

### バックエンド
- **フレームワーク**: FastAPI 0.111 + Python 3.12
- **JWT検証**: python-jose[cryptography] 3.3.x
- **設定管理**: pydantic-settings（要インストール）
- **DBクライアント**: supabase-py 2.x（service_role key使用）
- **テスト**: pytest + httpx（TestClient）
- 参照元: `docs/design/habit-design-app/architecture.md`

### フロントエンド
- **認証**: @supabase/supabase-js 2.x（createClient）
- **状態管理**: Zustand 4.x
- **ルーティング**: React Router v6
- **環境変数**: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- 参照元: `docs/design/habit-design-app/architecture.md`

## 2. 開発ルール

- Pydantic v2 を使用（`class Config:` 不可）
- ただし Settings は pydantic-settings の BaseSettings を使用
- `.env` から環境変数を読み込む
- JWT audience は `"authenticated"` （Supabase固定値）
- service_role key はバックエンドのみで使用（フロントエンドに絶対公開しない）
- テスト用JWTシークレットは本番と異なる値を使用
- 参照元: `docs/tasks/habit-design-app/TASK-0004.md`

## 3. 関連実装

- 既存の実装: `backend/app/main.py`（FastAPI基本構成・CORSミドルウェア）
- 既存の core: `backend/app/core/__init__.py`（空）
- 後続で使用される: `backend/app/core/security.py` の `get_current_user` が全APIエンドポイントで使われる
- 参照元: `backend/app/main.py`

## 4. 設計文書

- アーキテクチャ: `docs/design/habit-design-app/architecture.md`
- API仕様（認証ヘッダー）: `docs/design/habit-design-app/api-endpoints.md`
  - `Authorization: Bearer {supabase_access_token}`
  - エラーレスポンス: `{"success": false, "error": {"code": "...", "message": "..."}}`
- 型定義: `docs/design/habit-design-app/interfaces.ts`
- 参照元: `docs/design/habit-design-app/`

## 5. テスト関連情報

### テストフレームワーク
- **Python**: pytest（仮想環境に含まれる）
- **TestClient**: `from fastapi.testclient import TestClient`（httpxベース）
- **JWT生成**: `from jose import jwt`（テスト用トークン作成）

### テストディレクトリ構成（新規作成）
```
backend/
└── tests/
    ├── __init__.py
    ├── conftest.py        # 共通フィクスチャ（TestClient, トークン生成）
    └── test_security.py   # JWT検証テスト（5ケース）
```

### テストフィクスチャ
- `client`: TestClient(app)
- `valid_token`: 有効なJWT（1時間有効）
- `expired_token`: 期限切れJWT（-1時間）
- `invalid_token`: 不正署名JWT

### 注意事項
- テスト用JWTシークレット: `"test-secret-key-for-unit-tests"`
- テスト用USER_ID: `"00000000-0000-0000-0000-000000000001"`
- テスト時は `SUPABASE_JWT_SECRET` 環境変数を test secret に上書きが必要

## 6. 注意事項

### 未インストール
- `pydantic-settings` が未インストール → `pip install pydantic-settings` が必要

### Supabase JWT の特性
- audience: `"authenticated"`（必須）
- アルゴリズム: `HS256`
- `sub` クレームが user_id（UUID形式）

### フロントエンド
- 認証コールバックURL `http://localhost:5173/auth/callback` を Supabase `Authentication > URL Configuration > Redirect URLs` に登録が必要
- `supabase.auth.onAuthStateChange` でセッション変更を監視

### 環境変数
- `backend/.env`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET 設定済み
- `frontend/.env`: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 設定済み
- 参照元: `docs/tasks/habit-design-app/TASK-0004.md`

### 既知の未解決不具合（後続タスクで対応）
詳細: `docs/implements/habit-design-app/TASK-0004/followup-issues.md`

- **BUG-0001** [Medium]: ログアウト導線が UI にない → TASK-0013/0014 で対応
- **BUG-0002** [Medium]: Authorization ヘッダー欠落時に 403 が返る（401 が期待値）→ TASK-0005 で対応
  - 修正方法: `HTTPBearer(auto_error=False)` + `get_current_user` 内で手動 401
- **BUG-0003** [Low]: onAuthStateChange の購読解除なし（StrictMode 二重登録）→ TASK-0012 で対応
