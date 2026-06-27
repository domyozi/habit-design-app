"""
BODY タブ: 筋トレ・ランニング セッション記録 API
Sprint body-v1: workout_sessions / workout_exercises / workout_routines のCRUD

【エンドポイント】:
  POST   /api/workouts/sessions                  - セッション開始（201）
  PATCH  /api/workouts/sessions/{session_id}     - 進行中セッション更新
  POST   /api/workouts/sessions/{session_id}/finish - 完了 + habit_log upsert + streak/badge
  GET    /api/workouts/sessions                  - 履歴一覧（from/to/type フィルタ）
  GET    /api/workouts/sessions/{session_id}     - セッション詳細
  DELETE /api/workouts/sessions/{session_id}     - 削除（204、habit_log は SET NULL）
  GET    /api/workouts/routines                  - ルーティン一覧
  POST   /api/workouts/routines                  - ルーティン作成（201）
  PATCH  /api/workouts/routines/{routine_id}     - ルーティン更新
  DELETE /api/workouts/routines/{routine_id}     - ルーティン削除（204）
  POST   /api/workouts/bootstrap                 - 筋トレ/ランニング habit を冪等 pre-seed

【設計方針】:
- finish エンドポイントは workout_sessions の totals 計算 + habit_logs の upsert を
  単一処理として実行し、既存の streak/badge パイプラインを流用する。
- habit_id, habit_log_id は NULL 許容（ad-hoc セッション対応）。
- bootstrap は冪等。2 回叩いても重複しない。

🔵 信頼性レベル: plan use-the-claude-design-mcp-kind-dragonfly.md より
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    Habit,
    WorkoutBootstrapResponse,
    WorkoutExercise,
    WorkoutExerciseInput,
    WorkoutRoutine,
    WorkoutRoutineCreateRequest,
    WorkoutRoutineUpdateRequest,
    WorkoutSession,
    WorkoutSessionFinishRequest,
    WorkoutSessionStartRequest,
    WorkoutSessionType,
    WorkoutSessionUpdateRequest,
)
from app.services import badge_service, streak_service

router = APIRouter()


# --------------------------------------------------
# 内部ヘルパー
# --------------------------------------------------

def _get_session_or_raise(supabase, session_id: str, user_id: str) -> dict:
    """セッションを取得し、存在 / 所有権を確認する。"""
    result = (
        supabase.table("workout_sessions")
        .select("*")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not result.data:
        raise NotFoundError("ワークアウトセッション")
    if result.data["user_id"] != user_id:
        raise ForbiddenError()
    return result.data


def _get_routine_or_raise(supabase, routine_id: str, user_id: str) -> dict:
    result = (
        supabase.table("workout_routines")
        .select("*")
        .eq("id", routine_id)
        .single()
        .execute()
    )
    if not result.data:
        raise NotFoundError("ワークアウトルーティン")
    if result.data["user_id"] != user_id:
        raise ForbiddenError()
    return result.data


def _ensure_owned_habit(supabase, habit_id: str, user_id: str) -> dict:
    result = (
        supabase.table("habits")
        .select("*")
        .eq("id", habit_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=422, detail="habit_id is unknown or unauthorized")
    return result.data


def _replace_exercises(
    supabase, session_id: str, exercises: list[WorkoutExerciseInput]
) -> list[dict]:
    """セッションの種目を一括 replace する (シンプル: 全削除 → 再 insert)。"""
    supabase.table("workout_exercises").delete().eq("session_id", session_id).execute()
    if not exercises:
        return []
    rows = [
        {
            "session_id": session_id,
            "exercise_name": ex.exercise_name,
            "order_index": ex.order_index,
            "sets": [s.model_dump() for s in ex.sets],
        }
        for ex in exercises
    ]
    result = supabase.table("workout_exercises").insert(rows).execute()
    return result.data or []


def _fetch_exercises(supabase, session_id: str) -> list[dict]:
    result = (
        supabase.table("workout_exercises")
        .select("*")
        .eq("session_id", session_id)
        .order("order_index", desc=False)
        .execute()
    )
    return result.data or []


def _compute_totals(session_type: str, exercises: list[dict]) -> dict:
    """筋トレ: 総ボリューム (kg) を計算。"""
    out: dict = {}
    if session_type == "strength":
        total_volume = 0.0
        for ex in exercises:
            for s in ex.get("sets", []) or []:
                if not s.get("completed"):
                    continue
                if s.get("set_type") == "warmup":
                    continue
                weight = float(s.get("weight") or 0)
                reps = int(s.get("reps") or 0)
                total_volume += weight * reps
        out["total_volume_kg"] = round(total_volume, 2)
    return out


def _session_response(session: dict, exercises: list[dict]) -> dict:
    """WorkoutSession 用の JSON-friendly 辞書を組み立てる。"""
    payload = dict(session)
    payload["exercises"] = exercises
    return payload


# --------------------------------------------------
# セッション CRUD
# --------------------------------------------------

@router.post("/workouts/sessions", status_code=201)
async def start_session(
    request: WorkoutSessionStartRequest,
    user_id: str = Depends(get_current_user),
):
    """【セッション開始】 started_at は省略可 (now())。"""
    supabase = get_supabase()

    if request.habit_id:
        habit = _ensure_owned_habit(supabase, request.habit_id, user_id)
        # 既存 habit を流用する場合、workout_kind は session_type と一致すべき
        # ただし任意の habit と紐付けたいケースに備え warning に留める (拒否しない)
        _ = habit

    if request.routine_id:
        _get_routine_or_raise(supabase, request.routine_id, user_id)

    now = datetime.now(timezone.utc)
    started_at = request.started_at or now

    session_payload = {
        "user_id": user_id,
        "habit_id": request.habit_id,
        "routine_id": request.routine_id,
        "session_type": request.session_type,
        "started_at": started_at.isoformat(),
    }
    session_result = (
        supabase.table("workout_sessions").insert(session_payload).execute()
    )
    session = session_result.data[0] if session_result.data else session_payload
    session_id = session["id"]

    exercises = _replace_exercises(supabase, session_id, request.exercises)

    return JSONResponse(
        status_code=201,
        content=APIResponse(
            success=True, data=_session_response(session, exercises)
        ).model_dump(mode="json"),
    )


@router.patch("/workouts/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: WorkoutSessionUpdateRequest,
    user_id: str = Depends(get_current_user),
):
    """【進行中セッション更新】 exercises は全置換。"""
    supabase = get_supabase()
    _get_session_or_raise(supabase, session_id, user_id)

    update_payload: dict = {}
    if request.notes is not None:
        update_payload["notes"] = request.notes

    if update_payload:
        supabase.table("workout_sessions").update(update_payload).eq(
            "id", session_id
        ).eq("user_id", user_id).execute()

    if request.exercises is not None:
        _replace_exercises(supabase, session_id, request.exercises)

    session = _get_session_or_raise(supabase, session_id, user_id)
    exercises = _fetch_exercises(supabase, session_id)

    return APIResponse(
        success=True, data=_session_response(session, exercises)
    ).model_dump(mode="json")


@router.post("/workouts/sessions/{session_id}/finish")
async def finish_session(
    session_id: str,
    request: WorkoutSessionFinishRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【セッション完了】
    1. exercises の最終 snapshot を反映
    2. duration_s, total_volume_kg (筋トレ) / distance_m, avg_pace_s_per_km (ランニング) を計算
    3. habit_id が紐付いていれば habit_logs を upsert + streak / badge 計算
    4. 完了済みセッション + (任意で) habit_log の更新結果を返す
    """
    supabase = get_supabase()
    session = _get_session_or_raise(supabase, session_id, user_id)

    if request.exercises is not None:
        _replace_exercises(supabase, session_id, request.exercises)

    exercises = _fetch_exercises(supabase, session_id)

    now = datetime.now(timezone.utc)
    ended_at = request.ended_at or now
    started_at_str = session["started_at"]
    started_at = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
    duration_s = max(0, int((ended_at - started_at).total_seconds()))

    update_payload: dict = {
        "ended_at": ended_at.isoformat(),
        "duration_s": duration_s,
    }

    totals = _compute_totals(session["session_type"], exercises)
    update_payload.update(totals)

    if session["session_type"] == "running":
        if request.distance_m is not None:
            update_payload["distance_m"] = float(request.distance_m)
        if request.avg_pace_s_per_km is not None:
            update_payload["avg_pace_s_per_km"] = float(request.avg_pace_s_per_km)
        if request.gps_route is not None:
            update_payload["gps_route"] = [p.model_dump() for p in request.gps_route]

    if request.notes is not None:
        update_payload["notes"] = request.notes

    # habit_log upsert (habit_id 紐付け時のみ)
    habit_log_id: Optional[str] = None
    streak_after = 0
    badge_earned = None
    if session.get("habit_id"):
        habit = _ensure_owned_habit(supabase, session["habit_id"], user_id)
        log_date_str = ended_at.date().isoformat()

        # numeric_value: 筋トレ = 総ボリューム / ランニング = 距離 (km 単位に揃える)
        numeric_value: Optional[float] = None
        if session["session_type"] == "strength":
            numeric_value = totals.get("total_volume_kg")
        elif session["session_type"] == "running":
            if request.distance_m is not None:
                numeric_value = round(float(request.distance_m) / 1000.0, 3)

        log_payload = {
            "habit_id": habit["id"],
            "user_id": user_id,
            "log_date": log_date_str,
            "completed": True,
            "status": "done",
            "completed_at": ended_at.isoformat(),
            "input_method": "manual",
        }
        if numeric_value is not None:
            log_payload["numeric_value"] = numeric_value

        log_result = (
            supabase.table("habit_logs")
            .upsert(log_payload, on_conflict="habit_id,log_date")
            .execute()
        )
        habit_log = log_result.data[0] if log_result.data else log_payload
        habit_log_id = habit_log.get("id")

        log_date = date.fromisoformat(log_date_str)
        streak_after = streak_service.calculate_streak(
            supabase, habit["id"], user_id, log_date, habit_meta=habit
        )
        streak_service.update_streak(supabase, habit["id"], streak_after, user_id)
        badge_earned = badge_service.check_and_award_badges(
            supabase, user_id, habit["id"], streak_after
        )

        update_payload["habit_log_id"] = habit_log_id

    supabase.table("workout_sessions").update(update_payload).eq(
        "id", session_id
    ).eq("user_id", user_id).execute()

    session = _get_session_or_raise(supabase, session_id, user_id)
    exercises = _fetch_exercises(supabase, session_id)

    return APIResponse(
        success=True,
        data={
            "session": _session_response(session, exercises),
            "habit_log_id": habit_log_id,
            "streak": streak_after,
            "badge_earned": badge_earned,
        },
    ).model_dump(mode="json")


