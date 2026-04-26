"""
KGI 属性 CRUD API テスト
TASK-0030: goals.py KGI属性CRUD API実装

【テスト戦略】:
- Supabase クライアントを unittest.mock でモック（DB 依存なし）
- 認証は conftest.py の valid_token フィクスチャを利用
- build_goal_with_kgi_response() の計算ロジックを間接的に検証

🔵 信頼性レベル: TASK-0030 テスト要件より
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_GOAL_ID = "goal-uuid-0001"
OTHER_GOAL_ID = "goal-uuid-9999"

# 既存 Goal のモックデータ（KGI化前）
BASE_GOAL = {
    "id": TEST_GOAL_ID,
    "user_id": TEST_USER_ID,
    "wanna_be_id": None,
    "title": "体重を70kgにする",
    "description": None,
    "display_order": 0,
    "is_active": True,
    "target_value": None,
    "current_value": None,
    "unit": None,
    "target_date": None,
    "metric_type": None,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

# KGI 設定後の Goal モックデータ
KGI_GOAL = {
    **BASE_GOAL,
    "target_value": 70.0,
    "unit": "kg",
    "target_date": "2026-10-15",
    "metric_type": "numeric",
    "current_value": 75.0,
}

# 期限超過の Goal
EXPIRED_GOAL = {
    **BASE_GOAL,
    "target_date": "2020-01-01",
    "metric_type": "binary",
    "current_value": 0.0,
}


class TestSetGoalAsKgi:
    """PATCH /api/goals/{goal_id}/kgi のテスト"""

    def test_set_goal_as_kgi_success(self, client, valid_token):
        """
        TC-KGI-01: KGI 設定の正常系
        🔵 信頼性レベル: TC-KGI-01 より
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 既存 Goal の確認モック
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = BASE_GOAL

            # 更新後のデータモック
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.eq.return_value.execute.return_value \
                .data = [KGI_GOAL]

            response = client.patch(
                f"/api/goals/{TEST_GOAL_ID}/kgi",
                json={
                    "target_value": 70,
                    "unit": "kg",
                    "target_date": "2026-10-15",
                    "metric_type": "numeric",
                    "current_value": 75.0,
                },
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["is_kgi"] is True
        assert data["days_remaining"] is not None
        assert data["is_expired"] is False

    def test_set_kgi_without_target_date(self, client, valid_token):
        """
        TC-KGI-E01: target_date 未入力エラー
        🔵 信頼性レベル: TC-KGI-E01 より
        """
        response = client.patch(
            f"/api/goals/{TEST_GOAL_ID}/kgi",
            json={"metric_type": "numeric", "target_value": 70},
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422

    def test_set_kgi_without_metric_type(self, client, valid_token):
        """
        TC-KGI-E02: metric_type 未入力エラー
        """
        response = client.patch(
            f"/api/goals/{TEST_GOAL_ID}/kgi",
            json={"target_date": "2026-10-15"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422

    def test_set_kgi_goal_not_found(self, client, valid_token):
        """
        TC-KGI-E03: 存在しない Goal への操作（404）
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 存在しない Goal → data = None
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = None

            response = client.patch(
                f"/api/goals/{OTHER_GOAL_ID}/kgi",
                json={"target_date": "2026-10-15", "metric_type": "numeric"},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code in [403, 404]

    def test_kgi_expired_flag(self, client, valid_token):
        """
        TC-KGI-E05: 期限超過の is_expired フラグ
        🔵 信頼性レベル: EDGE-KPI-005 より
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = BASE_GOAL

            mock_sb.table.return_value.update.return_value \
                .eq.return_value.eq.return_value.execute.return_value \
                .data = [EXPIRED_GOAL]

            response = client.patch(
                f"/api/goals/{TEST_GOAL_ID}/kgi",
                json={"target_date": "2020-01-01", "metric_type": "binary"},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["is_expired"] is True
        assert data["days_remaining"] < 0

    def test_set_kgi_percentage_range_error(self, client, valid_token):
        """
        TC-KGI-E04: percentage 型で target_value が 100 超のエラー
        🔵 信頼性レベル: EDGE-KPI-004 より
        """
        response = client.patch(
            f"/api/goals/{TEST_GOAL_ID}/kgi",
            json={
                "target_date": "2026-10-15",
                "metric_type": "percentage",
                "target_value": 105,
            },
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422

    def test_set_kgi_binary_achievement_rate(self, client, valid_token):
        """
        TC-KGI-06: binary 型の achievement_rate 計算
        """
        binary_goal_achieved = {
            **BASE_GOAL,
            "target_date": "2026-10-15",
            "metric_type": "binary",
            "current_value": 1.0,
            "target_value": None,
        }
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = BASE_GOAL
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.eq.return_value.execute.return_value \
                .data = [binary_goal_achieved]

            response = client.patch(
                f"/api/goals/{TEST_GOAL_ID}/kgi",
                json={"target_date": "2026-10-15", "metric_type": "binary", "current_value": 1.0},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["achievement_rate"] == 100.0


class TestUpdateKgiCurrentValue:
    """PATCH /api/goals/{goal_id}/kgi/current-value のテスト"""

    def test_update_current_value_success(self, client, valid_token):
        """
        TC-KGI-10: KGI 現在値更新の正常系
        🔵 信頼性レベル: REQ-KGI-005 より
        """
        updated_goal = {**KGI_GOAL, "current_value": 72.5}
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.eq.return_value.execute.return_value \
                .data = [updated_goal]

            response = client.patch(
                f"/api/goals/{TEST_GOAL_ID}/kgi/current-value",
                json={"current_value": 72.5},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["current_value"] == 72.5

    def test_update_current_value_not_found(self, client, valid_token):
        """
        TC-KGI-E10: 存在しない Goal への現在値更新（404）
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.eq.return_value.execute.return_value \
                .data = []

            response = client.patch(
                f"/api/goals/{OTHER_GOAL_ID}/kgi/current-value",
                json={"current_value": 72.5},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 404

    def test_update_current_value_missing_field(self, client, valid_token):
        """
        TC-KGI-E11: current_value フィールド未入力（422）
        """
        response = client.patch(
            f"/api/goals/{TEST_GOAL_ID}/kgi/current-value",
            json={},
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422


class TestGetGoalsWithKgi:
    """GET /api/goals?include_kgi=true のテスト"""

    def test_get_goals_without_include_kgi(self, client, valid_token):
        """
        TC-KGI-20: include_kgi なしの GET /goals（既存動作との互換性）
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value.execute.return_value \
                .data = [BASE_GOAL]

            response = client.get(
                "/api/goals",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200

    def test_get_goals_with_include_kgi(self, client, valid_token):
        """
        TC-KGI-21: include_kgi=true で KGI 計算フィールドが付与される
        🔵 信頼性レベル: REQ-DASH-001 より
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value.execute.return_value \
                .data = [KGI_GOAL]

            response = client.get(
                "/api/goals?include_kgi=true",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)
        assert len(data) == 1
        item = data[0]
        assert "is_kgi" in item
        assert "days_remaining" in item
        assert "is_expired" in item
        assert "achievement_rate" in item
        assert item["is_kgi"] is True

    def test_get_goals_with_include_kgi_non_kgi_goal(self, client, valid_token):
        """
        TC-KGI-22: include_kgi=true で非KGI Goal は is_kgi=false
        """
        with patch("app.api.routes.goals.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value.execute.return_value \
                .data = [BASE_GOAL]

            response = client.get(
                "/api/goals?include_kgi=true",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        item = data[0]
        assert item["is_kgi"] is False
        assert item["days_remaining"] is None
        assert item["achievement_rate"] is None
