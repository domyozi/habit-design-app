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
    AiHabitSuggestion,
    AiKpiSuggestion,
    APIResponse,
    KpiChartDataPoint,
    KpiChartResponse,
    KpiChartSummary,
    KpiCreate,
    KpiLogResponse,
    KpiLogUpsert,
    KpiResponse,
    KpiUpdate,
    KpiWithTodayStatus,
    LinkKpiHabitsRequest,
    SuggestHabitsRequest,
    SuggestKpisRequest,
)
from app.services import ai_service
import json
import re
import logging

_logger = logging.getLogger(__name__)

router = APIRouter()


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _get_owned_active_kpi_or_404(supabase, kpi_id: str, user_id: str) -> dict:
    result = (
        supabase.table("kpis")
        .select("*")
        .eq("id", kpi_id)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="KPI not found")
    return result.data


def _validate_owned_active_habit_ids(supabase, habit_ids: list[str], user_id: str) -> list[str]:
    unique_habit_ids = _dedupe_preserve_order(habit_ids)
    if not unique_habit_ids:
        return []

    result = (
        supabase.table("habits")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    owned_ids = {row["id"] for row in (result.data or [])}
    invalid_ids = [habit_id for habit_id in unique_habit_ids if habit_id not in owned_ids]
    if invalid_ids:
        raise HTTPException(status_code=422, detail="habit_ids contain unknown or unauthorized habits")
    return unique_habit_ids


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

    # Goal の所有権・存在チェック（KGI 化済みである必要は撤廃 — Sprint G1.5）
    # 元仕様 REQ-KPI-001 では target_date 必須だったが、Habit からの「月X回」
    # 軽量入力動線を成立させるため、KGI 化前でも KPI を作れるようにする。
    goal = (
        supabase.table("goals")
        .select("id")
        .eq("id", request.goal_id)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not goal.data:
        raise HTTPException(
            status_code=422,
            detail="指定した Goal が見つかりません",
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

    # アクティブな KPI 取得 (P4-followup: migrated 済は milestone Goal に移行済なので除外)
    kpis_result = (
        supabase.table("kpis")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .is_("migrated_to_goal_id", "null")
        .execute()
    )

    result = []
    for kpi in kpis_result.data:
        # 今日のログ取得
        log_result = (
            supabase.table("kpi_logs")
            .select("*")
            .eq("kpi_id", kpi["id"])
            .eq("user_id", user_id)
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
            .eq("user_id", user_id)
            .execute()
        )
        habit_ids = [h["habit_id"] for h in (habits_result.data or []) if h.get("habit_id")]

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

    # Sprint v4-prep P4-followup: migrated 済 KPI は milestone Goal として
    # goals テーブルに既に存在するので、レガシー UI で二重表示しないよう除外する。
    kpis_result = (
        supabase.table("kpis")
        .select("*")
        .eq("user_id", user_id)
        .eq("goal_id", goal_id)
        .eq("is_active", True)
        .is_("migrated_to_goal_id", "null")
        .order("display_order")
        .execute()
    )

    kpis = []
    for kpi in kpis_result.data:
        habits_result = (
            supabase.table("kpi_habits")
            .select("habit_id")
            .eq("kpi_id", kpi["id"])
            .eq("user_id", user_id)
            .execute()
        )
        habit_ids = [h["habit_id"] for h in (habits_result.data or []) if h.get("habit_id")]
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
    _get_owned_active_kpi_or_404(supabase, kpi_id, user_id)
    habit_ids = _validate_owned_active_habit_ids(supabase, request.habit_ids, user_id)

    # 既存の連結を全削除
    supabase.table("kpi_habits").delete().eq("kpi_id", kpi_id).eq("user_id", user_id).execute()

    # 新しい連結を挿入
    if habit_ids:
        rows = [{"kpi_id": kpi_id, "habit_id": hid, "user_id": user_id} for hid in habit_ids]
        supabase.table("kpi_habits").insert(rows).execute()

    return JSONResponse(
        content=APIResponse(
            success=True,
            data={"kpi_id": kpi_id, "habit_ids": habit_ids},
        ).model_dump(mode="json"),
    )


@router.patch("/kpis/{kpi_id}")
async def update_kpi(
    kpi_id: str,
    request: KpiUpdate,
    user_id: str = Depends(get_current_user),
):
    """
    【PATCH /kpis/{kpi_id}】Sprint G1: 個別 KPI を編集する。
    全フィールド optional。送られたフィールドだけ更新する。
    """
    supabase = get_supabase()
    _get_owned_active_kpi_or_404(supabase, kpi_id, user_id)

    update_data = request.model_dump(exclude_none=True)
    if not update_data:
        current = (
            supabase.table("kpis").select("*").eq("id", kpi_id).single().execute()
        )
        habits = (
            supabase.table("kpi_habits")
            .select("habit_id")
            .eq("kpi_id", kpi_id)
            .eq("user_id", user_id)
            .execute()
        )
        habit_ids = [h["habit_id"] for h in (habits.data or []) if h.get("habit_id")]
        return JSONResponse(
            content=APIResponse(
                success=True,
                data=KpiResponse(**current.data, habit_ids=habit_ids),
            ).model_dump(mode="json"),
        )

    # percentage 型の target_value 範囲チェック
    target_value = update_data.get("target_value")
    metric_type = update_data.get("metric_type")
    if target_value is not None and metric_type == "percentage":
        if not (0 <= target_value <= 100):
            raise HTTPException(
                status_code=422,
                detail="percentage 型の target_value は 0〜100 の範囲で入力してください",
            )

    result = (
        supabase.table("kpis")
        .update(update_data)
        .eq("id", kpi_id)
        .eq("user_id", user_id)
        .execute()
    )
    habits = (
        supabase.table("kpi_habits")
        .select("habit_id")
        .eq("kpi_id", kpi_id)
        .eq("user_id", user_id)
        .execute()
    )
    habit_ids = [h["habit_id"] for h in (habits.data or []) if h.get("habit_id")]
    return JSONResponse(
        content=APIResponse(
            success=True,
            data=KpiResponse(**result.data[0], habit_ids=habit_ids),
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
    if len(range_str) < 2:
        raise HTTPException(status_code=422, detail="Invalid range")

    unit = range_str[-1]
    try:
        amount = int(range_str[:-1])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid range") from exc

    max_values = {"d": 366, "w": 104, "m": 24}
    if unit not in max_values or amount < 1 or amount > max_values[unit]:
        raise HTTPException(status_code=422, detail="Invalid range")

    if unit == "d":
        return today - timedelta(days=amount)
    if unit == "w":
        return today - timedelta(weeks=amount)
    return today - timedelta(days=amount * 30)


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
        .eq("user_id", user_id)
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


# Sprint G3-a: AI による KPI 提案
# ────────────────────────────────────────────────────────────────────
# 既存 KPI と重複しない提案を 2〜4 件返す。既存 habit を活かす提案も歓迎。
# 出力 JSON のパースは緩め（ ```json ブロックや末尾の余計な説明文を許容）。

_SUGGEST_KPIS_SYSTEM_PROMPT = """あなたは長期目標達成のコーチです。
渡された Goal（KGI）を達成するための KPI を **2〜4 件** 提案してください。

# 出力形式（必須）
JSON 配列のみ。説明文は付けない。コードフェンスは使わない。
```
[
  {
    "title": "短い KPI 名（例: 月20回 瞑想）",
    "metric_type": "numeric" | "percentage" | "binary",
    "tracking_frequency": "daily" | "weekly" | "monthly",
    "target_value": number | null,
    "unit": "回" | "分" | "%" | など | null,
    "reason": "なぜこの KPI が Goal 達成に効くかの 1〜2 文",
    "link_habit_ids": ["habit_id 候補（既存習慣を活かす場合）"]
  }
]
```

# 守ること
- existing_kpis に既にあるものは提案しない（重複禁止）
- 既存 habit が活かせる場合は link_habit_ids に id を入れる（複数可）
- 新規習慣の提案も可（その場合 link_habit_ids は []）
- target_value は具体的な数値を入れる（binary なら null）
- 提案件数は最低 2、最多 4
- ユーザーの user_context（identity / values / patterns）を踏まえてパーソナライズ
"""


def _parse_kpi_suggestions(text: str) -> list[dict]:
    """LLM 出力から JSON 配列を取り出す。コードフェンス／前後余計テキストに耐える。"""
    # コードフェンスの中身があれば取る
    fence = re.search(r"```(?:json)?\s*([\[{][\s\S]*?[\]}])\s*```", text)
    if fence:
        candidate = fence.group(1)
    else:
        # 最初の [ ... ] を抽出
        m = re.search(r"\[[\s\S]*\]", text)
        if not m:
            return []
        candidate = m.group(0)
    try:
        data = json.loads(candidate)
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        _logger.warning("[suggest-kpis] JSON parse failed: %s | text=%s", e, text[:300])
        return []


@router.post("/ai/suggest-kpis")
async def suggest_kpis(
    request: SuggestKpisRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /ai/suggest-kpis】Sprint G3-a: 指定 Goal の KPI 候補を AI が提案。
    """
    supabase = get_supabase()

    # Goal 取得
    goal_result = (
        supabase.table("goals")
        .select("*")
        .eq("id", request.goal_id)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not goal_result.data:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal = goal_result.data

    # 既存 KPI（同 goal）— 重複防止のため AI に渡す
    existing_kpis_result = (
        supabase.table("kpis")
        .select("title, metric_type, tracking_frequency, target_value, unit")
        .eq("user_id", user_id)
        .eq("goal_id", request.goal_id)
        .eq("is_active", True)
        .execute()
    )
    existing_kpis = existing_kpis_result.data or []

    # ユーザーの既存 habits（紐付け候補）
    habits_result = (
        supabase.table("habits")
        .select("id, title, metric_type, scheduled_time, frequency")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )
    habits = habits_result.data or []
    habit_ids_set = {h["id"] for h in habits}

    # user_context（パーソナライズ用）
    ctx_result = (
        supabase.table("user_context")
        .select("identity, values_keywords, goal_summary, patterns, profile")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    ctx = ctx_result.data or {}

    # ユーザープロンプト構築
    parts: list[str] = []
    parts.append("# Goal\n")
    parts.append(f"- title: {goal.get('title')}")
    if goal.get("description"):
        parts.append(f"- description: {goal['description']}")
    if goal.get("target_value") is not None:
        unit = goal.get("unit") or ""
        parts.append(f"- target_value: {goal['target_value']}{unit}")
    if goal.get("target_date"):
        parts.append(f"- target_date: {goal['target_date']}")
    if goal.get("metric_type"):
        parts.append(f"- metric_type: {goal['metric_type']}")

    parts.append("\n# existing_kpis（重複禁止）")
    if existing_kpis:
        for k in existing_kpis:
            parts.append(
                f"- {k['title']} ({k.get('tracking_frequency')}, {k.get('metric_type')}, target={k.get('target_value')}{k.get('unit') or ''})"
            )
    else:
        parts.append("- (なし)")

    parts.append("\n# existing_habits（link_habit_ids 候補）")
    if habits:
        for h in habits:
            parts.append(
                f"- id={h['id']}, title=「{h['title']}」, metric={h.get('metric_type')}, time={h.get('scheduled_time') or '-'}"
            )
    else:
        parts.append("- (なし)")

    parts.append("\n# user_context")
    if ctx.get("identity"):
        parts.append(f"- identity: {ctx['identity']}")
    if ctx.get("goal_summary"):
        parts.append(f"- goal_summary: {ctx['goal_summary']}")
    vk = ctx.get("values_keywords")
    if isinstance(vk, list) and vk:
        parts.append(f"- values: {', '.join(vk[:8])}")
    pat = ctx.get("patterns")
    if isinstance(pat, list) and pat:
        parts.append(f"- patterns: {', '.join(pat[:5])}")

    user_prompt = "\n".join(parts)

    # LLM 呼び出し（分析系なので Sonnet を指定）
    try:
        text = await ai_service.create_message(
            messages=[{"role": "user", "content": user_prompt}],
            user_id=user_id,
            feature="kpi_suggest",
            system_prompt=_SUGGEST_KPIS_SYSTEM_PROMPT,
            max_tokens=2048,
            model="claude-sonnet-4-6",
        )
    except ai_service.AIUnavailableError as e:
        raise HTTPException(status_code=503, detail="AI service unavailable") from e

    raw = _parse_kpi_suggestions(text)

    # サニタイズ：link_habit_ids は user 所有のものだけ残す
    suggestions: list[AiKpiSuggestion] = []
    for s in raw:
        try:
            sanitized_link = [hid for hid in (s.get("link_habit_ids") or []) if hid in habit_ids_set]
            sug = AiKpiSuggestion(
                title=str(s.get("title", ""))[:200] or "提案 KPI",
                metric_type=s.get("metric_type") or "numeric",
                tracking_frequency=s.get("tracking_frequency") or "monthly",
                target_value=(
                    float(s["target_value"])
                    if s.get("target_value") is not None and s.get("target_value") != ""
                    else None
                ),
                unit=(str(s["unit"]) if s.get("unit") else None),
                reason=str(s.get("reason", ""))[:400],
                link_habit_ids=sanitized_link,
            )
            suggestions.append(sug)
        except Exception as e:
            _logger.warning("[suggest-kpis] item validation failed: %s | item=%s", e, s)
            continue

    return APIResponse(success=True, data=suggestions).model_dump(mode="json")


# ────────────────────────────────────────────────────────────────────
# AI 習慣提案: Goal 達成に貢献する習慣候補を 2〜4 件返す。
# /ai/suggest-kpis を雛形にして、出力 shape を Habit 用に差し替えただけ。
# DB 書き込みなし（採用時にフロントが POST /api/habits を叩く）。

_SUGGEST_HABITS_SYSTEM_PROMPT = """あなたは長期目標達成のコーチです。
渡された Goal を達成するために、ユーザーが日々取り組める **習慣 (Habit)** を **2〜4 件** 提案してください。

# 出力形式（必須）
JSON 配列のみ。説明文は付けない。コードフェンスは使わない。
```
[
  {
    "title": "短い習慣名（例: 朝 30 分のランニング）",
    "frequency": "daily" | "weekdays" | "weekends" | "custom",
    "metric_type": "binary" | "numeric_min" | "numeric_max" | "duration",
    "target_value": number | null,
    "unit": "回" | "分" | "km" | "kg" | "ページ" | "問" など | null,
    "scheduled_time": "HH:MM" | null,
    "reason": "なぜこの習慣が Goal 達成に効くかの 1〜2 文"
  }
]
```

# 守ること
- existing_habits に既にあるものは提案しない（重複禁止）
- frequency は基本 "daily"。週末だけ等の特殊例だけ "weekdays"/"weekends"/"custom"
- metric_type は次の 4 つから選ぶ:
  - "binary": やる/やらない だけ判定する習慣（target_value=null, unit=null）
  - "numeric_min": 「○○ 以上やる」（例: 5km 以上走る → target_value=5, unit="km"）
  - "numeric_max": 「○○ 以下に抑える」（例: スマホ 2 時間以下 → target_value=2, unit="時間"）
  - "duration": 所要時間で測る習慣（例: 30 分の瞑想 → target_value=30, unit="分"）
- range / time_before / time_after は今回は使わない
- scheduled_time は「朝 7:00 にやる」など時刻が明確なときだけ。曖昧なら null
- 提案件数は最低 2、最多 4
- ユーザーの user_context（identity / values / patterns）を踏まえてパーソナライズ
- 既存 KPI が参考データとして渡されるが、KPI 自体は習慣ではないので提案には含めない
"""


def _parse_habit_suggestions(text: str) -> list[dict]:
    """LLM 出力から JSON 配列を取り出す。コードフェンス／前後余計テキストに耐える。"""
    fence = re.search(r"```(?:json)?\s*([\[{][\s\S]*?[\]}])\s*```", text)
    if fence:
        candidate = fence.group(1)
    else:
        m = re.search(r"\[[\s\S]*\]", text)
        if not m:
            return []
        candidate = m.group(0)
    try:
        data = json.loads(candidate)
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        _logger.warning("[suggest-habits] JSON parse failed: %s | text=%s", e, text[:300])
        return []


@router.post("/ai/suggest-habits")
async def suggest_habits(
    request: SuggestHabitsRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /ai/suggest-habits】指定 Goal の達成に貢献する習慣候補を AI が提案。
    """
    supabase = get_supabase()

    # Goal 取得
    goal_result = (
        supabase.table("goals")
        .select("*")
        .eq("id", request.goal_id)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not goal_result.data:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal = goal_result.data

    # 既存 habits（重複防止のため AI に渡す）
    habits_result = (
        supabase.table("habits")
        .select("title, frequency, metric_type, scheduled_time, target_value, unit")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )
    existing_habits = habits_result.data or []

    # 既存 KPI（参考情報）
    existing_kpis_result = (
        supabase.table("kpis")
        .select("title, metric_type, tracking_frequency, target_value, unit")
        .eq("user_id", user_id)
        .eq("goal_id", request.goal_id)
        .eq("is_active", True)
        .execute()
    )
    existing_kpis = existing_kpis_result.data or []

    # user_context（パーソナライズ用）
    ctx_result = (
        supabase.table("user_context")
        .select("identity, values_keywords, goal_summary, patterns, profile")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    ctx = ctx_result.data or {}

    # ユーザープロンプト構築
    parts: list[str] = []
    parts.append("# Goal\n")
    parts.append(f"- title: {goal.get('title')}")
    if goal.get("description"):
        parts.append(f"- description: {goal['description']}")
    if goal.get("target_value") is not None:
        unit = goal.get("unit") or ""
        parts.append(f"- target_value: {goal['target_value']}{unit}")
    if goal.get("target_date"):
        parts.append(f"- target_date: {goal['target_date']}")
    if goal.get("metric_type"):
        parts.append(f"- metric_type: {goal['metric_type']}")

    parts.append("\n# existing_habits（重複禁止）")
    if existing_habits:
        for h in existing_habits:
            parts.append(
                f"- 「{h['title']}」 ({h.get('frequency')}, {h.get('metric_type')}, time={h.get('scheduled_time') or '-'}, target={h.get('target_value')}{h.get('unit') or ''})"
            )
    else:
        parts.append("- (なし)")

    parts.append("\n# existing_kpis（参考。これは習慣ではないので提案には含めない）")
    if existing_kpis:
        for k in existing_kpis:
            parts.append(
                f"- {k['title']} ({k.get('tracking_frequency')}, {k.get('metric_type')}, target={k.get('target_value')}{k.get('unit') or ''})"
            )
    else:
        parts.append("- (なし)")

    parts.append("\n# user_context")
    if ctx.get("identity"):
        parts.append(f"- identity: {ctx['identity']}")
    if ctx.get("goal_summary"):
        parts.append(f"- goal_summary: {ctx['goal_summary']}")
    vk = ctx.get("values_keywords")
    if isinstance(vk, list) and vk:
        parts.append(f"- values: {', '.join(vk[:8])}")
    pat = ctx.get("patterns")
    if isinstance(pat, list) and pat:
        parts.append(f"- patterns: {', '.join(pat[:5])}")

    # ユーザー指定（任意）。dry run 中の「こういう習慣が欲しい」を最優先で考慮させる。
    # system_prompt は変更しないので metric_type 4 種制限・重複防止は依然有効。
    extra = (request.user_prompt or "").strip()
    if extra:
        parts.append("\n# ユーザー指定（最優先で考慮）")
        parts.append(extra)

    user_prompt = "\n".join(parts)

    # LLM 呼び出し（分析系なので Sonnet を指定）
    try:
        text = await ai_service.create_message(
            messages=[{"role": "user", "content": user_prompt}],
            user_id=user_id,
            feature="habit_suggest",
            system_prompt=_SUGGEST_HABITS_SYSTEM_PROMPT,
            max_tokens=2048,
            model="claude-sonnet-4-6",
        )
    except ai_service.AIUnavailableError as e:
        raise HTTPException(status_code=503, detail="AI service unavailable") from e

    raw = _parse_habit_suggestions(text)

    suggestions: list[AiHabitSuggestion] = []
    for s in raw:
        try:
            sug = AiHabitSuggestion(
                title=str(s.get("title", ""))[:200] or "提案習慣",
                frequency=s.get("frequency") or "daily",
                metric_type=s.get("metric_type") or "binary",
                target_value=(
                    float(s["target_value"])
                    if s.get("target_value") is not None and s.get("target_value") != ""
                    else None
                ),
                unit=(str(s["unit"]) if s.get("unit") else None),
                scheduled_time=(str(s["scheduled_time"]) if s.get("scheduled_time") else None),
                reason=str(s.get("reason", ""))[:400],
            )
            suggestions.append(sug)
        except Exception as e:
            _logger.warning("[suggest-habits] item validation failed: %s | item=%s", e, s)
            continue

    return APIResponse(success=True, data=suggestions).model_dump(mode="json")
