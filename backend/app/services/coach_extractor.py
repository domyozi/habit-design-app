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

# Sprint coach-eval-guard: 0.5 → 0.65 に引き上げ。低確信度の提案で UI が
# ノイジーになる問題への対処。memory_patch は元から閾値外なので別ルートでガード。
CONFIDENCE_THRESHOLD = 0.65


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


# Sprint coach-eval-guard: 「OK!」のような minimal input で AI が大量提案を出す事故対策。
# 短い相槌・確認のみのインプットでは action 系を一律で剥がす。memory_patch も含む。
# circuit breaker 的に prompt 側 (output_contract.0-PRE) と二重防御。
_MINIMAL_INPUT_THRESHOLD_CHARS = 20
_MINIMAL_INPUT_TOKENS = frozenset(
    {
        "ok", "okk", "おk",
        "yes", "y", "うん", "うんうん", "そう", "そうそう",
        "はい", "了解", "りょ", "りょうかい", "了承",
        "ありがとう", "thanks", "thx", "ty",
        "test", "テスト", "ping",
        "a", "あ", "あー", "あぁ", "ah",
        "ね", "ね！", "おお",
    }
)


def _is_minimal_input(user_input: str | None) -> bool:
    """単純な相槌 / 確認 / 短いテスト入力か?
    True なら action 系を一律 drop すべき。
    """
    if not user_input:
        return True
    # 句読点 / 絵文字 / 記号類を削った素の文字列で判定
    stripped = (user_input or "").strip()
    if not stripped:
        return True
    if len(stripped) < _MINIMAL_INPUT_THRESHOLD_CHARS:
        # 短い時は ASCII 句読点・記号を取り払って lowercase 比較
        normalized = "".join(c for c in stripped.lower() if c.isalnum() or c in "ぁ-んァ-ン一-龯")
        if normalized in _MINIMAL_INPUT_TOKENS:
            return True
        # 5 字未満は内容に関係なく minimal 扱い (token list 漏れ対策)
        if len(stripped) < 5:
            return True
    return False


def filter_by_user_input(payload: dict, user_input: str | None) -> dict:
    """minimal input なら **すべての action を剥がす** circuit breaker。
    通常入力は素通し。filter_by_confidence の前に呼ぶ前提。

    Sprint coach-eval-guard: prompt 側 (output_contract.0-PRE) のガード句が
    破れた場合の二重防御。「OK!」で memory_patch.profile が勝手に書き換わる
    事故 (= UX 重大事故) を確実に止める。
    """
    if not _is_minimal_input(user_input):
        return payload
    # minimal input: followup_question のテキスト返しだけ残す
    out: dict[str, Any] = {}
    if payload.get("followup_question"):
        out["followup_question"] = payload["followup_question"]
    return out


def filter_by_confidence(payload: dict) -> dict:
    """confidence < 0.5 のフィールドをドロップし、空配列も省く。"""
    out: dict[str, Any] = {}

    pt = payload.get("primary_target")
    if isinstance(pt, dict) and float(pt.get("confidence") or 0) >= CONFIDENCE_THRESHOLD:
        out["primary_target"] = pt

    # Slice B/C/D/E: 編集系 (habit_updates / task_updates / goal_updates)、
    # 削除系 (task_deletes / memory_clears)、新規 Goal (goals) も confidence フィルタ。
    for key in (
        "tasks",
        "habits",
        "habit_today_completes",
        "habit_updates",
        "task_updates",
        "task_deletes",
        "goals",
        "goal_updates",
        "memory_clears",
        "confirmation_prompts",
    ):
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
    # Slice B: 既存 entity の編集提案
    "habit_update",
    "task_update",
    # Slice C: 削除提案カード（task のみ。habit / goal は policy 上 ✕）
    "task_delete",
    # Slice D: 中長期 Goal の新規 / 編集（削除は policy 上 ✕）
    "goal",
    "goal_update",
    # Slice E: Memory の特定キー削除（merge ではなく明示的に null へ書き戻す）
    "memory_clear",
}

# AI 出力 string 値の最大長。これを超える値は切り詰める（DoS / DB 圧迫対策）。
# UI 側は短い表示しか想定していないので 1000 字でも十分余裕。
_MAX_STR_LEN = 1000


def _sanitize_str(value: object) -> object:
    """AI 出力に含まれる string 値を安全側に倒す:
    - HTML 制御文字を escape（FE で innerHTML 経路があった場合の保険）
    - 異常に長い値は切り詰め
    list / dict はネストしてサニタイズ。それ以外は素通し（数値・bool 等）。
    """
    if isinstance(value, str):
        # XSS 防御の保険として HTML エスケープ。
        # FE は基本 textContent / React で render するので二重防御。
        s = (
            value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )
        if len(s) > _MAX_STR_LEN:
            s = s[:_MAX_STR_LEN] + "…"
        return s
    if isinstance(value, list):
        return [_sanitize_str(v) for v in value]
    if isinstance(value, dict):
        return {k: _sanitize_str(v) for k, v in value.items()}
    return value


