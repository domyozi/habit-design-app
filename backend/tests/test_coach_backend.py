"""Phase 6.5: coach Real backend のテスト。

Frontend MockCoachClient と互換 shape を返すこと、coach_pending_actions
の CRUD が正しく動くことを確認する。
"""
from unittest.mock import MagicMock, patch

import pytest


TEST_USER_ID = "00000000-0000-0000-0000-000000000111"


def _wire_supabase_for_context(mock_sb, *, pt=None, habits=None, ctx=None,
                                journals=None, suggestions=None, coach_actions=None,
                                today_logs=None):
    """coach-context が読む 7 テーブルの mock を組む。"""
    pt = pt or []
    habits = habits or []
    ctx = ctx or []
    journals = journals or []
    suggestions = suggestions or []
    coach_actions = coach_actions or []
    today_logs = today_logs or []

    def table(name: str):
        wrapper = MagicMock()
        select = wrapper.select.return_value
        # eq -> limit -> execute  (primary_target / user_context)
        # eq -> order -> order -> limit -> execute (journals)
        # eq -> execute (habits)
        # eq -> eq -> execute (suggestions / habit_logs)
        # eq -> eq -> gte -> order -> execute (coach_pending_actions)
        # 共通の terminal: execute().data
        # MagicMock はデフォルトで any chain を吸収するので、最後の execute だけセットする

        if name == "primary_targets":
            chain = select.eq.return_value.order.return_value.limit.return_value
            chain.execute.return_value.data = pt
        elif name == "habits":
            # eq(user_id).eq(is_active).order(display_order).execute (Sprint 6.6)
            chain = select.eq.return_value.eq.return_value.order.return_value
            chain.execute.return_value.data = habits
        elif name == "user_context":
            chain = select.eq.return_value.limit.return_value
            chain.execute.return_value.data = ctx
        elif name == "journal_entries":
            chain = select.eq.return_value.order.return_value.order.return_value.limit.return_value
            chain.execute.return_value.data = journals
        elif name == "habit_suggestions":
            chain = select.eq.return_value.eq.return_value
            chain.execute.return_value.data = suggestions
        elif name == "coach_pending_actions":
            chain = select.eq.return_value.eq.return_value.gte.return_value.order.return_value
            chain.execute.return_value.data = coach_actions
        elif name == "habit_logs":
            chain = select.eq.return_value.eq.return_value
            chain.execute.return_value.data = today_logs
        return wrapper

    mock_sb.table.side_effect = table


@pytest.mark.asyncio
async def test_coach_context_returns_compatible_shape():
    """空ユーザーでも MockCoachClient と同 shape を返す（FE が壊れない）。"""
    from app.api.routes import coach as coach_module

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_supabase_for_context(mock_sb)

        bundle = await coach_module.get_coach_context(tz="Asia/Tokyo", user_id=TEST_USER_ID)

    # 必須キーが全て存在
    for k in (
        "primary_target", "user_context", "habits", "recent_journals",
        "pending_suggestions", "pending_coach_actions",
        "today_calendar", "signals",
        "today_date", "today_weekday", "local_time", "user_timezone",
        "server_received_at",
    ):
        assert k in bundle, f"missing key: {k}"

    # tz が Asia/Tokyo として反映される
    assert bundle["user_timezone"] == "Asia/Tokyo"
    # YYYY-MM-DD 形式
    assert len(bundle["today_date"]) == 10 and bundle["today_date"][4] == "-"
    # 曜日 1 文字
    assert bundle["today_weekday"] in ("月", "火", "水", "木", "金", "土", "日")
    # 空 user は全配列が []
    assert bundle["habits"] == []
    assert bundle["recent_journals"] == []
    assert bundle["pending_suggestions"] == []
    assert bundle["pending_coach_actions"] == []
    assert bundle["primary_target"] is None
    assert bundle["user_context"] is None


@pytest.mark.asyncio
async def test_coach_context_invalid_tz_falls_back_to_utc():
    """不正な tz は UTC にフォールバック（解析エラーで 500 にしない）。"""
    from app.api.routes import coach as coach_module

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_supabase_for_context(mock_sb)

        bundle = await coach_module.get_coach_context(tz="Not/A_Real_Zone", user_id=TEST_USER_ID)

    assert bundle["user_timezone"] == "UTC"


