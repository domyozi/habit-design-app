"""
外部連携（iOS Shortcuts / Apple Health）向け API

エンドポイント:
  POST /api/integrations/log          - 単一の健康データを記録（JWT or Shortcuts トークン）
  POST /api/integrations/batch        - 複数の健康データを一括記録（JWT or Shortcuts トークン）
  GET  /api/integrations/logs         - 健康データのログ一覧を取得（JWT）
  GET  /api/integrations/summary      - 各指標の最新値 + 週次データを取得（JWT）
  GET  /api/integrations/token        - Shortcuts 用トークンを取得（JWT）
  POST /api/integrations/token/regenerate - トークンを再生成（JWT）
"""
import hashlib
import logging
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import HealthMetricItem, HealthBatchRequest

logger = logging.getLogger(__name__)

# レート制限: 1時間あたり最大 120 リクエスト（iOS Shortcuts は1日1〜4回程度）
_INTEGRATIONS_RATE_LIMIT_MAX = 120
_INTEGRATIONS_RATE_LIMIT_WINDOW = 3600
_integrations_rate_buckets: dict[str, list[float]] = {}


def _enforce_integrations_rate_limit(key: str) -> None:
    now = time.monotonic()
    window_start = now - _INTEGRATIONS_RATE_LIMIT_WINDOW
    recent = [t for t in _integrations_rate_buckets.get(key, []) if t >= window_start]
    if len(recent) >= _INTEGRATIONS_RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests. Please retry later.")
    recent.append(now)
    _integrations_rate_buckets[key] = recent

router = APIRouter(prefix="/integrations")

ALLOWED_METRICS = {
    # 活動量
    "steps", "distance_walked", "active_calories", "resting_calories", "workout_minutes",
    # 心臓
    "heart_rate", "resting_heart_rate", "hrv",
    # 睡眠
    "sleep_hours",
    # 身体計測
    "weight", "bmi", "body_fat",
    # ウェルネス
    "blood_oxygen", "respiratory_rate", "mindful_minutes",
}


def _generate_shortcuts_token() -> str:
    return secrets.token_urlsafe(32)


def _hash_shortcuts_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _store_shortcuts_token_hash(user_id: str, token: str) -> None:
    supabase = get_supabase()
    supabase.table("user_profiles").update({
        "shortcuts_token_hash": _hash_shortcuts_token(token),
        "shortcuts_token": None,
    }).eq("id", user_id).execute()


def _migrate_legacy_shortcuts_token(user_id: str, token: str) -> None:
    try:
        _store_shortcuts_token_hash(user_id, token)
    except Exception:
        logger.exception("Failed to migrate legacy Shortcuts token")


def _get_user_by_shortcuts_token(token: str) -> Optional[str]:
    """Shortcuts トークンで user_id を取得する。DB上ではハッシュで照合する。"""
    supabase = get_supabase()
    token_hash = _hash_shortcuts_token(token)

    try:
        result = supabase.table("user_profiles").select("id").eq("shortcuts_token_hash", token_hash).single().execute()
        return result.data["id"] if result.data else None
    except Exception:
        pass

    try:
        result = supabase.table("user_profiles").select("id").eq("shortcuts_token", token).single().execute()
        if not result.data:
            return None
        user_id = result.data["id"]
        _migrate_legacy_shortcuts_token(user_id, token)
        return user_id
    except Exception:
        return None


async def _resolve_user(
    request: Request,
    x_shortcuts_token: Optional[str] = Header(default=None),
) -> str:
    """JWT または X-Shortcuts-Token ヘッダーからユーザーIDを解決する。"""
    if x_shortcuts_token:
        user_id = _get_user_by_shortcuts_token(x_shortcuts_token)
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid Shortcuts token")
        return user_id

    # JWT フォールバック
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    from app.core.security import verify_token
    token = auth_header.removeprefix("Bearer ").strip()
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id


def _insert_metric(user_id: str, metric: str, value: float, unit: Optional[str], recorded_at: datetime) -> dict:
    supabase = get_supabase()
    row = {
        "user_id": user_id,
        "metric": metric,
        "value": value,
        "unit": unit,
        "recorded_at": recorded_at.isoformat(),
    }
    result = supabase.table("health_logs").insert(row).execute()
    return result.data[0] if result.data else row


