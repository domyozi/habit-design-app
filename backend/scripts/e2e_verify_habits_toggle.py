"""Sprint 6.6 Phase A 検証スクリプト

Today チェックボックスが 1 秒で元に戻るバグの修正検証。

シナリオ:
  1. JWT を生成
  2. baseline: /api/ai/coach-context を取得し、各 habit の today_completed をスナップ
  3. 任意の binary habit を 1 つ pick して /api/habits/{id}/log に completed=true を書く
  4. /api/ai/coach-context を再取得し、その habit の today_completed が true になっていることを検証
  5. もう一度 /api/ai/coach-context を取得しても true のまま（revert しない）であることを検証
  6. テスト後にログを completed=false に戻して掃除（任意）

実行:
  cd backend && source .venv/bin/activate
  python scripts/e2e_verify_habits_toggle.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import date

import httpx
from jose import jwt

USER_ID = "066f5d05-ad91-4cc1-9afd-8cc50f39d5de"
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:8000")
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")


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


def fetch_context(token: str) -> dict:
    r = httpx.get(
        f"{BASE_URL}/api/ai/coach-context?tz=Asia/Tokyo",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def update_log(token: str, habit_id: str, completed: bool) -> dict:
    r = httpx.patch(
        f"{BASE_URL}/api/habits/{habit_id}/log",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "date": str(date.today()),
            "completed": completed,
            "input_method": "manual",
        },
        timeout=10,
    )
    if r.status_code >= 400:
        print(f"    [HTTP {r.status_code}] {r.text}")
    r.raise_for_status()
    return r.json()


def update_numeric_log(token: str, habit_id: str, numeric_value: float) -> dict:
    r = httpx.patch(
        f"{BASE_URL}/api/habits/{habit_id}/log",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "date": str(date.today()),
            "completed": True,
            "input_method": "manual",
            "numeric_value": numeric_value,
        },
        timeout=10,
    )
    if r.status_code >= 400:
        print(f"    [HTTP {r.status_code}] {r.text}")
    r.raise_for_status()
    return r.json()


def update_time_log(token: str, habit_id: str, time_value: str) -> dict:
    r = httpx.patch(
        f"{BASE_URL}/api/habits/{habit_id}/log",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "date": str(date.today()),
            "completed": True,
            "input_method": "manual",
            "time_value": time_value,
        },
        timeout=10,
    )
    if r.status_code >= 400:
        print(f"    [HTTP {r.status_code}] {r.text}")
    r.raise_for_status()
    return r.json()


def patch_habit(token: str, habit_id: str, body: dict) -> dict:
    r = httpx.patch(
        f"{BASE_URL}/api/habits/{habit_id}",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=10,
    )
    if r.status_code >= 400:
        print(f"    [HTTP {r.status_code}] {r.text}")
    r.raise_for_status()
    return r.json()


def main() -> None:
    print("==> JWT 生成")
    token = make_jwt()

    # ─── Phase A: revert バグ ────────────────────────────────
    print("\n[Phase A] Today checkbox revert バグ修正")
    ctx0 = fetch_context(token)
    habits = ctx0.get("habits", [])
    if not habits:
        sys.exit("[FAIL] habits 0 件 — テスト前提として 1 件以上必要")
    binary = [h for h in habits if h.get("metric_type", "binary") == "binary"]
    if not binary:
        sys.exit("[FAIL] binary habit 0 件")
    target = binary[0]
    hid = target["id"]
    print(f"    target binary habit: id={hid} title={target.get('title')!r}")
    original_completed = bool(target["today_completed"])
    update_log(token, hid, True)
    ctx1 = fetch_context(token)
    h1 = next((h for h in ctx1["habits"] if h["id"] == hid), None)
    if not h1 or not h1["today_completed"]:
        sys.exit("[FAIL] today_completed が true になっていない（バグ残存）")
    ctx2 = fetch_context(token)
    h2 = next((h for h in ctx2["habits"] if h["id"] == hid), None)
    if not h2 or not h2["today_completed"]:
        sys.exit("[FAIL] 2 回目の refresh で revert")
    print("    [OK] revert しない")

    # ─── Phase A 副次: is_active=false の habit が coach-context に出ない ──
    raw = httpx.get(
        f"{BASE_URL}/api/habits?include_today_log=true",
        headers={"Authorization": f"Bearer {token}"}, timeout=10,
    ).json().get("data", [])
    if len(raw) != len(ctx2["habits"]):
        sys.exit(f"[FAIL] /api/habits ({len(raw)} 件) と coach-context ({len(ctx2['habits'])} 件) の数が不一致")
    print(f"    [OK] /api/habits と coach-context の habit 数が一致 ({len(raw)})")

    # ─── Phase C: numeric / time 系の log 記録 ────────────────
    print("\n[Phase C] numeric / time 系の log 記録")
    numeric = [h for h in raw if h.get("metric_type") in ("numeric_min", "numeric_max", "duration", "range")]
    time_targets = [h for h in raw if h.get("metric_type") in ("time_before", "time_after")]
    if numeric:
        nh = numeric[0]
        print(f"    numeric habit: title={nh['title']!r} metric={nh['metric_type']} target={nh.get('target_value')}{nh.get('unit') or ''}")
        target_v = float(nh.get("target_value") or 1)
        # numeric_max は target 以下、それ以外は target 以上で達成
        v = (target_v - 0.1) if nh["metric_type"] == "numeric_max" else (target_v + 0.1)
        update_numeric_log(token, nh["id"], v)
        ctx_n = fetch_context(token)
        h_n = next((h for h in ctx_n["habits"] if h["id"] == nh["id"]), None)
        if not h_n["today_completed"]:
            sys.exit(f"[FAIL] numeric habit が達成扱いにならない (sent {v} vs target {target_v})")
        print(f"    [OK] numeric_value={v} で達成判定 → today_completed=true")
    else:
        print("    [SKIP] numeric habit なし")

    if time_targets:
        th = time_targets[0]
        print(f"    time habit: title={th['title']!r} metric={th['metric_type']} target_time={th.get('target_time')}")
        # time_before の場合は target_time より前の時刻、time_after は後の時刻
        target_t = th.get("target_time", "07:00")
        hh, mm = target_t.split(":")[:2]
        h_int = int(hh)
        if th["metric_type"] == "time_before":
            v = f"{max(0, h_int-1):02d}:{mm}"
        else:
            v = f"{min(23, h_int+1):02d}:{mm}"
        update_time_log(token, th["id"], v)
        ctx_t = fetch_context(token)
        h_t = next((h for h in ctx_t["habits"] if h["id"] == th["id"]), None)
        if not h_t["today_completed"]:
            sys.exit(f"[FAIL] time habit が達成扱いにならない (sent {v})")
        print(f"    [OK] time_value={v} で達成判定 → today_completed=true")
    else:
        print("    [SKIP] time habit なし")

    # ─── Phase B: habit 編集 (PATCH /api/habits/{id}) ────────
    print("\n[Phase B] habit 編集")
    if binary:
        eh = binary[0]
        original_title = eh["title"]
        new_title = original_title + " · 編集確認"
        patch_habit(token, eh["id"], {
            "action": "manual_edit",
            "title": new_title,
        })
        ctx_e = fetch_context(token)
        h_e = next((h for h in ctx_e["habits"] if h["id"] == eh["id"]), None)
        if h_e["title"] != new_title:
            sys.exit(f"[FAIL] habit 編集が反映されない ({h_e['title']!r} != {new_title!r})")
        print(f"    [OK] title 編集反映: {original_title!r} → {new_title!r}")
        # cleanup
        patch_habit(token, eh["id"], {"action": "manual_edit", "title": original_title})
        print(f"    cleanup: title を {original_title!r} に戻し")

    # ─── cleanup: Phase A binary を元に戻す
    if not original_completed:
        update_log(token, hid, False)
        print("\n[cleanup] Phase A binary を completed=false に戻し")

    print("\n[ALL OK] Sprint 6.6 全 Phase の e2e UAT 成功")


if __name__ == "__main__":
    main()
