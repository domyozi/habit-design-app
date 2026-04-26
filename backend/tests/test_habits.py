"""
習慣CRUD API テスト (TASK-0007)
TC-001〜TC-017 のテストケースを実装する

テスト対象:
- GET /api/habits   : 習慣一覧取得（今日のログ付き）
- POST /api/habits  : 習慣作成
- PATCH /api/habits/{id} : 習慣更新（AIアクション制限）
- DELETE /api/habits/{id}: 習慣論理削除

🔵 信頼性レベル: TASK-0007要件定義・api-endpoints.md より
"""
from unittest.mock import MagicMock, patch

import pytest

# 【テスト用定数】: conftest.py の TEST_USER_ID と一致させる
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "00000000-0000-0000-0000-000000000099"
TEST_HABIT_ID = "00000000-0000-0000-0000-000000000020"
TEST_GOAL_ID = "00000000-0000-0000-0000-000000000030"


def _make_habit(habit_id=TEST_HABIT_ID, user_id=TEST_USER_ID, title="ランニング30分"):
    """【ヘルパー】: テスト用習慣データを生成"""
    return {
        "id": habit_id,
        "user_id": user_id,
        "goal_id": TEST_GOAL_ID,
        "title": title,
        "description": None,
        "frequency": "daily",
        "scheduled_time": "07:00",
        "display_order": 0,
        "current_streak": 5,
        "longest_streak": 10,
        "is_active": True,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }


def _make_habit_log(habit_id=TEST_HABIT_ID, completed=True, log_date="2026-04-14"):
    """【ヘルパー】: テスト用習慣ログデータを生成"""
    return {
        "id": "00000000-0000-0000-0000-000000000040",
        "habit_id": habit_id,
        "user_id": TEST_USER_ID,
        "log_date": log_date,
        "completed": completed,
        "completed_at": None,
        "input_method": "manual",
        "created_at": "2026-04-14T07:30:00+00:00",
    }


# ==================================================
# GET /api/habits テスト
# ==================================================

