"""Phase 6.5: AI 応答末尾の ```json fence を抽出して action payload を取り出す。

Frontend `extractJsonBlock.ts` / `stripJsonBlock.ts` の Python 移植。
失敗時は None を返す（呼び出し側でフォールバック）。
confidence < 0.5 のフィールドは drop して、persist 対象を厳選する。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5


def extract_json_block(text: str) -> Optional[dict]:
    """末尾の ```json ... ``` を JSON として parse して返す。"""
    if not text:
        return None
    match = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    candidate = match.group(1) if match else text
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
        return None
    except (json.JSONDecodeError, TypeError):
        return None


def strip_json_block(text: str) -> str:
    """末尾の ```json fence を削った markdown 部分を返す。"""
    idx = text.find("```json")
    if idx >= 0:
        return text[:idx].rstrip()
    return text


def filter_by_confidence(payload: dict) -> dict:
    """confidence < 0.5 のフィールドをドロップし、空配列も省く。"""
    out: dict[str, Any] = {}

    pt = payload.get("primary_target")
    if isinstance(pt, dict) and float(pt.get("confidence") or 0) >= CONFIDENCE_THRESHOLD:
        out["primary_target"] = pt

    for key in ("tasks", "habits", "habit_today_completes", "confirmation_prompts"):
        rows = payload.get(key)
        if isinstance(rows, list):
            kept = [
                r for r in rows
                if isinstance(r, dict)
                and float(r.get("confidence") or 0) >= CONFIDENCE_THRESHOLD
            ]
            if kept:
                out[key] = kept

    if isinstance(payload.get("memory_patch"), dict):
        out["memory_patch"] = payload["memory_patch"]

    if payload.get("followup_question"):
        out["followup_question"] = payload["followup_question"]

    return out


# coach_pending_actions に保存できる kind 集合
_PENDING_KINDS = {
    "pt_update",
    "pt_close",
    "habit_today_complete",
    "memory_patch",
    "task",
    "habit",
}


def to_pending_action_rows(filtered: dict) -> list[dict]:
    """confidence フィルタ済みの action payload から coach_pending_actions に
    insert すべき行のリストを構築する。

    - primary_target → kind=pt_close|pt_update
    - habit_today_completes → 各要素を kind=habit_today_complete
    - memory_patch → kind=memory_patch（confidence は AI が出さないので 0.9 固定）
    - tasks → 各要素を kind=task（payload に label / due / reason）
    - habits → 各要素を kind=habit（payload に label / frequency / scheduled_time）

    tasks / habits は accept で別 store（tasks DB / habits DB）に流す。
    coach_pending_actions には「24h 保留＋承認/却下フロー」のために残す。
    """
    rows: list[dict] = []

    pt = filtered.get("primary_target")
    if isinstance(pt, dict):
        action = pt.get("action")
        kind = "pt_close" if action == "close" else "pt_update"
        rows.append({
            "kind": kind,
            "payload": {**pt},
            "confidence": float(pt.get("confidence") or 0),
        })

    for c in filtered.get("habit_today_completes") or []:
        if not isinstance(c, dict):
            continue
        rows.append({
            "kind": "habit_today_complete",
            "payload": {**c},
            "confidence": float(c.get("confidence") or 0),
        })

    if isinstance(filtered.get("memory_patch"), dict):
        rows.append({
            "kind": "memory_patch",
            "payload": filtered["memory_patch"],
            "confidence": 0.9,
        })

    for t in filtered.get("tasks") or []:
        if not isinstance(t, dict):
            continue
        # FE 側は label / due / reason を期待する
        rows.append({
            "kind": "task",
            "payload": {**t},
            "confidence": float(t.get("confidence") or 0),
        })

    for h in filtered.get("habits") or []:
        if not isinstance(h, dict):
            continue
        # FE 側は label / frequency / scheduled_time を期待する
        rows.append({
            "kind": "habit",
            "payload": {**h},
            "confidence": float(h.get("confidence") or 0),
        })

    # 安全弁: kind が想定外のものは drop
    return [r for r in rows if r["kind"] in _PENDING_KINDS]