@pytest.mark.asyncio
async def test_coach_context_adapts_habits_and_journals():
    """habits と journals が FE shape にアダプトされる。"""
    from app.api.routes import coach as coach_module

    habits_raw = [{
        "id": "h1", "title": "朝ラン", "current_streak": 5, "longest_streak": 12,
        "scheduled_time": "06:30", "target_value": 5, "unit": "km",
        "metric_type": "numeric_min",
    }]
    journals_raw = [{
        "id": "j1", "entry_type": "morning_journal",
        "content": "今日は集中するぞ" * 30,  # 200字超で truncate される
        "entry_date": "2026-05-03",
        "created_at": "2026-05-03T08:00:00Z",
    }]

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_supabase_for_context(mock_sb, habits=habits_raw, journals=journals_raw)

        bundle = await coach_module.get_coach_context(tz="UTC", user_id=TEST_USER_ID)

    assert len(bundle["habits"]) == 1
    h = bundle["habits"][0]
    assert h["id"] == "h1"
    assert h["title"] == "朝ラン"
    assert h["current_streak"] == 5
    assert h["scheduled_time"] == "06:30"
    assert h["today_completed"] is False  # log なしなら未完了

    assert len(bundle["recent_journals"]) == 1
    j = bundle["recent_journals"][0]
    assert j["entry_type"] == "morning_journal"
    assert j["content_excerpt"].endswith("…")
    assert len(j["content_excerpt"]) <= 201


@pytest.mark.asyncio
async def test_today_completed_reflects_today_log():
    """Sprint 6.6: 今日の habit_logs が completed=true なら today_completed=true。
    coachCtx.refresh() が toggle 結果を上書きしないことの根拠。"""
    from app.api.routes import coach as coach_module

    habits_raw = [
        {"id": "h1", "title": "朝ラン", "current_streak": 5,
         "scheduled_time": "06:30", "metric_type": "binary"},
        {"id": "h2", "title": "読書", "current_streak": 0,
         "scheduled_time": "21:00", "metric_type": "numeric_min",
         "target_value": 15, "unit": "分"},
    ]
    today_logs = [
        {"habit_id": "h1", "completed": True, "numeric_value": None, "time_value": None},
        # h2 は log なし → today_completed=false 期待
    ]

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_supabase_for_context(mock_sb, habits=habits_raw, today_logs=today_logs)

        bundle = await coach_module.get_coach_context(tz="Asia/Tokyo", user_id=TEST_USER_ID)

    by_id = {h["id"]: h for h in bundle["habits"]}
    assert by_id["h1"]["today_completed"] is True
    assert by_id["h2"]["today_completed"] is False