def _sanitize_payload(payload: dict) -> dict:
    """pending_action.payload 全体を再帰的にサニタイズ。"""
    return {k: _sanitize_str(v) for k, v in payload.items()}


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
            "payload": _sanitize_payload({**pt}),
            "confidence": float(pt.get("confidence") or 0),
        })

    for c in filtered.get("habit_today_completes") or []:
        if not isinstance(c, dict):
            continue
        rows.append({
            "kind": "habit_today_complete",
            "payload": _sanitize_payload({**c}),
            "confidence": float(c.get("confidence") or 0),
        })

    if isinstance(filtered.get("memory_patch"), dict):
        rows.append({
            "kind": "memory_patch",
            "payload": _sanitize_payload(filtered["memory_patch"]),
            "confidence": 0.9,
        })

    for t in filtered.get("tasks") or []:
        if not isinstance(t, dict):
            continue
        # FE 側は label / due / reason を期待する
        rows.append({
            "kind": "task",
            "payload": _sanitize_payload({**t}),
            "confidence": float(t.get("confidence") or 0),
        })

    for h in filtered.get("habits") or []:
        if not isinstance(h, dict):
            continue
        # FE 側は label / frequency / scheduled_time を期待する
        rows.append({
            "kind": "habit",
            "payload": _sanitize_payload({**h}),
            "confidence": float(h.get("confidence") or 0),
        })

    # Slice B: 既存 habit の編集提案。habit_id 必須（無いものは drop）。
    for h in filtered.get("habit_updates") or []:
        if not isinstance(h, dict):
            continue
        if not h.get("habit_id"):
            continue
        rows.append({
            "kind": "habit_update",
            "payload": _sanitize_payload({**h}),
            "confidence": float(h.get("confidence") or 0),
        })

    # Slice B: 既存 task の編集提案。task_id 必須。
    for t in filtered.get("task_updates") or []:
        if not isinstance(t, dict):
            continue
        if not t.get("task_id"):
            continue
        rows.append({
            "kind": "task_update",
            "payload": _sanitize_payload({**t}),
            "confidence": float(t.get("confidence") or 0),
        })

    # Slice C: task の削除提案。task_id 必須。
    # 破壊的なので prompt 側で confidence ≥ 0.7 + confirmation_prompt 必須を強制する。
    for t in filtered.get("task_deletes") or []:
        if not isinstance(t, dict):
            continue
        if not t.get("task_id"):
            continue
        rows.append({
            "kind": "task_delete",
            "payload": _sanitize_payload({**t}),
            "confidence": float(t.get("confidence") or 0),
        })

    # Slice D: 中長期 Goal の新規提案。title 必須。
    # KGI / target_value 等は AI に推測させず、accept 後ユーザーが Goals 画面で詰める設計。
    for g in filtered.get("goals") or []:
        if not isinstance(g, dict):
            continue
        if not g.get("title"):
            continue
        rows.append({
            "kind": "goal",
            "payload": _sanitize_payload({**g}),
            "confidence": float(g.get("confidence") or 0),
        })

    # Slice D: 中長期 Goal の編集提案。goal_id 必須。
    for g in filtered.get("goal_updates") or []:
        if not isinstance(g, dict):
            continue
        if not g.get("goal_id"):
            continue
        rows.append({
            "kind": "goal_update",
            "payload": _sanitize_payload({**g}),
            "confidence": float(g.get("confidence") or 0),
        })

    # Slice E: Memory の特定キー削除提案。fields に top-level 1〜N キーを並べる。
    # 許可キー: identity / patterns / values_keywords / insights / goal_summary
    # profile は per-key merge endpoint 仕様の都合でスコープ外（プロフィール削除は
    # ユーザーが Memory 画面で手で行う）。fields が空 / 不正なら drop。
    _ALLOWED_CLEAR_FIELDS = {
        "identity", "patterns", "values_keywords", "insights", "goal_summary",
    }
    for m in filtered.get("memory_clears") or []:
        if not isinstance(m, dict):
            continue
        raw_fields = m.get("fields")
        if not isinstance(raw_fields, list):
            continue
        valid = [f for f in raw_fields if isinstance(f, str) and f in _ALLOWED_CLEAR_FIELDS]
        if not valid:
            continue
        rows.append({
            "kind": "memory_clear",
            "payload": _sanitize_payload({**m, "fields": valid}),
            "confidence": float(m.get("confidence") or 0),
        })

    # 安全弁: kind が想定外のものは drop
    return [r for r in rows if r["kind"] in _PENDING_KINDS]
