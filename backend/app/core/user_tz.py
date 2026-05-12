"""
ユーザーのタイムゾーンに基づく「今日」計算のヘルパ。

ベースとなる考え方:
  - DB に保存する timestamp はすべて UTC (timestamptz)
  - 「ユーザーから見た今日」が必要な箇所では user_context.timezone (IANA name)
    を read してその TZ で date() を取る
  - サーバーのローカル時刻 (date.today()) は使わない

未設定 / 不正値の場合は DEFAULT_TZ ("Asia/Tokyo") にフォールバックする。
将来 multi-region 化するときに DEFAULT_TZ を "UTC" に倒すか議論する。
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.supabase import get_supabase

DEFAULT_TZ = "Asia/Tokyo"


def _resolve_zoneinfo(tz: str | None) -> ZoneInfo:
    """文字列 IANA name → ZoneInfo。失敗時は DEFAULT_TZ にフォールバック。"""
    if tz:
        try:
            return ZoneInfo(tz)
        except ZoneInfoNotFoundError:
            pass
    return ZoneInfo(DEFAULT_TZ)


def get_user_timezone(user_id: str) -> str:
    """user_context.timezone を取得。未登録 / NULL なら DEFAULT_TZ。

    DB から取った値が ZoneInfo で resolve できない不正値なら DEFAULT_TZ。
    Supabase 未初期化など DB 取得自体が失敗した場合も DEFAULT_TZ。
    (TZ ヘルパは「ユーザーの今日」を返すだけの read-only ロジックなので、
    DB 障害で全 endpoint を落とさず DEFAULT_TZ で fail-open する。)
    呼び出し側ではこの返り値をそのままログに出して良い。
    """
    try:
        supabase = get_supabase()
        result = (
            supabase.table("user_context")
            .select("timezone")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception:
        return DEFAULT_TZ
    if not result.data:
        return DEFAULT_TZ
    raw = result.data[0].get("timezone")
    if not raw:
        return DEFAULT_TZ
    # 妥当性チェック (不正値が DB に紛れ込んでいても落とさない)
    try:
        ZoneInfo(raw)
    except ZoneInfoNotFoundError:
        return DEFAULT_TZ
    return raw


def get_user_today(user_id: str) -> date:
    """ユーザーの TZ における「今日」を返す。

    Phase 2 で全 endpoint の date.today() をこれに置換する。
    """
    tz = get_user_timezone(user_id)
    return datetime.now(_resolve_zoneinfo(tz)).date()


def get_user_now(user_id: str) -> datetime:
    """ユーザーの TZ における「現在」を tz-aware datetime で返す。"""
    tz = get_user_timezone(user_id)
    return datetime.now(_resolve_zoneinfo(tz))


def is_valid_iana_tz(tz: str) -> bool:
    """PATCH /user-context の入力検証用。"""
    if not isinstance(tz, str) or not tz:
        return False
    try:
        ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        return False
    return True
