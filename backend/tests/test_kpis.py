"""
KPI CRUD API テスト
TASK-0031: kpis.py KPI CRUD + KPIログupsert API実装

【テスト戦略】:
- Supabase クライアントを unittest.mock でモック（DB 依存なし）
- 認証は conftest.py の valid_token フィクスチャを利用

🔵 信頼性レベル: TASK-0031 テスト要件より
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_GOAL_ID = "goal-uuid-0001"
TEST_KPI_ID = "kpi-uuid-0001"

KGI_GOAL_DATA = {
    "id": TEST_GOAL_ID,
    "user_id": TEST_USER_ID,
    "title": "体重を70kgにする",
    "target_date": "2026-10-15",
    "metric_type": "numeric",
}

NON_KGI_GOAL_DATA = {
    "id": TEST_GOAL_ID,
    "user_id": TEST_USER_ID,
    "title": "体重を70kgにする",
    "target_date": None,
    "metric_type": None,
}

KPI_DATA = {
    "id": TEST_KPI_ID,
    "user_id": TEST_USER_ID,
    "goal_id": TEST_GOAL_ID,
    "title": "週の運動日数",
    "description": None,
    "metric_type": "numeric",
    "target_value": 4.0,
    "unit": "回/週",
    "tracking_frequency": "weekly",
    "display_order": 0,
    "is_active": True,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

PERCENTAGE_KPI_DATA = {**KPI_DATA, "id": "kpi-uuid-pct", "metric_type": "percentage", "target_value": 80.0}
BINARY_KPI_DATA = {**KPI_DATA, "id": "kpi-uuid-bin", "metric_type": "binary", "target_value": None}

KPI_LOG_DATA = {
    "id": "log-uuid-0001",
    "kpi_id": TEST_KPI_ID,
    "user_id": TEST_USER_ID,
    "log_date": "2026-04-15",
    "value": 3.0,
    "input_method": "manual",
    "note": None,
    "created_at": "2026-04-15T00:00:00+00:00",
}


def make_supabase_mock():
    mock_sb = MagicMock()
    return mock_sb


class TestCreateKpi:
    """POST /api/kpis のテスト"""

    def test_create_kpi_success(self, client, valid_token):
        """
        TC-KPI-01: KPI 作成の正常系
        🔵 信頼性レベル: REQ-KPI-001 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            # Goal が KGI かの確認
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KGI_GOAL_DATA

            # KPI 作成
            mock_sb.table.return_value.insert.return_value.execute.return_value \
                .data = [KPI_DATA]

            response = client.post(
                "/api/kpis",
                json={
                    "goal_id": TEST_GOAL_ID,
                    "title": "週の運動日数",
                    "metric_type": "numeric",
                    "target_value": 4,
                    "unit": "回/週",
                    "tracking_frequency": "weekly",
                },
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["title"] == "週の運動日数"
        assert data["metric_type"] == "numeric"

    def test_create_kpi_goal_not_kgi(self, client, valid_token):
        """
        TC-KPI-E01: Goal が KGI でない場合（422）
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = NON_KGI_GOAL_DATA

            response = client.post(
                "/api/kpis",
                json={
                    "goal_id": TEST_GOAL_ID,
                    "title": "週の運動日数",
                    "metric_type": "numeric",
                    "tracking_frequency": "weekly",
                },
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 422

    def test_create_kpi_missing_required_fields(self, client, valid_token):
        """
        TC-KPI-E02: 必須フィールド不足（422）
        """
        response = client.post(
            "/api/kpis",
            json={"title": "週の運動日数"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422


class TestGetKpis:
    """GET /api/kpis のテスト"""

    def test_get_kpis_by_goal_id(self, client, valid_token):
        """
        TC-KPI-10: goal_id で KPI 一覧取得
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value \
                .data = [KPI_DATA]

            # habits join data
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.execute.return_value.data = []

            response = client.get(
                f"/api/kpis?goal_id={TEST_GOAL_ID}",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200


class TestGetTodayKpis:
    """GET /api/kpis/today のテスト"""

    def test_get_today_kpis_success(self, client, valid_token):
        """
        TC-KPI-20: 今日のKPI一覧取得
        🔵 信頼性レベル: REQ-DASH-002 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            # アクティブな KPI 一覧
            kpis_result = MagicMock()
            kpis_result.data = [KPI_DATA]
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.execute.return_value = kpis_result

            # 今日のログ（未記録）
            log_result = MagicMock()
            log_result.data = None
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value = log_result

            # 習慣連結
            habits_result = MagicMock()
            habits_result.data = []
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.execute.return_value = habits_result

            response = client.get(
                "/api/kpis/today",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)


class TestUpsertKpiLog:
    """PUT /api/kpis/{kpi_id}/logs のテスト"""

    def test_upsert_kpi_log_success(self, client, valid_token):
        """
        TC-KPI-30: KPI ログ upsert の正常系
        🔵 信頼性レベル: REQ-LOG-002 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            # KPI 取得
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KPI_DATA

            # upsert 結果
            mock_sb.table.return_value.upsert.return_value.execute.return_value \
                .data = [KPI_LOG_DATA]

            response = client.put(
                f"/api/kpis/{TEST_KPI_ID}/logs",
                json={"log_date": "2026-04-15", "value": 3.0},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["value"] == 3.0

    def test_upsert_kpi_log_percentage_out_of_range(self, client, valid_token):
        """
        TC-KPI-E30: percentage 型の範囲バリデーション（422）
        🔵 信頼性レベル: EDGE-KPI-004 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = PERCENTAGE_KPI_DATA

            response = client.put(
                f"/api/kpis/{PERCENTAGE_KPI_DATA['id']}/logs",
                json={"log_date": "2026-04-15", "value": 105},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 422

    def test_upsert_kpi_log_binary_invalid_value(self, client, valid_token):
        """
        TC-KPI-E31: binary 型の値バリデーション（422）
        🔵 信頼性レベル: EDGE-KPI-006 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = BINARY_KPI_DATA

            response = client.put(
                f"/api/kpis/{BINARY_KPI_DATA['id']}/logs",
                json={"log_date": "2026-04-15", "value": 0.5},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 422

    def test_upsert_kpi_log_kpi_not_found(self, client, valid_token):
        """
        TC-KPI-E32: 存在しない KPI へのログ記録（404）
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = None

            response = client.put(
                "/api/kpis/nonexistent-kpi/logs",
                json={"log_date": "2026-04-15", "value": 3.0},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 404


class TestLinkKpiHabits:
    """POST /api/kpis/{kpi_id}/habits のテスト"""

    def test_link_kpi_habits_success(self, client, valid_token):
        """
        TC-KPI-40: KPI 習慣連結の正常系
        🔵 信頼性レベル: REQ-KPI-006 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb

            # 削除と挿入のモック
            mock_sb.table.return_value.delete.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []
            mock_sb.table.return_value.insert.return_value.execute.return_value.data = []

            response = client.post(
                f"/api/kpis/{TEST_KPI_ID}/habits",
                json={"habit_ids": ["habit-uuid-001", "habit-uuid-002"]},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert "habit_ids" in data

    def test_link_kpi_habits_empty(self, client, valid_token):
        """
        TC-KPI-41: 空の habit_ids で全削除
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.delete.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []

            response = client.post(
                f"/api/kpis/{TEST_KPI_ID}/habits",
                json={"habit_ids": []},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200


class TestDeleteKpi:
    """DELETE /api/kpis/{kpi_id} のテスト"""

    def test_delete_kpi_success(self, client, valid_token):
        """
        TC-KPI-50: KPI 削除の正常系（soft delete）
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = make_supabase_mock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = [{**KPI_DATA, "is_active": False}]

            response = client.delete(
                f"/api/kpis/{TEST_KPI_ID}",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