@router.get("/workouts/sessions")
async def list_sessions(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    type: Optional[WorkoutSessionType] = None,
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user),
):
    """【履歴一覧】 from/to/type フィルタ + limit。"""
    supabase = get_supabase()
    query = (
        supabase.table("workout_sessions")
        .select("*")
        .eq("user_id", user_id)
        .order("started_at", desc=True)
        .limit(limit)
    )
    if from_date:
        query = query.gte("started_at", from_date)
    if to_date:
        query = query.lte("started_at", to_date)
    if type:
        query = query.eq("session_type", type)
    result = query.execute()
    sessions = result.data or []

    # exercises は別途バッチ取得
    session_ids = [s["id"] for s in sessions]
    exercises_by_session: dict[str, list[dict]] = {sid: [] for sid in session_ids}
    if session_ids:
        ex_result = (
            supabase.table("workout_exercises")
            .select("*")
            .in_("session_id", session_ids)
            .order("order_index", desc=False)
            .execute()
        )
        for ex in ex_result.data or []:
            exercises_by_session.setdefault(ex["session_id"], []).append(ex)

    items = [
        _session_response(s, exercises_by_session.get(s["id"], []))
        for s in sessions
    ]
    return APIResponse(success=True, data=items).model_dump(mode="json")


@router.get("/workouts/sessions/{session_id}")
async def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """【セッション詳細】"""
    supabase = get_supabase()
    session = _get_session_or_raise(supabase, session_id, user_id)
    exercises = _fetch_exercises(supabase, session_id)
    return APIResponse(
        success=True, data=_session_response(session, exercises)
    ).model_dump(mode="json")


