"""
Claude API 料金計算

【設計方針】:
- USD/M tokens の固定 dict を Decimal で保持（float 誤差防止）
- 未知の model は warning + Decimal("0") で fail-safe
  (pricing 失敗で本機能を落とさない方針)
- 価格は Anthropic の公式 pricing ページを参考に手書きメンテ
  https://www.anthropic.com/pricing

【更新ルール】:
- 新しい model を呼ぶ前に必ずこの dict を更新する
- Phase 2 で月次レポート見て価格を年 1 回程度メンテ
"""
from __future__ import annotations

import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

# USD per 1M tokens、token 種別ごとの単価
# cache_read = prompt cache 読み込み (90% off / 5min TTL)
# cache_creation = prompt cache 書き込み (25% premium / 5min TTL)
PRICING_PER_MTOK: dict[str, dict[str, Decimal]] = {
    "claude-sonnet-4-6": {
        "input": Decimal("3.00"),
        "output": Decimal("15.00"),
        "cache_read": Decimal("0.30"),
        "cache_creation": Decimal("3.75"),
    },
    "claude-haiku-4-5-20251001": {
        "input": Decimal("1.00"),
        "output": Decimal("5.00"),
        "cache_read": Decimal("0.10"),
        "cache_creation": Decimal("1.25"),
    },
}

_M_TOKENS = Decimal("1000000")


def compute_cost_usd(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_input_tokens: int = 0,
    cache_creation_input_tokens: int = 0,
) -> Decimal:
    """
    USD コストを計算する。未知 model は警告ログ + Decimal("0")。

    Args:
        model: モデル名（例: "claude-sonnet-4-6"）
        input_tokens: 通常 input tokens
        output_tokens: output tokens
        cache_read_input_tokens: prompt cache read tokens
        cache_creation_input_tokens: prompt cache creation tokens

    Returns:
        Decimal: USD（小数点以下 6 桁まで意味あり）
    """
    rates = PRICING_PER_MTOK.get(model)
    if rates is None:
        logger.warning("unknown model for pricing: %s (treating as $0)", model)
        return Decimal("0")

    return (
        Decimal(input_tokens) * rates["input"]
        + Decimal(output_tokens) * rates["output"]
        + Decimal(cache_read_input_tokens) * rates["cache_read"]
        + Decimal(cache_creation_input_tokens) * rates["cache_creation"]
    ) / _M_TOKENS
