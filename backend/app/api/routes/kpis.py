"""
KPI CRUD + KPIログ upsert + グラフ集計 API
TASK-0031: kpis.py KPI CRUD + KPIログupsert API実装
TASK-0032: KPIグラフデータ集計API実装

【エンドポイント】:
  POST   /api/kpis                      - KPI 作成
  GET    /api/kpis?goal_id={id}         - KGI に紐付く KPI 一覧取得
  GET    /api/kpis/today                - 今日の KPI 一覧（記録状況付き）
  PUT    /api/kpis/{id}/logs            - KPI ログ upsert（手動入力）
  GET    /api/kpis/{id}/logs            - KPI ログ集計（グラフ用）
  POST   /api/kpis/{id}/habits          - KPI 習慣連結（全上書き）
  DELETE /api/kpis/{id}                 - KPI 削除（soft delete）

🔵 信頼性レベル: REQ-KPI-001〜007・REQ-LOG-001〜005・api-endpoints.md より
"""
from datetime import date, timedelta
from statistics import mean
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    KpiChartDataPoint,
    KpiChartResponse,
    KpiChartSummary,
    KpiCreate,
    KpiLogResponse,
    KpiLogUpsert,
    KpiResponse,
    KpiWithTodayStatus,
    LinkKpiHabitsRequest,
)

router = APIRouter()


