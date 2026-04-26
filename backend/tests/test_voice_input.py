"""
音声入力API・AI分類サービス テスト (TASK-0009)

テスト対象:
- POST /api/voice-input : 音声入力分類・後処理
- voice_classifier.classify_voice_input() : AI分類ロジック

🔵 信頼性レベル: TASK-0009要件定義・REQ-401/402/403・EDGE-001/003 より
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_HABIT_ID = "00000000-0000-0000-0000-000000000020"
TODAY = str(date.today())


def _make_habit(habit_id=TEST_HABIT_ID, title="早起き"):
    return {
        "id": habit_id,
        "user_id": TEST_USER_ID,
        "title": title,
        "is_active": True,
        "display_order": 0,
        "goal_id": None,
        "frequency": "daily",
        "scheduled_time": None,
        "current_streak": 0,
        "longest_streak": 0,
        "description": None,
        "wanna_be_connection_text": None,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }


# ==================================================
# POST /api/voice-input テスト
# ==================================================

class TestVoiceInputEndpoint:
    """POST /api/voice-input のテスト"""

    def test_checklist_classification_updates_logs(self, client, valid_token):
        """
        TC-004: チェックリスト分類後のログ更新統合テスト

        【テスト目的】: チェックリスト分類時に habit_logs が更新されること
        【期待される動作】: 200, success=true, updated_habits に更新ログが含まれる
        🔵 信頼性レベル: REQ-401/403 より
        """
        from app.services.voice_classifier import ClassificationResult, HabitCheckResult

        habit = _make_habit()
        log = {
            "id": "00000000-0000-0000-0000-000000000040",
            "habit_id": TEST_HABIT_ID,
            "user_id": TEST_USER_ID,
            "log_date": TODAY,
            "completed": True,
            "input_method": "voice",
            "completed_at": None,
            "created_at": "2026-04-14T07:30:00+00:00",
        }

        checklist_result = ClassificationResult(
            type="checklist",
            habit_results=[
                HabitCheckResult(
                    habit_id=TEST_HABIT_ID,
                    habit_title="早起き",
                    completed=True,
                    confidence=0.95,
                )
            ],
        )

        with patch("app.api.routes.voice_input.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.voice_input.classify_voice_input", return_value=checklist_result), \
             patch("app.api.routes.voice_input.streak_service") as mock_streak, \
             patch("app.api.routes.voice_input.badge_service") as mock_badge:

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 習慣一覧
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value \
                .execute.return_value.data = [{"id": TEST_HABIT_ID, "title": "早起き"}]

            # ログUPSERT
            mock_sb.table.return_value.upsert.return_value \
                .execute.return_value.data = [log]

            mock_streak.calculate_streak.return_value = 1
            mock_streak.update_streak.return_value = None
            mock_badge.check_and_award_badges.return_value = None

            response = client.post(
                "/api/voice-input",
                json={"text": "早起き達成！", "date": TODAY},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["type"] == "checklist"  # 【確認内容】: 分類タイプ 🔵
        assert len(data["data"]["updated_habits"]) == 1  # 【確認内容】: 1件更新 🔵

    def test_journaling_classification_saves_journal(self, client, valid_token):
        """
        TC-002: ジャーナリング分類時に journal_entries に保存されること

        【期待される動作】: 200, success=true, journal_entry が返る
        🔵 信頼性レベル: REQ-402 より
        """
        from app.services.voice_classifier import ClassificationResult

        journaling_result = ClassificationResult(
            type="journaling",
            content="今日は気分が良かった。集中できた。",
        )
        journal_entry = {
            "id": "00000000-0000-0000-0000-000000000070",
            "user_id": TEST_USER_ID,
            "entry_date": TODAY,
            "content": "今日は気分が良かった。集中できた。",
            "entry_type": "journaling",
            "created_at": "2026-04-14T07:30:00+00:00",
        }

        with patch("app.api.routes.voice_input.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.voice_input.classify_voice_input", return_value=journaling_result):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 習慣一覧
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value \
                .execute.return_value.data = []

            # ジャーナル保存
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [journal_entry]

            response = client.post(
                "/api/voice-input",
                json={"text": "今日は気分が良かった。集中できた。", "date": TODAY},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["type"] == "journaling"  # 【確認内容】: ジャーナル分類 🔵
        assert data["data"]["journal_entry"] is not None  # 【確認内容】: ジャーナルエントリー 🔵

    def test_unknown_classification_returns_message(self, client, valid_token):
        """
        TC-003: unknown分類時に確認メッセージが返ること（EDGE-003）

        【期待される動作】: 200, message="どの操作ですか？..."
        🔵 信頼性レベル: EDGE-003 より
        """
        from app.services.voice_classifier import ClassificationResult

        unknown_result = ClassificationResult(type="unknown", content="謎のテキスト")

        with patch("app.api.routes.voice_input.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.voice_input.classify_voice_input", return_value=unknown_result):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value \
                .execute.return_value.data = []

            response = client.post(
                "/api/voice-input",
                json={"text": "謎のテキスト", "date": TODAY},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 200 OK 🔵
        data = response.json()
        assert "どの操作ですか" in data["data"]["message"]  # 【確認内容】: 確認メッセージ 🔵

    def test_ai_unavailable_returns_503(self, client, valid_token):
        """
        TC-005: Claude API障害時に 503 AI_UNAVAILABLE が返ること（EDGE-001）

        【期待される動作】: 503, error.code="AI_UNAVAILABLE"
        🔵 信頼性レベル: EDGE-001 より
        """
        from app.services.voice_classifier import AIUnavailableError

        with patch("app.api.routes.voice_input.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.voice_input.classify_voice_input",
                   side_effect=AIUnavailableError("APIエラー")):

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.order.return_value \
                .execute.return_value.data = []

            response = client.post(
                "/api/voice-input",
                json={"text": "早起き達成", "date": TODAY},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 503  # 【確認内容】: AI障害で503 🔵
        data = response.json()
        assert data["error"]["code"] == "AI_UNAVAILABLE"  # 【確認内容】: AI_UNAVAILABLEエラー 🔵
        assert "通常のトラッキング機能" in data["error"]["message"]  # 【確認内容】: 継続案内 🔵

    def test_no_auth_returns_403(self, client):
        """
        TC-008: 未認証で 403

        【期待される動作】: 403
        🔵 信頼性レベル: NFR-101 より
        """
        response = client.post(
            "/api/voice-input",
            json={"text": "テスト", "date": TODAY},
        )
        assert response.status_code == 403  # 【確認内容】: 未認証で403 🔵


# ==================================================
# voice_classifier ユニットテスト
# ==================================================

class TestClassifyVoiceInput:
    """voice_classifier.classify_voice_input() のユニットテスト"""

    def test_checklist_classification(self):
        """
        TC-001: チェックリスト分類の正常系

        【テスト目的】: モックClaude APIがチェックリストに分類すること
        【期待される動作】: type="checklist", 各習慣の completed が正しい
        🔵 信頼性レベル: REQ-401 より
        """
        from app.services.voice_classifier import classify_voice_input

        # Claude APIのレスポンスをモック
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = (
            '{"type": "checklist", "habit_results": ['
            f'{{"habit_id": "{TEST_HABIT_ID}", "habit_title": "早起き", "completed": true, "confidence": 0.95}},'
            '{"habit_id": "筋トレID", "habit_title": "筋トレ", "completed": false, "confidence": 0.9}'
            "]}"
        )
        mock_client.messages.create.return_value = mock_response

        habits = [
            {"id": TEST_HABIT_ID, "title": "早起き"},
            {"id": "筋トレID", "title": "筋トレ"},
        ]

        result = classify_voice_input(
            text="早起き達成、筋トレはできなかった",
            user_habits=habits,
            log_date=date.today(),
            anthropic_client=mock_client,
        )

        assert result.type == "checklist"  # 【確認内容】: チェックリスト分類 🔵
        assert len(result.habit_results) == 2  # 【確認内容】: 2件の習慣結果 🔵
        assert result.habit_results[0].completed is True  # 【確認内容】: 早起き達成 🔵
        assert result.habit_results[1].completed is False  # 【確認内容】: 筋トレ未達成 🔵

    def test_journaling_classification(self):
        """
        TC-002: ジャーナリング分類の正常系

        【期待される動作】: type="journaling", content にテキストが設定
        🔵 信頼性レベル: REQ-402 より
        """
        from app.services.voice_classifier import classify_voice_input

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = (
            '{"type": "journaling", "content": "今日は気分が良かった。集中できた。"}'
        )
        mock_client.messages.create.return_value = mock_response

        result = classify_voice_input(
            text="今日は気分が良かった。集中できた。",
            user_habits=[],
            log_date=date.today(),
            anthropic_client=mock_client,
        )

        assert result.type == "journaling"  # 【確認内容】: ジャーナリング分類 🔵
        assert "今日は気分が良かった" in result.content  # 【確認内容】: contentにテキスト 🔵

    def test_unknown_classification_on_json_error(self):
        """
        TC-007: JSONパースエラー時は unknown に分類されること

        【期待される動作】: type="unknown"
        🔵 信頼性レベル: api-endpoints.md より
        """
        from app.services.voice_classifier import classify_voice_input

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = "これはJSONではないテキストです"
        mock_client.messages.create.return_value = mock_response

        result = classify_voice_input(
            text="テスト入力",
            user_habits=[],
            log_date=date.today(),
            anthropic_client=mock_client,
        )

        assert result.type == "unknown"  # 【確認内容】: JSONエラーでunknown 🔵

    def test_ai_unavailable_error_on_api_error(self):
        """
        TC-005: Claude API障害時に AIUnavailableError がraise されること（EDGE-001）

        【期待される動作】: AIUnavailableError が発生
        🔵 信頼性レベル: EDGE-001 より
        """
        import anthropic
        from app.services.voice_classifier import AIUnavailableError, classify_voice_input

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = anthropic.APIError(
            message="APIエラー", request=MagicMock(), body=None
        )

        with pytest.raises(AIUnavailableError):  # 【確認内容】: AIUnavailableError がraise 🔵
            classify_voice_input(
                text="早起き達成",
                user_habits=[],
                log_date=date.today(),
                anthropic_client=mock_client,
            )

    def test_no_personal_info_in_claude_request(self):
        """
        TC-006: Claude APIへのリクエストに個人情報が含まれないこと（REQ-605）

        【テスト目的】: ユーザーID・メールがClaude APIのメッセージに含まれないこと
        【期待される動作】: messages の content にユーザーIDが含まれない
        🔵 信頼性レベル: REQ-605・NFR-101 より
        """
        from app.services.voice_classifier import classify_voice_input

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = '{"type": "unknown", "content": "test"}'
        mock_client.messages.create.return_value = mock_response

        user_email = "user@example.com"
        personal_user_id = "00000000-0000-0000-0000-000000000001"

        classify_voice_input(
            text="テスト",
            user_habits=[{"id": TEST_HABIT_ID, "title": "習慣名"}],
            log_date=date.today(),
            anthropic_client=mock_client,
        )

        # Claude API呼び出しの引数を確認
        call_kwargs = mock_client.messages.create.call_args
        messages_content = str(call_kwargs)

        # 【確認内容】: ユーザーID・メールが含まれない
        assert user_email not in messages_content  # 🔵
        assert personal_user_id not in messages_content  # 🔵
        # 習慣IDはhobitsの参照として含まれる場合があるが、
        # userのメールアドレスや認証情報は含まれない
