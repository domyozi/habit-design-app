import asyncio

import pytest
from pydantic import ValidationError

from app.api.routes import integrations
from app.models.schemas import HealthBatchRequest, HealthMetricItem


def test_shortcuts_token_hash_is_not_plaintext():
    token = integrations._generate_shortcuts_token()
    token_hash = integrations._hash_shortcuts_token(token)

    assert token_hash != token
    assert len(token) >= 32
    assert len(token_hash) == 64


def test_health_metric_rejects_non_finite_value():
    with pytest.raises(ValidationError):
        HealthMetricItem(metric="steps", value=float("nan"))


def test_health_batch_rejects_empty_metrics():
    with pytest.raises(ValidationError):
        HealthBatchRequest(metrics=[])


def test_batch_errors_do_not_leak_exception_details(monkeypatch):
    def fail_insert(*args, **kwargs):
        raise RuntimeError("database password leaked")

    monkeypatch.setattr(integrations, "_insert_metric", fail_insert)
    integrations._integrations_rate_buckets.clear()

    body = HealthBatchRequest(metrics=[
        HealthMetricItem(metric="steps", value=1234, unit="count"),
    ])
    result = asyncio.run(integrations.batch_log_health_metrics(body, user_id="user-1"))

    assert result["saved_count"] == 0
    assert result["errors"] == [{"metric": "steps", "error": "save_failed"}]
    assert "database password leaked" not in str(result)
