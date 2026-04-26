"""
メールサービス・スケジューラー テスト (TASK-0011)

テスト対象:
- email_service.send_reminder_email() : Resendメール送信
- scheduler.weekly_review.send_weekly_reminders() : スケジューラージョブ
- main.py lifespan: スケジューラー起動/停止

🔵 信頼性レベル: TASK-0011要件定義・REQ-701/801/802 より
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


# ==================================================
# email_service テスト
# ==================================================

class TestSendReminderEmail:
    """email_service.send_reminder_email() のテスト"""

    def test_send_reminder_email_success(self):
        """
        TC-001: メール送信正常系

        【テスト目的】: Resend APIが呼ばれ、Trueが返ること
        【期待される動作】: True
        🔵 信頼性レベル: REQ-801 より
        """
        from app.services.email_service import send_reminder_email

        mock_resend_client = MagicMock()
        mock_resend_client.Emails.send.return_value = {"id": "email-id-001"}

        with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}):
            result = asyncio.run(send_reminder_email(
                to_email="user@example.com",
                user_name="テストユーザー",
                resend_client=mock_resend_client,
            ))

        assert result is True  # 【確認内容】: 送信成功でTrue 🔵
        mock_resend_client.Emails.send.assert_called_once()  # 【確認内容】: APIが1回呼ばれた 🔵

        # 送信内容の確認
        call_args = mock_resend_client.Emails.send.call_args[0][0]
        assert call_args["to"] == ["user@example.com"]  # 【確認内容】: 送信先が正しい 🔵
        assert "テストユーザー" in call_args["html"]  # 【確認内容】: ユーザー名が含まれる 🔵

    def test_send_reminder_email_failure_returns_false(self):
        """
        TC-004: メール送信失敗時にFalseが返り、アプリが継続すること

        【テスト目的】: 送信失敗時はFalseを返し、例外を外部に漏らさないこと
        【期待される動作】: False（例外なし）
        🔵 信頼性レベル: REQ-802（アプリ継続）より
        """
        from app.services.email_service import send_reminder_email

        mock_resend_client = MagicMock()
        mock_resend_client.Emails.send.side_effect = Exception("Resend API接続エラー")

        with patch.dict("os.environ", {"RESEND_API_KEY": "test-api-key"}):
            result = asyncio.run(send_reminder_email(
                to_email="user@example.com",
                resend_client=mock_resend_client,
            ))

        assert result is False  # 【確認内容】: 失敗時はFalse 🔵
        # 【確認内容】: 例外が外部に漏れないこと（テスト自体が正常終了すれば証明）

    def test_send_reminder_email_no_api_key_returns_false(self):
        """
        TC-005: APIキー未設定時にFalseが返ること

        【期待される動作】: False（メール未送信）
        🔵 信頼性レベル: REQ-801 より
        """
        from app.services.email_service import send_reminder_email

        with patch.dict("os.environ", {"RESEND_API_KEY": ""}):
            result = asyncio.run(send_reminder_email(
                to_email="user@example.com",
            ))

        assert result is False  # 【確認内容】: APIキーなしはFalse 🔵


# ==================================================
# send_weekly_reminders テスト
# ==================================================

class TestSendWeeklyReminders:
    """scheduler.weekly_review.send_weekly_reminders() のテスト"""

    def test_sends_email_to_enabled_users_on_review_day(self):
        """
        TC-002: 通知enabled・本日が週次レビュー曜日のユーザーにメールが送信されること

        【テスト目的】: 対象ユーザーにメール送信が呼ばれること
        【期待される動作】: send_reminder_email が1回呼ばれる
        🔵 信頼性レベル: REQ-701 より
        """
        from datetime import date
        from scheduler.weekly_review import send_weekly_reminders

        today_weekday = date.today().isoweekday()

        # 対象ユーザー
        target_user = {
            "id": TEST_USER_ID,
            "display_name": "テストユーザー",
            "notification_email": "user@example.com",
            "weekly_review_day": today_weekday,
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.execute.return_value.data = [target_user]

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb))

        assert result == 1  # 【確認内容】: 1件送信成功 🔵
        mock_send.assert_called_once_with(
            to_email="user@example.com",
            user_name="テストユーザー",
        )  # 【確認内容】: 正しいパラメータで呼ばれた 🔵

    def test_does_not_send_to_notification_disabled_user(self):
        """
        TC-003（変形）: notification_enabled=false のユーザーはDBクエリ時点で除外されること

        【テスト目的】: notification_enabled=false のユーザーはSQLフィルタで除外される
        【期待される動作】: send_reminder_email は呼ばれない
        🔵 信頼性レベル: REQ-802 より
        """
        from scheduler.weekly_review import send_weekly_reminders

        # 通知無効ユーザーはDBクエリで除外されるため、空リストを返す
        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.execute.return_value.data = []  # 空（除外済み）

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb))

        assert result == 0  # 【確認内容】: 送信件数0 🔵
        mock_send.assert_not_called()  # 【確認内容】: メール送信なし 🔵

    def test_skips_user_without_email(self):
        """
        TC-006: メールアドレス未設定のユーザーはスキップされること

        【期待される動作】: send_reminder_email は呼ばれない
        🔵 信頼性レベル: REQ-801 より
        """
        from datetime import date
        from scheduler.weekly_review import send_weekly_reminders

        today_weekday = date.today().isoweekday()

        # メールアドレス未設定のユーザー
        user_no_email = {
            "id": TEST_USER_ID,
            "display_name": "テストユーザー",
            "notification_email": None,  # 未設定
            "weekly_review_day": today_weekday,
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.execute.return_value.data = [user_no_email]

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb))

        assert result == 0  # 【確認内容】: 送信件数0 🔵
        mock_send.assert_not_called()  # 【確認内容】: メール送信なし 🔵


# ==================================================
# スケジューラー起動/停止テスト
# ==================================================

class TestSchedulerLifecycle:
    """APScheduler の起動/停止テスト"""

    def test_scheduler_starts_and_stops(self):
        """
        TC-007: スケジューラー起動/停止テスト

        【テスト目的】: setup_scheduler() でジョブが登録されること
        【期待される動作】: スケジューラーにジョブが1件登録される
        🔵 信頼性レベル: architecture.md APScheduler より
        """
        from scheduler.weekly_review import setup_scheduler

        sched = setup_scheduler()
        jobs = sched.get_jobs()

        assert len(jobs) >= 1  # 【確認内容】: ジョブが登録済み 🔵
        job_ids = [job.id for job in jobs]
        assert "weekly_review_reminder" in job_ids  # 【確認内容】: 週次リマインダージョブあり 🔵
