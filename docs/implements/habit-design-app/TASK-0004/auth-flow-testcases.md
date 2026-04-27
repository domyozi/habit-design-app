# 認証フロー実装 テストケース定義書

**タスクID**: TASK-0004
**機能名**: auth-flow
**作成日**: 2026-04-13

---

## 1. 正常系テストケース

### TC-001: 有効なJWTトークンの検証
- **テスト名**: 有効なJWTトークンで user_id が返される
- **何をテストするか**: `verify_token()` が正しい署名・有効期限内のJWTを受け取った場合にuser_idを返すこと
- **入力値**: HS256署名・audience="authenticated"・exp=1時間後 のJWT
- **期待される結果**: UUID形式のuser_id文字列（`"00000000-0000-0000-0000-000000000001"`）
- **テストの目的**: 正常な認証フローの基本動作確認
- 🔵 *TASK-0004.md テストケース1より*

### TC-002: 認証済みAPIエンドポイントへの有効トークンアクセス
- **テスト名**: 有効なBearerトークンで認証エンドポイントが200を返す
- **何をテストするか**: `get_current_user` 依存関数が `Authorization: Bearer <valid_token>` を受け取り正常処理すること
- **入力値**: `Authorization: Bearer <valid_token>` ヘッダー付きリクエスト
- **期待される結果**: HTTP 200、user_idが取得できる
- **テストの目的**: FastAPI依存関数経由のJWT検証が正常動作することを確認
- 🔵 *TASK-0004.md テストケース5より*

---

## 2. 異常系テストケース

### TC-003: 不正な署名のJWT検証
- **テスト名**: 署名が不正なJWTで None が返される
- **何をテストするか**: `verify_token()` が異なるシークレットで署名されたJWTを拒否すること
- **入力値**: 別のシークレット（`"wrong-secret"`）で署名したJWT
- **期待される結果**: `None`
- **テストの目的**: 不正トークンの拒否を確認（NFR-101）
- 🔵 *TASK-0004.md テストケース2より*

### TC-004: 期限切れJWTの検証
- **テスト名**: 有効期限切れのJWTで None が返される
- **何をテストするか**: `verify_token()` が過去のexpを持つJWTを拒否すること
- **入力値**: `exp` が1時間前のJWT（正しい署名）
- **期待される結果**: `None`
- **テストの目的**: トークン期限切れの適切な処理確認
- 🔵 *TASK-0004.md テストケース3より*

### TC-005: Authorizationヘッダーなしでのアクセス
- **テスト名**: 未認証リクエストで401が返される
- **何をテストするか**: `Authorization` ヘッダーなしのリクエストが拒否されること
- **入力値**: ヘッダーなしのHTTPリクエスト
- **期待される結果**: HTTP 403 または 401（HTTPBearerが先に403を返す）
- **テストの目的**: 未認証アクセスの拒否確認（NFR-102）
- 🔵 *TASK-0004.md テストケース4より*

### TC-006: 無効トークンでのAPIアクセス
- **テスト名**: 無効なBearerトークンで401が返される
- **何をテストするか**: `get_current_user` が不正JWTを含むリクエストを401で拒否すること
- **入力値**: `Authorization: Bearer <invalid_token>` ヘッダー付きリクエスト
- **期待される結果**: HTTP 401、`{"detail": "Invalid or expired token"}`
- **テストの目的**: 認証ミドルウェアのエラーレスポンス確認
- 🔵 *NFR-102・api-endpoints.md エラーレスポンスより*

---

## 3. 境界値テストケース

### TC-007: subクレームが欠落したJWT
- **テスト名**: subクレームなしのJWTで None が返される
- **何をテストするか**: `verify_token()` が `sub` クレームのないJWTを適切に拒否すること
- **入力値**: `sub` を含まないJWTペイロード
- **期待される結果**: `None`
- **テストの目的**: 不完全なJWTペイロードへの堅牢性確認
- 🟡 *要件定義 制約条件・Supabase JWT特性より推測*

### TC-008: expクレームが欠落したJWT
- **テスト名**: expクレームなしのJWTで None が返される
- **何をテストするか**: `verify_token()` が `exp` クレームのないJWTを拒否すること
- **入力値**: `exp` を含まないJWTペイロード
- **期待される結果**: `None`
- **テストの目的**: 有効期限なしトークンの拒否確認
- 🟡 *security.py 実装仕様より推測*

---

## 4. 開発言語・フレームワーク

- **プログラミング言語**: Python 3.12
  - **理由**: バックエンドがFastAPI/Python構成のため
- **テストフレームワーク**: pytest + FastAPI TestClient
  - **理由**: FastAPIの公式テスト推奨。httpxベースで非同期対応
  - **JWT生成**: `python-jose` の `jwt.encode()` でテスト用トークン生成
  - **実行コマンド**: `cd backend && source .venv/bin/activate && pytest tests/ -v`
- 🔵 *note.md テスト関連情報より*

---

## 5. テストファイル構成

```
backend/
└── tests/
    ├── __init__.py
    ├── conftest.py        # フィクスチャ: client, valid_token, expired_token, invalid_token
    └── test_security.py   # TC-001〜TC-008
```

### conftest.py の主要フィクスチャ

```python
TEST_JWT_SECRET = "test-secret-key-for-unit-tests"
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

# valid_token: 1時間有効・正しい署名
# expired_token: -1時間（期限切れ）・正しい署名
# invalid_token: 1時間有効・wrong-secret署名
# client: TestClient(app)
```

### 環境変数の上書き（テスト時）

```python
# conftest.py で SUPABASE_JWT_SECRET を TEST_JWT_SECRET に上書き
import os
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET
```

---

## 6. 要件定義との対応関係

- **参照した機能概要**: `auth-flow-requirements.md` セクション1（verify_token, get_current_user）
- **参照した入力・出力仕様**: セクション2（JWT検証仕様、HTTPレスポンス）
- **参照した制約条件**: セクション3（NFR-101, NFR-102, JWT仕様）
- **参照した使用例**: セクション4（正常系・異常系シナリオ）

---

## 品質判定

- **テストケース分類**: 正常系2, 異常系4, 境界値2 ✅ 網羅的
- **期待値定義**: 全TC明確 ✅
- **技術選択**: pytest + TestClient 確定 ✅
- **実装可能性**: 既存仮想環境で実現可能 ✅
- **信頼性レベル**: 🔵 6件 (75%), 🟡 2件 (25%) → **高品質** ✅
