"""
claude_logger.py の unit test
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.claude_logger import log_claude_call


def _make_usage(input_t=10, output_t=20, cache_read=0, cache_creation=0):
    """anthropic.types.Usage 互換オブジェクト"""
    return SimpleNamespace(
        input_tokens=input_t,
        output_tokens=output_t,
        cache_read_input_tokens=cache_read,
        cache_creation_input_tokens=cache_creation,
    )


@pytest.mark.asyncio
async def test_log_claude_call_inserts_row():
    """成功 path: 1 row insert される"""
    mock_client = MagicMock()
    insert_mock = MagicMock()
    mock_client.table.return_value.insert.return_value = insert_mock

    with patch("app.core.supabase.get_supabase", return_value=mock_client):
        await log_claude_call(
            user_id="00000000-0000-0000-0000-000000000001",
            feature="coach_stream",
            model="claude-sonnet-4-6",
            streaming=True,
            usage=_make_usage(input_t=1000, output_t=500),
            latency_ms=2300,
            status="ok",
            request_id="msg_abc123",
        )

    mock_client.table.assert_called_with("claude_api_logs")
    inserted_row = mock_client.table.return_value.insert.call_args[0][0]
    assert inserted_row["user_id"] == "00000000-0000-0000-0000-000000000001"
    assert inserted_row["feature"] == "coach_stream"
    assert inserted_row["model"] == "claude-sonnet-4-6"
    assert inserted_row["streaming"] is True
    assert inserted_row["status"] == "ok"
    assert inserted_row["input_tokens"] == 1000
    assert inserted_row["output_tokens"] == 500
    assert inserted_row["latency_ms"] == 2300
    assert inserted_row["request_id"] == "msg_abc123"
    # cost_usd: 1000 * 3 / 1M + 500 * 15 / 1M = 0.003 + 0.0075 = 0.0105
    assert abs(inserted_row["cost_usd"] - 0.0105) < 1e-9
    insert_mock.execute.assert_called_once()


@pytest.mark.asyncio
async def test_log_claude_call_with_no_usage():
    """usage=None でも row は書かれる（status='error' の time line 用）"""
    mock_client = MagicMock()

    with patch("app.core.supabase.get_supabase", return_value=mock_client):
        await log_claude_call(
            user_id="user-1",
            feature="coach_stream",
            model="claude-sonnet-4-6",
            streaming=True,
            usage=None,
            latency_ms=100,
            status="error",
            error_kind="APIError",
        )

    inserted_row = mock_client.table.return_value.insert.call_args[0][0]
    assert inserted_row["input_tokens"] == 0
    assert inserted_row["output_tokens"] == 0
    assert inserted_row["status"] == "error"
    assert inserted_row["error_kind"] == "APIError"
    assert inserted_row["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_log_claude_call_swallows_supabase_failure():
    """Supabase insert で例外 → 呼び出し元には raise しない"""
    mock_client = MagicMock()
    mock_client.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    with patch("app.core.supabase.get_supabase", return_value=mock_client):
        # raise しないことを assert
        await log_claude_call(
            user_id="user-1",
            feature="coach_stream",
            model="claude-sonnet-4-6",
            streaming=False,
            usage=_make_usage(),
            latency_ms=100,
            status="ok",
        )


@pytest.mark.asyncio
async def test_log_claude_call_no_supabase_client():
    """Supabase 未初期化 → no-op で例外なし"""
    with patch("app.core.supabase.get_supabase", side_effect=RuntimeError("not initialized")):
        # raise しない
        await log_claude_call(
            user_id="user-1",
            feature="coach_stream",
            model="claude-sonnet-4-6",
            streaming=False,
            usage=_make_usage(),
            latency_ms=50,
            status="ok",
        )


@pytest.mark.asyncio
async def test_log_claude_call_unknown_status_normalized_to_error():
    """status が不正値 → 'error' に丸める"""
    mock_client = MagicMock()
    with patch("app.core.supabase.get_supabase", return_value=mock_client):
        await log_claude_call(
            user_id="user-1",
            feature="x",
            model="claude-sonnet-4-6",
            streaming=False,
            usage=_make_usage(),
            latency_ms=10,
            status="weird",  # not in VALID_STATUS
        )
    inserted_row = mock_client.table.return_value.insert.call_args[0][0]
    assert inserted_row["status"] == "error"


@pytest.mark.asyncio
async def test_log_claude_call_cancelled_status():
    """status='cancelled' は valid"""
    mock_client = MagicMock()
    with patch("app.core.supabase.get_supabase", return_value=mock_client):
        await log_claude_call(
            user_id="user-1",
            feature="coach_stream",
            model="claude-sonnet-4-6",
            streaming=True,
            usage=_make_usage(input_t=500, output_t=100),
            latency_ms=1500,
            status="cancelled",
        )
    inserted_row = mock_client.table.return_value.insert.call_args[0][0]
    assert inserted_row["status"] == "cancelled"
    # cancelled でも usage は記録
    assert inserted_row["input_tokens"] == 500
    assert inserted_row["output_tokens"] == 100


@pytest.mark.asyncio
async def test_log_claude_call_unknown_model_zero_cost():
    """未知 model → cost=0 だが row は書かれる"""
    mock_client = MagicMock()
    with patch("app.core.supabase.get_supabase", return_value=mock_client):
        await log_claude_call(
            user_id="user-1",
            feature="x",
            model="claude-future-model-99",
            streaming=False,
            usage=_make_usage(input_t=1000, output_t=1000),
            latency_ms=100,
            status="ok",
        )
    inserted_row = mock_client.table.return_value.insert.call_args[0][0]
    assert inserted_row["model"] == "claude-future-model-99"
    assert inserted_row["cost_usd"] == 0.0
