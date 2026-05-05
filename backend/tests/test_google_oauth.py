"""
Google OAuth ルーターと token サービスの単体テスト。

外部 (Google API + Supabase) は monkeypatch で stub する。
"""
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

# 必要な env を set してから import（_state_secret が値を取りに行くため）
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-key-for-unit-tests")
os.environ.setdefault("GOOGLE_CLIENT_ID", "fake-client.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "fake-secret")

from app.api.routes import google_oauth as router_module
from app.services import google_token_service as svc


def test_state_round_trip():
    state = router_module._make_state("user-123")
    assert router_module._verify_state(state) == "user-123"


def test_state_rejects_tampering():
    state = router_module._make_state("user-123")
    assert router_module._verify_state(state[:-2] + "00") is None
    assert router_module._verify_state("not.a.state") is None


def test_build_authorize_url_contains_required_params():
    url = svc.build_authorize_url("state-xyz")
    assert "client_id=" in url
    assert "redirect_uri=" in url
    assert "scope=" in url
    assert "state=state-xyz" in url
    assert "access_type=offline" in url
    assert "prompt=consent" in url


@pytest.mark.asyncio
async def test_get_valid_access_token_returns_existing_when_fresh(monkeypatch):
    future = datetime.now(tz=timezone.utc) + timedelta(hours=1)
    monkeypatch.setattr(
        svc,
        "fetch_token_row",
        lambda uid: {
            "user_id": uid,
            "access_token": "fresh-access",
            "refresh_token": "rt",
            "expires_at": future.isoformat(),
            "scope": "calendar.events",
        },
    )
    refresh_called = False

    async def _no_refresh(_rt):
        nonlocal refresh_called
        refresh_called = True
        return {}

    monkeypatch.setattr(svc, "refresh_access_token", _no_refresh)

    token = await svc.get_valid_access_token("u1")
    assert token == "fresh-access"
    assert refresh_called is False


@pytest.mark.asyncio
async def test_get_valid_access_token_refreshes_when_expired(monkeypatch):
    past = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
    monkeypatch.setattr(
        svc,
        "fetch_token_row",
        lambda uid: {
            "user_id": uid,
            "access_token": "old",
            "refresh_token": "rt-1",
            "expires_at": past.isoformat(),
            "scope": "calendar.events",
        },
    )

    refresh_mock = AsyncMock(return_value={"access_token": "new-access", "expires_in": 3600})
    monkeypatch.setattr(svc, "refresh_access_token", refresh_mock)
    update_mock = MagicMock()
    monkeypatch.setattr(svc, "update_access_token", update_mock)

    token = await svc.get_valid_access_token("u1")
    assert token == "new-access"
    refresh_mock.assert_awaited_once_with("rt-1")
    update_mock.assert_called_once()
    args = update_mock.call_args.args
    assert args[0] == "u1"
    assert args[1] == "new-access"


@pytest.mark.asyncio
async def test_get_valid_access_token_returns_none_for_unknown_user(monkeypatch):
    monkeypatch.setattr(svc, "fetch_token_row", lambda uid: None)
    assert await svc.get_valid_access_token("nobody") is None


@pytest.mark.asyncio
async def test_get_valid_access_token_returns_none_when_refresh_fails(monkeypatch):
    past = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
    monkeypatch.setattr(
        svc,
        "fetch_token_row",
        lambda uid: {
            "user_id": uid,
            "access_token": "old",
            "refresh_token": "rt-broken",
            "expires_at": past.isoformat(),
            "scope": None,
        },
    )

    async def _raise(_rt):
        raise svc.GoogleAuthError("refresh failed: 400")

    monkeypatch.setattr(svc, "refresh_access_token", _raise)

    assert await svc.get_valid_access_token("u1") is None


def test_token_route_returns_disconnected_when_no_row(client, valid_token, monkeypatch):
    # ルートモジュールが from import している参照も上書きする
    monkeypatch.setattr(router_module, "fetch_token_row", lambda uid: None)
    monkeypatch.setattr(router_module, "get_valid_access_token", AsyncMock(return_value=None))
    res = client.get(
        "/api/integrations/google/token",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"connected": False}


def test_status_route_self_only(client, valid_token, monkeypatch):
    monkeypatch.setattr(router_module, "fetch_token_row", lambda uid: {"user_id": uid})
    res = client.get(
        "/api/integrations/google/status",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"connected": True}


def test_disconnect_calls_delete(client, valid_token, monkeypatch):
    called = {"yes": False}

    def _del(uid):
        called["yes"] = True

    monkeypatch.setattr(router_module, "delete_tokens", _del)
    res = client.delete(
        "/api/integrations/google/token",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert res.status_code == 200
    assert res.json() == {"disconnected": True}
    assert called["yes"] is True