@router.delete("/workouts/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """【セッション削除】 関連 habit_log は SET NULL (履歴保持)。"""
    supabase = get_supabase()
    _get_session_or_raise(supabase, session_id, user_id)
    supabase.table("workout_sessions").delete().eq("id", session_id).eq(
        "user_id", user_id
    ).execute()
    return Response(status_code=204)


# --------------------------------------------------
# ルーティン CRUD
# --------------------------------------------------

@router.get("/workouts/routines")
async def list_routines(
    routine_type: Optional[WorkoutSessionType] = Query(None, alias="type"),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    query = (
        supabase.table("workout_routines")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
    )
    if routine_type:
        query = query.eq("routine_type", routine_type)
    result = query.execute()
    return APIResponse(success=True, data=result.data or []).model_dump(mode="json")


@router.post("/workouts/routines", status_code=201)
async def create_routine(
    request: WorkoutRoutineCreateRequest,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    payload = {
        "user_id": user_id,
        "name": request.name,
        "routine_type": request.routine_type,
        "template": request.template,
    }
    result = supabase.table("workout_routines").insert(payload).execute()
    created = result.data[0] if result.data else payload
    return JSONResponse(
        status_code=201,
        content=APIResponse(success=True, data=created).model_dump(mode="json"),
    )


@router.patch("/workouts/routines/{routine_id}")
async def update_routine(
    routine_id: str,
    request: WorkoutRoutineUpdateRequest,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    _get_routine_or_raise(supabase, routine_id, user_id)
    update_payload: dict = {}
    if request.name is not None:
        update_payload["name"] = request.name
    if request.template is not None:
        update_payload["template"] = request.template
    if update_payload:
        supabase.table("workout_routines").update(update_payload).eq(
            "id", routine_id
        ).eq("user_id", user_id).execute()
    routine = _get_routine_or_raise(supabase, routine_id, user_id)
    return APIResponse(success=True, data=routine).model_dump(mode="json")


@router.delete("/workouts/routines/{routine_id}", status_code=204)
async def delete_routine(
    routine_id: str,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    _get_routine_or_raise(supabase, routine_id, user_id)
    supabase.table("workout_routines").delete().eq("id", routine_id).eq(
        "user_id", user_id
    ).execute()
    return Response(status_code=204)


# --------------------------------------------------
# Bootstrap (BODY 初回起動時)
# --------------------------------------------------

@router.post("/workouts/bootstrap")
async def bootstrap_workout_habits(
    user_id: str = Depends(get_current_user),
):
    """
    【冪等 pre-seed】
    workout_kind='strength' / 'running' の habit が無ければ作成、あれば返すだけ。
    """
    supabase = get_supabase()

    existing = (
        supabase.table("habits")
        .select("*")
        .eq("user_id", user_id)
        .in_("workout_kind", ["strength", "running"])
        .execute()
    )
    found: dict[str, dict] = {}
    for h in existing.data or []:
        kind = h.get("workout_kind")
        if kind in ("strength", "running"):
            found[kind] = h

    created = False
    new_rows: list[dict] = []

    if "strength" not in found:
        new_rows.append({
            "user_id": user_id,
            "title": "筋トレ",
            "frequency": "daily",
            "metric_type": "binary",
            "aggregation": "exists",
            "aggregation_kind": "count",
            "aggregation_period": "weekly",
            "period_target": 3,
            "display_window": "anytime",
            "workout_kind": "strength",
            "is_active": True,
            "xp_base": 20,
        })

    if "running" not in found:
        new_rows.append({
            "user_id": user_id,
            "title": "ランニング",
            "frequency": "daily",
            "metric_type": "numeric_min",
            "unit": "km",
            "target_value": 3,
            "aggregation": "sum",
            "aggregation_kind": "sum",
            "aggregation_period": "weekly",
            "period_target": 15,
            "display_window": "anytime",
            "workout_kind": "running",
            "is_active": True,
            "xp_base": 20,
        })

    if new_rows:
        ins_result = supabase.table("habits").insert(new_rows).execute()
        for row in ins_result.data or []:
            kind = row.get("workout_kind")
            if kind in ("strength", "running"):
                found[kind] = row
        created = True

    return APIResponse(
        success=True,
        data={
            "strength_habit": found.get("strength"),
            "running_habit": found.get("running"),
            "created": created,
        },
    ).model_dump(mode="json")
