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
    """scheduler.weekly_review.send_weekly_reminders() のテスト

    Phase 3 (per-user TZ) 以降の挙動:
      - DB は notification_enabled=True で粗フィルタ
      - 各ユーザーの user_context.timezone で「今が 8 時台 + weekly_review_day」を判定
      - now_utc 引数で時刻を制御してテスト
    """

    def _wire_supabase(self, mock_sb, profiles, tz_rows=None):
        """user_profiles と user_context の 2 つの table モックを wire する。"""
        def _table(name):
            tbl = MagicMock()
            if name == "user_profiles":
                tbl.select.return_value.eq.return_value.execute.return_value.data = profiles
            elif name == "user_context":
                tbl.select.return_value.in_.return_value.execute.return_value.data = tz_rows or []
            return tbl

        mock_sb.table.side_effect = _table

    def test_sends_email_to_enabled_users_on_review_day(self):
        """JST 月曜 08:00 の起動で、weekly_review_day=月 (1) かつ JST TZ のユーザーに送信される。"""
        from datetime import datetime, timezone, timedelta
        from scheduler.weekly_review import send_weekly_reminders

        # JST 月曜 08:00 (= UTC 月曜 -1日 23:00 だが、ZoneInfo("Asia/Tokyo") で月曜 08:00 になる UTC 時刻を選ぶ)
        # JST = UTC+9 なので、UTC 月曜 23:00 = JST 火曜 08:00。
        # → JST 月曜 08:00 は UTC 月曜 -1d 23:00 (= 日曜 23:00 UTC) になる。
        # シンプルに: 2026-05-11 (JST 月曜) 08:00 JST = 2026-05-10 23:00 UTC (日曜)
        # ただ計算より、ZoneInfo に変換してから組み立てる。
        from zoneinfo import ZoneInfo
        jst_monday_8 = datetime(2026, 5, 11, 8, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
        now_utc = jst_monday_8.astimezone(timezone.utc)
        assert now_utc.astimezone(ZoneInfo("Asia/Tokyo")).isoweekday() == 1  # 月曜
        assert now_utc.astimezone(ZoneInfo("Asia/Tokyo")).hour == 8

        target_user = {
            "id": TEST_USER_ID,
            "display_name": "テストユーザー",
            "notification_email": "user@example.com",
            "weekly_review_day": 1,  # 月曜
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        self._wire_supabase(
            mock_sb,
            profiles=[target_user],
            tz_rows=[{"user_id": TEST_USER_ID, "timezone": "Asia/Tokyo"}],
        )

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        assert result == 1
        mock_send.assert_called_once_with(
            to_email="user@example.com",
            user_name="テストユーザー",
        )

    def test_does_not_send_when_local_hour_does_not_match(self):
        """JST 月曜 12:00 (8 時台でない) では送信されない。"""
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        from scheduler.weekly_review import send_weekly_reminders

        jst_monday_noon = datetime(2026, 5, 11, 12, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
        now_utc = jst_monday_noon.astimezone(timezone.utc)

        target_user = {
            "id": TEST_USER_ID,
            "display_name": "テストユーザー",
            "notification_email": "user@example.com",
            "weekly_review_day": 1,
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        self._wire_supabase(
            mock_sb,
            profiles=[target_user],
            tz_rows=[{"user_id": TEST_USER_ID, "timezone": "Asia/Tokyo"}],
        )

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        assert result == 0
        mock_send.assert_not_called()

    def test_does_not_send_when_weekday_does_not_match(self):
        """JST 火曜 08:00 で weekly_review_day=月 (1) のユーザーは対象外。"""
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        from scheduler.weekly_review import send_weekly_reminders

        jst_tuesday_8 = datetime(2026, 5, 12, 8, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
        now_utc = jst_tuesday_8.astimezone(timezone.utc)

        target_user = {
            "id": TEST_USER_ID,
            "display_name": "テストユーザー",
            "notification_email": "user@example.com",
            "weekly_review_day": 1,  # 月曜
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        self._wire_supabase(
            mock_sb,
            profiles=[target_user],
            tz_rows=[{"user_id": TEST_USER_ID, "timezone": "Asia/Tokyo"}],
        )

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        assert result == 0
        mock_send.assert_not_called()

    def test_per_user_tz_independence(self):
        """同じ now_utc でも user_context.timezone が違えば判定が変わる。

        UTC 月曜 23:00 のとき:
          - JST ユーザー (TZ=Asia/Tokyo) → 火曜 08:00 → weekly_review_day=2 (火) なら hit
          - LA ユーザー (TZ=America/Los_Angeles) → 月曜 16:00 → 8 時台ではない
        """
        from datetime import datetime, timezone
        from scheduler.weekly_review import send_weekly_reminders

        now_utc = datetime(2026, 5, 11, 23, 0, tzinfo=timezone.utc)

        jst_user = {
            "id": "user-jst",
            "display_name": "JST User",
            "notification_email": "jst@example.com",
            "weekly_review_day": 2,  # 火曜 (JST では 5/12 火曜)
            "notification_enabled": True,
        }
        la_user = {
            "id": "user-la",
            "display_name": "LA User",
            "notification_email": "la@example.com",
            "weekly_review_day": 1,  # 月曜 (LA では 5/11 月曜)
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        self._wire_supabase(
            mock_sb,
            profiles=[jst_user, la_user],
            tz_rows=[
                {"user_id": "user-jst", "timezone": "Asia/Tokyo"},
                {"user_id": "user-la", "timezone": "America/Los_Angeles"},
            ],
        )

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        # JST ユーザーだけ送信される (LA は同じ瞬間に local hour=16 で除外)
        assert result == 1
        mock_send.assert_called_once_with(to_email="jst@example.com", user_name="JST User")

    def test_does_not_send_to_notification_disabled_user(self):
        """DB クエリで notification_enabled=True に絞っているので、無効ユーザーは空リストで届く。"""
        from datetime import datetime, timezone
        from scheduler.weekly_review import send_weekly_reminders

        now_utc = datetime(2026, 5, 11, 0, 0, tzinfo=timezone.utc)
        mock_sb = MagicMock()
        self._wire_supabase(mock_sb, profiles=[], tz_rows=[])

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        assert result == 0
        mock_send.assert_not_called()

    def test_skips_user_without_email(self):
        """JST 月曜 08:00 で時刻/曜日マッチでもメールアドレスが無ければ送信スキップ。"""
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        from scheduler.weekly_review import send_weekly_reminders

        jst_monday_8 = datetime(2026, 5, 11, 8, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
        now_utc = jst_monday_8.astimezone(timezone.utc)

        user_no_email = {
            "id": TEST_USER_ID,
            "display_name": "テストユーザー",
            "notification_email": None,
            "weekly_review_day": 1,
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        self._wire_supabase(
            mock_sb,
            profiles=[user_no_email],
            tz_rows=[{"user_id": TEST_USER_ID, "timezone": "Asia/Tokyo"}],
        )

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        assert result == 0
        mock_send.assert_not_called()

    def test_falls_back_to_default_tz_when_user_context_missing(self):
        """user_context にエントリがないユーザーは DEFAULT_TZ (Asia/Tokyo) で判定される。"""
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        from scheduler.weekly_review import send_weekly_reminders

        # JST 月曜 08:00
        jst_monday_8 = datetime(2026, 5, 11, 8, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
        now_utc = jst_monday_8.astimezone(timezone.utc)

        target_user = {
            "id": TEST_USER_ID,
            "display_name": "Default User",
            "notification_email": "default@example.com",
            "weekly_review_day": 1,
            "notification_enabled": True,
        }

        mock_sb = MagicMock()
        # user_context は空 → DEFAULT_TZ (Asia/Tokyo) フォールバック
        self._wire_supabase(mock_sb, profiles=[target_user], tz_rows=[])

        with patch("scheduler.weekly_review.send_reminder_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            result = asyncio.run(send_weekly_reminders(supabase=mock_sb, now_utc=now_utc))

        assert result == 1
        mock_send.assert_called_once_with(to_email="default@example.com", user_name="Default User")


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
