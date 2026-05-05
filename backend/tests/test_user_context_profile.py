"""Phase 6.5.3: user_context.profile (JSONB) の PATCH merge 動作テスト。

既存 profile に対して partial update を投げると、欠落キーは保持され、
渡したキーだけ上書きされること。
"""
from unittest.mock import MagicMock, patch

import pytest


TEST_USER_ID = "00000000-0000-0000-0000-000000000222"


def _wire_supabase_with_existing_profile(mock_sb, existing_profile: dict | None):
    """user_context テーブルの select / upsert を mock。"""
    select_chain = MagicMock()
    select_chain.execute.return_value.data = (
        [{"profile": existing_profile}] if existing_profile is not None else []
    )

    upsert_chain = MagicMock()
    upsert_chain.execute.return_value.data = []

    table_wrapper = MagicMock()
    table_wrapper.select.return_value.eq.return_value = select_chain
    table_wrapper.upsert.return_value = upsert_chain

    mock_sb.table.return_value = table_wrapper
    return table_wrapper, upsert_chain


@pytest.mark.asyncio
async def test_patch_profile_merges_with_existing():
    from app.api.routes import user_context as uc_module

    existing = {"age": 32, "location": "東京"}

    with patch.object(uc_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        wrapper, _upsert = _wire_supabase_with_existing_profile(mock_sb, existing)

        await uc_module.patch_user_context(
            payload={"profile": {"occupation": "PM"}},
            user_id=TEST_USER_ID,
        )

    # upsert に渡された data の profile が merge 結果になっていること
    upsert_calls = wrapper.upsert.call_args_list
    assert len(upsert_calls) == 1
    sent = upsert_calls[0].args[0]
    assert sent["profile"] == {"age": 32, "location": "東京", "occupation": "PM"}


@pytest.mark.asyncio
async def test_patch_profile_overrides_specific_keys():
    """同じキーは上書き、他のキーは保持。"""
    from app.api.routes import user_context as uc_module

    existing = {"age": 32, "location": "東京", "interests": ["読書"]}

    with patch.object(uc_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        wrapper, _upsert = _wire_supabase_with_existing_profile(mock_sb, existing)

        await uc_module.patch_user_context(
            payload={"profile": {"age": 33, "interests": ["筋トレ", "料理"]}},
            user_id=TEST_USER_ID,
        )

    sent = wrapper.upsert.call_args_list[0].args[0]
    assert sent["profile"]["age"] == 33  # 上書き
    assert sent["profile"]["location"] == "東京"  # 保持
    assert sent["profile"]["interests"] == ["筋トレ", "料理"]  # 配列も上書き


@pytest.mark.asyncio
async def test_patch_profile_when_no_existing_row():
    """既存 row がなくても upsert で新規行を作る。"""
    from app.api.routes import user_context as uc_module

    with patch.object(uc_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        wrapper, _upsert = _wire_supabase_with_existing_profile(mock_sb, None)

        await uc_module.patch_user_context(
            payload={"profile": {"age": 30}},
            user_id=TEST_USER_ID,
        )

    sent = wrapper.upsert.call_args_list[0].args[0]
    assert sent["profile"] == {"age": 30}
    assert sent["user_id"] == TEST_USER_ID


@pytest.mark.asyncio
async def test_patch_other_field_does_not_touch_profile():
    """profile を含まない PATCH は profile の merge クエリも走らない。"""
    from app.api.routes import user_context as uc_module

    with patch.object(uc_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        wrapper, _upsert = _wire_supabase_with_existing_profile(mock_sb, {"age": 32})

        await uc_module.patch_user_context(
            payload={"identity": "PM"},
            user_id=TEST_USER_ID,
        )

    sent = wrapper.upsert.call_args_list[0].args[0]
    assert sent["identity"] == "PM"
    assert "profile" not in sent
    # select も呼ばれない（profile 未指定なので merge 不要）
    wrapper.select.assert_not_called()