@router.post("/kpis")
async def create_kpi(
    request: KpiCreate,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /kpis】: KPI を作成する
    goal_id の Goal が KGI として設定済み（target_date あり）であることが前提
    🔵 信頼性レベル: REQ-KPI-001 より
    """
    supabase = get_supabase()

    # Goal が KGI かを確認
    goal = (
        supabase.table("goals")
        .select("target_date")
        .eq("id", request.goal_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not goal.data or not goal.data.get("target_date"):
        raise HTTPException(
            status_code=422,
            detail="指定した Goal は KGI として設定されていません",
        )

    data = {**request.model_dump(), "user_id": user_id}
    result = supabase.table("kpis").insert(data).execute()

    kpi = KpiResponse(**result.data[0], habit_ids=[])
    return JSONResponse(
        content=APIResponse(success=True, data=kpi).model_dump(mode="json"),
    )


@router.get("/kpis/today")
async def get_today_kpis(
    user_id: str = Depends(get_current_user),
):
    """
    【GET /kpis/today】: 今日の KPI 一覧を記録状況付きで返す
    🔵 信頼性レベル: REQ-DASH-002 より
    """
    supabase = get_supabase()
    today = str(date.today())

    # アクティブな KPI 取得
    kpis_result = (
        supabase.table("kpis")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )

    result = []
    for kpi in kpis_result.data:
        # 今日のログ取得
        log_result = (
            supabase.table("kpi_logs")
            .select("*")
            .eq("kpi_id", kpi["id"])
            .eq("log_date", today)
            .single()
            .execute()
        )
        today_log = log_result.data

        # 紐付き習慣取得
        habits_result = (
            supabase.table("kpi_habits")
            .select("habit_id")
            .eq("kpi_id", kpi["id"])
            .execute()
        )
        habit_ids = [h["habit_id"] for h in habits_result.data]

        # 今日完了判定
        if kpi["metric_type"] == "binary":
            today_completed = today_log is not None and today_log.get("value") == 1.0
        else:
            today_completed = today_log is not None

        result.append(
            KpiWithTodayStatus(
                **kpi,
                habit_ids=habit_ids,
                today_completed=today_completed,
                today_value=today_log.get("value") if today_log else None,
                connected_habits=[],
            )
        )

    return JSONResponse(
        content=APIResponse(success=True, data=result).model_dump(mode="json"),
    )


@router.get("/kpis")
async def get_kpis(
    goal_id: str = Query(...),
    user_id: str = Depends(get_current_user),
):
    """
    【GET /kpis?goal_id={id}】: KGI に紐付く KPI 一覧取得
    🔵 信頼性レベル: REQ-KPI-001・api-endpoints.md より
    """
    supabase = get_supabase()

    kpis_result = (
        supabase.table("kpis")
        .select("*")
        .eq("user_id", user_id)
        .eq("goal_id", goal_id)
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )

    kpis = []
    for kpi in kpis_result.data:
        habits_result = (
            supabase.table("kpi_habits")
            .select("habit_id")
            .eq("kpi_id", kpi["id"])
            .execute()
        )
        habit_ids = [h["habit_id"] for h in habits_result.data]
        kpis.append(KpiResponse(**kpi, habit_ids=habit_ids))

    return JSONResponse(
        content=APIResponse(success=True, data=kpis).model_dump(mode="json"),
    )


@router.put("/kpis/{kpi_id}/logs")
async def upsert_kpi_log(
    kpi_id: str,
    request: KpiLogUpsert,
    user_id: str = Depends(get_current_user),
):
    """
    【PUT /kpis/{kpi_id}/logs】: KPI ログを upsert する
    同日に記録済みの場合は上書き（UNIQUE constraint on kpi_id, log_date）
    🔵 信頼性レベル: REQ-LOG-002・EDGE-KPI-007 より
    """
    supabase = get_supabase()

    # KPI の metric_type を取得してバリデーション
    kpi_result = (
        supabase.table("kpis")
        .select("metric_type")
        .eq("id", kpi_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not kpi_result.data:
        raise HTTPException(status_code=404, detail="KPI not found")

    metric_type = kpi_result.data["metric_type"]
    value = request.value

    if metric_type == "percentage" and not (0 <= value <= 100):
        raise HTTPException(
            status_code=422,
            detail="percentage 型の値は 0〜100 の範囲で入力してください",
        )
    if metric_type == "binary" and value not in [0.0, 1.0]:
        raise HTTPException(
            status_code=422,
            detail="binary 型の値は 0.0（未達成）または 1.0（達成）のみ有効です",
        )

    data = {
        "kpi_id": kpi_id,
        "user_id": user_id,
        "log_date": str(request.log_date),
        "value": value,
        "input_method": request.input_method or "manual",
        "note": request.note,
    }

    result = supabase.table("kpi_logs").upsert(data, on_conflict="kpi_id,log_date").execute()
    log = KpiLogResponse(**result.data[0])
    return JSONResponse(
        content=APIResponse(success=True, data=log).model_dump(mode="json"),
    )


@router.post("/kpis/{kpi_id}/habits")
async def link_kpi_habits(
    kpi_id: str,
    request: LinkKpiHabitsRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /kpis/{kpi_id}/habits】: KPI に習慣を連結する（全上書き方式）
    🔵 信頼性レベル: REQ-KPI-006・REQ-KPI-007 より
    """
    supabase = get_supabase()

    # 既存の連結を全削除
    supabase.table("kpi_habits").delete().eq("kpi_id", kpi_id).eq("user_id", user_id).execute()

    # 新しい連結を挿入
    if request.habit_ids:
        rows = [{"kpi_id": kpi_id, "habit_id": hid, "user_id": user_id} for hid in request.habit_ids]
        supabase.table("kpi_habits").insert(rows).execute()

    return JSONResponse(
        content=APIResponse(
            success=True,
            data={"kpi_id": kpi_id, "habit_ids": request.habit_ids},
        ).model_dump(mode="json"),
    )


@router.delete("/kpis/{kpi_id}")
async def delete_kpi(
    kpi_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    【DELETE /kpis/{kpi_id}】: KPI を soft delete する（is_active=false）
    🔵 信頼性レベル: REQ-KPI-005 より
    """
    supabase = get_supabase()

    result = (
        supabase.table("kpis")
        .update({"is_active": False})
        .eq("id", kpi_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="KPI not found")

    return JSONResponse(
        content=APIResponse(success=True, data={"kpi_id": kpi_id}).model_dump(mode="json"),
    )


# ─────────────────────────────────────────────
# ヘルパー関数（グラフ集計用）
# ─────────────────────────────────────────────

def _parse_range_to_start_date(range_str: str, today: date) -> date:
    """'30d', '12w', '6m' などの range 文字列を開始日に変換"""
    if range_str.endswith("d"):
        return today - timedelta(days=int(range_str[:-1]))
    elif range_str.endswith("w"):
        return today - timedelta(weeks=int(range_str[:-1]))
    elif range_str.endswith("m"):
        return today - timedelta(days=int(range_str[:-1]) * 30)
    return today - timedelta(days=30)


def _aggregate_daily(log_map: dict, start_date: date, today: date) -> list[KpiChartDataPoint]:
    """日次: start_date から today まで各日の値（記録なしは None）"""
    points = []
    current = start_date
    while current <= today:
        key = str(current)
        points.append(KpiChartDataPoint(date=key, value=log_map.get(key)))
        current += timedelta(days=1)
    return points


def _aggregate_weekly(log_map: dict, start_date: date, today: date) -> list[KpiChartDataPoint]:
    """週次: 週の月曜日を基準に週内の平均値を返す"""
    # 開始日を直近の月曜に正規化
    start_monday = start_date - timedelta(days=start_date.weekday())
    points = []
    current = start_monday
    while current <= today:
        week_values = []
        for i in range(7):
            day = current + timedelta(days=i)
            v = log_map.get(str(day))
            if v is not None:
                week_values.append(v)
        avg = round(mean(week_values), 2) if week_values else None
        points.append(KpiChartDataPoint(date=str(current), value=avg))
        current += timedelta(weeks=1)
    return points


def _aggregate_monthly(log_map: dict, start_date: date, today: date) -> list[KpiChartDataPoint]:
    """月次: 月の1日を基準に月内の平均値を返す"""
    # 開始月を算出
    year, month = start_date.year, start_date.month
    points = []
    while date(year, month, 1) <= today:
        # 月内の全日を集計
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        month_values = []
        current = date(year, month, 1)
        while current < next_month and current <= today:
            v = log_map.get(str(current))
            if v is not None:
                month_values.append(v)
            current += timedelta(days=1)
        avg = round(mean(month_values), 2) if month_values else None
        points.append(KpiChartDataPoint(date=f"{year:04d}-{month:02d}", value=avg))
        # 次の月へ
        month += 1
        if month > 12:
            month = 1
            year += 1
    return points


@router.get("/kpis/{kpi_id}/logs")
async def get_kpi_logs_chart(
    kpi_id: str,
    granularity: Literal["daily", "weekly", "monthly"] = Query("daily"),
    range: str = Query("30d"),
    user_id: str = Depends(get_current_user),
):
    """
    【GET /kpis/{kpi_id}/logs】: KPI ログをグラフ用に集計して返す
    🔵 信頼性レベル: REQ-LOG-005・api-endpoints.md より
    """
    supabase = get_supabase()

    # KPI 取得（所有権確認）
    kpi_result = (
        supabase.table("kpis")
        .select("*")
        .eq("id", kpi_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not kpi_result.data:
        raise HTTPException(status_code=404, detail="KPI not found")

    today = date.today()
    start_date = _parse_range_to_start_date(range, today)

    # ログ取得
    logs_result = (
        supabase.table("kpi_logs")
        .select("log_date, value")
        .eq("kpi_id", kpi_id)
        .gte("log_date", str(start_date))
        .order("log_date")
        .execute()
    )
    log_map: dict[str, float] = {log["log_date"]: log["value"] for log in logs_result.data}

    # 粒度別に集計
    if granularity == "daily":
        data_points = _aggregate_daily(log_map, start_date, today)
    elif granularity == "weekly":
        data_points = _aggregate_weekly(log_map, start_date, today)
    else:
        data_points = _aggregate_monthly(log_map, start_date, today)

    # サマリー計算
    values = [dp.value for dp in data_points if dp.value is not None]
    summary = KpiChartSummary(
        avg=round(mean(values), 2) if values else None,
        max=max(values) if values else None,
        min=min(values) if values else None,
        latest_value=log_map.get(str(today)),
        target_value=kpi_result.data.get("target_value"),
    )

    chart = KpiChartResponse(
        kpi_id=kpi_id,
        granularity=granularity,
        data_points=data_points,
        summary=summary,
    )
    return JSONResponse(
        content=APIResponse(success=True, data=chart).model_dump(mode="json"),
    )
