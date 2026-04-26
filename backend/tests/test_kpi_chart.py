"""
KPI ログ集計 API テスト
TASK-0032: KPIグラフデータ集計API実装

🔵 信頼性レベル: TASK-0032 テスト要件より
"""
from unittest.mock import MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_KPI_ID = "kpi-uuid-0001"

KPI_DATA = {
    "id": TEST_KPI_ID,
    "user_id": TEST_USER_ID,
    "goal_id": "goal-uuid-0001",
    "title": "週の運動日数",
    "metric_type": "numeric",
    "target_value": 4.0,
    "unit": "回/週",
    "tracking_frequency": "weekly",
    "display_order": 0,
    "is_active": True,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

LOGS_DATA = [
    {"log_date": "2026-04-13", "value": 75.0},
    {"log_date": "2026-04-14", "value": 74.5},
    {"log_date": "2026-04-15", "value": 74.0},
]


class TestGetKpiLogsChart:
    """GET /api/kpis/{kpi_id}/logs のテスト"""

    def test_get_daily_logs_success(self, client, valid_token):
        """
        TC-CHART-01: 日次データ取得の正常系
        🔵 信頼性レベル: REQ-LOG-005 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb

            # KPI 確認
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KPI_DATA

            # ログ取得
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.gte.return_value.order.return_value.execute.return_value \
                .data = LOGS_DATA

            response = client.get(
                f"/api/kpis/{TEST_KPI_ID}/logs?granularity=daily&range=7d",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert body["kpi_id"] == TEST_KPI_ID
        assert body["granularity"] == "daily"
        assert isinstance(body["data_points"], list)
        assert len(body["data_points"]) > 0

    def test_get_daily_logs_null_for_no_record(self, client, valid_token):
        """
        TC-CHART-02: 記録がない日は value=null
        🔵 信頼性レベル: REQ-LOG-005 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KPI_DATA
            # 記録なし
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.gte.return_value.order.return_value.execute.return_value \
                .data = []

            response = client.get(
                f"/api/kpis/{TEST_KPI_ID}/logs?granularity=daily&range=7d",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()["data"]
        data_points = body["data_points"]
        # 全ポイントの value が None
        assert all(dp["value"] is None for dp in data_points)

    def test_get_weekly_logs_success(self, client, valid_token):
        """
        TC-CHART-03: 週次データ取得
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KPI_DATA
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.gte.return_value.order.return_value.execute.return_value \
                .data = LOGS_DATA

            response = client.get(
                f"/api/kpis/{TEST_KPI_ID}/logs?granularity=weekly&range=12w",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert body["granularity"] == "weekly"

    def test_get_monthly_logs_success(self, client, valid_token):
        """
        TC-CHART-04: 月次データ取得
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KPI_DATA
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.gte.return_value.order.return_value.execute.return_value \
                .data = LOGS_DATA

            response = client.get(
                f"/api/kpis/{TEST_KPI_ID}/logs?granularity=monthly&range=6m",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert body["granularity"] == "monthly"

    def test_chart_summary_calculation(self, client, valid_token):
        """
        TC-CHART-05: summary（avg/max/min/latest_value）の正確性
        🔵 信頼性レベル: REQ-LOG-005 より
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = KPI_DATA
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.gte.return_value.order.return_value.execute.return_value \
                .data = LOGS_DATA

            response = client.get(
                f"/api/kpis/{TEST_KPI_ID}/logs?granularity=daily&range=7d",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        summary = response.json()["data"]["summary"]
        assert summary["max"] == 75.0
        assert summary["min"] == 74.0
        assert summary["target_value"] == 4.0

    def test_kpi_not_found(self, client, valid_token):
        """
        TC-CHART-E01: 存在しない KPI（404）
        """
        with patch("app.api.routes.kpis.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value.execute.return_value \
                .data = None

            response = client.get(
                "/api/kpis/nonexistent/logs",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 404

    def test_invalid_granularity(self, client, valid_token):
        """
        TC-CHART-E02: 無効な granularity（422）
        """
        with patch("app.api.routes.kpis.get_supabase"):
            response = client.get(
                f"/api/kpis/{TEST_KPI_ID}/logs?granularity=invalid",
                headers={"Authorization": f"Bearer {valid_token}"},
            )
        assert response.status_code == 422
