from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.routes.goals import _ensure_owned_wanna_be as ensure_goal_wanna_be
from app.api.routes.habits import _ensure_owned_goal
from app.api.routes.mandala import _ensure_owned_wanna_be as ensure_mandala_wanna_be


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


def test_create_habit_rejects_unknown_or_other_user_goal_id():
    supabase = MagicMock()
    (
        supabase.table.return_value.select.return_value
        .eq.return_value.eq.return_value.eq.return_value
        .single.return_value.execute.return_value.data
    ) = None

    with pytest.raises(HTTPException) as exc:
        _ensure_owned_goal(supabase, "other-goal-id", TEST_USER_ID)

    assert exc.value.status_code == 422


def test_save_goals_rejects_unknown_or_other_user_wanna_be_id():
    supabase = MagicMock()
    (
        supabase.table.return_value.select.return_value
        .eq.return_value.eq.return_value
        .single.return_value.execute.return_value.data
    ) = None

    with pytest.raises(HTTPException) as exc:
        ensure_goal_wanna_be(supabase, "other-wanna-be-id", TEST_USER_ID)

    assert exc.value.status_code == 422


def test_save_mandala_rejects_unknown_or_other_user_wanna_be_id():
    supabase = MagicMock()
    (
        supabase.table.return_value.select.return_value
        .eq.return_value.eq.return_value
        .single.return_value.execute.return_value.data
    ) = None

    with pytest.raises(HTTPException) as exc:
        ensure_mandala_wanna_be(supabase, "other-wanna-be-id", TEST_USER_ID)

    assert exc.value.status_code == 422