def _parse_recorded_at(recorded_at_str: Optional[str]) -> datetime:
    if not recorded_at_str:
        return datetime.now(timezone.utc)

    try:
        recorded_at = datetime.fromisoformat(recorded_at_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid recorded_at")

    if recorded_at.tzinfo is None:
        return recorded_at.replace(tzinfo=timezone.utc)
    return recorded_at


@router.post("/log", status_code=201)
async def log_health_metric(
    payload: HealthMetricItem,
    user_id: str = Depends(_resolve_user),
):
    """単一の健康データを記録する。JWT または X-Shortcuts-Token で認証。"""
    _enforce_integrations_rate_limit(user_id)
    if payload.metric not in ALLOWED_METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric: {payload.metric}. Allowed: {sorted(ALLOWED_METRICS)}")

    recorded_at = _parse_recorded_at(payload.recorded_at)

    _insert_metric(user_id, payload.metric, payload.value, payload.unit, recorded_at)

    return {"saved": True, "metric": payload.metric, "value": payload.value, "unit": payload.unit}


@router.post("/batch", status_code=201)
async def batch_log_health_metrics(
    body: HealthBatchRequest,
    user_id: str = Depends(_resolve_user),
):
    """複数の健康データを一括記録する。iOS Shortcuts から全指標を1回で送信するために使用。"""
    _enforce_integrations_rate_limit(user_id)
    saved = []
    errors = []

    for item in body.metrics:
        if item.metric not in ALLOWED_METRICS:
            errors.append({"metric": item.metric, "error": "unknown metric"})
            continue
        try:
            recorded_at = _parse_recorded_at(item.recorded_at)
            _insert_metric(user_id, item.metric, item.value, item.unit, recorded_at)
            saved.append(item.metric)
        except Exception:
            logger.exception("Failed to insert health metric")
            errors.append({"metric": item.metric, "error": "save_failed"})

    return {"saved_count": len(saved), "saved": saved, "errors": errors}


@router.get("/logs")
async def get_health_logs(
    date: Optional[str] = None,
    metric: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """健康データのログ一覧を取得する。"""
    supabase = get_supabase()
    query = supabase.table("health_logs").select("*").eq("user_id", user_id)
    if date:
        query = query.gte("recorded_at", f"{date}T00:00:00").lt("recorded_at", f"{date}T23:59:59")
    if metric:
        query = query.eq("metric", metric)
    result = query.order("recorded_at", desc=True).limit(200).execute()
    return result.data


@router.get("/summary")
async def get_health_summary(
    user_id: str = Depends(get_current_user),
):
    """各メトリクスの最新値 + 過去7日分の日別集計を返す。"""
    _enforce_integrations_rate_limit(user_id)
    supabase = get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    result = supabase.table("health_logs").select("*").eq("user_id", user_id).gte("recorded_at", since).order("recorded_at", desc=False).execute()
    logs = result.data or []

    # 最新値 per metric
    latest: dict = {}
    for log in reversed(logs):
        m = log["metric"]
        if m not in latest:
            latest[m] = {
                "value": float(log["value"]),
                "unit": log.get("unit"),
                "recorded_at": log["recorded_at"],
            }

    # 過去7日の日別平均 per metric
    from collections import defaultdict
    day_buckets: dict = defaultdict(lambda: defaultdict(list))
    for log in logs:
        day = log["recorded_at"][:10]  # YYYY-MM-DD
        day_buckets[log["metric"]][day].append(float(log["value"]))

    today = datetime.now(timezone.utc).date()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]

    weekly: dict = {}
    for metric in ALLOWED_METRICS:
        if metric in day_buckets or metric in latest:
            weekly[metric] = [
                {
                    "date": d,
                    "value": round(sum(day_buckets[metric][d]) / len(day_buckets[metric][d]), 1) if day_buckets[metric][d] else None,
                }
                for d in dates
            ]

    return {"latest": latest, "weekly": weekly}


@router.get("/token")
async def get_shortcuts_token(
    user_id: str = Depends(get_current_user),
):
    """ユーザーの Shortcuts 用トークン状態を取得する（なければ生成し、その場だけ返す）。"""
    supabase = get_supabase()
    result = supabase.table("user_profiles").select("shortcuts_token_hash,shortcuts_token").eq("id", user_id).single().execute()
    profile = result.data or {}

    token_hash = profile.get("shortcuts_token_hash")
    legacy_token = profile.get("shortcuts_token")

    if token_hash:
        return {"configured": True}

    if legacy_token:
        _migrate_legacy_shortcuts_token(user_id, str(legacy_token))
        return {"configured": True}

    new_token = _generate_shortcuts_token()
    _store_shortcuts_token_hash(user_id, new_token)
    return {"configured": True, "token": new_token}


@router.post("/token/regenerate")
async def regenerate_shortcuts_token(
    user_id: str = Depends(get_current_user),
):
    """Shortcuts 用トークンを再生成する。"""
    new_token = _generate_shortcuts_token()
    _store_shortcuts_token_hash(user_id, new_token)
    return {"configured": True, "token": new_token}
