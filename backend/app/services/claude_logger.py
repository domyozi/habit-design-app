"""
Claude API 呼び出しログ書き込み

【設計方針】:
- Supabase service_role client (app/core/supabase.py:get_supabase) 経由で 1 row insert
- supabase-py の insert は同期 → asyncio.to_thread で逃がす
- 失敗しても呼び出し元には絶対に raise しない（観測の失敗で本機能を落とさない）
- Supabase 未初期化の dev 環境では no-op（logger.info で row dump）
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.services.claude_pricing import compute_cost_usd

logger = logging.getLogger(__name__)

VALID_STATUS = ("ok", "error", "cancelled")


async def log_claude_call(
    *,
    user_id: str,
    feature: str,
    model: str,
    streaming: bool,
    usage: Optional[Any] = None,
    latency_ms: int,
    status: str,
    error_kind: Optional[str] = None,
    request_id: Optional[str] = None,
) -> None:
    """
    Claude API 呼び出し 1 件を claude_api_logs テーブルに記録する。

    Args:
        user_id: Supabase auth user UUID（生 UUID。hash 化はせず DB に格納）
        feature: 機能ラベル（"coach_stream" など）
        model: モデル名（"claude-sonnet-4-6" など）
        streaming: streaming 呼び出しなら True
        usage: anthropic.types.Usage 互換オブジェクト or None
        latency_ms: 呼び出し開始～終了の経過時間（ms）
        status: "ok" / "error" / "cancelled"
        error_kind: error / cancelled 時の例外型名（"APIError" など）
        request_id: response.id（取得できた場合のみ）
    """
    try:
        if status not in VALID_STATUS:
            logger.warning("log_claude_call: unknown status=%r (treating as 'error')", status)
            status = "error"

        in_tok = _safe_int(usage, "input_tokens")
        out_tok = _safe_int(usage, "output_tokens")
        c_read = _safe_int(usage, "cache_read_input_tokens")
        c_creat = _safe_int(usage, "cache_creation_input_tokens")
        cost = compute_cost_usd(model, in_tok, out_tok, c_read, c_creat)

        row = {
            "user_id": user_id,
            "feature": feature,
            "model": model,
            "streaming": streaming,
            "status": status,
            "error_kind": error_kind,
            "request_id": request_id,
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "cache_read_input_tokens": c_read,
            "cache_creation_input_tokens": c_creat,
            # Decimal を float にキャスト（Supabase は NUMERIC を float で受ける）。
            # 精度は NUMERIC(12, 6) なので 1 回の call あたり $0.000001 まで意味がある。
            "cost_usd": float(cost),
            "latency_ms": int(latency_ms),
        }

        # 遅延 import で循環参照を避ける
        from app.core.supabase import get_supabase

        try:
            client = get_supabase()
        except RuntimeError:
            # dev で Supabase 未初期化のとき。row を log するだけで終わる。
            logger.info("claude_api_log (no-supabase): %s", row)
            return

        if client is None:
            logger.info("claude_api_log (client=None): %s", row)
            return

        await asyncio.to_thread(
            lambda: client.table("claude_api_logs").insert(row).execute()
        )
    except Exception:
        # 観測の失敗で呼び出し元を絶対に落とさない
        logger.exception("log_claude_call failed (swallowed)")


def _safe_int(obj: Any, attr: str) -> int:
    """obj.attr を int で安全に取り出す。None / 属性なし / 変換失敗は 0。"""
    if obj is None:
        return 0
    val = getattr(obj, attr, None)
    if val is None:
        return 0
    try:
        return int(val)
    except (TypeError, ValueError):
        return 0
