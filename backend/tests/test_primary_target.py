from unittest.mock import MagicMock, patch

import pytest

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

