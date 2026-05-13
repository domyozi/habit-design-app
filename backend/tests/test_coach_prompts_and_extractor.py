"""Phase 6.5: build_coach_prompt と coach_extractor の単体テスト。

Frontend coachPrompts.test.ts に相当する範囲をカバー。
"""
import pytest

from app.services.coach_prompts import build_coach_prompt
from app.services.coach_extractor import (
    extract_json_block,
    filter_by_confidence,
    filter_by_user_input,
    strip_json_block,
    to_pending_action_rows,
)


def _base_ctx() -> dict:
    return {
        "primary_target": {
            "value": "提案書を仕上げる",
            "set_date": "2026-05-01",
            "completed": False,
        },
        "user_context": {
            "identity": "PMとして組織で動く",
            "patterns": "朝が最も生産的",
            "values_keywords": ["誠実", "実行力"],
            "insights": {"time_use": "夜は疲れて鈍る"},
            "goal_summary": "習慣で人生を再設計",
        },
        "habits": [{
            "id": "h1", "title": "朝ラン", "current_streak": 5,
            "scheduled_time": "06:30", "today_completed": False,
            "target_value": 5, "unit": "km", "metric_type": "numeric_min",
        }],
        "recent_journals": [{
            "entry_type": "morning_journal",
            "content_excerpt": "集中できなかった",
            "entry_date": "2026-05-02",
            "created_at": "2026-05-02T08:00:00Z",
        }],
        "pending_suggestions": [
            {"id": "s1", "label": "議事録を共有", "kind": "task", "source": "evening"},
        ],
        "pending_coach_actions": [],
        "today_calendar": {"items": [], "available": False},
        "signals": {"habit_streak_alerts": []},
        "today_date": "2026-05-03",
        "today_weekday": "日",
        "local_time": "17:18",
        "user_timezone": "Asia/Tokyo",
        "server_received_at": 0,
    }


# ─── build_coach_prompt ────────────────────────────────────


def test_build_coach_prompt_embeds_sections():
    system, user = build_coach_prompt(_base_ctx(), "DECLARE", "今日は集中する")
    assert "<user_memory>" in system
    assert "PMとして組織で動く" in system
    assert '<primary_target completed="false"' in system
    assert "提案書を仕上げる" in system
    assert 'id=h1 title="朝ラン"' in system
    assert "<output_contract>" in system
    assert "モード: DECLARE" in user
    assert "<user_input>" in user
    assert "今日は集中する" in user


def test_build_coach_prompt_briefing_has_no_user_input():
    _, user = build_coach_prompt(_base_ctx(), "BRIEFING", "")
    assert "BRIEFING" in user
    assert "<user_input>" not in user


def test_build_coach_prompt_today_calendar_section():
    system, _ = build_coach_prompt(_base_ctx(), "DECLARE", "x")
    assert '<today date="2026-05-03"' in system
    assert "Asia/Tokyo" in system
    assert 'local_time="17:18"' in system
    # JS-order weekday と一致するか
    assert "2026-05-03 (5/3, 日曜) — 今日" in system
    assert "2026-05-04 (5/4, 月曜) — 明日" in system
    assert "2026-05-05 (5/5, 火曜) — 明後日" in system
    assert "2026-05-09 (5/9, 土曜) — 6日後" in system


def test_build_coach_prompt_handles_missing_pt():
    ctx = _base_ctx()
    ctx["primary_target"] = None
    system, _ = build_coach_prompt(ctx, "REFLECT", "a")
    assert "<primary_target>未設定</primary_target>" in system


def test_build_coach_prompt_pending_coach_actions_section():
    ctx = _base_ctx()
    ctx["pending_coach_actions"] = [{
        "id": "cpa-1", "user_id": "me", "kind": "pt_update",
        "payload": {"value": "提案書"}, "confidence": 0.8, "status": "pending",
        "created_at": "2026-05-03T08:00:00Z", "resolved_at": None,
    }]
    system, _ = build_coach_prompt(ctx, "DECLARE", "x")
    assert "既にユーザーへ提示済の提案" in system
    assert "kind=pt_update" in system
    assert 'value="提案書"' in system


