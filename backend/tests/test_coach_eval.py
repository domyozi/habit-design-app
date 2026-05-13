"""
coach_eval (LLM-as-judge) のユニットテスト。

外部 LLM / Supabase に依存する部分は mock で差し替えて、
- sample_pairs: 模擬 supabase レコードから正しいペアが作れること
- _parse_judge_output: rubric の各 dimension を抽出できること
- judge_pair: create_message を mock して、scores の検証ロジックが効くこと
- summarize / format_markdown_report: 集計・レポート文字列の組み立て
を検証する。
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from unittest.mock import patch

import pytest

from app.services.coach_eval import (
    DimensionScore,
    JudgePair,
    JudgeResult,
    RUBRIC,
    _build_judge_user_message,
    _parse_judge_output,
    format_markdown_report,
    judge_pair,
    sample_pairs,
    summarize,
)


# ────────────────────── Test helpers ──────────────────────


class _FakeSupabaseTable:
    """journal_entries の超単純なモック。`.eq().in_().order().limit().execute()` の
    流暢インターフェイスを再現する。"""

    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self._filters: list = []
        self._order_key: Optional[str] = None
        self._order_desc: bool = True
        self._limit: int = 1000

    def select(self, *_: str) -> "_FakeSupabaseTable":
        return self

    def eq(self, k: str, v: Any) -> "_FakeSupabaseTable":
        self._filters.append(("eq", k, v))
        return self

    def in_(self, k: str, vs: list[Any]) -> "_FakeSupabaseTable":
        self._filters.append(("in", k, set(vs)))
        return self

    def gte(self, k: str, v: Any) -> "_FakeSupabaseTable":
        self._filters.append(("gte", k, v))
        return self

    def lt(self, k: str, v: Any) -> "_FakeSupabaseTable":
        self._filters.append(("lt", k, v))
        return self

    def order(self, k: str, desc: bool = False) -> "_FakeSupabaseTable":
        self._order_key = k
        self._order_desc = desc
        return self

    def limit(self, n: int) -> "_FakeSupabaseTable":
        self._limit = n
        return self

    def execute(self):
        rows = list(self._rows)
        for f in self._filters:
            kind, k, v = f
            if kind == "eq":
                rows = [r for r in rows if r.get(k) == v]
            elif kind == "in":
                rows = [r for r in rows if r.get(k) in v]
            elif kind == "gte":
                rows = [r for r in rows if r.get(k) and r[k] >= v]
            elif kind == "lt":
                rows = [r for r in rows if r.get(k) and r[k] < v]
        if self._order_key:
            rows.sort(
                key=lambda r: r.get(self._order_key) or "",
                reverse=self._order_desc,
            )
        rows = rows[: self._limit]

        class _Result:
            def __init__(self, data):
                self.data = data

        return _Result(rows)


class _FakeSupabaseClient:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def table(self, name: str) -> _FakeSupabaseTable:  # noqa: ARG002
        return _FakeSupabaseTable(self._rows)


def _row(
    id_: str,
    user_id: str,
    entry_type: str,
    created_at: datetime,
    content: str,
) -> dict[str, Any]:
    return {
        "id": id_,
        "user_id": user_id,
        "entry_type": entry_type,
        "content": content,
        "entry_date": created_at.date().isoformat(),
        "created_at": created_at.astimezone(timezone.utc).isoformat(),
    }


# ────────────────────── Tests ──────────────────────


def test_sample_pairs_basic_user_ai_pairing():
    """user (morning_journal) → 5 分後の AI (evening_feedback) でペアが作れる。"""
    t0 = datetime(2026, 4, 1, 9, 0, tzinfo=timezone.utc)
    rows = [
        _row("u1", "user-a", "morning_journal", t0, "今日は集中したい"),
        _row("a1", "user-a", "evening_feedback", t0 + timedelta(minutes=5), "応答1"),
        _row("u2", "user-a", "evening_notes", t0 + timedelta(hours=10), "夜の振り返り"),
        _row("a2", "user-a", "evening_feedback", t0 + timedelta(hours=10, minutes=2), "応答2"),
    ]
    client = _FakeSupabaseClient(rows)
    pairs = sample_pairs(client, limit=10)
    assert len(pairs) == 2
    # 新しい順で返る
    assert pairs[0].ai_entry_id == "a2"
    assert pairs[0].user_entry_id == "u2"
    assert pairs[1].ai_entry_id == "a1"
    assert pairs[1].user_entry_id == "u1"


def test_sample_pairs_gap_too_large_skipped():
    """user → AI の時間差が max_gap_minutes を超えるペアは作らない。"""
    t0 = datetime(2026, 4, 1, 9, 0, tzinfo=timezone.utc)
    rows = [
        _row("u1", "user-a", "morning_journal", t0, "独白"),
        # 3 時間後 → デフォルト 60 分 gap を超えているので不採用
        _row("a1", "user-a", "evening_feedback", t0 + timedelta(hours=3), "応答"),
    ]
    client = _FakeSupabaseClient(rows)
    pairs = sample_pairs(client, limit=10, max_gap_minutes=60)
    assert len(pairs) == 0


def test_sample_pairs_filter_by_user():
    """user_id を渡すとそのユーザーだけ。"""
    t0 = datetime(2026, 4, 1, 9, 0, tzinfo=timezone.utc)
    rows = [
        _row("u1", "user-a", "morning_journal", t0, "Aの独白"),
        _row("a1", "user-a", "evening_feedback", t0 + timedelta(minutes=5), "Aの応答"),
        _row("u2", "user-b", "morning_journal", t0 + timedelta(hours=1), "Bの独白"),
        _row("a2", "user-b", "evening_feedback", t0 + timedelta(hours=1, minutes=5), "Bの応答"),
    ]
    client = _FakeSupabaseClient(rows)
    pairs = sample_pairs(client, limit=10, user_id="user-b")
    assert len(pairs) == 1
    assert pairs[0].user_id == "user-b"


def test_parse_judge_output_well_formed():
    sample = """<observation>核心は集中時間の確保。AI は具体的提案を返している。</observation>
