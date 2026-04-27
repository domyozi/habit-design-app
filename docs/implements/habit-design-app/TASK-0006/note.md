# TASK-0006 タスクノート

## 1. 技術スタック

- **言語**: Python 3.12
- **フレームワーク**: FastAPI 0.111 + Pydantic v2
- **DB**: Supabase PostgreSQL（supabase-py 2.x、service_role キーで RLS バイパス）
- **認証**: JWT（python-jose）+ `get_current_user` Depends
- **テストフレームワーク**: pytest + unittest.mock
- **テストクライアント**: FastAPI TestClient（starlette）
- **参照元**: backend/CLAUDE.md, docs/design/habit-design-app/architecture.md

## 2. 開発ルール

- **ファイルサイズ制限**: 実装ファイル 800行以下、テストファイル 500行以下
- **モック制限**: 実装コードにモック禁止。テストコードのみ unittest.mock 使用
- **信頼性レベル**: 🔵（API仕様準拠）, 🟡（推測）, 🔴（仕様外）を記載
- **日本語コメント**: 関数・処理ブロックに必須
- **エラーレスポンス**: `ErrorResponse` 形式統一（TASK-0005で実装済み）
- **認証**: 全エンドポイントで `Depends(get_current_user)` を使用
- **参照元**: backend/CLAUDE.md

## 3. 関連実装

### 既存の認証実装
- **認証関数**: `backend/app/core/security.py` - `get_current_user`, `verify_token`
- **HTTPBearer**: `auto_error=True`（未設定時403）、BUG-0002として記録済み
- **テストパターン**: `backend/tests/conftest.py` - `valid_token`, `client` フィクスチャ

### 既存のスキーマ
- `backend/app/models/schemas.py` の以下を活用:
  - `APIResponse[T]`, `ErrorResponse`, `ErrorDetail`
  - `UserProfile`, `WannaBe`, `Goal` (レスポンス用)
  - `UpdateUserProfileRequest`, `CreateGoalRequest` (リクエスト用)
  - `UpsertWannaBeRequest` はTASK-0010(AI分析)で使う想定

### 既存の例外クラス
- `backend/app/core/exceptions.py`:
  - `NotFoundError` → 404
  - `ForbiddenError` → 403
  - `ConflictError` → 409
  - `AppError` 基底クラス

### テスト参照パターン
- `backend/tests/test_security.py` のパターンを参照
- `TestClient(app)` でエンドポイントを叩く
- Supabase クライアントは `unittest.mock.patch` でモック

## 4. 設計文書

### API仕様
- **参照元**: `docs/design/habit-design-app/api-endpoints.md`

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/api/v1/users/me` | GET | プロフィール取得 |
| `/api/v1/users/me` | PATCH | プロフィール更新 |
| `/api/v1/wanna-be` | GET | 現在のWanna Be取得（未登録時204） |
| `/api/v1/goals` | POST | 目標保存（最大3件）|
| `/api/v1/notifications/settings` | GET | 通知設定取得 |
| `/api/v1/notifications/settings` | PATCH | 通知設定更新 |

### DBスキーマ
- **参照元**: `docs/design/habit-design-app/database-schema.sql`

**user_profiles**:
- `id` UUID PK (auth.users FK)
- `display_name` VARCHAR(100) nullable
- `timezone` VARCHAR(50) DEFAULT 'Asia/Tokyo'
- `weekly_review_day` SMALLINT DEFAULT 5（1〜7）
- `notification_email` VARCHAR(255) nullable
- `notification_enabled` BOOLEAN DEFAULT true

**wanna_be**:
- `id` UUID PK
- `user_id` UUID FK
- `text` TEXT NOT NULL
- `version` INTEGER DEFAULT 1
- `is_current` BOOLEAN DEFAULT true

**goals**:
- `id` UUID PK
- `user_id` UUID FK
- `wanna_be_id` UUID FK nullable
- `title` VARCHAR(200) NOT NULL
- `description` TEXT nullable
- `display_order` SMALLINT DEFAULT 0
- `is_active` BOOLEAN DEFAULT true

### 要件
- **REQ-204**: 長期目標は最大3件まで（保存時点で3件超ならVALIDATION_ERROR）
- **REQ-701**: weekly_review_day は1〜7（1=月曜, 7=日曜）
- **REQ-801/802**: 通知設定（notification_email, notification_enabled）

## 5. テスト関連情報

### テスト実行コマンド
```bash
source .venv/bin/activate
pytest tests/ -v
pytest tests/test_users_wanna_be_goals.py -v  # 今回のテストファイル
```

### テストディレクトリ構成
```
backend/
  tests/
    __init__.py
    conftest.py          # 共通フィクスチャ（valid_token等）
    test_security.py     # TASK-0004テスト
    test_users_wanna_be_goals.py  # TASK-0006で作成
```

### Supabase モック戦略
```python
from unittest.mock import MagicMock, patch

# Supabase クライアントをモックして DB 依存をなくす
@patch("app.api.routes.users.get_supabase")
def test_something(mock_get_supabase, client, valid_token):
    mock_supabase = MagicMock()
    mock_get_supabase.return_value = mock_supabase
    
    # supabase.table(...).select(...).eq(...).single().execute() の返り値を設定
    mock_supabase.table.return_value.select.return_value \
        .eq.return_value.single.return_value.execute.return_value \
        .data = {"id": "uuid", "display_name": "Test User", ...}
```

### 既存フィクスチャ（conftest.py から利用可能）
- `client`: TestClient インスタンス
- `valid_token`: 有効な JWT トークン（TEST_USER_ID = "00000000-0000-0000-0000-000000000001"）
- `expired_token`, `invalid_token`: テスト用不正トークン

## 6. 注意事項

### BUG-0002（既知）
- `HTTPBearer(auto_error=True)` は Authorization ヘッダーなし時に 403 を返す（本来は 401 が理想）
- 現状このまま（TASK-0005以降で修正予定）
- テストでは 403 が返ることを受け入れる

### POST /goals の処理フロー（重要）
1. 現在の `is_active=true` な目標件数 + 今回の件数が3超 → VALIDATION_ERROR（400）
2. 既存の `is_active=true` 目標を全て `is_active=false` に更新
3. 新しい目標を INSERT（display_order は 0,1,2... で設定）
- **エラー時**: 既存目標の状態を復元（トランザクション的な処理が必要）

### POST /wanna-be/analyze は TASK-0010 でのみ実装
- 今回は GET /wanna-be のみ実装

### NotificationSettings スキーマ（schemas.py 未定義）
- `user_profiles` の一部フィールドを返す専用モデルが必要
- TASK-0006 内で `backend/app/models/schemas.py` に追加

### テスト用 TEST_USER_ID
- `"00000000-0000-0000-0000-000000000001"` が `valid_token` の sub クレーム
- Supabase モックのフィルタ条件に使用
