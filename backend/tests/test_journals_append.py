"""journal_entries の append-only 動作テスト。

v3 で Flow が会話ログとして機能するよう、`POST /api/journals` は
同日同 entry_type でも常に新しい row を INSERT する。バックグラウンド
抽出は同 user/kind で 30s デバウンスする。
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


TEST_USER_ID = "00000000-0000-0000-0000-000000000999"


def _wire_insert_only_supabase(mock_sb):
    """journal_entries の insert が呼ばれた回数を見られる mock を組む。"""
    insert_chain = MagicMock()
    insert_chain.execute.return_value.data = [{"id": "stub", "user_id": TEST_USER_ID}]

    table_wrapper = MagicMock()
    table_wrapper.insert.return_value = insert_chain

    mock_sb.table.return_value = table_wrapper
    return table_wrapper, insert_chain


@pytest.mark.asyncio
async def test_append_only_inserts_two_rows_for_same_day_same_type():
    """同日同 entry_type で 2 回 POST → insert が 2 回呼ばれること（upsert ではない）。"""
    from app.api.routes import journal as journal_module

    bg = MagicMock()

    with patch.object(journal_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        wrapper, _insert_chain = _wire_insert_only_supabase(mock_sb)

        await journal_module.upsert_journal(
            payload={
                "entry_type": "morning_journal",
                "content": "朝のひとつめ",
                "entry_date": "2026-05-03",
            },
            background_tasks=bg,
            user_id=TEST_USER_ID,
        )
        await journal_module.upsert_journal(
            payload={
                "entry_type": "morning_journal",
                "content": "朝のふたつめ",
                "entry_date": "2026-05-03",
            },
            background_tasks=bg,
            user_id=TEST_USER_ID,
        )

    # insert が 2 回呼ばれている = append-only 動作
    insert_calls = wrapper.insert.call_args_list
    assert len(insert_calls) == 2
    # それぞれ違う row（content も id も独立）
    rows = [c.args[0] for c in insert_calls]
    assert rows[0]["content"] == "朝のひとつめ"
    assert rows[1]["content"] == "朝のふたつめ"
    assert rows[0]["id"] != rows[1]["id"]


@pytest.mark.asyncio
async def test_extraction_is_debounced_within_window():
    """30 秒以内の連投で memory/suggestion 抽出 task は 1 回ずつしか登録されない。"""
    from app.api.routes import journal as journal_module

    # デバウンス state を毎回リセット
    journal_module._last_extraction_at.clear()

    bg = MagicMock()

    with patch.object(journal_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_insert_only_supabase(mock_sb)

        # 同 user で 3 連投
        for content in ("一つ目", "二つ目", "三つ目"):
            await journal_module.upsert_journal(
                payload={
                    "entry_type": "morning_journal",
                    "content": content,
                    "entry_date": "2026-05-03",
                },
                background_tasks=bg,
                user_id=TEST_USER_ID,
            )

    # add_task は memory + suggestion の 2 種類で各 1 回ずつ = 計 2 回のみ
    assert bg.add_task.call_count == 2


@pytest.mark.asyncio
async def test_coach_action_log_entry_type_is_accepted():
    """coach_action_log は ALLOWED_ENTRY_TYPES に入っていて 201 で row が作られる。

    Sprint 7.4.7 で導入した「coach の判断履歴」を journal_entries に
    append する経路。backend がこの entry_type を弾くと FE 側の
    logCoachAction が silent に失敗するため、テストで保証する。
    """
    from app.api.routes import journal as journal_module

    journal_module._last_extraction_at.clear()
    bg = MagicMock()

    with patch.object(journal_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        wrapper, _insert_chain = _wire_insert_only_supabase(mock_sb)

        result = await journal_module.upsert_journal(
            payload={
                "entry_type": "coach_action_log",
                "content": "✓ ADOPTED · 新タスク · オーダースーツ候補店の納期を調べる",
                "entry_date": "2026-05-03",
            },
            background_tasks=bg,
            user_id=TEST_USER_ID,
        )

    # insert が呼ばれていること（422 等で弾かれていない）
    insert_calls = wrapper.insert.call_args_list
    assert len(insert_calls) == 1
    inserted = insert_calls[0].args[0]
    assert inserted["entry_type"] == "coach_action_log"
    assert "ADOPTED" in inserted["content"]
    # 抽出系 (memory / suggestion) は coach_action_log では起動しない
    bg.add_task.assert_not_called()
    # row が返る
    assert result is not None


@pytest.mark.asyncio
async def test_extraction_not_triggered_for_excluded_entry_types():
    """checklist / kpi_update / user_context_snapshot / evening_feedback は抽出対象外。"""
    from app.api.routes import journal as journal_module

    journal_module._last_extraction_at.clear()
    bg = MagicMock()

    with patch.object(journal_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_insert_only_supabase(mock_sb)

        await journal_module.upsert_journal(
            payload={
                "entry_type": "evening_feedback",
                "content": "AI からの応答テキスト",
                "entry_date": "2026-05-03",
            },
            background_tasks=bg,
            user_id=TEST_USER_ID,
        )

    bg.add_task.assert_not_called()
