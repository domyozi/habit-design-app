"""
認証フロー実装 テスト (TASK-0004)
TC-001〜TC-008 のテストケースを実装する

テスト対象:
- verify_token(): JWT検証関数
- get_current_user(): FastAPI依存関数（Bearer認証）
- 認証エンドポイント: /api/me (テスト用エンドポイント)
"""
import base64
import json

import pytest
from fastapi.testclient import TestClient

from app.core.security import verify_token


class TestVerifyToken:
    """
    verify_token() のユニットテスト
    対象: app.core.security.verify_token
    """

    def test_valid_token_returns_user_id(self, valid_token):
        """
        TC-001: 有効なJWTトークンで user_id が返される

        【テスト目的】: verify_token() が正しい署名・有効期限内のJWTを受け取った場合にuser_idを返すこと
        【テスト内容】: HS256署名・audience="authenticated"・exp=1時間後のJWTを渡す
        【期待される動作】: UUID形式のuser_id文字列が返される
        🔵 信頼性レベル: auth-flow-testcases.md TC-001より
        """
        # 【テストデータ準備】: conftest.pyのvalid_tokenフィクスチャで生成した有効なJWT
        # 【初期条件設定】: SUPABASE_JWT_SECRET=TEST_JWT_SECRET で設定済み

        # 【実際の処理実行】: verify_token()にvalidトークンを渡す
        # 【処理内容】: JWTの署名・有効期限・audienceを検証してsubクレーム(user_id)を返す
        result = verify_token(valid_token)

        # 【結果検証】: user_idが正しいUUID形式で返されること
        # 【期待値確認】: TEST_USER_IDと一致することを確認
        assert result == "00000000-0000-0000-0000-000000000001"  # 【確認内容】: subクレームのuser_idが返される 🔵

    def test_invalid_signature_returns_none(self, invalid_token):
        """
        TC-003: 署名が不正なJWTで None が返される

        【テスト目的】: verify_token() が異なるシークレットで署名されたJWTを拒否すること
        【テスト内容】: "wrong-secret"で署名したJWTを渡す
        【期待される動作】: None が返される（不正トークンの拒否）
        🔵 信頼性レベル: auth-flow-testcases.md TC-003より (NFR-101対応)
        """
        # 【テストデータ準備】: "wrong-secret"で署名した不正なJWT
        # 【初期条件設定】: 検証シークレットはTEST_JWT_SECRET（異なる値）

        # 【実際の処理実行】: 不正署名トークンを verify_token() に渡す
        result = verify_token(invalid_token)

        # 【結果検証】: Noneが返されること（不正トークンの拒否確認）
        assert result is None  # 【確認内容】: 署名不正のトークンはNoneを返す 🔵

    def test_expired_token_returns_none(self, expired_token):
        """
        TC-004: 有効期限切れのJWTで None が返される

        【テスト目的】: verify_token() が過去のexpを持つJWTを拒否すること
        【テスト内容】: expが1時間前のJWT（正しい署名）を渡す
        【期待される動作】: None が返される
        🔵 信頼性レベル: auth-flow-testcases.md TC-004より
        """
        # 【テストデータ準備】: expが1時間前（期限切れ）のJWT
        # 【初期条件設定】: 署名は正しいが有効期限が過去

        # 【実際の処理実行】: 期限切れトークンを verify_token() に渡す
        result = verify_token(expired_token)

        # 【結果検証】: Noneが返されること（期限切れトークンの拒否確認）
        assert result is None  # 【確認内容】: 期限切れトークンはNoneを返す 🔵

    def test_token_without_sub_returns_none(self, token_without_sub):
        """
        TC-007: subクレームが欠落したJWTで None が返される

        【テスト目的】: verify_token() が sub クレームのないJWTを適切に拒否すること
        【テスト内容】: subを含まないJWTペイロードを渡す
        【期待される動作】: None が返される
        🟡 信頼性レベル: 要件定義 制約条件・Supabase JWT特性より推測
        """
        # 【テストデータ準備】: subクレームを含まないJWT（audとexpは正常）
        # 【初期条件設定】: 有効な署名・有効期限だがsubが欠落

        # 【実際の処理実行】: sub欠落トークンを verify_token() に渡す
        result = verify_token(token_without_sub)

        # 【結果検証】: Noneが返されること（不完全なJWTの拒否確認）
        assert result is None  # 【確認内容】: subクレームなしトークンはNoneを返す 🟡

    def test_token_without_exp_returns_none(self, token_without_exp):
        """
        TC-008: expクレームが欠落したJWTで None が返される

        【テスト目的】: verify_token() が exp クレームのないJWTを拒否すること
        【テスト内容】: expを含まないJWTペイロードを渡す
        【期待される動作】: None が返される
        🟡 信頼性レベル: security.py 実装仕様より推測
        """
        # 【テストデータ準備】: expクレームを含まないJWT
        # 【初期条件設定】: subとaudは正常だがexpが欠落

        # 【実際の処理実行】: exp欠落トークンを verify_token() に渡す
        result = verify_token(token_without_exp)

        # 【結果検証】: Noneが返されること（有効期限なしトークンの拒否確認）
        assert result is None  # 【確認内容】: expクレームなしトークンはNoneを返す 🟡

    def test_unsupported_algorithm_returns_none(self):
        """
        alg=none のような許可外アルゴリズムは、署名検証前に拒否する。
        """
        header = {"alg": "none", "typ": "JWT"}
        payload = {
            "sub": "00000000-0000-0000-0000-000000000001",
            "aud": "authenticated",
            "exp": 4_102_444_800,
        }

        def encode_part(value: dict) -> str:
            raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
            return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

        unsigned_token = f"{encode_part(header)}.{encode_part(payload)}."

        assert verify_token(unsigned_token) is None


