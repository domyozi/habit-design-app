"""
Coach 応答の "replay" 評価: 同一 user_input を 異なる prompt で再生成し採点する。

Phase C: prompt 変更が同じ入力に対してどう response を変えるかを CI で測れる。

通常の coach_eval は DB から過去ペアを取り出すが、それは「過去 prompt が出した
過去応答」を採点するだけで、prompt 変更の effect は測れない。
本モジュールは:
  1. 固定 fixture (= synthetic user_inputs + minimal context) を読み込み
  2. 現在の build_coach_prompt + Anthropic SDK で fresh response を生成
  3. coach_eval.judge_pairs に流して採点
の流れで同じ user_input に対する prompt 変化を測定可能にする。

CI から呼ばれる前提なので、外部依存は最小 (Supabase 不要、Anthropic だけ)。
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from app.services.ai_service import create_message
from app.services.coach_eval import JudgePair
from app.services.coach_prompts import build_coach_prompt

logger = logging.getLogger(__name__)

# CI で固定したい mock context のデフォルト日付。テストの再現性確保。
_FIXED_DATE = datetime(2026, 5, 14, 9, 0, tzinfo=timezone.utc)

# replay の judge user_id (claude_api_logs で feature='coach_eval_replay' として残る)
_REPLAY_LOG_USER_ID = "00000000-0000-0000-0000-000000000001"


def _make_mock_context(
    user_context: dict[str, Any] | None = None,
    primary_target: dict[str, Any] | None = None,
    habits: list[dict[str, Any]] | None = None,
    recent_journals: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """build_coach_prompt 用の最小 mock CoachContext を構築。

    全フィールドを default で埋め、必要に応じて上書きする。CI の再現性のため
    日付は _FIXED_DATE 固定。
    """
    return {
        "today_date": _FIXED_DATE.date().isoformat(),
        "today_weekday": "木",  # 2026-05-14 is Thursday
        "local_time": "09:00",
        "user_timezone": "Asia/Tokyo",
        "user_context": user_context or {
            "identity": None,
            "patterns": None,
            "values_keywords": None,
            "insights": None,
            "goal_summary": None,
            "profile": None,
        },
        "primary_target": primary_target,
        "habits": habits or [],
        "goals": [],
        "recent_journals": recent_journals or [],
        "today_calendar": {"items": [], "available": False},
        "signals": {"habit_streak_alerts": []},
        "pending_suggestions": [],
        "pending_coach_actions": [],
        "server_received_at": int(_FIXED_DATE.timestamp()),
    }


def _strip_json_fence(text: str) -> str:
    """応答末尾の ```json {...} ``` ブロックを除去 (採点はテキスト本体のみで行う)。"""
    fence = re.compile(r"```json\s*\n[\s\S]*?\n```\s*$", re.M)
    return fence.sub("", text).strip()


async def generate_response(
    user_input: str,
    *,
    mock_context: dict[str, Any] | None = None,
    mode: str = "DECLARE",
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 1500,
) -> str:
    """build_coach_prompt + create_message で fresh 応答を 1 件生成。

    判定対象は応答テキスト本体のみなので、JSON fence は除いて返す。
    """
    ctx = mock_context or _make_mock_context()
    system, user = build_coach_prompt(ctx, mode, user_input)
    text = await create_message(
        messages=[{"role": "user", "content": user}],
        user_id=_REPLAY_LOG_USER_ID,
        feature="coach_eval_replay",
        system_prompt=system,
        max_tokens=max_tokens,
        model=model,
    )
    return _strip_json_fence(text)


# ───────────────────────── Fixture I/O ─────────────────────────


def load_fixture(path: str | Path) -> list[dict[str, Any]]:
    """JSON fixture を読み込む。

    Fixture フォーマット:
    [
      {
        "id": "smoke-1",
        "user_input": "今日は集中したい",
        "context": {                                  # 省略可: 全 default
          "user_context": {...},
          "primary_target": {...},
          "habits": [...],
          "recent_journals": [...]
        }
      },
      ...
    ]
    """
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"fixture {path} must be a JSON array, got {type(data).__name__}")
    return data


async def replay_and_pair(
    fixture_entries: Iterable[dict[str, Any]],
    *,
    concurrency: int = 4,
    model: str = "claude-haiku-4-5-20251001",
) -> list[JudgePair]:
    """fixture 各 entry の user_input から fresh AI 応答を生成し、JudgePair に整形。

    生成された JudgePair はそのまま `coach_eval.judge_pairs()` に渡せる。
    """
    sem = asyncio.Semaphore(concurrency)
    entries = list(fixture_entries)

    async def _one(entry: dict[str, Any]) -> JudgePair:
        async with sem:
            user_input = entry.get("user_input") or ""
            ctx_override = entry.get("context") or {}
            ctx = _make_mock_context(
                user_context=ctx_override.get("user_context"),
                primary_target=ctx_override.get("primary_target"),
                habits=ctx_override.get("habits"),
                recent_journals=ctx_override.get("recent_journals"),
            )
            ai_text = await generate_response(
                user_input, mock_context=ctx, model=model
            )
            return JudgePair(
                user_id=_REPLAY_LOG_USER_ID,
                user_entry_id=entry.get("id") or f"fixture-{user_input[:12]}",
                user_entry_type="morning_journal",
                user_content=user_input,
                user_created_at=_FIXED_DATE.isoformat(),
                ai_entry_id=f"replay-{entry.get('id') or '?'}",
                ai_content=ai_text,
                ai_created_at=_FIXED_DATE.isoformat(),
            )

    pairs = await asyncio.gather(*[_one(e) for e in entries])
    return list(pairs)
