# TDD開発メモ: auth-flow

## 概要

- 機能名: 認証フロー実装（Supabase Auth + JWT検証）
- 開発開始: 2026-04-13
- 現在のフェーズ: Red → Green（次フェーズ）

## 関連ファイル

- 元タスクファイル: `docs/tasks/habit-design-app/TASK-0004.md`
- 要件定義: `docs/implements/habit-design-app/TASK-0004/auth-flow-requirements.md`
- テストケース定義: `docs/implements/habit-design-app/TASK-0004/auth-flow-testcases.md`
- Redフェーズ記録: `docs/implements/habit-design-app/TASK-0004/auth-flow-red-phase.md`
- 実装ファイル（予定）:
  - `backend/app/core/config.py`
  - `backend/app/core/security.py`
  - `backend/app/api/routes/me.py`
- テストファイル:
  - `backend/tests/conftest.py`
  - `backend/tests/test_security.py`

---

## Redフェーズ（失敗するテスト作成）

### 作成日時

2026-04-13

### テストケース

- TC-001: 有効なJWTトークンで user_id が返される（verify_token）
- TC-002: 有効なBearerトークンで認証エンドポイントが200を返す
- TC-003: 署名が不正なJWTで None が返される（verify_token）
- TC-004: 有効期限切れのJWTで None が返される（verify_token）
- TC-005: Authorizationヘッダーなしで403が返される
- TC-006: 無効なBearerトークンで401が返される
- TC-007: subクレームなしのJWTで None が返される（verify_token）
- TC-008: expクレームなしのJWTで None が返される（verify_token）
- TC-004ext: 期限切れBearerトークンで401が返される

### テストファイル

- `backend/tests/conftest.py`: フィクスチャ定義
- `backend/tests/test_security.py`: テストケース実装

### 期待される失敗

```
ModuleNotFoundError: No module named 'app.core.security'
```

### 次のフェーズへの要求事項

Greenフェーズで実装すべきファイル：

1. **`backend/app/core/config.py`**
   - `Settings` クラス（pydantic-settings の BaseSettings 使用）
   - `SUPABASE_JWT_SECRET` 環境変数の読み込み

2. **`backend/app/core/security.py`**
   - `verify_token(token: str) -> Optional[str]`: JWT検証
     - HS256、audience="authenticated"
     - 検証失敗・例外は全て None を返す
     - expとsubが必須
   - `get_current_user()`: FastAPI依存関数
     - HTTPBearer() 経由でトークン取得
     - verify_token() が None の場合、HTTPException(401, "Invalid or expired token")

3. **`backend/app/api/routes/me.py`**（または `backend/app/main.py` に一時追加）
   - `GET /api/v1/me` エンドポイント
   - Depends(get_current_user) で認証
   - レスポンス: `{"user_id": "<uuid>"}`

4. **`backend/app/main.py`**
   - `/api/v1` プレフィックスでルーターをマウント

---

## Greenフェーズ（最小実装）

### 実装日時

（未実施）

### 実装方針

（未実施）

### 実装コード

（未実施）

### テスト結果

（未実施）

### 課題・改善点

（未実施）

---

## Refactorフェーズ（品質改善）

### リファクタ日時

（未実施）

### 改善内容

（未実施）

---
