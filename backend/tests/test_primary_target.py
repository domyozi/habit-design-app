from datetime import date as date_type, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.routes.primary_target import get_primary_target_history, upsert_primary_target

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_upsert_primary_target_writes_current_and_daily_history():
    current_table = MagicMock()
    current_table.upsert.return_value.execute.return_value.data = [
        {
            "user_id": TEST_USER_ID,
            "value": "提案書を出す",
            "set_date": "2026-05-07",
            "completed": True,
            "completed_at": "2026-05-07T01:00:00+00:00",
        }
    ]
    history_table = MagicMock()
    tables = {
        "primary_targets": current_table,
        "primary_target_days": history_table,
    }
    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda name: tables[name]

    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        result = await upsert_primary_target(
            {"value": "提案書を出す", "set_date": "2026-05-07", "completed": True},
            user_id=TEST_USER_ID,
        )

    assert result["completed"] is True
    current_table.upsert.assert_called_once()
    history_table.upsert.assert_called_once()
    history_payload = history_table.upsert.call_args.args[0]
    assert history_payload["user_id"] == TEST_USER_ID
    assert history_payload["set_date"] == "2026-05-07"
    assert history_payload["value"] == "提案書を出す"
    assert history_payload["completed"] is True
    assert history_payload["completed_at"] is not None


@pytest.mark.asyncio
async def test_get_primary_target_history_filters_by_user_and_range():
    query = MagicMock()
    query.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = [
        {
            "value": "提案書を出す",
            "set_date": "2026-05-07",
            "completed": True,
            "completed_at": "2026-05-07T01:00:00+00:00",
        }
    ]
    mock_sb = MagicMock()
    mock_sb.table.return_value = query

    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        result = await get_primary_target_history(
            from_date="2026-05-01",
            to_date="2026-05-31",
            user_id=TEST_USER_ID,
        )

    mock_sb.table.assert_called_once_with("primary_target_days")
    query.select.return_value.eq.assert_called_once_with("user_id", TEST_USER_ID)
    assert result[0]["set_date"] == "2026-05-07"
    assert result[0]["completed"] is True


@pytest.mark.asyncio
async def test_upsert_rejects_future_pt_when_today_open():
    """今日の PT が completed=false のまま、明日 (今日+1) の PT を upsert しようとしたら 400。"""
    today = date_type.today()
    tomorrow = today + timedelta(days=1)

    # primary_targets の SELECT で今日の未完了 PT を返すモック
    current_table = MagicMock()
    current_table.select.return_value.eq.return_value.execute.return_value.data = [
        {"value": "今日の未完了タスク", "set_date": str(today), "completed": False}
    ]
    tables = {"primary_targets": current_table}
    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda name: tables[name]

    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        with pytest.raises(HTTPException) as exc_info:
            await upsert_primary_target(
                {"value": "明日の新 PT", "set_date": str(tomorrow)},
                user_id=TEST_USER_ID,
            )

    assert exc_info.value.status_code == 400
    assert "今日" in exc_info.value.detail


@pytest.mark.asyncio
async def test_upsert_allows_future_pt_when_today_completed():
    """今日の PT が completed=true なら、明日の PT を upsert できる。"""
    today = date_type.today()
    tomorrow = today + timedelta(days=1)

    current_table = MagicMock()
    # SELECT 用 (gate 判定): 今日の PT が completed=true
    current_table.select.return_value.eq.return_value.execute.return_value.data = [
        {"value": "今日の完了済", "set_date": str(today), "completed": True}
    ]
    # upsert 用
    current_table.upsert.return_value.execute.return_value.data = [
        {
            "user_id": TEST_USER_ID,
            "value": "明日の新 PT",
            "set_date": str(tomorrow),
            "completed": False,
            "completed_at": None,
        }
    ]
    history_table = MagicMock()
    tables = {
        "primary_targets": current_table,
        "primary_target_days": history_table,
    }
    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda name: tables[name]

    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        result = await upsert_primary_target(
            {"value": "明日の新 PT", "set_date": str(tomorrow)},
            user_id=TEST_USER_ID,
        )

    assert result["set_date"] == str(tomorrow)
    current_table.upsert.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_uses_client_today_to_avoid_timezone_mismatch():
    """サーバー (UTC) 今日 = 5/12 で client_today = 5/13 のとき、
    既存 row が set_date=5/12, completed=false でも 5/13 への upsert は通る。

    UTC サーバー上で JST クライアントが朝に PT を更新すると、サーバーの
    date.today() (5/12) と クライアントの今日 (5/13) がずれて gate が
    暴発する問題を防ぐ。
    """
    from unittest.mock import patch as patch_dt

    fake_server_today = date_type(2026, 5, 12)
    client_today = "2026-05-13"

    current_table = MagicMock()
    # SELECT 用: サーバー視点で 5/12 (server today) の未完了 PT
    current_table.select.return_value.eq.return_value.execute.return_value.data = [
        {"value": "前日の未完了", "set_date": "2026-05-12", "completed": False}
    ]
    current_table.upsert.return_value.execute.return_value.data = [
        {
            "user_id": TEST_USER_ID,
            "value": "今日の新 PT",
            "set_date": client_today,
            "completed": False,
            "completed_at": None,
        }
    ]
    history_table = MagicMock()
    tables = {
        "primary_targets": current_table,
        "primary_target_days": history_table,
    }
    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda name: tables[name]

    class _FakeDate(date_type):
        @classmethod
        def today(cls):
            return fake_server_today

    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        with patch_dt("app.api.routes.primary_target.date_type", _FakeDate):
            result = await upsert_primary_target(
                {
                    "value": "今日の新 PT",
                    "set_date": client_today,
                    "client_today": client_today,
                },
                user_id=TEST_USER_ID,
            )

    assert result["set_date"] == client_today
    current_table.upsert.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_rejects_invalid_client_today():
    """client_today が ISO 8601 でない場合 400 を返す。"""
    mock_sb = MagicMock()
    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        with pytest.raises(HTTPException) as exc_info:
            await upsert_primary_target(
                {"value": "x", "set_date": "2026-05-13", "client_today": "not-a-date"},
                user_id=TEST_USER_ID,
            )

    assert exc_info.value.status_code == 400
    assert "client_today" in exc_info.value.detail


@pytest.mark.asyncio
async def test_upsert_allows_past_pt_for_history_correction():
    """過去日 (例: 異常値訂正用) の PT は今日が未完了でも書き込める。"""
    today = date_type.today()
    yesterday = today - timedelta(days=1)

    current_table = MagicMock()
    # past 日付なら gate ロジックを通らないので select は呼ばれない想定だが、
    # 万一呼ばれても影響が出ないようにモックは整えておく。
    current_table.select.return_value.eq.return_value.execute.return_value.data = [
        {"value": "今日の未完了", "set_date": str(today), "completed": False}
    ]
    current_table.upsert.return_value.execute.return_value.data = [
        {
            "user_id": TEST_USER_ID,
            "value": "昨日の修正値",
            "set_date": str(yesterday),
            "completed": True,
            "completed_at": "2026-05-08T01:00:00+00:00",
        }
    ]
    history_table = MagicMock()
    tables = {
        "primary_targets": current_table,
        "primary_target_days": history_table,
    }
    mock_sb = MagicMock()
    mock_sb.table.side_effect = lambda name: tables[name]

    with patch("app.api.routes.primary_target.get_supabase", return_value=mock_sb):
        result = await upsert_primary_target(
            {"value": "昨日の修正値", "set_date": str(yesterday), "completed": True},
            user_id=TEST_USER_ID,
        )

    assert result["set_date"] == str(yesterday)
