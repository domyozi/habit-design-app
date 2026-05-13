"""
Admin: Coach Eval (LLM-as-judge) 管理 API

Phase B: 蓄積された eval run / scores を frontend dashboard から閲覧する。
書き込み (run の起動) は backend CLI / 内部スケジューラ経由が主で、
ここでは閲覧用の GET と「今すぐ走らせる」POST のみ提供する。

すべて require_admin で gate (settings.ADMIN_USER_IDS allowlist)。
未設定なら全 deny。
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import require_admin
from app.core.supabase import get_supabase
from app.services.coach_eval import (
    DEFAULT_CONCURRENCY,
    DEFAULT_JUDGE_MODEL,
    fetch_run_scores,
    fetch_runs,
    judge_pairs,
    persist_run,
    sample_pairs,
    summarize,
)

router = APIRouter(prefix="/admin/eval", tags=["admin-eval"])


@router.get("/runs")
async def list_runs(
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(require_admin),
) -> dict[str, Any]:
    """最近の eval run 一覧 (新しい順)。dashboard の左ペイン用。"""
    runs = fetch_runs(get_supabase(), limit=limit)
    return {"runs": runs}


@router.get("/runs/{run_id}")
async def get_run_detail(
    run_id: str,
    _: str = Depends(require_admin),
) -> dict[str, Any]:
    """特定 run の詳細 + score 全件。worst examples / dimension 分布の元データ。"""
    sb = get_supabase()
    run_row = (
        sb.table("coach_eval_runs")
        .select("*")
        .eq("id", run_id)
        .maybe_single()
        .execute()
    )
    if not run_row.data:
        raise HTTPException(status_code=404, detail="run not found")
    scores = fetch_run_scores(sb, run_id)
    return {"run": run_row.data, "scores": scores}


@router.post("/runs")
async def create_run(
    payload: dict[str, Any],
    _: str = Depends(require_admin),
) -> dict[str, Any]:
    """新しい eval run をその場で走らせる。同期実行 (採点数が多いと長い)。

    payload:
      label: str       — 比較用ラベル (例: 'baseline')
      limit: int = 30  — 評価する pair 数
      user_id: str|None — 特定ユーザーに絞る
      since: str|None  — YYYY-MM-DD 以降
      concurrency: int = 4
      model: str
    """
    label = payload.get("label") or "manual"
    limit = int(payload.get("limit") or 30)
    target_user = payload.get("user_id")
    since_str = payload.get("since")
    concurrency = int(payload.get("concurrency") or DEFAULT_CONCURRENCY)
    model = payload.get("model") or DEFAULT_JUDGE_MODEL

    since_dt = None
    if since_str:
        from datetime import datetime, timezone

        try:
            since_dt = datetime.fromisoformat(since_str).replace(tzinfo=timezone.utc)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"invalid since: {e}") from e

    sb = get_supabase()
    pairs = sample_pairs(
        sb, limit=limit, user_id=target_user, since=since_dt
    )
    if not pairs:
        raise HTTPException(status_code=400, detail="no eval pairs found")

    results = await judge_pairs(pairs, concurrency=concurrency, model=model)
    summary = summarize(results, label=label, model=model)
    run_id = persist_run(sb, summary)
    return {
        "run_id": run_id,
        "pair_count": summary.pair_count,
        "avg_total": summary.avg_total,
        "avg_by_dimension": summary.avg_by_dimension,
        "error_count": summary.error_count,
    }