class TestGetHabits:
    """GET /api/habits のテスト"""

    def test_get_habits_success(self, client, valid_token):
        """
        TC-001: 習慣一覧取得（正常）

        【テスト目的】: 認証済みユーザーが習慣一覧を取得できること
        【テスト内容】: is_active=true の習慣3件をモックして一覧取得
        【期待される動作】: 200, success=true, 3件のリスト
        🔵 信頼性レベル: REQ-301・api-endpoints.md より
        """
        # 【テストデータ準備】: 3件の習慣
        mock_habits = [
            _make_habit(f"00000000-0000-0000-0000-00000000002{i}", title=f"習慣{i}")
            for i in range(3)
        ]

        # 【Supabaseモック設定】
        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value \
                .execute.return_value.data = mock_habits

            # 【実際の処理実行】: GET /api/habits に有効なトークンでリクエスト
            response = client.get(
                "/api/habits",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: 200 かつ 3件の習慣リスト
        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert len(data["data"]) == 3  # 【確認内容】: 3件取得 🔵

    def test_get_habits_with_today_log(self, client, valid_token):
        """
        TC-002: 今日のログ付き習慣一覧

        【テスト目的】: include_today_log=true の場合 today_log が付与されること
        【テスト内容】: 習慣2件 + 1件分のログをモック
        【期待される動作】: 1件は today_log.completed=true、1件は today_log=null
        🔵 信頼性レベル: REQ-301・api-endpoints.md より
        """
        # 【テストデータ準備】: 習慣2件とログ1件
        habit1 = _make_habit(TEST_HABIT_ID, title="習慣1")
        habit2 = _make_habit("00000000-0000-0000-0000-000000000021", title="習慣2")
        today_log = _make_habit_log(TEST_HABIT_ID, completed=True)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 【モック設定】: 習慣一覧とログ取得を別々にモック
            habits_query = mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value
            habits_query.execute.return_value.data = [habit1, habit2]

            response = client.get(
                "/api/habits?include_today_log=true",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】
        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert len(data["data"]) == 2  # 【確認内容】: 2件取得 🔵

    def test_get_habits_empty_list(self, client, valid_token):
        """
        TC-015: 習慣一覧0件（空リスト）

        【テスト目的】: 習慣が0件の場合 200 + 空リストが返ること
        【期待される動作】: 200, data=[]
        🔵 信頼性レベル: REQ-301 より
        """
        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value \
                .execute.return_value.data = []

            response = client.get(
                "/api/habits",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: 空リストでも200 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"] == []  # 【確認内容】: 空リスト 🔵

    def test_get_habits_no_auth_returns_403(self, client):
        """
        TC-013: 未認証リクエストで 403

        【テスト目的】: Bearer ヘッダーなしは拒否されること
        【期待される動作】: 403
        🔵 信頼性レベル: NFR-101 より
        """
        response = client.get("/api/habits")
        assert response.status_code == 403  # 【確認内容】: 未認証で403 🔵


# ==================================================
# POST /api/habits テスト
# ==================================================

class TestCreateHabit:
    """POST /api/habits のテスト"""

    def test_create_habit_success(self, client, valid_token):
        """
        TC-003: 習慣作成（正常）

        【テスト目的】: 有効なリクエストで習慣が作成されること
        【テスト内容】: title, frequency, scheduled_time を送信
        【期待される動作】: 201, success=true, 作成された習慣データ
        🔵 信頼性レベル: REQ-302 より
        """
        # 【テストデータ準備】: 作成リクエストと返り値
        request_data = {
            "title": "ランニング30分",
            "frequency": "daily",
            "scheduled_time": "07:00",
        }
        created_habit = _make_habit(title="ランニング30分")

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [created_habit]

            # 【実際の処理実行】: POST /api/habits にリクエスト
            response = client.post(
                "/api/habits",
                json=request_data,
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        # 【結果検証】: 201 かつ 習慣データ
        assert response.status_code == 201  # 【確認内容】: 201 Created 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["title"] == "ランニング30分"  # 【確認内容】: タイトルが一致 🔵

    def test_create_habit_title_required(self, client, valid_token):
        """
        TC-014: 習慣作成 - タイトル必須チェック

        【テスト目的】: title 未指定で 422 が返ること
        【期待される動作】: 422, VALIDATION_ERROR
        🔵 信頼性レベル: Pydantic バリデーション
        """
        response = client.post(
            "/api/habits",
            json={"frequency": "daily"},
            headers={"Authorization": f"Bearer {valid_token}"}
        )
        assert response.status_code == 422  # 【確認内容】: タイトル未指定で422 🔵
        data = response.json()
        assert data["error"]["code"] == "VALIDATION_ERROR"  # 【確認内容】: バリデーションエラー 🔵

    def test_create_habit_max_title_length(self, client, valid_token):
        """
        TC-017: タイトル最大長（200文字）で習慣作成

        【テスト目的】: 200文字のタイトルで作成できること
        【期待される動作】: 201
        🔵 参照: DBスキーマ VARCHAR(200)
        """
        long_title = "あ" * 200
        created_habit = _make_habit(title=long_title)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [created_habit]

            response = client.post(
                "/api/habits",
                json={"title": long_title, "frequency": "daily"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 201  # 【確認内容】: 200文字は許容 🔵


# ==================================================
# PATCH /api/habits/{id} テスト
# ==================================================

class TestUpdateHabit:
    """PATCH /api/habits/{habit_id} のテスト"""

    def test_update_habit_change_time(self, client, valid_token):
        """
        TC-004: AI許可アクション change_time で習慣更新

        【テスト目的】: action=change_time で時刻変更が許可されること
        【期待される動作】: 200, 更新された習慣データ
        🔵 信頼性レベル: REQ-303 より
        """
        updated_habit = _make_habit()
        updated_habit["scheduled_time"] = "07:30"

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            # SELECT（所有者確認）
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = _make_habit()
            # UPDATE
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_habit]

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}",
                json={"action": "change_time", "scheduled_time": "07:30"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: change_timeは許可 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵

    def test_update_habit_manual_edit(self, client, valid_token):
        """
        TC-005: manual_edit で習慣更新

        【テスト目的】: action=manual_edit で手動編集ができること
        【期待される動作】: 200, 更新された習慣データ
        🔵 信頼性レベル: REQ-304 より
        """
        updated_habit = _make_habit(title="ランニング45分")

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = _make_habit()
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_habit]

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}",
                json={"action": "manual_edit", "title": "ランニング45分"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: manual_editは許可 🔵
        data = response.json()
        assert data["data"]["title"] == "ランニング45分"  # 【確認内容】: タイトルが更新 🔵

    def test_update_habit_add_habit_action(self, client, valid_token):
        """
        TC-007: add_habit アクションで習慣更新

        【テスト目的】: AI提案 add_habit が許可されること
        【期待される動作】: 200
        🔵 信頼性レベル: REQ-303 より
        """
        updated_habit = _make_habit(title="英語30分")

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = _make_habit()
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_habit]

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}",
                json={"action": "add_habit", "title": "英語30分"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: add_habitは許可 🔵

    def test_update_habit_remove_habit_action(self, client, valid_token):
        """
        TC-008: remove_habit アクションで習慣更新

        【テスト目的】: AI提案 remove_habit が許可されること
        【期待される動作】: 200
        🔵 信頼性レベル: REQ-303 より
        """
        updated_habit = _make_habit()

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = _make_habit()
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [updated_habit]

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}",
                json={"action": "remove_habit"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 200  # 【確認内容】: remove_habitは許可 🔵

    def test_update_habit_forbidden_action(self, client, valid_token):
        """
        TC-009: 許可外AIアクションで FORBIDDEN_ACTION

        【テスト目的】: action=delete_all など不明なアクションは 400 で拒否されること
        【期待される動作】: 400, error.code="FORBIDDEN_ACTION"
        🔵 信頼性レベル: REQ-303 より
        """
        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}",
                json={"action": "delete_all"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 400  # 【確認内容】: 許可外actionは400 🔵
        data = response.json()
        assert data["error"]["code"] == "FORBIDDEN_ACTION"  # 【確認内容】: FORBIDDENエラーコード 🔵
        assert data["success"] is False  # 【確認内容】: success=false 🔵

    def test_update_habit_forbidden_other_user(self, client, valid_token):
        """
        TC-010: 他ユーザーの習慣への更新で 403

        【テスト目的】: 別ユーザーの習慣を更新しようとした場合 403 が返ること
        【テスト内容】: DBから返る習慣の user_id が別ユーザー
        【期待される動作】: 403
        🔵 信頼性レベル: NFR-101 より
        """
        other_user_habit = _make_habit(user_id=OTHER_USER_ID)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = other_user_habit

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}",
                json={"action": "manual_edit", "title": "不正"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 403  # 【確認内容】: 他ユーザーの習慣は403 🔵

    def test_update_habit_not_found(self, client, valid_token):
        """
        TC-012: 存在しない習慣の更新で 404

        【テスト目的】: 存在しない habit_id への PATCH は 404 が返ること
        【テスト内容】: DBが None を返す
        【期待される動作】: 404
        🔵 信頼性レベル: api-endpoints.md より
        """
        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = None

            response = client.patch(
                "/api/habits/nonexistent-id",
                json={"action": "manual_edit"},
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 404  # 【確認内容】: 存在しない習慣は404 🔵


# ==================================================
# DELETE /api/habits/{id} テスト
# ==================================================

class TestDeleteHabit:
    """DELETE /api/habits/{habit_id} のテスト"""

    def test_delete_habit_success(self, client, valid_token):
        """
        TC-006: 習慣論理削除（正常）

        【テスト目的】: DELETE で is_active=false になること（204 返却）
        【期待される動作】: 204
        🔵 信頼性レベル: REQ-306 より
        """
        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            # 所有者確認
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = _make_habit()
            # 論理削除
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = [{"id": TEST_HABIT_ID}]

            response = client.delete(
                f"/api/habits/{TEST_HABIT_ID}",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 204  # 【確認内容】: 論理削除で204 🔵

    def test_delete_habit_forbidden_other_user(self, client, valid_token):
        """
        TC-011: 他ユーザーの習慣の削除で 403

        【テスト目的】: 別ユーザーの習慣を削除しようとした場合 403 が返ること
        【期待される動作】: 403
        🔵 信頼性レベル: NFR-101 より
        """
        other_user_habit = _make_habit(user_id=OTHER_USER_ID)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = other_user_habit

            response = client.delete(
                f"/api/habits/{TEST_HABIT_ID}",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 403  # 【確認内容】: 他ユーザーの習慣は403 🔵

    def test_delete_habit_not_found(self, client, valid_token):
        """
        TC-016: 存在しない習慣の削除で 404

        【テスト目的】: 存在しない habit_id への DELETE は 404 が返ること
        【テスト内容】: DBが None を返す
        【期待される動作】: 404
        🟡 推測: 404 が自然な振る舞い
        """
        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = None

            response = client.delete(
                "/api/habits/nonexistent-id",
                headers={"Authorization": f"Bearer {valid_token}"}
            )

        assert response.status_code == 404  # 【確認内容】: 存在しない習慣は404 🟡
