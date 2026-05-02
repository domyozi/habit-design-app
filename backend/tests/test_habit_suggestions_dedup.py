"""
habit_suggestions の dedup 動作テスト

- rejected の label が avoid_list に含まれて Claude に渡ること
- Claude が同じ label を返しても existing_lower で弾かれて INSERT 0 件になること
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


def _make_suggestion(label: str, status: str = "rejected"):
    return {"label": label, "status": status}


def _wire_supabase(mock_sb, existing_suggestions):
    """既存の habit_suggestions と todo_definitions のクエリチェーンを mock する。
    返り値: (suggestions_chain, insert_chain, suggestions_wrapper)
    suggestions_wrapper は habit_suggestions テーブルの mock 本体で、
    .insert.call_args_list 等から呼び出し履歴を確認できる。
    """
    todo_chain = MagicMock()
    todo_chain.execute.return_value.data = []

    suggestions_chain = MagicMock()
    suggestions_chain.execute.return_value.data = existing_suggestions

    insert_chain = MagicMock()
    insert_chain.execute.return_value.data = []

    todo_wrapper = MagicMock()
    todo_wrapper.select.return_value.eq.return_value = todo_chain

    suggestions_wrapper = MagicMock()
    suggestions_wrapper.select.return_value.eq.return_value.in_.return_value = suggestions_chain
    suggestions_wrapper.insert.return_value = insert_chain

    def table_side_effect(name):
        if name == "todo_definitions":
            return todo_wrapper
        if name == "habit_suggestions":
            return suggestions_wrapper
        return MagicMock()

    mock_sb.table.side_effect = table_side_effect
    return suggestions_chain, insert_chain, suggestions_wrapper


@pytest.mark.asyncio
async def test_rejected_labels_are_passed_to_avoid_list():
    """rejected の label が avoid_list (Claude プロンプト) に含まれて渡る"""
    from app.api.routes.habit_suggestions import _extract_and_persist_suggestions

    rejected_label = "夜更かしを記録する"
    existing = [_make_suggestion(rejected_label, status="rejected")]

    captured = {"avoid_labels": None}

    async def fake_ask(*, journal_text, avoid_labels, max_count, existing_habit_count):
        captured["avoid_labels"] = list(avoid_labels)
        return []

    with patch("app.api.routes.habit_suggestions.get_supabase") as mock_get_sb, \
         patch(
             "app.api.routes.habit_suggestions._ask_claude_for_suggestions",
             new=AsyncMock(side_effect=fake_ask),
         ):
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_supabase(mock_sb, existing)[0]  # suggestions_chain unused

        await _extract_and_persist_suggestions(
            user_id=TEST_USER_ID,
            journal_text="今日も夜更かしした",
            source="morning_journal",
            source_date="2026-05-02",
        )

    assert rejected_label in (captured["avoid_labels"] or [])


@pytest.mark.asyncio
async def test_rejected_label_is_not_reinserted_even_if_ai_returns_it():
    """Claude が rejected と同じ label を返しても exact-match dedup で INSERT されない"""
    from app.api.routes.habit_suggestions import _extract_and_persist_suggestions

    rejected_label = "夜更かしを記録する"
    existing = [_make_suggestion(rejected_label, status="rejected")]

    async def fake_ask(*, journal_text, avoid_labels, max_count, existing_habit_count):
        # Claude が avoid を破って同じ label を返してきたケース
        return [(rejected_label, "habit")]

    with patch("app.api.routes.habit_suggestions.get_supabase") as mock_get_sb, \
         patch(
             "app.api.routes.habit_suggestions._ask_claude_for_suggestions",
             new=AsyncMock(side_effect=fake_ask),
         ):
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _, insert_chain, _suggestions_wrapper = _wire_supabase(mock_sb, existing)

        result = await _extract_and_persist_suggestions(
            user_id=TEST_USER_ID,
            journal_text="今日も夜更かしした",
            source="morning_journal",
            source_date="2026-05-02",
        )

    assert result == []
    # insert そのものが呼ばれない（rows_to_insert が空のため早期 return）
    insert_chain.execute.assert_not_called()


@pytest.mark.asyncio
async def test_new_label_still_inserted_when_avoid_contains_rejected():
    """rejected が avoid に含まれていても、別の新しい label は問題なく INSERT される"""
    from app.api.routes.habit_suggestions import _extract_and_persist_suggestions

    existing = [_make_suggestion("古いラベル", status="rejected")]
    new_label = "朝の散歩を続ける"

    async def fake_ask(*, journal_text, avoid_labels, max_count, existing_habit_count):
        return [(new_label, "habit")]

    with patch("app.api.routes.habit_suggestions.get_supabase") as mock_get_sb, \
         patch(
             "app.api.routes.habit_suggestions._ask_claude_for_suggestions",
             new=AsyncMock(side_effect=fake_ask),
         ):
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _, _insert_chain, suggestions_wrapper = _wire_supabase(mock_sb, existing)

        await _extract_and_persist_suggestions(
            user_id=TEST_USER_ID,
            journal_text="今日は朝散歩した",
            source="morning_journal",
            source_date="2026-05-02",
        )

    # habit_suggestions テーブルに対して insert が 1 回呼ばれ、new_label が含まれること
    insert_calls = suggestions_wrapper.insert.call_args_list
    assert len(insert_calls) == 1
    rows_arg = insert_calls[0].args[0]
    assert isinstance(rows_arg, list)
    assert any(r["label"] == new_label for r in rows_arg)
