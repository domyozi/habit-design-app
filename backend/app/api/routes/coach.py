"""
Phase 6.5: Coach Real backend
- GET  /api/ai/coach-context             → bundle 並列取得（FE MockCoachClient.getContext と同 shape）
- GET  /api/ai/coach-pending-actions     → pending 一覧
- PATCH /api/ai/coach-pending-actions/{id} → status 更新（accepted/rejected/expired）
- POST /api/ai/coach-stream              → SSE で coach 応答（次 step で実装）

Frontend の `MockCoachClient` を Real に切り替えても shape が一致するように構築する。
Mock 期に確定した型 (`frontend-v3/src/lib/coach/types.ts`) が backend 側のソース・オブ・トゥルース。
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.services import ai_service
from app.services.coach_extractor import (
    extract_json_block,
    filter_by_confidence,
    to_pending_action_rows,
)
from app.services.coach_prompts import build_coach_prompt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai")

PENDING_TTL_SEC = 24 * 3600
PENDING_KINDS = {
    "pt_update",
    "pt_close",
    "habit_today_complete",
    "memory_patch",
    "task",
    "habit",
    # Slice B: 既存 entity の編集提案
    "habit_update",
    "task_update",
    # Slice C: 削除提案（task のみ）
    "task_delete",
    # Slice D: 中長期 Goal の新規 / 編集
    "goal",
    "goal_update",
}
PENDING_STATUSES_RESOLVABLE = {"accepted", "rejected", "expired"}
WEEKDAYS_JA = ["月", "火", "水", "木", "金", "土", "日"]


# ─── ヘルパー ──────────────────────────────────────────────

def _resolve_tz(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _now_local_fields(tz: str) -> dict:
    zi = _resolve_tz(tz)
    now_local = datetime.now(zi)
    return {
        "today_date": now_local.strftime("%Y-%m-%d"),
        "today_weekday": WEEKDAYS_JA[now_local.weekday()],
        "local_time": now_local.strftime("%H:%M"),
        "user_timezone": str(zi),
    }


def _adapt_habit(
    h: dict,
    today_log: dict | None = None,
    goal_ids: list[str] | None = None,
) -> dict:
    """FE CoachHabitSnapshot と shape を揃える。

    Sprint 6.6: today_log を受け取り `today_completed` を埋める。
    `completed=true` を「ユーザーが今日マークした」と解釈（binary は user 操作、
    numeric/time は streak_service.is_achieved の結果が log.completed に入る）。

    Sprint today-display: 完了表示時に「実際に記録した値」を出すため、
    today_log の numeric_value / time_value も同梱する（reload 後も値が見える）。

    Sprint v4-prep: habit_goals (N:N) を反映した goal_ids 配列も同梱。
    coach prompt が「この habit はどの Goal に貢献しているか」を把握できるようにする。
    """
    return {
        "id": h.get("id"),
        "title": h.get("title", ""),
        "current_streak": h.get("current_streak", 0) or 0,
        "longest_streak": h.get("longest_streak"),
        "scheduled_time": h.get("scheduled_time"),
        "today_completed": bool(today_log and today_log.get("completed")),
        "today_numeric_value": today_log.get("numeric_value") if today_log else None,
        "today_time_value": today_log.get("time_value") if today_log else None,
        "target_value": h.get("target_value"),
        "unit": h.get("unit"),
        "metric_type": h.get("metric_type", "binary"),
        "goal_ids": goal_ids or [],
        # Sprint v5: KPI 統合 4 列 + 表示時間帯
        "aggregation_kind": h.get("aggregation_kind", "count"),
        "aggregation_period": h.get("aggregation_period", "daily"),
        "period_target": h.get("period_target"),
        "display_window": h.get("display_window", "anytime"),
    }


def _adapt_journal(j: dict) -> dict:
    """FE CoachJournalSnapshot と shape を揃える。"""
    content = j.get("content") or ""
    excerpt = " ".join(content.split())
    if len(excerpt) > 200:
        excerpt = excerpt[:200] + "…"
    return {
        "entry_type": j.get("entry_type", ""),
        "content_excerpt": excerpt,
        "entry_date": j.get("entry_date", ""),
        "created_at": j.get("created_at"),
    }


# Sprint G3-b: Goal + KPI を coach 文脈に渡す。
# KPI 進捗は monthly_logs から FE GoalKpiOverview と同じロジックで集計する。

def _kpi_period_window(freq: str, today_str: str) -> tuple[str, str]:
    """tracking_frequency に応じた from/to (両端含む) を返す。"""
    from datetime import date as _date
    today_d = _date.fromisoformat(today_str)
    if freq == "daily":
        return today_str, today_str
    if freq == "weekly":
        offset = today_d.weekday()  # Mon=0
        from_d = _date.fromordinal(today_d.toordinal() - offset)
        return from_d.isoformat(), today_str
    # monthly (default)
    return today_str[:8] + "01", today_str


def _count_kpi_progress(habit_ids: list[str], freq: str, monthly_logs: list[dict], today_str: str) -> int:
    if not habit_ids:
        return 0
    from_str, to_str = _kpi_period_window(freq, today_str)
    id_set = set(habit_ids)
    count = 0
    for log in monthly_logs:
        if not log.get("completed"):
            continue
        if log.get("habit_id") not in id_set:
            continue
        d = log.get("log_date")
        if not d:
            continue
        if from_str <= d <= to_str:
            count += 1
    return count


def _build_goals_with_kpis(
    goals_raw: list[dict],
    kpis_raw: list[dict],
    kpi_habits_raw: list[dict],
    monthly_logs: list[dict],
    today_str: str,
) -> list[dict]:
    """Goal 配列に配下 KPI（進捗付き）と KGI 計算済みフィールドを足して返す。"""
    from datetime import date as _date

    # kpi_id → habit_ids の map
    kpi_habit_map: dict[str, list[str]] = {}
    for kh in kpi_habits_raw:
        kid = kh.get("kpi_id")
        hid = kh.get("habit_id")
        if not kid or not hid:
            continue
        kpi_habit_map.setdefault(kid, []).append(hid)

    # goal_id → kpis の map
    kpis_by_goal: dict[str, list[dict]] = {}
    for k in kpis_raw:
        kpis_by_goal.setdefault(k["goal_id"], []).append(k)

    today_d = _date.fromisoformat(today_str)
    out: list[dict] = []
    for g in goals_raw:
        is_kgi = g.get("target_date") is not None
        days_remaining = None
        achievement_rate = None
        is_expired = False
        if is_kgi:
            try:
                td = _date.fromisoformat(g["target_date"])
                days_remaining = (td - today_d).days
                is_expired = days_remaining < 0
            except Exception:
                pass
            try:
                tv = g.get("target_value")
                cv = g.get("current_value")
                if tv and cv is not None and tv != 0:
                    achievement_rate = round(min(100.0, float(cv) / float(tv) * 100), 1)
            except Exception:
                pass

        adapted_kpis = []
        for k in kpis_by_goal.get(g["id"], []):
            hids = kpi_habit_map.get(k["id"], [])
            adapted_kpis.append({
                "id": k["id"],
                "title": k.get("title", ""),
                "metric_type": k.get("metric_type"),
                "tracking_frequency": k.get("tracking_frequency", "monthly"),
                "target_value": k.get("target_value"),
                "unit": k.get("unit"),
                "habit_ids": hids,
                "current_period_count": _count_kpi_progress(
                    hids, k.get("tracking_frequency", "monthly"), monthly_logs, today_str,
                ),
            })

        out.append({
            "id": g["id"],
            "title": g.get("title", ""),
            "description": g.get("description"),
            "is_kgi": is_kgi,
            "target_value": g.get("target_value"),
            "current_value": g.get("current_value"),
            "unit": g.get("unit"),
            "target_date": g.get("target_date"),
            "metric_type": g.get("metric_type"),
            "achievement_rate": achievement_rate,
            "days_remaining": days_remaining,
            "is_expired": is_expired,
            "kpis": adapted_kpis,
        })
    return out


def _detect_streak_alerts(habits: list[dict]) -> list[dict]:
    """current_streak=0 かつ scheduled_time あり habit を「3 日連続未達」と仮置き。
    Mock と同じ簡易ヒューリスティック。"""
    out = []
    for h in habits:
        if (h.get("current_streak") or 0) == 0 and h.get("scheduled_time"):
            out.append({
                "habit_id": h["id"],
                "title": h.get("title", ""),
                "days_missed": 3,
            })
            if len(out) >= 3:
                break
    return out


# ─── GET /coach-context ────────────────────────────────────

@router.get("/coach-context")
async def get_coach_context(
    tz: str = Query("UTC", description="IANA timezone, e.g. Asia/Tokyo"),
    user_id: str = Depends(get_current_user),
) -> dict:
    """
    coach prompt 組立に必要なデータを並列に取得して 1 つの bundle にまとめる。
    Frontend の MockCoachClient.getContext と互換 shape を返す。
    """
    supabase = get_supabase()

    def _fetch_pt():
        row = (
            supabase.table("primary_targets")
            .select("*")
            .eq("user_id", user_id)
            .order("set_date", desc=True)
            .limit(1)
            .execute()
        )
        if not row.data:
            return None
        d = row.data[0]
        return {
            "value": d.get("value"),
            "set_date": d.get("set_date"),
            "completed": d.get("completed", False),
        }

    def _fetch_habits():
        # Sprint 6.6: is_active=true でフィルタ。
        # 旧実装は削除済み habit (is_active=false) も coach に渡していて、
        # /api/habits 側のフィルタとズレて Today に余分に出る + delete 後に
        # PATCH /log を打つと 500 に至る不整合の元凶だった。
        row = (
            supabase.table("habits")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("display_order")
            .execute()
        )
        return row.data or []

    # Sprint 6.6: ローカル今日（tz 解決済）の habit_logs を一括取得
    today_local_str = _now_local_fields(tz)["today_date"]

    def _fetch_today_logs():
        row = (
            supabase.table("habit_logs")
            .select("habit_id, completed, numeric_value, time_value")
            .eq("user_id", user_id)
            .eq("log_date", today_local_str)
            .execute()
        )
        return row.data or []

    def _fetch_user_context():
        row = (
            supabase.table("user_context")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return row.data[0] if row.data else None

    def _fetch_journals():
        # MVP前パフォーマンス対応: 7 だとコーチが直近対話を覚えない問題があったため 30 に拡張。
        # _journals_section が prompt 側で更にスライスするので、ここは多めに取って柔軟性を持たせる。
        row = (
            supabase.table("journal_entries")
            .select("*")
            .eq("user_id", user_id)
            .order("entry_date", desc=True)
            .order("created_at", desc=True)
            .limit(30)
            .execute()
        )
        return row.data or []

    def _fetch_pending_suggestions():
        row = (
            supabase.table("habit_suggestions")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .execute()
        )
        return row.data or []

    # Sprint G3-b: Goals + KPI を coach 文脈に追加。
    # KPI 進捗は今月分の habit_logs から計算（FE GoalKpiOverview と同じロジックを backend にも）。
    def _fetch_goals():
        row = (
            supabase.table("goals")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("display_order")
            .execute()
        )
        return row.data or []

    def _fetch_kpis():
        # Sprint v4-prep P4-followup: migrated 済 KPI は milestone Goal として goals
        # テーブルに既に存在するので、coach の文脈に二重で含めないよう除外する。
        row = (
            supabase.table("kpis")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .is_("migrated_to_goal_id", "null")
            .order("display_order")
            .execute()
        )
        return row.data or []

    def _fetch_kpi_habits():
        row = (
            supabase.table("kpi_habits")
            .select("kpi_id, habit_id")
            .eq("user_id", user_id)
            .execute()
        )
        return row.data or []

    # Sprint v4-prep: habit_goals (N:N) を coach context に含める。
    # _adapt_habit で habit ごとの goal_ids 配列に展開する。
    def _fetch_habit_goals():
        row = (
            supabase.table("habit_goals")
            .select("habit_id, goal_id")
            .eq("user_id", user_id)
            .execute()
        )
        return row.data or []

    def _fetch_monthly_logs():
        # 月初〜今日の habit_logs（KPI 進捗集計用）。月単位 KPI までカバー。
        today_str = today_local_str
        month_start = today_str[:8] + "01"
        row = (
            supabase.table("habit_logs")
            .select("habit_id, log_date, completed")
            .eq("user_id", user_id)
            .gte("log_date", month_start)
            .lte("log_date", today_str)
            .execute()
        )
        return row.data or []

    def _fetch_pending_coach_actions():
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PENDING_TTL_SEC)).isoformat()
        row = (
            supabase.table("coach_pending_actions")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .gte("created_at", cutoff)
            .order("created_at", desc=True)
            .execute()
        )
        return row.data or []

    # Supabase Python SDK は同期なので run_in_executor で並列化。
    # 一括 try ではなく per-fetch でエラーを握って原因究明可能にする
    # （Sprint 6.5.2 の primary_target → primary_targets typo を silent
    # で握りつぶしてバグ特定に時間を使ったため）。
    loop = asyncio.get_running_loop()
    started = loop.time()

    async def _safe(label: str, fn):
        try:
            return await loop.run_in_executor(None, fn)
        except Exception as e:  # noqa: BLE001
            logger.warning("coach-context fetch failed [%s]: %s", label, e)
            return None

    (
        pt,
        habits_raw,
        ctx_raw,
        journals_raw,
        suggestions_raw,
        coach_actions_raw,
        today_logs_raw,
        goals_raw,
        kpis_raw,
        kpi_habits_raw,
        habit_goals_raw,
        monthly_logs_raw,
    ) = await asyncio.gather(
        _safe("primary_targets", _fetch_pt),
        _safe("habits", _fetch_habits),
        _safe("user_context", _fetch_user_context),
        _safe("journal_entries", _fetch_journals),
        _safe("habit_suggestions", _fetch_pending_suggestions),
        _safe("coach_pending_actions", _fetch_pending_coach_actions),
        _safe("habit_logs_today", _fetch_today_logs),
        _safe("goals", _fetch_goals),
        _safe("kpis", _fetch_kpis),
        _safe("kpi_habits", _fetch_kpi_habits),
        _safe("habit_goals", _fetch_habit_goals),
        _safe("habit_logs_month", _fetch_monthly_logs),
    )
    habits_raw = habits_raw or []
    journals_raw = journals_raw or []
    suggestions_raw = suggestions_raw or []
    coach_actions_raw = coach_actions_raw or []
    today_logs_raw = today_logs_raw or []
    goals_raw = goals_raw or []
    kpis_raw = kpis_raw or []
    kpi_habits_raw = kpi_habits_raw or []
    habit_goals_raw = habit_goals_raw or []
    monthly_logs_raw = monthly_logs_raw or []
    today_logs_map = {log["habit_id"]: log for log in today_logs_raw if log.get("habit_id")}
    # habit_id → goal_ids[] のマップを作成（_adapt_habit で参照）
    habit_goal_ids_map: dict[str, list[str]] = {}
    for row in habit_goals_raw:
        habit_goal_ids_map.setdefault(row["habit_id"], []).append(row["goal_id"])

    user_context = None
    if ctx_raw:
        user_context = {
            "identity": ctx_raw.get("identity"),
            "patterns": ctx_raw.get("patterns"),
            "values_keywords": ctx_raw.get("values_keywords"),
            "insights": ctx_raw.get("insights"),
            "goal_summary": ctx_raw.get("goal_summary"),
            # Phase 6.5.3: profile (JSONB) を coach に渡す
            "profile": ctx_raw.get("profile"),
        }

    habits = [
        _adapt_habit(h, today_logs_map.get(h["id"]), habit_goal_ids_map.get(h["id"], []))
        for h in habits_raw
    ]

    # Sprint G3-b: Goals + KPI を組み立てる。KPI 進捗は monthly_logs_raw から FE と同じロジックで集計。
    goals_with_kpis = _build_goals_with_kpis(
        goals_raw, kpis_raw, kpi_habits_raw, monthly_logs_raw, today_local_str,
    )

    bundle = {
        "primary_target": pt,
        "user_context": user_context,
        "habits": habits,
        "goals": goals_with_kpis,
        "recent_journals": [_adapt_journal(j) for j in journals_raw],
        "pending_suggestions": [
            {
                "id": s["id"],
                "label": s.get("label", ""),
                "kind": s.get("kind", "habit"),
                "source": s.get("source"),
            }
            for s in suggestions_raw
        ],
        "pending_coach_actions": coach_actions_raw,
        "today_calendar": {"items": [], "available": False},
        "signals": {"habit_streak_alerts": _detect_streak_alerts(habits)},
        "server_received_at": int((loop.time() - started) * 1000),
    }
    bundle.update(_now_local_fields(tz))
    return bundle


# ─── coach_pending_actions CRUD ────────────────────────────


@router.get("/coach-pending-actions")
async def list_pending_actions(
    status: Optional[str] = Query(None, description="pending/accepted/rejected/expired"),
    user_id: str = Depends(get_current_user),
) -> list[dict]:
    """coach_pending_actions の自分の行を返す。デフォルトは全 status。"""
    supabase = get_supabase()
    q = (
        supabase.table("coach_pending_actions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(100)
    )
    if status:
        q = q.eq("status", status)
    return q.execute().data or []


class PendingActionPatch(BaseModel):
    status: Optional[str] = None  # 'accepted' | 'rejected' | 'expired'
    source_journal_id: Optional[str] = None


@router.patch("/coach-pending-actions/{action_id}")
async def update_pending_action(
    action_id: str,
    patch: PendingActionPatch,
    user_id: str = Depends(get_current_user),
) -> dict:
    """ActionCard の accept/reject / 自動 expire / source 紐づけで呼ばれる。"""
    if patch.status is None and patch.source_journal_id is None:
        raise HTTPException(status_code=422, detail="status or source_journal_id is required")
    if patch.status is not None and patch.status not in PENDING_STATUSES_RESOLVABLE:
        raise HTTPException(status_code=422, detail=f"Invalid status: {patch.status}")
    supabase = get_supabase()
    # Slice A: source_journal_id を patch する場合は当該 journal の owner 確認。
    if patch.source_journal_id is not None:
        _ensure_owned_journal(supabase, patch.source_journal_id, user_id)
    # Slice A: accepted へ遷移する時は payload 内 entity ID の owner も確認する。
    # 受理 = 下流 apply への "GO" サインなので、ここで弾けば壊れた payload を持つ
    # 行が accepted で残らない。
    if patch.status == "accepted":
        target = (
            supabase.table("coach_pending_actions")
            .select("kind, payload")
            .eq("id", action_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not target.data:
            raise HTTPException(status_code=404, detail="not found")
        row = target.data[0]
        _ensure_payload_owner(supabase, row.get("kind") or "", row.get("payload") or {}, user_id)
    update_data = {}
    if patch.status is not None:
        update_data["status"] = patch.status
        update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
    if patch.source_journal_id is not None:
        update_data["source_journal_id"] = patch.source_journal_id
    # 自分の行のみ更新（RLS で防御されているが念のため eq でも絞る）
    res = (
        supabase.table("coach_pending_actions")
        .update(update_data)
        .eq("id", action_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="not found")
    return res.data[0]


class PendingActionCreate(BaseModel):
    kind: str
    payload: dict
    confidence: float
    source_journal_id: Optional[str] = None


@router.post("/coach-pending-actions", status_code=201)
async def create_pending_action(
    body: PendingActionCreate,
    user_id: str = Depends(get_current_user),
) -> dict:
    """coach stream が抽出した action を pending として保存する。
    /coach-stream 側でも内部的に呼ぶが、外部からも投入できる。"""
    if body.kind not in PENDING_KINDS:
        raise HTTPException(status_code=422, detail=f"Invalid kind: {body.kind}")
    if not 0.0 <= body.confidence <= 1.0:
        raise HTTPException(status_code=422, detail="confidence must be 0.0-1.0")
    supabase = get_supabase()
    # Slice A: source_journal_id と payload 内 entity ID の owner 検証
    if body.source_journal_id:
        _ensure_owned_journal(supabase, body.source_journal_id, user_id)
    _ensure_payload_owner(supabase, body.kind, body.payload, user_id)
    # Slice D: Goal 新規 / 編集で親 Goal を指定するなら親も owner であること
    if body.kind in ("goal", "goal_update"):
        _ensure_owned_goal_parent(supabase, body.payload, user_id)
    res = (
        supabase.table("coach_pending_actions")
        .insert({
            "user_id": user_id,
            "kind": body.kind,
            "payload": body.payload,
            "confidence": body.confidence,
            "source_journal_id": body.source_journal_id,
            "status": "pending",
        })
        .execute()
    )
    return res.data[0] if res.data else {}


# ─── POST /coach-stream (SSE) ──────────────────────────────


# ─── Owner-check helpers (Slice A defense-in-depth) ───────────
#
# pending_action 周辺の write 経路で、
#  - source_journal_id が当該 user の journal を指しているか
#  - payload 内の habit_id / task_id 等が当該 user のものか
# を validate するための薄いヘルパ。
#
# 既存の RLS と各 apply endpoint の owner check で実害は抑えられているが、
# 将来 backend 側で payload を直接 apply するハンドラを足したときに trust
# boundary が崩れないよう "validate-before-write" を pending_action 入口で
# も効かせる。新しい kind を Slice B 以降で増やすときも、_PAYLOAD_OWNER_CHECKS
# に 1 行追記すれば自動で防御が効く設計。


def _ensure_owned_journal(supabase, journal_id: str, user_id: str) -> None:
    """source_journal_id が当該 user のものか確認する。違えば 404。"""
    res = (
        supabase.table("journal_entries")
        .select("id")
        .eq("id", journal_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="journal not found")


# kind → (payload key, table name, owner column) の dispatch。
# memory_patch / pt_* / 新規 (task / habit) は対象 entity が「これから作るもの」
# なので owner check 不要。既存 entity を指す kind だけ列挙する。
_PAYLOAD_OWNER_CHECKS: dict[str, tuple[str, str, str]] = {
    "habit_today_complete": ("habit_id", "habits", "id"),
    # Slice B: 既存 entity の編集提案。AI が指す ID が当該 user のものか確認する。
    "habit_update": ("habit_id", "habits", "id"),
    "task_update": ("task_id", "tasks", "id"),
    # Slice C: 削除提案
    "task_delete": ("task_id", "tasks", "id"),
    # Slice D: 既存 Goal 編集提案。AI が指す goal_id が当該 user のものか確認する。
    # 新規 Goal (kind="goal") は対象 entity が「これから作る」なので owner check 対象外
    # （ただし parent_goal_id が含まれる場合は別途 _ensure_owned_goal_parent で確認）。
    "goal_update": ("goal_id", "goals", "id"),
}


def _payload_owner_ok(supabase, kind: str, payload: dict, user_id: str) -> bool:
    """raise しない版。_persist_pending_actions の batch loop 用。"""
    spec = _PAYLOAD_OWNER_CHECKS.get(kind)
    if spec is None:
        return True
    payload_key, table, col = spec
    if not isinstance(payload, dict):
        return False
    target_id = payload.get(payload_key)
    if not target_id:
        # ID 未指定の場合は下流の apply endpoint で弾かれる。ここでは通す。
        return True
    try:
        res = (
            supabase.table(table)
            .select(col)
            .eq(col, target_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("payload owner check failed kind=%s id=%s: %s", kind, target_id, e)
        return False
    return bool(res.data)


def _ensure_payload_owner(supabase, kind: str, payload: dict, user_id: str) -> None:
    """raise する版。create / update endpoint 用。違反すれば 403。"""
    if not _payload_owner_ok(supabase, kind, payload, user_id):
        spec = _PAYLOAD_OWNER_CHECKS.get(kind)
        table = spec[1] if spec else "entity"
        raise HTTPException(status_code=403, detail=f"{table} not owned")


def _ensure_owned_goal_parent(supabase, payload: object, user_id: str) -> None:
    """Slice D: goal / goal_update の payload に parent_goal_id が含まれている場合、
    その親 Goal が当該 user のものか確認する。違反すれば 403。
    (kind 主 entity の owner check は _PAYLOAD_OWNER_CHECKS が担うので、ここは
    あくまで親側の追加チェック。)"""
    if not isinstance(payload, dict):
        return
    parent_id = payload.get("parent_goal_id")
    if not parent_id or not isinstance(parent_id, str):
        return
    res = (
        supabase.table("goals")
        .select("id")
        .eq("id", parent_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=403, detail="parent goal not owned")


def _filter_completed_habit_actions(filtered: dict, ctx: dict) -> dict:
    done_habit_ids = {
        h.get("id")
        for h in (ctx.get("habits") or [])
        if h.get("id") and h.get("today_completed")
    }
    if not done_habit_ids or not filtered.get("habit_today_completes"):
        return filtered
    kept = [
        c for c in (filtered.get("habit_today_completes") or [])
        if c.get("habit_id") not in done_habit_ids
    ]
    next_filtered = {**filtered}
    if kept:
        next_filtered["habit_today_completes"] = kept
    else:
        next_filtered.pop("habit_today_completes", None)
    return next_filtered


def _persist_pending_actions(user_id: str, filtered: dict, ctx: dict) -> None:
    """filter_by_confidence 済 payload から pending actions を DB に書き込む。
    重複は気にせず追加のみ（FE 側 dedupe ロジックは markPendingActionResolved で）。"""
    rows = to_pending_action_rows(_filter_completed_habit_actions(filtered, ctx))
    if not rows:
        return
    supabase = get_supabase()
    for r in rows:
        # Slice A: AI 出力の payload に他人の entity id が紛れていたら skip する。
        # 通常は ctx に基づく ID なので発生しないが、prompt 注入対策として念のため。
        if not _payload_owner_ok(supabase, r["kind"], r["payload"], user_id):
            logger.warning(
                "coach_pending_actions skip kind=%s: payload references non-owned entity",
                r["kind"],
            )
            continue
        try:
            supabase.table("coach_pending_actions").insert({
                "user_id": user_id,
                "kind": r["kind"],
                "payload": r["payload"],
                "confidence": r["confidence"],
                "status": "pending",
            }).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning("coach_pending_actions insert failed kind=%s: %s", r["kind"], e)


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


# Sprint flow-image: Flow composer から流れてくる画像 payload を validate して
# Anthropic vision に渡せる shape に整える。MVP 仕様で永続化はしない。
_ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_IMAGES = 4
_MAX_IMAGE_BASE64_LEN = 8 * 1024 * 1024  # base64 文字列長上限。decode 後で約 6MB 相当。


def _sanitize_coach_images(raw: object) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw[:_MAX_IMAGES]:
        if not isinstance(item, dict):
            continue
        media_type = item.get("media_type")
        data = item.get("data")
        if not isinstance(media_type, str) or media_type not in _ALLOWED_IMAGE_MIMES:
            continue
        if not isinstance(data, str) or not data:
            continue
        if len(data) > _MAX_IMAGE_BASE64_LEN:
            logger.warning("coach-stream: image dropped (too large len=%d)", len(data))
            continue
        out.append({"media_type": media_type, "data": data})
    return out


@router.post("/coach-stream")
async def coach_stream(
    request: Request,
    user_id: str = Depends(get_current_user),
):
    """SSE で AI 応答を text_chunk → actions → done の順に返す。

    Body:
      {
        "mode": "DECLARE" | "REFLECT" | "BRAINSTORM" | "PLAN" | "BRIEFING",
        "user_input": "...",
        "history": [{role, content}, ...],
        "tz": "Asia/Tokyo"
      }
    """
    body = await request.json()
    mode = body.get("mode") or "DECLARE"
    user_input = body.get("user_input") or ""
    history = body.get("history") or []
    tz = body.get("tz") or "UTC"
    # Sprint flow-image: Flow から添付された画像（base64）。最大 4 枚まで取り込み、
    # 末尾 user message に inline image block として添える。
    raw_images = body.get("images") or []
    images = _sanitize_coach_images(raw_images)

    # context 取得（同関数を内部利用）
    try:
        ctx = await get_coach_context(tz=tz, user_id=user_id)
    except Exception as e:
        logger.error("coach-stream: context load failed: %s", e)

        async def err_gen():
            yield _sse({"type": "error", "code": "CONTEXT_LOAD_FAILED", "message": str(e)})

        return StreamingResponse(err_gen(), media_type="text/event-stream")

    system_prompt, user_prompt = build_coach_prompt(ctx, mode, user_input)

    # 観測性: <user_memory> セクションだけを抜き出してログ。AI に届いた memory が
    # どう embed されているかを後追い検証できるようにする（Sprint 6.5.3-fix2）。
    # production では PII（identity / patterns / profile / insights）が含まれるため
    # debug レベルに下げる。dev 開発ではそのまま見える。
    import re

    mem_match = re.search(r"<user_memory>(.*?)</user_memory>", system_prompt, re.DOTALL)
    if mem_match:
        logger.debug("coach-stream user_memory:\n%s", mem_match.group(0))
    # メタ情報のみは production でも残す（PII 無し、運用に必要）
    logger.info(
        "coach-stream mode=%s user_input_len=%d system_prompt_len=%d images_count=%d",
        mode, len(user_input), len(system_prompt), len(images),
    )

    # message history（FE 側で history を渡してきた場合）
    messages: list[dict] = []
    if isinstance(history, list):
        for h in history:
            if isinstance(h, dict) and h.get("role") in ("user", "assistant"):
                messages.append({"role": h["role"], "content": str(h.get("content") or "")})

    # 末尾 user message: 画像があれば content を block list 化して vision に流す。
    # Sprint flow-image: history は text-only のまま、画像は今回 turn にだけ inline で添付。
    if images:
        content_blocks: list[dict] = []
        for img in images:
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img["media_type"],
                    "data": img["data"],
                },
            })
        content_blocks.append({"type": "text", "text": user_prompt})
        messages.append({"role": "user", "content": content_blocks})
    else:
        messages.append({"role": "user", "content": user_prompt})

    started_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    async def generate():
        # meta
        yield _sse({
            "type": "meta",
            "tracing_id": f"real-{started_ms}",
            "mode": mode,
            "model": "claude-sonnet-4-6",
            "server_received_at": started_ms,
        })
        # thinking trace
        for step in ("memory_loaded", "habits_loaded", "calendar_loaded", "composing"):
            yield _sse({"type": "thinking_trace", "step": step})

        accumulated = ""
        try:
            # stream_message_events は text と web_search_started を流す。
            # web 検索が始まったら frontend へ thinking_trace を emit して、
            # ThinkingTrace UI が「Web 検索中」シマーを表示できるようにする。
            async for ev in ai_service.stream_message_events(
                messages=messages,
                user_id=user_id,
                feature="coach_stream",
                system_prompt=system_prompt,
                # JSON action 出力で 1024 だと途中で切れて extract 失敗 → memory 更新が
                # silent に失われる現象が観測されたため引き上げ（Sprint 6.5.3-fix2）。
                max_tokens=2048,
                # Haiku は OUTPUT_CONTRACT の遵守が弱く、テキスト質問返しに固執して
                # memory_patch JSON を emit しない振る舞いが頻発したため Sonnet 4.6 を使う。
                model="claude-sonnet-4-6",
                # Sprint 6.5.4: web_search 有効化。
                # Coach がユーザーから「調べて」と頼まれた時、サーバ側でリアル検索を
                # 行ってその結果を踏まえた応答を返せる。「調べる task」を新規作成して
                # ユーザーに自分で検索させるパターンを廃止する。
                tools=[{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                }],
            ):
                if ev.get("type") == "text":
                    chunk = ev.get("content", "")
                    accumulated += chunk
                    yield _sse({"type": "text_chunk", "content": chunk})
                elif ev.get("type") == "web_search_started":
                    payload: dict = {"type": "thinking_trace", "step": "web_searching"}
                    q = ev.get("query")
                    if q:
                        payload["query"] = q
                    yield _sse(payload)
        except ai_service.AIUnavailableError as e:
            logger.error("coach-stream: claude unavailable: %s", e)
            yield _sse({"type": "error", "code": "STREAM_FAILED", "message": str(e)})
            return
        except Exception as e:  # noqa: BLE001
            logger.error("coach-stream: unexpected error: %s", e)
            yield _sse({"type": "error", "code": "STREAM_FAILED", "message": str(e)})
            return

        # 末尾 JSON fence 抽出 → confidence フィルタ → 保存
        parsed = extract_json_block(accumulated)
        # 観測性: AI が JSON を出したか / 出した場合 keys は何か / 出さなかった場合
        # accumulated 末尾 300 文字をログ（Sprint 6.5.3-fix2）。
        if parsed:
            logger.info(
                "coach-stream JSON emitted keys=%s accumulated_len=%d",
                list(parsed.keys()), len(accumulated),
            )
        else:
            tail = accumulated[-300:] if len(accumulated) > 300 else accumulated
            logger.info(
                "coach-stream NO_JSON accumulated_len=%d tail=%r",
                len(accumulated), tail,
            )
        if parsed:
            filtered = filter_by_confidence(parsed)
            if filtered:
                filtered = _filter_completed_habit_actions(filtered, ctx)
                if filtered:
                    _persist_pending_actions(user_id, filtered, ctx)
                    yield _sse({"type": "actions", "payload": filtered})

        yield _sse({"type": "done"})

    return StreamingResponse(generate(), media_type="text/event-stream")
