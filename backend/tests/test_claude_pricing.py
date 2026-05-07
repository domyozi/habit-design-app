"""
claude_pricing.py の unit test
"""
from decimal import Decimal

import pytest

from app.services.claude_pricing import PRICING_PER_MTOK, compute_cost_usd


class TestComputeCostUsd:
    """compute_cost_usd のテスト"""

    def test_sonnet_input_only(self):
        """Sonnet 4.6 で input 1M tokens → $3.00"""
        cost = compute_cost_usd("claude-sonnet-4-6", input_tokens=1_000_000)
        assert cost == Decimal("3.00")

    def test_sonnet_output_only(self):
        """Sonnet 4.6 で output 1M tokens → $15.00"""
        cost = compute_cost_usd("claude-sonnet-4-6", output_tokens=1_000_000)
        assert cost == Decimal("15.00")

    def test_haiku_input_only(self):
        """Haiku 4.5 で input 1M tokens → $1.00"""
        cost = compute_cost_usd("claude-haiku-4-5-20251001", input_tokens=1_000_000)
        assert cost == Decimal("1.00")

    def test_haiku_output_only(self):
        """Haiku 4.5 で output 1M tokens → $5.00"""
        cost = compute_cost_usd("claude-haiku-4-5-20251001", output_tokens=1_000_000)
        assert cost == Decimal("5.00")

    def test_sonnet_combined(self):
        """Sonnet で input 1k + output 1k + cache_read 1k + cache_creation 1k"""
        cost = compute_cost_usd(
            "claude-sonnet-4-6",
            input_tokens=1000,
            output_tokens=1000,
            cache_read_input_tokens=1000,
            cache_creation_input_tokens=1000,
        )
        # $3 + $15 + $0.30 + $3.75 / 1M * 1k = (3 + 15 + 0.3 + 3.75) / 1000 = 0.02205
        assert cost == Decimal("0.02205")

    def test_zero_tokens(self):
        """全 0 → $0.00"""
        cost = compute_cost_usd("claude-sonnet-4-6")
        assert cost == Decimal("0")

    def test_unknown_model_returns_zero(self, caplog):
        """未知 model → warning + Decimal(0)"""
        import logging
        with caplog.at_level(logging.WARNING):
            cost = compute_cost_usd("claude-unknown-9-9", input_tokens=1_000_000)
        assert cost == Decimal("0")
        assert any("unknown model" in r.message.lower() for r in caplog.records)

    def test_pricing_dict_has_required_keys(self):
        """price dict の各 model に必須 key が揃っているか"""
        required = {"input", "output", "cache_read", "cache_creation"}
        for model, rates in PRICING_PER_MTOK.items():
            assert required.issubset(rates.keys()), f"missing keys in {model}"
            for key, val in rates.items():
                assert isinstance(val, Decimal), f"{model}.{key} must be Decimal"

    def test_small_token_counts(self):
        """token 数が少ないときの精度（Decimal なら誤差なし）"""
        # Sonnet input 100 tokens = 100 * 3 / 1M = 0.0003
        cost = compute_cost_usd("claude-sonnet-4-6", input_tokens=100)
        assert cost == Decimal("0.0003")