@pytest.mark.asyncio
async def test_pending_action_patch_validates_status():
    """status が許可外なら 422。"""
    from fastapi import HTTPException
    from app.api.routes import coach as coach_module

    with pytest.raises(HTTPException) as exc:
        await coach_module.update_pending_action(
            action_id="00000000-0000-0000-0000-000000000aaa",
            patch=coach_module.PendingActionPatch(status="weird"),
            user_id=TEST_USER_ID,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_pending_action_create_validates_kind_and_confidence():
    from fastapi import HTTPException
    from app.api.routes import coach as coach_module

    with pytest.raises(HTTPException) as exc:
        await coach_module.create_pending_action(
            body=coach_module.PendingActionCreate(
                kind="bogus", payload={}, confidence=0.7,
            ),
            user_id=TEST_USER_ID,
        )
    assert exc.value.status_code == 422

    with pytest.raises(HTTPException) as exc:
        await coach_module.create_pending_action(
            body=coach_module.PendingActionCreate(
                kind="pt_update", payload={}, confidence=1.5,
            ),
            user_id=TEST_USER_ID,
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_pending_action_full_cycle():
    """create → list → patch(accepted) を mock で通す。"""
    from app.api.routes import coach as coach_module

    inserted_row = {
        "id": "00000000-0000-0000-0000-000000000bbb",
        "user_id": TEST_USER_ID,
        "kind": "pt_update",
        "payload": {"value": "新 PT"},
        "confidence": 0.85,
        "status": "pending",
        "source_journal_id": None,
        "created_at": "2026-05-03T10:00:00Z",
        "resolved_at": None,
    }

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb

        # insert
        ins_chain = MagicMock()
        ins_chain.execute.return_value.data = [inserted_row]
        # update
        upd_chain = MagicMock()
        upd_chain.execute.return_value.data = [{**inserted_row, "status": "accepted"}]
        # select list
        sel_chain = MagicMock()
        sel_chain.execute.return_value.data = [inserted_row]

        def table(name: str):
            w = MagicMock()
            w.insert.return_value = ins_chain
            w.update.return_value.eq.return_value.eq.return_value = upd_chain
            w.select.return_value.eq.return_value.order.return_value.limit.return_value = sel_chain
            return w

        mock_sb.table.side_effect = table

        # 1) create
        created = await coach_module.create_pending_action(
            body=coach_module.PendingActionCreate(
                kind="pt_update", payload={"value": "新 PT"}, confidence=0.85,
            ),
            user_id=TEST_USER_ID,
        )
        assert created["kind"] == "pt_update"

        # 2) list
        listed = await coach_module.list_pending_actions(status=None, user_id=TEST_USER_ID)
        assert len(listed) == 1

        # 3) patch
        patched = await coach_module.update_pending_action(
            action_id=inserted_row["id"],
            patch=coach_module.PendingActionPatch(status="accepted"),
            user_id=TEST_USER_ID,
        )
        assert patched["status"] == "accepted"


# ─── Slice A/B: payload owner check ─────────────────────────────


def _wire_owner_lookup(mock_sb, *, table_name: str, owned: bool):
    """`select(col).eq(col, id).eq("user_id", uid).limit(1).execute().data` を
    owned True/False で返すミニ mock。"""
    def table(name: str):
        wrapper = MagicMock()
        chain = wrapper.select.return_value.eq.return_value.eq.return_value.limit.return_value
        if name == table_name:
            chain.execute.return_value.data = [{"id": "owned-id"}] if owned else []
        else:
            chain.execute.return_value.data = []
        return wrapper

    mock_sb.table.side_effect = table


def test_payload_owner_ok_returns_true_when_owned():
    """Slice A: habit_update の habit_id を持つ habits 行が同 user_id で存在 → ok."""
    from app.api.routes import coach as coach_module

    mock_sb = MagicMock()
    _wire_owner_lookup(mock_sb, table_name="habits", owned=True)
    assert coach_module._payload_owner_ok(
        mock_sb, "habit_update", {"habit_id": "h1"}, TEST_USER_ID
    ) is True


def test_payload_owner_ok_returns_false_when_not_owned():
    """別 user 所有の habit_id を payload に仕込んでも owner check が false を返す。"""
    from app.api.routes import coach as coach_module

    mock_sb = MagicMock()
    _wire_owner_lookup(mock_sb, table_name="habits", owned=False)
    assert coach_module._payload_owner_ok(
        mock_sb, "habit_update", {"habit_id": "victim"}, TEST_USER_ID
    ) is False


def test_payload_owner_ok_skips_unknown_kinds():
    """_PAYLOAD_OWNER_CHECKS に登録されていない kind は素通し（True）。"""
    from app.api.routes import coach as coach_module

    mock_sb = MagicMock()
    # supabase は呼ばれないはず
    assert coach_module._payload_owner_ok(
        mock_sb, "memory_patch", {"identity": "X"}, TEST_USER_ID
    ) is True
    assert coach_module._payload_owner_ok(
        mock_sb, "task", {"label": "X"}, TEST_USER_ID
    ) is True


def test_payload_owner_ok_returns_true_when_id_missing():
    """ID 欠落時はここでは弾かない（下流の apply で弾かれる想定）。"""
    from app.api.routes import coach as coach_module

    mock_sb = MagicMock()
    assert coach_module._payload_owner_ok(
        mock_sb, "habit_update", {}, TEST_USER_ID
    ) is True


@pytest.mark.asyncio
async def test_create_pending_action_rejects_foreign_habit_update():
    """habit_update payload に他人の habit_id を仕込むと 403 で reject される。"""
    from app.api.routes import coach as coach_module
    from fastapi import HTTPException

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        # owner lookup: habits テーブルで該当行が無い (=他人のもの)
        _wire_owner_lookup(mock_sb, table_name="habits", owned=False)

        with pytest.raises(HTTPException) as exc:
            await coach_module.create_pending_action(
                body=coach_module.PendingActionCreate(
                    kind="habit_update",
                    payload={"habit_id": "victim-uuid", "label": "乗っ取り"},
                    confidence=0.9,
                ),
                user_id=TEST_USER_ID,
            )
        assert exc.value.status_code == 403


def test_payload_owner_ok_handles_task_delete():
    """Slice C: task_delete も _PAYLOAD_OWNER_CHECKS で tasks テーブルを引く。"""
    from app.api.routes import coach as coach_module

    mock_sb = MagicMock()
    _wire_owner_lookup(mock_sb, table_name="tasks", owned=True)
    assert coach_module._payload_owner_ok(
        mock_sb, "task_delete", {"task_id": "t1"}, TEST_USER_ID
    ) is True

    mock_sb2 = MagicMock()
    _wire_owner_lookup(mock_sb2, table_name="tasks", owned=False)
    assert coach_module._payload_owner_ok(
        mock_sb2, "task_delete", {"task_id": "victim"}, TEST_USER_ID
    ) is False


@pytest.mark.asyncio
async def test_create_pending_action_rejects_foreign_task_delete():
    """task_delete payload に他人の task_id を仕込むと 403 で reject される。"""
    from app.api.routes import coach as coach_module
    from fastapi import HTTPException

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_owner_lookup(mock_sb, table_name="tasks", owned=False)

        with pytest.raises(HTTPException) as exc:
            await coach_module.create_pending_action(
                body=coach_module.PendingActionCreate(
                    kind="task_delete",
                    payload={"task_id": "victim-uuid"},
                    confidence=0.9,
                ),
                user_id=TEST_USER_ID,
            )
        assert exc.value.status_code == 403


# ─── Slice D: goal / goal_update owner check ───────────────────


def test_payload_owner_ok_handles_goal_update():
    """Slice D: goal_update も _PAYLOAD_OWNER_CHECKS で goals テーブルを引く。"""
    from app.api.routes import coach as coach_module

    mock_sb = MagicMock()
    _wire_owner_lookup(mock_sb, table_name="goals", owned=True)
    assert coach_module._payload_owner_ok(
        mock_sb, "goal_update", {"goal_id": "g1"}, TEST_USER_ID
    ) is True

    mock_sb2 = MagicMock()
    _wire_owner_lookup(mock_sb2, table_name="goals", owned=False)
    assert coach_module._payload_owner_ok(
        mock_sb2, "goal_update", {"goal_id": "victim"}, TEST_USER_ID
    ) is False


@pytest.mark.asyncio
async def test_create_pending_action_rejects_foreign_goal_update():
    """goal_update payload に他人の goal_id を仕込むと 403 で reject される。"""
    from app.api.routes import coach as coach_module
    from fastapi import HTTPException

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        _wire_owner_lookup(mock_sb, table_name="goals", owned=False)

        with pytest.raises(HTTPException) as exc:
            await coach_module.create_pending_action(
                body=coach_module.PendingActionCreate(
                    kind="goal_update",
                    payload={"goal_id": "victim-uuid", "title": "乗っ取り"},
                    confidence=0.9,
                ),
                user_id=TEST_USER_ID,
            )
        assert exc.value.status_code == 403


def test_filter_completed_habit_actions_drops_pt_close_when_already_completed():
    """Bug 1: <primary_target completed=true> な状態の close 提案を弾く。"""
    from app.api.routes import coach as coach_module

    filtered = {
        "primary_target": {"action": "close", "value": "X", "confidence": 0.9},
    }
    ctx_done = {"primary_target": {"completed": True, "set_date": "2026-05-09"}}
    out = coach_module._filter_completed_habit_actions(filtered, ctx_done)
    assert "primary_target" not in out, "完了済 PT の close 提案は drop されるべき"

    # update 提案は弾かない（=close だけが対象）
    filtered_update = {
        "primary_target": {"action": "update", "value": "Y", "confidence": 0.9},
    }
    out2 = coach_module._filter_completed_habit_actions(filtered_update, ctx_done)
    assert out2.get("primary_target", {}).get("action") == "update"

    # PT が completed=false なら close も通す
    ctx_open = {"primary_target": {"completed": False, "set_date": "2026-05-09"}}
    out3 = coach_module._filter_completed_habit_actions(filtered, ctx_open)
    assert out3.get("primary_target", {}).get("action") == "close"


def test_is_meaningless_action_empty_memory_patch():
    """Empty-card fix: 空 memory_patch / current と等価な memory_patch を no-op 判定。"""
    from app.api.routes import coach as coach_module

    # 空 dict → no-op
    assert coach_module._is_meaningless_action(
        "memory_patch", {}, {"user_context": {}}
    ) is True

    # 全フィールド null → no-op
    assert coach_module._is_meaningless_action(
        "memory_patch",
        {"identity": None, "patterns": "", "values_keywords": [], "insights": {}},
        {"user_context": {}},
    ) is True

    # current と完全一致 → no-op
    ctx = {"user_context": {"identity": "PM", "patterns": "朝が生産的"}}
    assert coach_module._is_meaningless_action(
        "memory_patch",
        {"identity": "PM", "patterns": "朝が生産的"},
        ctx,
    ) is True

    # 1 つでも diff があれば valid
    assert coach_module._is_meaningless_action(
        "memory_patch",
        {"identity": "PM", "patterns": "夜のほうが生産的"},  # patterns が違う
        ctx,
    ) is False

    # profile sub-key の diff も検出
    ctx2 = {"user_context": {"profile": {"age": 32}}}
    assert coach_module._is_meaningless_action(
        "memory_patch", {"profile": {"age": 32}}, ctx2
    ) is True
    assert coach_module._is_meaningless_action(
        "memory_patch", {"profile": {"age": 33}}, ctx2
    ) is False


def test_is_meaningless_action_empty_updates():
    """Empty-card fix: *_update で変更フィールドが無いものは no-op 判定。"""
    from app.api.routes import coach as coach_module

    # habit_update with no fields
    assert coach_module._is_meaningless_action(
        "habit_update", {"habit_id": "h1"}, {}
    ) is True
    # habit_update with one field
    assert coach_module._is_meaningless_action(
        "habit_update", {"habit_id": "h1", "label": "新タイトル"}, {}
    ) is False

    # task_update with no fields
    assert coach_module._is_meaningless_action(
        "task_update", {"task_id": "t1"}, {}
    ) is True
    # task_update with due
    assert coach_module._is_meaningless_action(
        "task_update", {"task_id": "t1", "due": "2026-05-15"}, {}
    ) is False

    # goal_update with description
    assert coach_module._is_meaningless_action(
        "goal_update", {"goal_id": "g1", "description": "新しい説明"}, {}
    ) is False


def test_is_meaningless_action_pt_and_task_delete():
    """pt_update / pt_close / task_delete の必須フィールド欠落時 no-op。"""
    from app.api.routes import coach as coach_module

    # pt_update no value
    assert coach_module._is_meaningless_action(
        "pt_update", {"value": ""}, {}
    ) is True
    assert coach_module._is_meaningless_action(
        "pt_update", {"value": "新ターゲット"}, {}
    ) is False

    # task_delete no task_id
    assert coach_module._is_meaningless_action("task_delete", {}, {}) is True
    assert coach_module._is_meaningless_action(
        "task_delete", {"task_id": "t1"}, {}
    ) is False


def test_is_meaningless_action_does_not_filter_normal_kinds():
    """task / habit / goal (新規) や habit_today_complete は対象外で False。"""
    from app.api.routes import coach as coach_module

    assert coach_module._is_meaningless_action(
        "task", {"label": "X"}, {}
    ) is False
    assert coach_module._is_meaningless_action(
        "habit", {"label": "Y"}, {}
    ) is False
    assert coach_module._is_meaningless_action(
        "goal", {"title": "Z"}, {}
    ) is False
    assert coach_module._is_meaningless_action(
        "habit_today_complete", {"habit_id": "h1"}, {}
    ) is False


def test_is_similar_jaccard_dedup():
    """Bug 2: fuzzy 類似度判定。微妙に違う文言を同じ趣旨と検出できる。"""
    from app.api.routes import coach as coach_module

    a = "明日（5/10母の日）実家に帰る予定のため、前日中に確認"
    b = "明日5/10（母の日）実家へ行く予定のため、前日確認"
    assert coach_module._is_similar(a, b), "母の日実家 task は同一趣旨と判定されるべき"

    # 全く違う label なら False
    assert not coach_module._is_similar("プロテインを飲む", "夜の散歩")

    # 空文字ガード
    assert not coach_module._is_similar("", "X")
    assert not coach_module._is_similar("X", "")


@pytest.mark.asyncio
async def test_create_pending_action_rejects_foreign_parent_goal_id():
    """新規 goal の payload に他人の parent_goal_id を仕込むと 403。
    主 entity (新規 goal) は自分のものだが、親リンク先が他人 = 親検証で弾く。"""
    from app.api.routes import coach as coach_module
    from fastapi import HTTPException

    with patch.object(coach_module, "get_supabase") as mock_get_sb:
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        # 新規 goal は kind の owner check は対象外（_PAYLOAD_OWNER_CHECKS に
        # "goal" が無い）。parent 検証だけが効く。goals テーブル lookup を not-owned に。
        _wire_owner_lookup(mock_sb, table_name="goals", owned=False)

        with pytest.raises(HTTPException) as exc:
            await coach_module.create_pending_action(
                body=coach_module.PendingActionCreate(
                    kind="goal",
                    payload={"title": "new", "parent_goal_id": "victim-uuid"},
                    confidence=0.9,
                ),
                user_id=TEST_USER_ID,
            )
        assert exc.value.status_code == 403