def test_build_coach_prompt_omits_pending_when_resolved():
    ctx = _base_ctx()
    ctx["pending_coach_actions"] = [{
        "id": "cpa-2", "user_id": "me", "kind": "pt_update",
        "payload": {"value": "old"}, "confidence": 0.7, "status": "accepted",
        "created_at": "2026-05-03T08:00:00Z", "resolved_at": "2026-05-03T08:30:00Z",
    }]
    system, _ = build_coach_prompt(ctx, "DECLARE", "x")
    assert "既にユーザーへ提示済の提案" not in system


def test_build_coach_prompt_contract_is_recommendation_not_mandatory():
    system, _ = build_coach_prompt(_base_ctx(), "DECLARE", "x")
    assert "強制ではない" in system
    assert "推奨" in system
    assert "再度出さない" in system


def test_build_coach_prompt_forbids_internal_terms_in_user_text():
    """Sprint 6.5.3-fix2: 一般ユーザー向けテキストに JSON / schema / フィールド名を出さない。"""
    system, _ = build_coach_prompt(_base_ctx(), "DECLARE", "x")
    assert "内部用語を使わない" in system
    assert "下の JSON で確認させてください" in system  # NG 例
    assert "下のカードで確認してください" in system    # OK 例


def test_build_coach_prompt_requires_json_when_text_mentions_memory_update():
    """Sprint 6.5.3-fix2: テキストで更新意思を表明したら必ず JSON でも emit。"""
    system, _ = build_coach_prompt(_base_ctx(), "DECLARE", "x")
    assert "メモリ更新したい" in system
    assert "テキストで言及して JSON を省くのは矛盾" in system


def test_build_coach_prompt_embeds_profile():
    """profile (JSONB) が <user_memory> に 1 行で埋め込まれる。"""
    ctx = _base_ctx()
    ctx["user_context"]["profile"] = {
        "age": 32,
        "location": "東京",
        "occupation": "PM",
        "family": "妻と娘",
        "interests": ["読書", "ランニング"],
        "constraints": [],  # 空配列は省かれる
        "gender": None,     # null も省かれる
    }
    system, _ = build_coach_prompt(ctx, "DECLARE", "x")
    assert "profile: " in system
    assert "age=32" in system
    assert "location=東京" in system
    assert "occupation=PM" in system
    assert "family=妻と娘" in system
    assert "interests=[読書, ランニング]" in system
    # 空 / null は省かれる
    assert "constraints=" not in system
    assert "gender=" not in system


def test_build_coach_prompt_omits_profile_when_empty():
    """profile が None / 空 dict のときは <user_memory> 内に profile 行が出ない。
    OUTPUT_CONTRACT 内には "profile:" の説明文字列が常時あるので、
    user_memory セクション内に限定して検査する。"""
    import re

    def _user_memory(system: str) -> str:
        m = re.search(r"<user_memory>(.*?)</user_memory>", system, re.DOTALL)
        return m.group(1) if m else ""

    ctx = _base_ctx()
    ctx["user_context"]["profile"] = None
    system, _ = build_coach_prompt(ctx, "DECLARE", "x")
    assert "profile:" not in _user_memory(system)

    ctx["user_context"]["profile"] = {}
    system2, _ = build_coach_prompt(ctx, "DECLARE", "x")
    assert "profile:" not in _user_memory(system2)


def test_build_coach_prompt_profile_preserves_order():
    """profile のキーは age → gender → location → ... の固定順で並ぶ。"""
    from app.services.coach_prompts import _PROFILE_KEY_ORDER, _format_profile
    p = {
        "constraints": ["a"],
        "interests": ["b"],
        "age": 30,
        "location": "X",
        "occupation": "Y",
    }
    line = _format_profile(p)
    # age が constraints / interests より先に出る
    assert line.index("age=") < line.index("interests=")
    assert line.index("age=") < line.index("constraints=")
    assert line.index("location=") < line.index("occupation=")


