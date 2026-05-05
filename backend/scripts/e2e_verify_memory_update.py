"""Sprint 6.5.3-fix2 検証スクリプト

実 backend (localhost:8000) に対し、ユーザーの独白を coach-stream に投げ、
メモリ更新フローが end-to-end で機能することを確認する。

検証手順:
  1. JWT を生成（実ユーザー id を sub にする HS256 署名）
  2. baseline の user_context.profile を取得
  3. POST /api/ai/coach-stream で独白を送信
  4. SSE を受信し text / actions / done を解析
  5. memory_patch があれば PATCH /api/user-context で適用
  6. 更新後の user_context.profile を取得し diff 確認

実行:
  cd backend && source .venv/bin/activate
  python scripts/e2e_verify_memory_update.py
"""
from __future__ import annotations

import json
import os
import sys
import time

import httpx
from jose import jwt

USER_ID = "066f5d05-ad91-4cc1-9afd-8cc50f39d5de"
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:8000")
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
TEST_INPUT = (
    "来年37歳になるにあたって厚木以外に住んでヨーロッパとかに行きたいなと"
    "思うようになってきた。となると6歳の娘と猫と妻どうするかが心配だ。"
)


def make_jwt() -> str:
    if not JWT_SECRET:
        sys.exit("[FAIL] SUPABASE_JWT_SECRET not set")
    payload = {
        "sub": USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + 600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_profile(token: str) -> dict | None:
    r = httpx.get(
        f"{BASE_URL}/api/user-context",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()
    body = r.json()
    if not body:
        return None
    return body.get("profile") or {}


def stream_coach(token: str) -> tuple[str, dict | None]:
    """coach-stream を呼び、(accumulated text, actions payload) を返す。"""
    body = {
        "mode": "DECLARE",
        "user_input": TEST_INPUT,
        "history": [],
        "tz": "Asia/Tokyo",
    }
    accumulated = ""
    actions: dict | None = None
    persisted_journal_id = None
    with httpx.stream(
        "POST",
        f"{BASE_URL}/api/ai/coach-stream",
        headers={
            "Authorization": f"Bearer {token}",
            "content-type": "application/json",
        },
        json=body,
        timeout=60,
    ) as r:
        if r.status_code != 200:
            sys.exit(f"[FAIL] coach-stream returned {r.status_code}: {r.read().decode()}")
        for line in r.iter_lines():
            if not line.startswith("data: "):
                continue
            data = line[len("data: "):].strip()
            if not data or data == "[DONE]":
                continue
            try:
                evt = json.loads(data)
            except Exception:
                continue
            t = evt.get("type")
            if t == "text_chunk":
                accumulated += evt.get("content", "")
            elif t == "actions":
                actions = evt.get("payload")
            elif t == "done":
                persisted_journal_id = evt.get("persisted_journal_id")
            elif t == "error":
                sys.exit(f"[FAIL] coach-stream error: {evt}")
    _ = persisted_journal_id
    return accumulated, actions


def patch_user_context(token: str, patch: dict) -> dict:
    r = httpx.patch(
        f"{BASE_URL}/api/user-context",
        headers={"Authorization": f"Bearer {token}"},
        json=patch,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def main() -> None:
    print("==> JWT 生成")
    token = make_jwt()

    print("==> baseline profile 取得")
    before = get_profile(token)
    print("    before:", json.dumps(before, ensure_ascii=False))

    print("==> coach-stream 呼び出し")
    text, actions = stream_coach(token)
    text_tail = text[-200:] if len(text) > 200 else text
    print(f"    text_len={len(text)} tail={text_tail!r}")

    # ユーザーに見える text は fence 前のみ（FE は stripJsonBlock で削る）
    visible_idx = text.find("```json")
    visible_text = text[:visible_idx] if visible_idx >= 0 else text
    forbidden = ["JSON", "fence", "schema", "memory_patch", "primary_target"]
    leaks = [w for w in forbidden if w in visible_text]
    if leaks:
        print(f"    [FAIL] internal terms leaked into user-visible text: {leaks}")
    else:
        print("    [OK] no internal terms leaked into user-visible text")

    if not actions:
        print("    [WARN] actions event not received — AI did NOT emit JSON")
    else:
        print(f"    actions keys: {list(actions.keys())}")
        if "memory_patch" in actions:
            mp = actions["memory_patch"]
            print(f"    memory_patch: {json.dumps(mp, ensure_ascii=False)}")
        if "confirmation_prompts" in actions:
            cps = actions["confirmation_prompts"]
            print(f"    confirmation_prompts: {len(cps)} 件")
            for cp in cps:
                print(f"      - kind={cp.get('kind')} q={cp.get('question')!r}")

    if actions and actions.get("memory_patch"):
        print("==> memory_patch を user_context に PATCH 適用")
        patch_user_context(token, actions["memory_patch"])
        after = get_profile(token)
        print("    after:", json.dumps(after, ensure_ascii=False))
        if before == after:
            print("    [FAIL] profile に変化なし")
            sys.exit(1)
        else:
            changed_keys = [
                k for k in (set(before or {}) | set(after or {}))
                if (before or {}).get(k) != (after or {}).get(k)
            ]
            print(f"    [OK] profile changed: {changed_keys}")
    else:
        print("==> memory_patch 未 emit のためスキップ")
        sys.exit(2)


if __name__ == "__main__":
    main()