class TestAuthEndpoint:
    """
    認証エンドポイント の統合テスト
    対象: get_current_user() 依存関数 + /api/me エンドポイント
    """

    def test_security_headers_present(self, client):
        response = client.get("/")

        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"

    def test_valid_bearer_token_returns_200(self, client, valid_token):
        """
        TC-002: 有効なBearerトークンで認証エンドポイントが200を返す

        【テスト目的】: get_current_user 依存関数がAuthorization: Bearer <valid_token>を受け取り正常処理すること
        【テスト内容】: 有効なBearerトークン付きリクエストを /api/me に送信
        【期待される動作】: HTTP 200、user_idが取得できる
        🔵 信頼性レベル: auth-flow-testcases.md TC-002より
        """
        # 【テストデータ準備】: valid_tokenフィクスチャの有効なJWT
        # 【初期条件設定】: Authorization: Bearer ヘッダー付きリクエスト

        # 【実際の処理実行】: 有効なBearerトークンで/api/meにGETリクエスト
        response = client.get(
            "/api/me",
            headers={"Authorization": f"Bearer {valid_token}"}
        )

        # 【結果検証】: HTTP 200が返されること
        assert response.status_code == 200  # 【確認内容】: 有効トークンで200 OK 🔵
        # 【追加検証】: レスポンスにuser_idが含まれること
        data = response.json()
        assert "user_id" in data  # 【確認内容】: レスポンスにuser_idキーが存在する 🔵
        assert data["user_id"] == "00000000-0000-0000-0000-000000000001"  # 【確認内容】: 正しいuser_idが返される 🔵

    def test_no_auth_header_returns_401(self, client):
        """
        TC-005: 未認証リクエストで401が返される

        【テスト目的】: Authorizationヘッダーなしのリクエストが拒否されること
        【テスト内容】: ヘッダーなしのHTTPリクエストを送信
        【期待される動作】: HTTP 401
        🔵 信頼性レベル: auth-flow-testcases.md TC-005より
        """
        # 【テストデータ準備】: なし（ヘッダーなしリクエスト）
        # 【初期条件設定】: Authorizationヘッダーを付与しない

        # 【実際の処理実行】: ヘッダーなしで/api/meにGETリクエスト
        response = client.get("/api/me")

        # 【結果検証】: HTTP 401が返されること（HTTPBearerによる自動拒否）
        assert response.status_code == 401  # 【確認内容】: ヘッダーなしで401 Unauthorized 🔵

    def test_query_token_is_not_accepted(self, client, valid_token):
        """
        JWTをURL queryに乗せる認証は、ログや履歴への漏えいを避けるため拒否する。
        """
        response = client.get(f"/api/ai/weekly-review/stream?token={valid_token}")

        assert response.status_code == 403

    def test_invalid_bearer_token_returns_401(self, client, invalid_token):
        """
        TC-006: 無効なBearerトークンで401が返される

        【テスト目的】: get_current_user が不正JWTを含むリクエストを401で拒否すること
        【テスト内容】: 不正なJWTをBearerトークンとして送信
        【期待される動作】: HTTP 401、ErrorResponse形式 {"success": false, "error": {"code": "UNAUTHORIZED", ...}}
        🔵 信頼性レベル: auth-flow-testcases.md TC-006より (NFR-102対応)
        """
        # 【テストデータ準備】: "wrong-secret"で署名した不正なJWT
        # 【初期条件設定】: Authorization: Bearer <invalid_token> ヘッダー付きリクエスト

        # 【実際の処理実行】: 不正なBearerトークンで/api/meにGETリクエスト
        response = client.get(
            "/api/me",
            headers={"Authorization": f"Bearer {invalid_token}"}
        )

        # 【結果検証】: HTTP 401が返されること
        assert response.status_code == 401  # 【確認内容】: 不正トークンで401 Unauthorized 🔵
        # 【追加検証】: ErrorResponse 形式で返されること（TASK-0005共通基盤）
        data = response.json()
        assert data["error"]["message"] == "Invalid or expired token"  # 【確認内容】: ErrorResponse形式のエラーメッセージ 🔵
        assert data["success"] is False  # 【確認内容】: success=falseであること 🔵

    def test_expired_bearer_token_returns_401(self, client, expired_token):
        """
        TC-004拡張: 期限切れBearerトークンで401が返される

        【テスト目的】: 期限切れトークンでAPIエンドポイントアクセス時に401が返されること
        【テスト内容】: expが1時間前のJWTをBearerトークンとして送信
        【期待される動作】: HTTP 401、ErrorResponse形式 {"success": false, "error": {"code": "UNAUTHORIZED", ...}}
        🔵 信頼性レベル: auth-flow-requirements.md 異常系使用例より
        """
        # 【テストデータ準備】: expが1時間前の期限切れJWT
        # 【初期条件設定】: Authorization: Bearer <expired_token> ヘッダー付きリクエスト

        # 【実際の処理実行】: 期限切れBearerトークンで/api/meにGETリクエスト
        response = client.get(
            "/api/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )

        # 【結果検証】: HTTP 401が返されること
        assert response.status_code == 401  # 【確認内容】: 期限切れトークンで401 Unauthorized 🔵
        # 【追加検証】: ErrorResponse 形式で返されること（TASK-0005共通基盤）
        data = response.json()
        assert data["error"]["message"] == "Invalid or expired token"  # 【確認内容】: ErrorResponse形式のエラーメッセージ 🔵
        assert data["success"] is False  # 【確認内容】: success=falseであること 🔵