# ─── coach_extractor ────────────────────────────────────


def test_extract_json_block_with_fence():
    text = '応答テキストです\n\n```json\n{"primary_target": {"action": "close", "value": "X", "reason": "done", "confidence": 0.9}}\n```'
    parsed = extract_json_block(text)
    assert parsed is not None
    assert parsed["primary_target"]["action"] == "close"


def test_extract_json_block_invalid_returns_none():
    assert extract_json_block("just plain text") is None
    assert extract_json_block("") is None
    assert extract_json_block("```json\n{not json\n```") is None


def test_strip_json_block():
    text = "応答テキスト\n\n```json\n{...}\n```"
    assert strip_json_block(text) == "応答テキスト"
    # fence なしは元のまま
    assert strip_json_block("plain") == "plain"


def test_filter_by_confidence_drops_low():
    # Sprint coach-eval-guard: threshold は 0.5 → 0.65 に引き上げた。
    # 境界を確実にカバーするように 0.65 未満 / 以上の 2 値で確認する。
    payload = {
        "primary_target": {"action": "close", "value": "X", "confidence": 0.4},  # 落とす
        "tasks": [
            {"label": "高", "due": None, "confidence": 0.7, "reason": "r"},
            {"label": "低", "due": None, "confidence": 0.3, "reason": "r"},
            {"label": "ボーダー直下", "due": None, "confidence": 0.6, "reason": "r"},
        ],
        "habits": [{"label": "朝散歩", "frequency": "daily", "confidence": 0.75}],
        "habit_today_completes": [],  # 空配列は省く
        "memory_patch": {"identity": "X"},
        "followup_question": "?",
    }
    out = filter_by_confidence(payload)
    assert "primary_target" not in out  # 0.4 < 0.65 で drop
    assert len(out["tasks"]) == 1  # 0.3 と 0.6 が drop、0.7 だけ残る
    assert out["tasks"][0]["label"] == "高"
    assert "habits" in out  # 0.75 で通る
    assert "habit_today_completes" not in out
    assert out["memory_patch"] == {"identity": "X"}
    assert out["followup_question"] == "?"


