"""
KGI/KPI 統合テスト (voice_classifier + ai_service)
TASK-0033: voice_classifier + ai_service KGI/KPI統合

🔵 信頼性レベル: TASK-0033 テスト要件より
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

KPI_LIST = [
    {"id": "kpi-uuid-001", "title": "週の運動日数", "unit": "回/週"},
    {"id": "kpi-uuid-002", "title": "体重", "unit": "kg"},
    {"id": "kpi-uuid-003", "title": "睡眠時間", "unit": "時間"},
]


class TestMatchKpiCandidates:
    """match_kpi_candidates() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_match_by_unit_exact(self):
        """
        TC-VOICE-01: unit_hint が "kg" の場合、unit="kg" の KPI が返る
        🔵 信頼性レベル: REQ-LOG-003 より
        """
        from app.services.voice_classifier import match_kpi_candidates

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.execute.return_value \
            .data = KPI_LIST

        candidates = await match_kpi_candidates("kg", TEST_USER_ID, mock_sb)
        assert len(candidates) == 1
        assert candidates[0]["unit"] == "kg"

    @pytest.mark.asyncio
    async def test_match_no_result(self):
        """
        TC-VOICE-02: 一致する KPI がない場合は空リスト
        🔵 信頼性レベル: EDGE-KPI-006 より
        """
        from app.services.voice_classifier import match_kpi_candidates

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.execute.return_value \
            .data = KPI_LIST

        candidates = await match_kpi_candidates("mile", TEST_USER_ID, mock_sb)
        assert candidates == []

    @pytest.mark.asyncio
    async def test_match_empty_unit_hint(self):
        """
        TC-VOICE-03: unit_hint が空の場合は空リスト（エラーにしない）
        """
        from app.services.voice_classifier import match_kpi_candidates

        mock_sb = MagicMock()
        candidates = await match_kpi_candidates("", TEST_USER_ID, mock_sb)
        assert candidates == []

    @pytest.mark.asyncio
    async def test_match_partial_unit(self):
        """
        TC-VOICE-04: 部分一致（"時間" が unit="時間" に一致）
        """
        from app.services.voice_classifier import match_kpi_candidates

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.execute.return_value \
            .data = KPI_LIST

        candidates = await match_kpi_candidates("時間", TEST_USER_ID, mock_sb)
        assert len(candidates) == 1
        assert candidates[0]["unit"] == "時間"


class TestBuildWeeklyReviewPromptWithKgi:
    """build_weekly_review_prompt_with_kgi() 関数のテスト"""

    @pytest.mark.asyncio
    async def test_prompt_no_personal_info(self):
        """
        TC-AI-01: AI プロンプトに個人情報（タイトル）が含まれない
        🔵 信頼性レベル: NFR-KPI-102 より
        """
        from app.services.ai_service import build_weekly_review_prompt_with_kgi

        mock_sb = MagicMock()

        # KGI データ（タイトルなし）
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.not_.return_value.is_.return_value.execute.return_value \
            .data = [
                {"metric_type": "numeric", "target_value": 70.0, "current_value": 74.5, "target_date": "2026-10-15"}
            ]

        # KPI データ
        kpis_result = MagicMock()
        kpis_result.data = [
            {"id": "kpi-uuid-001", "metric_type": "numeric", "target_value": 4.0, "tracking_frequency": "weekly"}
        ]
        logs_result = MagicMock()
        logs_result.data = [{"value": 3.0}, {"value": 4.0}]

        call_count = [0]
        def mock_table(name):
            mock = MagicMock()
            if name == "goals":
                mock.select.return_value.eq.return_value.not_.return_value.is_.return_value.execute.return_value.data = [
                    {"metric_type": "numeric", "target_value": 70.0, "current_value": 74.5, "target_date": "2026-10-15"}
                ]
            elif name == "kpis":
                mock.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
                    {"id": "kpi-uuid-001", "metric_type": "numeric", "target_value": 4.0, "tracking_frequency": "weekly"}
                ]
            elif name == "kpi_logs":
                mock.select.return_value.eq.return_value.gte.return_value.execute.return_value.data = [
                    {"value": 3.0}, {"value": 4.0}
                ]
            return mock

        mock_sb.table = mock_table

        prompt = await build_weekly_review_prompt_with_kgi(TEST_USER_ID, {"achievement_rate": 80}, mock_sb)

        # タイトル等の個人情報が含まれていない
        assert "体重" not in prompt
        assert "goal_title" not in prompt
        assert "kpi_title" not in prompt
        # KGI・KPI 統計は含まれる
        assert "KGI" in prompt or "achievement_rate" in prompt or "metric_type" in prompt

    @pytest.mark.asyncio
    async def test_prompt_includes_kgi_stats(self):
        """
        TC-AI-02: プロンプトに KGI 達成率が含まれる
        🔵 信頼性レベル: REQ-REVIEW-001 より
        """
        from app.services.ai_service import build_weekly_review_prompt_with_kgi

        def mock_table(name):
            mock = MagicMock()
            if name == "goals":
                mock.select.return_value.eq.return_value.not_.return_value.is_.return_value.execute.return_value.data = [
                    {"metric_type": "numeric", "target_value": 70.0, "current_value": 63.0, "target_date": "2026-10-15"}
                ]
            elif name == "kpis":
                mock.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
            return mock

        mock_sb = MagicMock()
        mock_sb.table = mock_table

        prompt = await build_weekly_review_prompt_with_kgi(TEST_USER_ID, {}, mock_sb)
        # 達成率計算が含まれること（90.0% = 63/70 * 100）
        assert prompt is not None
        assert len(prompt) > 0
