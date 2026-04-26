"""
Wanna Be分析SSE・週次レビューSSE テスト (TASK-0010)

テスト対象:
- POST /api/wanna-be/analyze : Wanna Be分析SSEストリーミング
- GET  /api/ai/weekly-review/stream : 週次レビューSSEストリーミング
- ai_service.analyze_wanna_be() : SSEジェネレータ
- ai_service.generate_weekly_review() : 週次レビュージェネレータ

🔵 信頼性レベル: TASK-0010要件定義・REQ-203/702・EDGE-001 より
"""
import json
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_HABIT_ID = "00000000-0000-0000-0000-000000000020"
TODAY = str(date.today())
WEEK_START = str(date.today() - timedelta(days=date.today().weekday()))


# ==================================================
# POST /api/wanna-be/analyze テスト
# ==================================================

class TestWannaBeAnalyze:
    """POST /api/wanna-be/analyze のテスト"""

    def test_wanna_be_analyze_returns_sse_stream(self, client, valid_token):
        """
        TC-001: Wanna Be分析SSEチャンク生成

        【テスト目的】: SSEチャンクが返り、type:done と suggested_goals が含まれること
        【期待される動作】: StreamingResponse, SSEチャンク複数 + done イベント
        🔵 信頼性レベル: REQ-203・NFR-002 より
        """
        async def mock_analyze_wanna_be(wanna_be_text, async_client=None):
            yield 'data: {"type": "chunk", "content": "目標を分析しています..."}\n\n'
            yield 'data: {"type": "chunk", "content": "1. 健康的な生活"}\n\n'
            yield 'data: {"type": "done", "suggested_goals": [{"title": "毎日運動する", "description": "30分のランニング"}]}\n\n'

        wanna_be_data = {
            "id": "00000000-0000-0000-0000-000000000080",
            "user_id": TEST_USER_ID,
            "text": "健康的なライフスタイルを送りたい",
            "version": 1,
            "is_current": True,
        }

        with patch("app.api.routes.wanna_be.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.wanna_be.analyze_wanna_be", side_effect=mock_analyze_wanna_be):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 現在のWanna Be（存在しない）
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []

            # 非活性化
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = []

            # 新しいWanna Be保存
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [wanna_be_data]

            response = client.post(
                "/api/wanna-be/analyze",
                json={"text": "健康的なライフスタイルを送りたい"},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 200 OK 🔵
        assert "text/event-stream" in response.headers["content-type"]  # 【確認内容】: SSEレスポンス 🔵

        # SSEチャンクの確認
        content = response.text
        assert "type" in content  # 【確認内容】: SSEイベントタイプ 🔵
        assert "done" in content  # 【確認内容】: doneイベント 🔵

    def test_wanna_be_analyze_ai_unavailable(self, client, valid_token):
        """
        TC-003: Claude API障害時の動作（EDGE-001）

        【テスト目的】: AI障害時にSSEエラーイベントが返ること、Wanna Beは保存済みであること
        【期待される動作】: SSEで type:error が返る
        🔵 信頼性レベル: EDGE-001 より
        """
        from app.services.ai_service import AIUnavailableError

        async def mock_analyze_raises(wanna_be_text, async_client=None):
            raise AIUnavailableError("APIエラー")
            yield  # ジェネレータにするために必要

        wanna_be_data = {
            "id": "00000000-0000-0000-0000-000000000080",
            "user_id": TEST_USER_ID,
            "text": "健康的なライフスタイルを送りたい",
            "version": 1,
            "is_current": True,
        }

        with patch("app.api.routes.wanna_be.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.wanna_be.analyze_wanna_be", side_effect=mock_analyze_raises):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []
            mock_sb.table.return_value.update.return_value \
                .eq.return_value.execute.return_value.data = []
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [wanna_be_data]

            response = client.post(
                "/api/wanna-be/analyze",
                json={"text": "健康的なライフスタイルを送りたい"},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: SSEなので200 🔵
        assert "AI_UNAVAILABLE" in response.text  # 【確認内容】: AI障害エラーがSSEで返る 🔵

    def test_wanna_be_analyze_no_auth_returns_403(self, client):
        """未認証で 403"""
        response = client.post(
            "/api/wanna-be/analyze",
            json={"text": "健康的なライフスタイル"},
        )
        assert response.status_code == 403  # 【確認内容】: 未認証で403 🔵


# ==================================================
# GET /api/ai/weekly-review/stream テスト
# ==================================================

class TestWeeklyReviewStream:
    """GET /api/ai/weekly-review/stream のテスト"""

    def test_weekly_review_returns_sse_stream(self, client, valid_token):
        """
        TC-002: 週次レビューSSE正常系

        【テスト目的】: SSEチャンクが返り、type:done とactionsが含まれること
        【期待される動作】: StreamingResponse, SSEチャンク + done イベント
        🔵 信頼性レベル: REQ-702 より
        """
        async def mock_generate_weekly_review(
            habits_summary, failure_reasons, achievement_rate, async_client=None
        ):
            yield 'data: {"type": "chunk", "content": "今週の分析..."}\n\n'
            yield 'data: {"type": "done", "actions": [], "achievement_rate": 75.0}\n\n'

        with patch("app.api.routes.ai_coach.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.ai_coach.generate_weekly_review", side_effect=mock_generate_weekly_review):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # weekly_reviews 既存なし
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []

            # INSERT
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [{"id": "00000000-0000-0000-0000-000000000090"}]

            # 習慣一覧
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []

            response = client.get(
                f"/api/ai/weekly-review/stream?week_start={WEEK_START}",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 200 OK 🔵
        assert "text/event-stream" in response.headers["content-type"]  # 【確認内容】: SSEレスポンス 🔵
        content = response.text
        assert "done" in content  # 【確認内容】: doneイベント 🔵

    def test_weekly_review_ai_unavailable(self, client, valid_token):
        """
        TC-003変形: 週次レビューでAI障害時のSSEエラーイベント（EDGE-001）

        【期待される動作】: SSEで type:error, error:AI_UNAVAILABLE が返る
        🔵 信頼性レベル: EDGE-001 より
        """
        from app.services.ai_service import AIUnavailableError

        async def mock_raises(habits_summary, failure_reasons, achievement_rate, async_client=None):
            raise AIUnavailableError("APIエラー")
            yield

        with patch("app.api.routes.ai_coach.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.ai_coach.generate_weekly_review", side_effect=mock_raises):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.execute.return_value.data = []
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [{"id": "review-id"}]

            response = client.get(
                f"/api/ai/weekly-review/stream?week_start={WEEK_START}",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: SSEなので200 🔵
        assert "AI_UNAVAILABLE" in response.text  # 【確認内容】: AI障害エラーがSSEで返る 🔵

    def test_weekly_review_no_auth_returns_403(self, client):
        """未認証で 403"""
        response = client.get("/api/ai/weekly-review/stream")
        assert response.status_code == 403  # 【確認内容】: 未認証で403 🔵


# ==================================================
# ai_service ユニットテスト
# ==================================================

class TestAnalyzeWannaBe:
    """ai_service.analyze_wanna_be() のユニットテスト"""

    def test_generates_sse_chunks_and_done_event(self):
        """
        TC-001: SSEチャンク + doneイベントの生成

        【テスト目的】: チャンクとdoneイベントが正しく生成されること
        🔵 信頼性レベル: REQ-203・NFR-002 より
        """
        import asyncio
        from app.services.ai_service import analyze_wanna_be

        # 非同期ストリームクライアントのモック
        mock_client = MagicMock()
        mock_stream = MagicMock()

        async def mock_text_stream():
            yield "目標を分析しています..."
            yield "\n\n[GOALS_JSON]\n"
            yield '[{"title": "毎日運動する", "description": "30分のランニング"}]\n'
            yield "[/GOALS_JSON]"

        mock_stream.text_stream = mock_text_stream()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=None)
        mock_client.messages.stream.return_value = mock_stream

        async def run():
            chunks = []
            async for chunk in analyze_wanna_be("健康的な生活", async_client=mock_client):
                chunks.append(chunk)
            return chunks

        chunks = asyncio.run(run())

        # チャンクが生成されたか
        assert len(chunks) > 0  # 【確認内容】: チャンクあり 🔵

        # doneイベントが含まれるか
        done_chunks = [c for c in chunks if '"type": "done"' in c or '"type":"done"' in c]
        assert len(done_chunks) == 1  # 【確認内容】: doneイベント1件 🔵

        # suggested_goals が含まれるか
        done_data = json.loads(done_chunks[0].replace("data: ", "").strip())
        assert "suggested_goals" in done_data  # 【確認内容】: suggested_goals あり 🔵

    def test_no_personal_info_in_request(self):
        """
        TC-006変形: Claude APIへのリクエストに個人情報が含まれないこと（REQ-605）

        【テスト目的】: Wanna Beテキストのみが送信されること
        🔵 信頼性レベル: REQ-605・NFR-101 より
        """
        import asyncio
        from app.services.ai_service import analyze_wanna_be

        mock_client = MagicMock()
        mock_stream = MagicMock()

        async def mock_text_stream():
            yield "分析完了"

        mock_stream.text_stream = mock_text_stream()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=None)
        mock_client.messages.stream.return_value = mock_stream

        user_email = "user@example.com"
        user_id = TEST_USER_ID
        wanna_be_text = "健康的な生活を送りたい"

        async def run():
            async for _ in analyze_wanna_be(wanna_be_text, async_client=mock_client):
                pass

        asyncio.run(run())

        # APIコール引数を確認
        call_kwargs = str(mock_client.messages.stream.call_args)
        assert user_email not in call_kwargs  # 【確認内容】: メールアドレスなし 🔵
        assert user_id not in call_kwargs  # 【確認内容】: ユーザーIDなし 🔵
        assert wanna_be_text in call_kwargs  # 【確認内容】: Wanna Beテキストは含まれる 🔵
