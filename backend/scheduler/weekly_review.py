"""
週次レビューリマインダースケジューラー
TASK-0011: APSchedulerスケジューラー + Resendメール通知実装

【設計方針】:
- APScheduler AsyncIOScheduler で毎時 0 分に実行
- 各ユーザーの user_context.timezone に基づいて「今が朝 8 時台」を判定
- 「ユーザー TZ で今日が weekly_review_day」のユーザーにリマインダー送信
- notification_enabled=false のユーザーはスキップ（REQ-802）
- メール送信失敗はログのみ、アプリは継続動作

【Phase 3 (timezone migration) で変更点】:
旧: サーバーローカル時刻 8:00 に 1 回起動し、サーバー TZ で「今日の曜日」と
    weekly_review_day を比較していた。
    → UTC サーバー上で JST ユーザーは日本時間 17:00 にリマインドされたり、
       週次レビュー曜日が 1 日ずれる問題があった。
新: 毎時 0 分に起動し、各ユーザーの user_context.timezone で
    「今が 8 時台」かつ「今日の曜日 == weekly_review_day」のユーザーにだけ送信。
    1 つのユーザー視点では従来通り「1 日 1 回 8 時台にメール」になる。

🔵 信頼性レベル: REQ-701/802・architecture.md APScheduler より
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.user_tz import DEFAULT_TZ
from app.services.email_service import send_reminder_email

logger = logging.getLogger(__name__)

# 朝のリマインダーを送る hour 帯。ユーザー TZ で local.hour == 8 のときだけ送信。
REMINDER_LOCAL_HOUR = 8

# 【グローバルスケジューラーインスタンス】: main.py の lifespan で管理
scheduler = AsyncIOScheduler()


def _resolve_zone(tz_name: str | None) -> ZoneInfo:
    """ユーザーの TZ 文字列を ZoneInfo に。不正値は DEFAULT_TZ にフォールバック。"""
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            pass
    return ZoneInfo(DEFAULT_TZ)


async def send_weekly_reminders(
    supabase=None,
    now_utc: datetime | None = None,
) -> int:
    """
    【週次リマインダー送信ジョブ】: 毎時 0 分に起動、各ユーザーの TZ で 8 時台 +
    今日の曜日 == weekly_review_day のユーザーにメール送信。

    【フィルタ】:
      - DB: notification_enabled=true のみ取得（負荷軽減）
      - 各ユーザー: user_context.timezone (未登録なら DEFAULT_TZ) で local 時刻を計算し、
        local.hour == REMINDER_LOCAL_HOUR かつ local.isoweekday() == weekly_review_day
        のユーザーにだけ送信。

    Args:
        supabase: Supabase クライアント（テスト用に注入可能）
        now_utc: 「現在時刻 (UTC, tz-aware)」をテスト用に注入できる。
                 省略時は datetime.now(ZoneInfo("UTC"))。

    Returns:
        int: 送信成功件数
    """
    from app.core.supabase import get_supabase

    if supabase is None:
        supabase = get_supabase()

    if now_utc is None:
        now_utc = datetime.now(ZoneInfo("UTC"))

    # 【対象候補取得】: 通知有効ユーザー全件 (per-user TZ で曜日/時刻判定するため
    # SQL では絞り込まない)。
    profiles_result = (
        supabase.table("user_profiles")
        .select("id, display_name, notification_email, weekly_review_day, notification_enabled")
        .eq("notification_enabled", True)
        .execute()
    )
    profiles = profiles_result.data or []

    if not profiles:
        logger.info("週次リマインダー: 対象ユーザーなし (notification_enabled=true が 0 件)")
        return 0

    # 【TZ 一括取得】: N+1 を避けるため user_context.timezone を 1 query で読む
    user_ids = [p["id"] for p in profiles if p.get("id")]
    tz_map: dict[str, str] = {}
    if user_ids:
        try:
            ctx_result = (
                supabase.table("user_context")
                .select("user_id, timezone")
                .in_("user_id", user_ids)
                .execute()
            )
            for row in ctx_result.data or []:
                tz = row.get("timezone")
                if tz:
                    tz_map[row["user_id"]] = tz
        except Exception as exc:
            # user_context が取れない場合は全員 DEFAULT_TZ で進める
            logger.warning("週次リマインダー: user_context.timezone 取得失敗、DEFAULT で続行: %s", exc)

    success_count = 0
    matched_count = 0

    for profile in profiles:
        user_id = profile.get("id")
        if not user_id:
            continue

        tz_name = tz_map.get(user_id, DEFAULT_TZ)
        local = now_utc.astimezone(_resolve_zone(tz_name))

        # 【時刻フィルタ】: ユーザー TZ で 8 時台のみ
        if local.hour != REMINDER_LOCAL_HOUR:
            continue
        # 【曜日フィルタ】: ユーザー TZ での今日の曜日 == weekly_review_day
        review_day = profile.get("weekly_review_day")
        if review_day is None or local.isoweekday() != review_day:
            continue

        matched_count += 1

        email = profile.get("notification_email")
        if not email:
            logger.info("メールアドレス未設定のためスキップ: user_id=%s", user_id)
            continue

        # 【メール送信】: 失敗時はログのみ、継続
        sent = await send_reminder_email(
            to_email=email,
            user_name=profile.get("display_name"),
        )
        if sent:
            success_count += 1

    logger.info(
        "週次リマインダー送信完了: 候補=%d人, 該当=%d人, 成功=%d人",
        len(profiles), matched_count, success_count,
    )
    return success_count


def setup_scheduler() -> AsyncIOScheduler:
    """
    【スケジューラー設定】: ジョブを登録して設定済みスケジューラーを返す
    【実行タイミング】: 毎時 0 分 (UTC)。各ユーザーは TZ で 8 時台のときだけ実際に送信される。

    Returns:
        AsyncIOScheduler: 設定済みスケジューラー
    """
    scheduler.add_job(
        send_weekly_reminders,
        CronTrigger(minute=0),
        id="weekly_review_reminder",
        replace_existing=True,
        misfire_grace_time=3600,  # 1時間以内なら遅延実行を許容
    )
    logger.info("週次レビューリマインダースケジューラーを設定しました (毎時 0 分起動 / per-user TZ 判定)")
    return scheduler