<scores>
{
  "relevance": {"score": 5, "rationale": "核心を捉えている"},
  "specificity": {"score": 4, "rationale": "時間提示あり"},
  "actionability": {"score": 4, "rationale": "今日実行可能"},
  "tone_fit": {"score": 5, "rationale": "対等な口調"}
}
</scores>
"""
    obs, scores = _parse_judge_output(sample)
    assert "核心" in obs
    assert scores["relevance"]["score"] == 5
    assert scores["tone_fit"]["rationale"] == "対等な口調"


def test_parse_judge_output_fallback_when_no_tags():
    """<scores> タグ無しでも、最後の JSON ブロックを拾える。"""
    sample = """observation の体裁が違うが採点だけは入っている
{"relevance": {"score": 4, "rationale": "r"}, "specificity": {"score": 2, "rationale": "s"},
 "actionability": {"score": 4, "rationale": "a"}, "tone_fit": {"score": 5, "rationale": "t"}}
"""
    obs, scores = _parse_judge_output(sample)
    assert obs == ""
    assert scores["specificity"]["score"] == 2


def test_build_judge_user_message_contains_both_sides():
    pair = JudgePair(
        user_id="u",
        user_entry_id="u1",
        user_entry_type="morning_journal",
        user_content="今日は集中したい",
        user_created_at="2026-04-01T09:00:00+00:00",
        ai_entry_id="a1",
        ai_content="9 時から 11 時を集中ブロックに置きましょう",
        ai_created_at="2026-04-01T09:05:00+00:00",
    )
    msg = _build_judge_user_message(pair)
    assert "今日は集中したい" in msg
    assert "集中ブロックに置きましょう" in msg
    assert "<user_input>" in msg and "<ai_response>" in msg


@pytest.mark.asyncio
async def test_judge_pair_mocked_success():
    """create_message を mock すれば 4 dimension の正常 result が組み立つこと。"""
    pair = JudgePair(
        user_id="u",
        user_entry_id="u1",
        user_entry_type="morning_journal",
        user_content="集中したい",
        user_created_at="",
        ai_entry_id="a1",
        ai_content="今日 9-11 時を集中時間に",
        ai_created_at="",
    )
    fake_response = """<observation>適切</observation>
<scores>
{
  "relevance": {"score": 5, "rationale": "ok"},
  "specificity": {"score": 4, "rationale": "ok"},
  "actionability": {"score": 4, "rationale": "ok"},
  "tone_fit": {"score": 5, "rationale": "ok"}
}
</scores>"""
    with patch(
        "app.services.coach_eval.create_message",
        return_value=fake_response,
    ):
        result = await judge_pair(pair)
    assert result.ok
    assert result.error is None
    assert len(result.scores) == len(RUBRIC)
    keys = {s.key for s in result.scores}
    assert keys == {r["key"] for r in RUBRIC}
    assert 4.0 <= result.total <= 5.0


@pytest.mark.asyncio
async def test_judge_pair_invalid_score_value():
    """score=3 (中央値) は無効なので error 扱い。"""
    pair = JudgePair(
        user_id="u",
        user_entry_id="u1",
        user_entry_type="morning_journal",
        user_content="x",
        user_created_at="",
        ai_entry_id="a1",
        ai_content="y",
        ai_created_at="",
    )
    fake_response = """<scores>
{
  "relevance": {"score": 3, "rationale": "ok"},
  "specificity": {"score": 4, "rationale": "ok"},
  "actionability": {"score": 4, "rationale": "ok"},
  "tone_fit": {"score": 5, "rationale": "ok"}
}
</scores>"""
    with patch("app.services.coach_eval.create_message", return_value=fake_response):
        result = await judge_pair(pair)
    assert not result.ok
    assert result.error is not None
    assert "invalid score" in result.error


def test_summarize_and_format_markdown():
    pair = JudgePair(
        user_id="u",
        user_entry_id="aaaaaaaa-1",
        user_entry_type="morning_journal",
        user_content="集中したい",
        user_created_at="",
        ai_entry_id="bbbbbbbb-1",
        ai_content="9-11 時を集中に",
        ai_created_at="",
    )
    res = JudgeResult(
        pair=pair,
        observation="OK",
        scores=[
            DimensionScore(key="relevance", score=5, rationale="r1"),
            DimensionScore(key="specificity", score=4, rationale="r2"),
            DimensionScore(key="actionability", score=4, rationale="r3"),
            DimensionScore(key="tone_fit", score=5, rationale="r4"),
        ],
    )
    summary = summarize([res], label="t1", model="claude-haiku-4-5-20251001")
    assert summary.pair_count == 1
    assert summary.error_count == 0
    assert summary.avg_total == 4.5
    assert summary.avg_by_dimension["relevance"] == 5.0
    md = format_markdown_report(summary)
    assert "Coach Eval — t1" in md
    assert "avg total" in md
    assert "relevance" in md