def test_to_pending_action_rows():
    filtered = {
        "primary_target": {
            "action": "close", "value": "X", "reason": "done", "confidence": 0.9,
        },
        "habit_today_completes": [
            {"habit_id": "h1", "confidence": 0.8, "evidence": "e"},
            {"habit_id": "h2", "confidence": 0.7, "evidence": "e2"},
        ],
        "memory_patch": {"identity": "PM"},
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 4  # pt_close + 2 habit_today + memory_patch
    kinds = [r["kind"] for r in rows]
    assert kinds.count("pt_close") == 1
    assert kinds.count("habit_today_complete") == 2
    assert kinds.count("memory_patch") == 1
    # confidence が float に揃う
    for r in rows:
        assert isinstance(r["confidence"], float)


def test_to_pending_action_rows_pt_update():
    filtered = {
        "primary_target": {
            "action": "update", "value": "新", "reason": "next",
            "confidence": 0.7,
        },
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "pt_update"


# ─── Slice B: habit_update / task_update ────────────────────────


def test_filter_by_confidence_keeps_habit_and_task_updates():
    """Slice B で追加した habit_updates / task_updates も confidence で
    フィルタリングされ、threshold 以上は残ることを確認。"""
    payload = {
        "habit_updates": [
            {"habit_id": "h1", "label": "新", "confidence": 0.7},
            {"habit_id": "h2", "label": "低", "confidence": 0.3},  # drop
        ],
        "task_updates": [
            {"task_id": "t1", "due": "2026-05-15", "confidence": 0.7},  # threshold up: 0.6 → 0.7
        ],
    }
    out = filter_by_confidence(payload)
    assert "habit_updates" in out
    assert len(out["habit_updates"]) == 1
    assert out["habit_updates"][0]["habit_id"] == "h1"
    assert "task_updates" in out
    assert len(out["task_updates"]) == 1


def test_to_pending_action_rows_habit_update_emits_kind():
    """habit_updates → kind=habit_update に変換される。habit_id 必須。"""
    filtered = {
        "habit_updates": [
            {"habit_id": "h1", "target_time": "05:00", "confidence": 0.85, "reason": "r"},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "habit_update"
    assert rows[0]["payload"]["habit_id"] == "h1"
    assert rows[0]["payload"]["target_time"] == "05:00"
    assert isinstance(rows[0]["confidence"], float)


def test_to_pending_action_rows_task_update_emits_kind():
    filtered = {
        "task_updates": [
            {"task_id": "t1", "due": "2026-05-20", "confidence": 0.7, "reason": "r"},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "task_update"
    assert rows[0]["payload"]["task_id"] == "t1"


def test_to_pending_action_rows_drops_update_without_target_id():
    """habit_id / task_id 欠落の update は drop される（apply 不能で危険なため）。"""
    filtered = {
        "habit_updates": [
            {"label": "新", "confidence": 0.9},  # habit_id 無し → drop
        ],
        "task_updates": [
            {"label": "新", "confidence": 0.9},  # task_id 無し → drop
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert rows == []


# ─── Slice C: task_delete ────────────────────────────────────────


def test_filter_by_confidence_keeps_task_deletes():
    """Slice C で追加した task_deletes も confidence でフィルタリングされる。"""
    payload = {
        "task_deletes": [
            {"task_id": "t1", "confidence": 0.8, "reason": "cancel"},
            {"task_id": "t2", "confidence": 0.4, "reason": "low"},  # drop
        ],
    }
    out = filter_by_confidence(payload)
    assert "task_deletes" in out
    assert len(out["task_deletes"]) == 1
    assert out["task_deletes"][0]["task_id"] == "t1"


def test_to_pending_action_rows_task_delete_emits_kind():
    filtered = {
        "task_deletes": [
            {"task_id": "t1", "confidence": 0.8, "reason": "ユーザー発話: キャンセル"},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "task_delete"
    assert rows[0]["payload"]["task_id"] == "t1"
    assert isinstance(rows[0]["confidence"], float)


def test_to_pending_action_rows_drops_task_delete_without_id():
    """task_id 欠落の delete は drop（ID 無しに削除を走らせるのは危険）。"""
    filtered = {
        "task_deletes": [
            {"reason": "削除", "confidence": 0.9},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert rows == []


# ─── Slice D: goals / goal_updates ──────────────────────────────


def test_filter_by_confidence_keeps_goals_and_goal_updates():
    """Slice D で追加した goals / goal_updates も confidence でフィルタリング。"""
    payload = {
        "goals": [
            {"title": "新規目標A", "confidence": 0.7},
            {"title": "低", "confidence": 0.3},  # drop
        ],
        "goal_updates": [
            {"goal_id": "g1", "description": "新", "confidence": 0.8},
        ],
    }
    out = filter_by_confidence(payload)
    assert "goals" in out
    assert len(out["goals"]) == 1
    assert out["goals"][0]["title"] == "新規目標A"
    assert "goal_updates" in out
    assert len(out["goal_updates"]) == 1


def test_to_pending_action_rows_goal_emits_kind():
    filtered = {
        "goals": [
            {"title": "3ヶ月で5kg減量", "description": "...", "confidence": 0.85, "reason": "r"},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "goal"
    # description は HTML escape されるが title は plain なまま入る
    assert "3ヶ月で5kg減量" in rows[0]["payload"]["title"]
    assert isinstance(rows[0]["confidence"], float)


def test_to_pending_action_rows_goal_update_emits_kind():
    filtered = {
        "goal_updates": [
            {"goal_id": "g1", "description": "もう少し詳しく", "confidence": 0.8},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "goal_update"
    assert rows[0]["payload"]["goal_id"] == "g1"


def test_to_pending_action_rows_drops_goal_without_required_fields():
    """title 無しの goal、goal_id 無しの goal_update は drop。"""
    filtered = {
        "goals": [{"description": "x", "confidence": 0.9}],
        "goal_updates": [{"description": "x", "confidence": 0.9}],
    }
    rows = to_pending_action_rows(filtered)
    assert rows == []


# ─── Slice E: memory_clears ─────────────────────────────────────


def test_filter_by_confidence_keeps_memory_clears():
    payload = {
        "memory_clears": [
            {"fields": ["patterns"], "confidence": 0.8},
            {"fields": ["identity"], "confidence": 0.3},  # drop
        ],
    }
    out = filter_by_confidence(payload)
    assert "memory_clears" in out
    assert len(out["memory_clears"]) == 1
    assert out["memory_clears"][0]["fields"] == ["patterns"]


def test_to_pending_action_rows_memory_clear_emits_kind():
    filtered = {
        "memory_clears": [
            {"fields": ["patterns", "identity"], "confidence": 0.8, "reason": "r"},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert len(rows) == 1
    assert rows[0]["kind"] == "memory_clear"
    assert rows[0]["payload"]["fields"] == ["patterns", "identity"]


def test_to_pending_action_rows_memory_clear_filters_disallowed_fields():
    """profile や sub-key 指定は許可されない。fields に許可外しか無ければ row 自体を drop。"""
    filtered = {
        "memory_clears": [
            {"fields": ["profile"], "confidence": 0.9},  # 許可外 → drop
            {"fields": ["insights.morning"], "confidence": 0.9},  # sub-key → drop
            {"fields": ["patterns", "profile"], "confidence": 0.9},  # patterns だけ残る
        ],
    }
    rows = to_pending_action_rows(filtered)
    # 1 件目と 2 件目は valid fields が空なので drop、3 件目だけ採用
    assert len(rows) == 1
    assert rows[0]["payload"]["fields"] == ["patterns"]


def test_to_pending_action_rows_drops_memory_clear_without_fields():
    """fields 配列が無い / 空の memory_clear は drop。"""
    filtered = {
        "memory_clears": [
            {"confidence": 0.9, "reason": "x"},
            {"fields": [], "confidence": 0.9},
        ],
    }
    rows = to_pending_action_rows(filtered)
    assert rows == []


# ───────────────── Sprint coach-eval-guard: minimal input gate ─────────────────


@pytest.mark.parametrize(
    "user_input",
    [
        "",
        "   ",
        "OK",
        "OK!",
        "ok",
        "うん",
        "はい",
        "了解",
        "ありがとう",
        "test",
        "あ",
        "あー",
        "ね！",  # 短い感嘆
    ],
)
def test_filter_by_user_input_minimal_drops_everything(user_input: str):
    """短い相槌・テスト入力では action 系を全部剥がす。followup_question だけ残る。"""
    payload = {
        "tasks": [{"label": "x", "due": None, "confidence": 0.9, "reason": "r"}],
        "memory_patch": {"profile": {"family": "妻"}},
        "primary_target": {"action": "update", "value": "x", "reason": "r", "confidence": 0.9},
        "followup_question": "本当に？",
    }
    out = filter_by_user_input(payload, user_input)
    assert "tasks" not in out
    assert "memory_patch" not in out
    assert "primary_target" not in out
    assert out.get("followup_question") == "本当に？"


def test_filter_by_user_input_substantial_passes_through():
    """20 字以上 / 意味のあるテキストは全部素通し。filter_by_confidence に委ねる。"""
    payload = {
        "tasks": [{"label": "x", "due": None, "confidence": 0.9, "reason": "r"}],
        "memory_patch": {"profile": {"family": "妻"}},
    }
    user_input = "明日の朝、ジムに行ってからジャーナル書くつもり"
    out = filter_by_user_input(payload, user_input)
    assert out == payload  # そのまま返る


def test_filter_by_user_input_short_japanese_5chars_kept_minimal():
    """5 字未満の入力は token list に無くても minimal 扱い。"""
    out = filter_by_user_input(
        {"tasks": [{"label": "x", "confidence": 0.9}]},
        "やった",
    )
    assert "tasks" not in out
