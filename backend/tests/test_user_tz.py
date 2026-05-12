"""user_tz ヘルパのテスト。

- DB から timezone を読んで返すこと / 未登録時に DEFAULT_TZ
- 不正値 (typo, 空文字, None) は DEFAULT_TZ にフォールバック
- get_user_today が ZoneInfo 経由で date を返すこと
- IANA name 検証 (is_valid_iana_tz)
"""
from datetime import date, datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from app.core import user_tz

TEST_USER_ID = "00000000-0000-0000-0000-000000000333"


def _mock_supabase_with_timezone(value):
    """user_context.timezone select を返すモック。value=None なら row なし。"""
    mock_sb = MagicMock()
    table = MagicMock()
    if value is _SENTINEL_NO_ROW:
        table.select.return_value.eq.return_value.execute.return_value.data = []
    else:
        table.select.return_value.eq.return_value.execute.return_value.data = [
            {"timezone": value}
        ]
    mock_sb.table.return_value = table
    return mock_sb


_SENTINEL_NO_ROW = object()


def test_get_user_timezone_returns_value_from_db():
    mock_sb = _mock_supabase_with_timezone("America/Los_Angeles")
    with patch.object(user_tz, "get_supabase", return_value=mock_sb):
        assert user_tz.get_user_timezone(TEST_USER_ID) == "America/Los_Angeles"


def test_get_user_timezone_falls_back_when_row_missing():
    mock_sb = _mock_supabase_with_timezone(_SENTINEL_NO_ROW)
    with patch.object(user_tz, "get_supabase", return_value=mock_sb):
        assert user_tz.get_user_timezone(TEST_USER_ID) == user_tz.DEFAULT_TZ


def test_get_user_timezone_falls_back_when_value_null():
    mock_sb = _mock_supabase_with_timezone(None)
    with patch.object(user_tz, "get_supabase", return_value=mock_sb):
        assert user_tz.get_user_timezone(TEST_USER_ID) == user_tz.DEFAULT_TZ


def test_get_user_timezone_falls_back_on_invalid_value():
    """DB に不正な timezone 文字列が紛れ込んでも落とさず DEFAULT_TZ に倒す。"""
    mock_sb = _mock_supabase_with_timezone("Not/A_Real_Zone")
    with patch.object(user_tz, "get_supabase", return_value=mock_sb):
        assert user_tz.get_user_timezone(TEST_USER_ID) == user_tz.DEFAULT_TZ


def test_get_user_today_returns_local_date():
    """ZoneInfo("Asia/Tokyo") の today と一致すること。"""
    mock_sb = _mock_supabase_with_timezone("Asia/Tokyo")
    with patch.object(user_tz, "get_supabase", return_value=mock_sb):
        today = user_tz.get_user_today(TEST_USER_ID)
    expected = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    assert isinstance(today, date)
    # テスト実行中に日付変更を跨ぐ瞬間は ±1 日になりうるが現実的に同一日。
    assert today == expected


def test_get_user_today_uses_user_tz_not_server_tz():
    """JST と LA で日付がずれる時刻帯では結果が異なるはず。

    ZoneInfo の挙動を信頼するので、ここではモック越しに 2 つの TZ を順に
    渡して date() が ZoneInfo("Asia/Tokyo") と ZoneInfo("America/Los_Angeles")
    の現在時刻から計算されることだけ確認する。
    """
    for tz_name in ["Asia/Tokyo", "America/Los_Angeles", "Europe/London"]:
        mock_sb = _mock_supabase_with_timezone(tz_name)
        with patch.object(user_tz, "get_supabase", return_value=mock_sb):
            today = user_tz.get_user_today(TEST_USER_ID)
        expected = datetime.now(ZoneInfo(tz_name)).date()
        assert today == expected, f"{tz_name}: {today} != {expected}"


def test_is_valid_iana_tz():
    assert user_tz.is_valid_iana_tz("Asia/Tokyo")
    assert user_tz.is_valid_iana_tz("UTC")
    assert user_tz.is_valid_iana_tz("America/Los_Angeles")
    assert not user_tz.is_valid_iana_tz("")
    assert not user_tz.is_valid_iana_tz("JST")  # 旧 3 文字略号は ZoneInfo 不可
    assert not user_tz.is_valid_iana_tz("Not/A_Real_Zone")
    assert not user_tz.is_valid_iana_tz(None)  # type: ignore[arg-type]
