"""
ユーザープロフィール・Wanna Be・長期目標・通知設定API テスト
TASK-0006: TDD Red フェーズ

【テスト戦略】:
- Supabase クライアントを unittest.mock でモック（DB 依存なし）
- 各ルーターの Supabase 呼び出し箇所をパッチ
- 認証は conftest.py の valid_token フィクスチャを利用

🔵 信頼性レベル: api-endpoints.md・TASK-0006要件定義より
"""
from unittest.mock import MagicMock, patch

import pytest

# 【テスト用定数】: conftest.py の TEST_USER_ID と一致させる
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_WANNA_BE_ID = "00000000-0000-0000-0000-000000000010"


# ==================================================
# ユーザープロフィール API テスト
# ==================================================


class TestGetUserProfile:
    """GET /api/users/me のテスト"""

    def test_get_profile_success(self, client, valid_token):
        """
        TC-001: プロフィール取得（正常）

        【テスト目的】: 有効なJWTで GET /users/me を叩くとプロフィールが返ること
        【テスト内容】: Supabase をモックしてユーザープロフィールを返す
        【期待される動作】: HTTP 200, success=true, UserProfile データが返る
        🔵 信頼性レベル: REQ-103・api-endpoints.md より
        """
        # 【テストデータ準備】: DB が返すプロフィールレコードを定義
        mock_profile = {
            "id": TEST_USER_ID,
            "display_name": "田中 太郎",
            "timezone": "Asia/Tokyo",
            "weekly_review_day": 5,
            "notification_email": "test@example.com",
            "notification_enabled": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        # 【Supabase モック設定】: table().select().eq().single().execute() の返り値を設定
        with patch("app.api.routes.users.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.single.return_value.execute.return_value \
                .data = mock_profile

            # 【実際の処理実行】: GET /api/users/me に有効なBearerトークンでリクエスト
            response = client.get(
                "/api/users/me",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 200 かつ UserProfile データが返ること
        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["id"] == TEST_USER_ID  # 【確認内容】: ユーザーIDが一致 🔵
        assert data["data"]["display_name"] == "田中 太郎"  # 【確認内容】: 表示名が含まれる 🔵
        assert data["data"]["timezone"] == "Asia/Tokyo"  # 【確認内容】: タイムゾーンが含まれる 🔵

    def test_get_profile_not_found(self, client, valid_token):
        """
        TC-012: プロフィール未存在で404

        【テスト目的】: DBにプロフィールがない場合 404 が返ること
        【テスト内容】: Supabase が data=None を返すようにモック
        【期待される動作】: HTTP 404, ErrorResponse 形式
        🔵 信頼性レベル: api-endpoints.md エラーレスポンスより
        """
        # 【テストデータ準備】: DB がレコードなしを返す状況を設定
        with patch("app.api.routes.users.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.single.return_value.execute.return_value \
                .data = None

            response = client.get(
                "/api/users/me",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 404 かつ ErrorResponse 形式
        assert response.status_code == 404  # 【確認内容】: 未存在で404 🔵
        data = response.json()
        assert data["success"] is False  # 【確認内容】: success=false 🔵
        assert data["error"]["code"] == "NOT_FOUND"  # 【確認内容】: NOT_FOUNDエラーコード 🔵

    def test_get_profile_no_auth_returns_401(self, client):
        """
        TC-010: 認証なしで401

        【テスト目的】: Authorization ヘッダーなしで 401 が返ること
        【テスト内容】: ヘッダーなしリクエスト
        【期待される動作】: HTTP 401
        🔵 信頼性レベル: NFR-101 / BUG-0002より
        """
        # 【初期条件設定】: Authorization ヘッダーなし
        response = client.get("/api/users/me")
        # 【結果検証】: 401
        assert response.status_code == 401  # 【確認内容】: 未認証で401 🔵

    def test_get_profile_invalid_token_returns_401(self, client, invalid_token):
        """
        TC-011: 無効なトークンで401

        【テスト目的】: 不正なJWTで 401 が返ること
        【テスト内容】: wrong-secret で署名したトークンを送信
        【期待される動作】: HTTP 401, ErrorResponse 形式
        🔵 信頼性レベル: NFR-101 より
        """
        response = client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {invalid_token}"}
        )
        # 【結果検証】: 401 かつ ErrorResponse 形式
        assert response.status_code == 401  # 【確認内容】: 不正トークンで401 🔵
        data = response.json()
        assert data["success"] is False  # 【確認内容】: success=false 🔵


class TestUpdateUserProfile:
    """PATCH /api/users/me のテスト"""

    def test_update_profile_success(self, client, valid_token):
        """
        TC-002: プロフィール更新（正常）

        【テスト目的】: PATCH /users/me でプロフィールを部分更新できること
        【テスト内容】: weekly_review_day=1, notification_enabled=false に更新
        【期待される動作】: HTTP 200, 更新後のプロフィールが返る
        🔵 信頼性レベル: REQ-701・api-endpoints.md より
        """
        # 【テストデータ準備】: 更新後のレコードを定義
        updated_profile = {
            "id": TEST_USER_ID,
            "display_name": None,
            "timezone": "Asia/Tokyo",
            "weekly_review_day": 1,
            "notification_email": None,
            "notification_enabled": False,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-04-14T00:00:00+00:00",
        }

        with patch("app.api.routes.users.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            # PATCH は update().eq().execute() の後、データ取得のために select も呼ぶ
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_profile]

            # 【実際の処理実行】: PATCH リクエスト
            response = client.patch(
                "/api/users/me",
                json={"weekly_review_day": 1, "notification_enabled": False},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 200 かつ 更新後のデータが返る
        assert response.status_code == 200  # 【確認内容】: 正常更新 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["weekly_review_day"] == 1  # 【確認内容】: 更新値が反映 🔵

    def test_update_profile_weekly_review_day_min(self, client, valid_token):
        """
        TC-014: weekly_review_day 境界値（1=最小）

        【テスト目的】: weekly_review_day=1（月曜）で更新できること
        🔵 信頼性レベル: DBスキーマ CHECK (BETWEEN 1 AND 7) より
        """
        updated_profile = {
            "id": TEST_USER_ID, "display_name": None, "timezone": "Asia/Tokyo",
            "weekly_review_day": 1, "notification_email": None,
            "notification_enabled": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-04-14T00:00:00+00:00",
        }

        with patch("app.api.routes.users.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_profile]

            response = client.patch(
                "/api/users/me",
                json={"weekly_review_day": 1},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: 境界値1でOK 🔵

    def test_update_profile_weekly_review_day_max(self, client, valid_token):
        """
        TC-015: weekly_review_day 境界値（7=最大）

        【テスト目的】: weekly_review_day=7（日曜）で更新できること
        🔵 信頼性レベル: DBスキーマ CHECK (BETWEEN 1 AND 7) より
        """
        updated_profile = {
            "id": TEST_USER_ID, "display_name": None, "timezone": "Asia/Tokyo",
            "weekly_review_day": 7, "notification_email": None,
            "notification_enabled": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-04-14T00:00:00+00:00",
        }

        with patch("app.api.routes.users.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_profile]

            response = client.patch(
                "/api/users/me",
                json={"weekly_review_day": 7},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: 境界値7でOK 🔵

    def test_update_profile_weekly_review_day_out_of_range(self, client, valid_token):
        """
        TC-016: weekly_review_day=0 で 422

        【テスト目的】: 範囲外の値（0）でバリデーションエラーになること
        🔵 信頼性レベル: UpdateUserProfileRequest ge=1 より
        """
        # 【初期条件設定】: スキーマバリデーションでエラーになるはずなので Supabase モック不要
        response = client.patch(
            "/api/users/me",
            json={"weekly_review_day": 0},
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        # 【結果検証】: 422 バリデーションエラー
        assert response.status_code == 422  # 【確認内容】: 範囲外でバリデーションエラー 🔵


# ==================================================
# Wanna Be API テスト
# ==================================================


class TestGetWannaBe:
    """GET /api/wanna-be のテスト"""

    def test_get_wanna_be_exists(self, client, valid_token):
        """
        TC-003: Wanna Be 取得（登録済み）

        【テスト目的】: is_current=true の Wanna Be が返ること
        【テスト内容】: Supabase が wanna_be レコードを返すようにモック
        【期待される動作】: HTTP 200, WannaBe データが返る
        🔵 信頼性レベル: REQ-201/202・api-endpoints.md より
        """
        # 【テストデータ準備】: DB が返す Wanna Be レコードを定義
        mock_wanna_be = {
            "id": TEST_WANNA_BE_ID,
            "user_id": TEST_USER_ID,
            "text": "1年後は毎朝6時に起き、英語でプレゼンができる自分になる",
            "version": 1,
            "is_current": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        with patch("app.api.routes.wanna_be.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = mock_wanna_be

            # 【実際の処理実行】: GET /api/wanna-be
            response = client.get(
                "/api/wanna-be",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 200 かつ WannaBe データが返る
        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["text"] == "1年後は毎朝6時に起き、英語でプレゼンができる自分になる"  # 🔵
        assert data["data"]["is_current"] is True  # 【確認内容】: is_current=true 🔵

    def test_get_wanna_be_not_registered(self, client, valid_token):
        """
        TC-004: Wanna Be 取得（未登録→204）

        【テスト目的】: Wanna Be 未登録時に 204 No Content が返ること
        【テスト内容】: Supabase が data=None を返すようにモック
        【期待される動作】: HTTP 204, ボディなし
        🔵 信頼性レベル: api-endpoints.md GET /wanna-be 未登録時204 より
        """
        # 【テストデータ準備】: DB がレコードなしを返す状況を設定
        with patch("app.api.routes.wanna_be.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = None

            response = client.get(
                "/api/wanna-be",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 204 かつボディなし
        assert response.status_code == 204  # 【確認内容】: 未登録で204 🔵


# ==================================================
# 長期目標 API テスト
# ==================================================


class TestSaveGoals:
    """POST /api/goals のテスト"""

    def test_save_goals_two_items(self, client, valid_token):
        """
        TC-005: 目標保存（正常・2件）

        【テスト目的】: 2件の目標を POST /goals で保存できること
        【テスト内容】: Supabase の INSERT をモック
        【期待される動作】: HTTP 201, 2件の Goal が返る
        🔵 信頼性レベル: REQ-203・api-endpoints.md より
        """
        # 【テストデータ準備】: 保存後に DB が返すレコードを定義
        saved_goals = [
            {
                "id": "00000000-0000-0000-0000-000000000020",
                "user_id": TEST_USER_ID,
                "wanna_be_id": None,
                "title": "早起きの習慣化",
                "description": "毎朝6時起床",
                "display_order": 0,
                "is_active": True,
                "created_at": "2026-04-14T00:00:00+00:00",
                "updated_at": "2026-04-14T00:00:00+00:00",
            },
            {
                "id": "00000000-0000-0000-0000-000000000021",
                "user_id": TEST_USER_ID,
                "wanna_be_id": None,
                "title": "英語力向上",
                "description": "ビジネス英語習得",
                "display_order": 1,
                "is_active": True,
                "created_at": "2026-04-14T00:00:00+00:00",
                "updated_at": "2026-04-14T00:00:00+00:00",
            },
        ]

        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            # 既存目標の非活性化（update）
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = []
            # 新規目標の INSERT
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = saved_goals

            # 【実際の処理実行】: POST /api/goals
            response = client.post(
                "/api/goals",
                json={
                    "goals": [
                        {"title": "早起きの習慣化", "description": "毎朝6時起床"},
                        {"title": "英語力向上", "description": "ビジネス英語習得"},
                    ]
                },
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 201 かつ 2件の Goal が返る
        assert response.status_code == 201  # 【確認内容】: 正常作成 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert len(data["data"]) == 2  # 【確認内容】: 2件のGoalが返る 🔵

    def test_save_goals_three_items_max(self, client, valid_token):
        """
        TC-006: 目標保存（正常・3件上限）

        【テスト目的】: 3件ちょうどで保存できること
        🔵 信頼性レベル: REQ-204 より
        """
        saved_goals = [
            {"id": f"00000000-0000-0000-0000-00000000002{i}", "user_id": TEST_USER_ID,
             "wanna_be_id": None, "title": f"目標{i}", "description": None,
             "display_order": i, "is_active": True,
             "created_at": "2026-04-14T00:00:00+00:00",
             "updated_at": "2026-04-14T00:00:00+00:00"}
            for i in range(3)
        ]

        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = []
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = saved_goals

            response = client.post(
                "/api/goals",
                json={"goals": [{"title": f"目標{i}"} for i in range(3)]},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 201  # 【確認内容】: 3件上限でOK 🔵
        assert len(response.json()["data"]) == 3  # 【確認内容】: 3件が返る 🔵

    def test_save_goals_four_items_validation_error(self, client, valid_token):
        """
        TC-009: 目標4件でVALIDATION_ERROR

        【テスト目的】: 4件以上の目標を送信するとエラーが返ること
        【テスト内容】: 4件の goals を送信
        【期待される動作】: HTTP 400, error.code == "VALIDATION_ERROR"
        🔵 信頼性レベル: REQ-204 より
        """
        # 【テストデータ準備】: 4件の目標（1件多い）
        # 【初期条件設定】: Supabase モック不要（バリデーションが先に走る）
        response = client.post(
            "/api/goals",
            json={"goals": [{"title": f"目標{i}"} for i in range(4)]},
            headers={"Authorization": f"Bearer {valid_token}"}
        )

        # 【結果検証】: HTTP 400 かつ VALIDATION_ERROR
        assert response.status_code == 400  # 【確認内容】: 4件でバリデーションエラー 🔵
        data = response.json()
        assert data["success"] is False  # 【確認内容】: success=false 🔵
        assert data["error"]["code"] == "VALIDATION_ERROR"  # 【確認内容】: VALIDATION_ERRORコード 🔵
        assert "3件" in data["error"]["message"]  # 【確認内容】: 3件制限のメッセージ 🔵

    def test_save_goals_empty_list_validation_error(self, client, valid_token):
        """
        TC-013: 目標0件でバリデーションエラー

        【テスト目的】: goals が空配列だと 422 になること
        🔵 信頼性レベル: SaveGoalsRequest min_length=1 より
        """
        # 【初期条件設定】: 空の goals リスト
        response = client.post(
            "/api/goals",
            json={"goals": []},
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        # 【結果検証】: 422 バリデーションエラー
        assert response.status_code == 422  # 【確認内容】: 空配列で422 🔵

    def test_save_goals_empty_title_validation_error(self, client, valid_token):
        """
        TC-017: 目標タイトルが空文字でバリデーションエラー

        【テスト目的】: タイトルが空の目標は保存できないこと
        🔵 信頼性レベル: GoalItem min_length=1 より
        """
        response = client.post(
            "/api/goals",
            json={"goals": [{"title": ""}]},
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        assert response.status_code == 422  # 【確認内容】: 空タイトルで422 🔵


# ==================================================
# 通知設定 API テスト
# ==================================================


class TestNotificationSettings:
    """GET/PATCH /api/notifications/settings のテスト"""

    def test_get_notification_settings_success(self, client, valid_token):
        """
        TC-007: 通知設定取得（正常）

        【テスト目的】: 通知設定が取得できること
        【テスト内容】: Supabase をモックして通知設定レコードを返す
        【期待される動作】: HTTP 200, 3フィールドが含まれる
        🔵 信頼性レベル: REQ-801・api-endpoints.md より
        """
        # 【テストデータ準備】: DB が返す通知設定（user_profiles の一部フィールド）
        mock_profile = {
            "notification_enabled": True,
            "notification_email": "test@example.com",
            "weekly_review_day": 5,
        }

        with patch("app.api.routes.notifications.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.single.return_value.execute.return_value \
                .data = mock_profile

            # 【実際の処理実行】: GET /api/notifications/settings
            response = client.get(
                "/api/notifications/settings",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 200 かつ 3フィールドが含まれる
        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert "notification_enabled" in data["data"]  # 【確認内容】: 通知フラグが含まれる 🔵
        assert "notification_email" in data["data"]  # 【確認内容】: 通知メールが含まれる 🔵
        assert "weekly_review_day" in data["data"]  # 【確認内容】: 週次レビュー曜日が含まれる 🔵

    def test_update_notification_settings_success(self, client, valid_token):
        """
        TC-008: 通知設定更新（正常）

        【テスト目的】: notification_enabled=false に更新できること
        【テスト内容】: PATCH /notifications/settings
        【期待される動作】: HTTP 200, 更新後の設定が返る
        🔵 信頼性レベル: REQ-802 より
        """
        # 【テストデータ準備】: 更新後のレコードを定義
        updated_settings = {
            "notification_enabled": False,
            "notification_email": "test@example.com",
            "weekly_review_day": 5,
        }

        with patch("app.api.routes.notifications.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_settings]

            # 【実際の処理実行】: PATCH /api/notifications/settings
            response = client.patch(
                "/api/notifications/settings",
                json={"notification_enabled": False},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: HTTP 200 かつ 通知が無効になっている
        assert response.status_code == 200  # 【確認内容】: 正常更新 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["notification_enabled"] is False  # 【確認内容】: 通知が無効化 🔵
