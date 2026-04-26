"""
週次レビューリマインダースケジューラー
TASK-0011: APSchedulerスケジューラー + Resendメール通知実装

【設計方針】:
- APScheduler AsyncIOScheduler で毎日8時に実行
- 本日が weekly_review_day のユーザーにリマインダーを送信
- notification_enabled=false のユーザーはスキップ（REQ-802）
- メール送信失敗はログのみ、アプリは継続動作

🔵 信頼性レベル: REQ-701/802・architecture.md APScheduler より
"""
import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.email_service import send_reminder_email

logger = logging.getLogger(__name__)

# 【グローバルスケジューラーインスタンス】: main.py の lifespan で管理
scheduler = AsyncIOScheduler()


async def send_weekly_reminders(supabase=None) -> int:
    """
    【週次リマインダー送信ジョブ】: 毎日実行、本日が週次レビュー曜日のユーザーにメール送信
    【フィルタ】: weekly_review_day == 今日の曜日 かつ notification_enabled=true（REQ-802）

    Args:
        supabase: Supabase クライアント（テスト用に注入可能）

    Returns:
        int: 送信成功件数
    """
    from app.core.supabase import get_supabase

    if supabase is None:
        supabase = get_supabase()

    # 今日の曜日を取得（1=月〜7=日、ISO weekday）
    today_weekday = date.today().isoweekday()

    # 【対象ユーザー取得】: 本日が weekly_review_day かつ通知有効のユーザー
    result = (
        supabase.table("user_profiles")
        .select("id, display_name, notification_email, weekly_review_day, notification_enabled")
        .eq("weekly_review_day", today_weekday)
        .eq("notification_enabled", True)
        .execute()
    )

    users = result.data or []
    success_count = 0

    for user in users:
        email = user.get("notification_email")
        if not email:
            logger.info("メールアドレス未設定のためスキップ: user_id=%s", user.get("id"))
            continue

        # 【メール送信】: 失敗時はログのみ、継続
        sent = await send_reminder_email(
            to_email=email,
            user_name=user.get("display_name"),
        )
        if sent:
            success_count += 1

    logger.info(
        "週次リマインダー送信完了: weekday=%d, 対象=%d人, 成功=%d人",
        today_weekday, len(users), success_count
    )
    return success_count


def setup_scheduler() -> AsyncIOScheduler:
    """
    【スケジューラー設定】: ジョブを登録して設定済みスケジューラーを返す
    【実行タイミング】: 毎日8:00（サーバーのローカルタイム）

    Returns:
        AsyncIOScheduler: 設定済みスケジューラー
    """
    scheduler.add_job(
        send_weekly_reminders,
        CronTrigger(hour=8, minute=0),
        id="weekly_review_reminder",
        replace_existing=True,
        misfire_grace_time=3600,  # 1時間以内なら遅延実行を許容
    )
    logger.info("週次レビューリマインダースケジューラーを設定しました")
    return scheduler
