"""
外部連携（iOS Shortcuts等）向け Webhook API

エンドポイント:
  POST /api/integrations/log  - 健康データを記録
  GET  /api/integrations/logs - 当日の記録を取得
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/integrations")

ALLOWED_METRICS = {"weight", "steps", "sleep_hours", "heart_rate", "workout_minutes"}


@router.post("/log", status_code=201)
async def log_health_metric(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    """Apple Health などのデータを health_logs テーブルに保存する。"""
    metric = payload.get("metric", "")
    if metric not in ALLOWED_METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric: {metric}")

    value = float(payload.get("value", 0))
    unit = payload.get("unit")
    recorded_at_str = payload.get("recorded_at")
    try:
        recorded_at = datetime.fromisoformat(recorded_at_str) if recorded_at_str else datetime.now(timezone.utc)
    except (ValueError, TypeError):
        recorded_at = datetime.now(timezone.utc)

    date_str = recorded_at.strftime("%Y-%m-%d")

    supabase = get_supabase()
    result = supabase.table("health_logs").insert({
        "user_id": user_id,
        "metric": metric,
        "value": value,
        "unit": unit,
        "recorded_at": recorded_at.isoformat(),
    }).execute()

    return {
        "saved": True,
        "date": date_str,
        "metric": metric,
        "value": value,
        "unit": unit,
    }


@router.get("/logs")
async def get_health_logs(
    date: str | None = None,
    user_id: str = Depends(get_current_user),
):
    """健康データのログ一覧を取得する。date パラメータで日付フィルタ可能。"""
    supabase = get_supabase()
    query = supabase.table("health_logs").select("*").eq("user_id", user_id)
    if date:
        query = query.gte("recorded_at", f"{date}T00:00:00").lt("recorded_at", f"{date}T23:59:59")
    result = query.order("recorded_at", desc=True).limit(50).execute()
    return result.data
