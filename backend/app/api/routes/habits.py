"""
習慣CRUD API
TASK-0007: 習慣CRUD API実装
TASK-0008: 習慣ログ・ストリーク計算・バッジ付与API実装

【エンドポイント】:
  GET    /api/habits                          - 習慣一覧取得（今日のログ付き）
  POST   /api/habits                          - 習慣作成（201）
  PATCH  /api/habits/{habit_id}               - 習慣更新（AIアクション制限あり）
  DELETE /api/habits/{habit_id}               - 習慣論理削除（204）
  PATCH  /api/habits/{habit_id}/log           - 習慣ログ記録・ストリーク更新・バッジ付与
  POST   /api/habits/{habit_id}/failure-reason - 未達成理由記録（201）

【設計方針】:
- action フィールドで操作種別を検証（REQ-303）
- AI提案アクション（change_time/add_habit/remove_habit）と manual_edit のみ許可
- 他ユーザーの習慣への操作は ForbiddenError で拒否（NFR-101）
- 削除は物理削除せず is_active=false に更新（REQ-306）

🔵 信頼性レベル: REQ-301/302/303/304/305/306/404/406/501/502/503/901・api-endpoints.md より
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response

from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    CreateFailureReasonRequest,
    CreateHabitRequest,
    FailureReason,
    Habit,
    ReorderHabitsRequest,
    UpdateHabitLogRequest,
    UpdateHabitRequest,
)
from app.services import badge_service, streak_service

router = APIRouter()

# 【許可アクション一覧】: REQ-303 に基づく許可リスト（change_time/add_habit/remove_habit + 手動編集）
ALLOWED_ACTIONS = {"change_time", "add_habit", "remove_habit", "manual_edit"}


def _default_aggregation(metric_type: str) -> str:
    """metric_type に応じた aggregation の既定値。"""
    if metric_type in ("numeric_min", "numeric_max", "duration", "range"):
        return "sum"
    if metric_type in ("time_before", "time_after"):
        return "first"
    return "exists"


def _get_habit_or_raise(supabase, habit_id: str, user_id: str) -> dict:
    """
    【所有者確認ヘルパー】: 習慣を取得し、存在・所有権を確認する
    【404】: 習慣が存在しない（または is_active=false）の場合
    【403】: ログインユーザーの習慣でない場合
    🔵 信頼性レベル: NFR-101 より
    """
    result = (
        supabase.table("habits")
        .select("*")
        .eq("id", habit_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise NotFoundError("習慣")
    if result.data["user_id"] != user_id:
        raise ForbiddenError()
    return result.data


def _ensure_owned_goal(supabase, goal_id: str, user_id: str) -> None:
    result = (
        supabase.table("goals")
        .select("id")
        .eq("id", goal_id)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=422, detail="goal_id is unknown or unauthorized")


@router.get("/habits")
async def get_habits(
    include_today_log: bool = Query(default=True),
    include_inactive: bool = Query(default=False),
    user_id: str = Depends(get_current_user),
):
    """
    【GET /habits】: 有効な習慣一覧を取得（今日のログ付き）
    【フィルタ】: 既定では is_active=true かつログインユーザーのもののみ
    【include_inactive】: true の場合 is_active=false（アーカイブ済）も含めて返す。
                       Habits 画面のアーカイブ復元 UI 用。default=False で既存呼び出し
                       (Today / Signals / Coach) は無影響。
    【ログ付き】: include_today_log=true の場合、今日の habit_logs も取得
    🔵 信頼性レベル: REQ-301・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【習慣一覧取得】: 自ユーザーの習慣を display_order 順に取得。
    # include_inactive=False（既定）のときだけ is_active=true に絞る。
    query = (
        supabase.table("habits")
        .select("*")
        .eq("user_id", user_id)
    )
    if not include_inactive:
        query = query.eq("is_active", True)
    result = query.order("display_order").execute()
    habits = result.data or []

    # 【今日のログ取得】: include_today_log=true の場合、今日分の habit_logs を取得
    today_logs_map: dict = {}
    if include_today_log and habits:
        today_str = str(date.today())
        habit_ids = [h["id"] for h in habits]

        logs_result = (
            supabase.table("habit_logs")
            .select("*")
            .eq("user_id", user_id)
            .eq("log_date", today_str)
            .execute()
        )
        logs = logs_result.data or []
        # 【マッピング】: habit_id → ログ の辞書を作成
        today_logs_map = {log["habit_id"]: log for log in logs if log["habit_id"] in habit_ids}

    # Sprint v4-prep P3b: habit_goals junction から goal_ids を populate。
    # 1 query で全 habit 分まとめて取って、メモリで habit_id → list[goal_id] にマップ。
    goal_ids_map: dict[str, list[str]] = {}
    if habits:
        habit_ids = [h["id"] for h in habits]
        hg_result = (
            supabase.table("habit_goals")
            .select("habit_id, goal_id")
            .eq("user_id", user_id)
            .in_("habit_id", habit_ids)
            .execute()
        )
        for row in hg_result.data or []:
            goal_ids_map.setdefault(row["habit_id"], []).append(row["goal_id"])

    # 【レスポンス構築】: 各習慣に today_log と goal_ids を付与
    habits_with_log = []
    for habit in habits:
        habit_data = dict(habit)
        if include_today_log:
            habit_data["today_log"] = today_logs_map.get(habit["id"])
        habit_data["goal_ids"] = goal_ids_map.get(habit["id"], [])
        habits_with_log.append(habit_data)

    return APIResponse(success=True, data=habits_with_log).model_dump(mode="json")


@router.get("/habits/logs")
async def get_habit_logs(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    user_id: str = Depends(get_current_user),
):
    """
    【GET /habits/logs】: 期間内の habit_logs を全件取得（分析画面の月次集計用）
    【期間】: from / to は YYYY-MM-DD（両端含む）
    🔵 信頼性レベル: api-endpoints.md 拡張提案より
    """
    supabase = get_supabase()
    result = (
        supabase.table("habit_logs")
        .select("*")
        .eq("user_id", user_id)
        .gte("log_date", from_date)
        .lte("log_date", to_date)
        .order("log_date")
        .execute()
    )
    return APIResponse(success=True, data=result.data or []).model_dump(mode="json")


@router.post("/habits", status_code=201)
async def create_habit(
    request: CreateHabitRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /habits】: 新しい習慣を作成する
    【バリデーション】: Pydantic で title 必須・200文字以内を確認
    【wanna_be_connection_text】: goal_id が指定された場合に goals テーブルから自動生成
    🔵 信頼性レベル: REQ-302・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【習慣データ構築】: user_id をセットして INSERT 用データを準備
    new_habit = {
        "user_id": user_id,
        "title": request.title,
        "frequency": request.frequency,
        "metric_type": request.metric_type,
    }
    if request.goal_id is not None:
        _ensure_owned_goal(supabase, request.goal_id, user_id)
        new_habit["goal_id"] = request.goal_id
    if request.description is not None:
        new_habit["description"] = request.description
    if request.scheduled_time is not None:
        new_habit["scheduled_time"] = request.scheduled_time
    if request.display_order is not None:
        new_habit["display_order"] = request.display_order
    if request.wanna_be_connection_text is not None:
        new_habit["wanna_be_connection_text"] = request.wanna_be_connection_text
    if request.target_value is not None:
        new_habit["target_value"] = request.target_value
    if request.target_value_max is not None:
        new_habit["target_value_max"] = request.target_value_max
    if request.target_time is not None:
        new_habit["target_time"] = request.target_time
    if request.unit is not None:
        new_habit["unit"] = request.unit
    if request.aggregation is not None:
        new_habit["aggregation"] = request.aggregation
    else:
        # metric_type から aggregation 既定値を推論
        new_habit["aggregation"] = _default_aggregation(request.metric_type)
    # Sprint v5: KPI 統合 4 列。指定がなければ DB の DEFAULT (count/daily/NULL/anytime) が入る。
    if request.aggregation_kind is not None:
        new_habit["aggregation_kind"] = request.aggregation_kind
    if request.aggregation_period is not None:
        new_habit["aggregation_period"] = request.aggregation_period
    if request.period_target is not None:
        new_habit["period_target"] = request.period_target
    if request.display_window is not None:
        new_habit["display_window"] = request.display_window

    result = supabase.table("habits").insert(new_habit).execute()
    created = result.data[0] if result.data else {}

    return JSONResponse(
        status_code=201,
        content=APIResponse(success=True, data=Habit(**created)).model_dump(mode="json"),
    )


@router.post("/habits/reorder")
async def reorder_habits(
    request: ReorderHabitsRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /habits/reorder】: 習慣の並び替えを 1 トランザクションで反映する。
    【入力】: ordered_ids = 並び替え後の habit id 配列。
    【動作】: Postgres の reorder_habits(habit_ids) 関数を呼び、display_order を 0..n-1 に振り直す。
    【所有者保護】: 関数内で user_id = auth.uid() を強制するので、他ユーザーの habit は no-op。
    🔵 信頼性レベル: docs/sprint-spec/v3-stocktake.md K (habit 重み付け) + add_reorder_habits_function.sql
    """
    supabase = get_supabase()
    ids = request.ordered_ids

    if not ids:
        return APIResponse(success=True, data=None).model_dump(mode="json")

    # 【所有者確認】: 渡された全 id が呼び出しユーザーのものであることを事前に検証する。
    # ストアド関数側でも auth.uid() フィルタはかかるが、不一致があれば 403 で明示的に弾く方が
    # クライアント側のデバッグが楽になる。
    fetched = (
        supabase.table("habits")
        .select("id, user_id")
        .in_("id", ids)
        .execute()
    )
    rows = fetched.data or []
    if len(rows) != len(ids):
        raise NotFoundError("習慣")
    for row in rows:
        if row["user_id"] != user_id:
            raise ForbiddenError()

    # 【一括 reorder】: ストアド関数を 1 回呼ぶだけ。Postgres トランザクションで原子的に走る。
    # 注: backend は service_role で接続しているため関数内の auth.uid() は NULL になる。
    # そのため target_user_id を明示的に渡し、関数側はこの値で WHERE 句を作る。所有権は
    # 上で検証済みなので、ここで他人の id を渡すことは事実上できない。
    supabase.rpc(
        "reorder_habits",
        {"target_user_id": user_id, "habit_ids": ids},
    ).execute()

    return APIResponse(success=True, data=None).model_dump(mode="json")


@router.patch("/habits/{habit_id}")
async def update_habit(
    habit_id: str,
    request: UpdateHabitRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【PATCH /habits/{habit_id}】: 習慣を更新する
    【アクション検証】: REQ-303 に基づき許可外アクションは FORBIDDEN_ACTION で拒否
    【所有者確認】: 他ユーザーの習慣への操作は 403 FORBIDDEN
    🔵 信頼性レベル: REQ-303/304/305・api-endpoints.md より
    """
    # 【アクション検証】: change_time/add_habit/remove_habit/manual_edit 以外は拒否
    # UpdateHabitRequest.action は str 型のため、ルーターで許可リストをチェックする
    # （Literal にすると Pydantic が 422 を返し、仕様の 400 FORBIDDEN_ACTION と不整合になる）
    if request.action not in ALLOWED_ACTIONS:
        raise AppError(
            code="FORBIDDEN_ACTION",
            message="このAIアクションは許可されていません。使用可能なアクション: change_time, add_habit, remove_habit",
            status_code=400,
        )

    supabase = get_supabase()

    # 【所有者確認】: 習慣の存在と所有権を確認（404/403 を自動発生）
    existing = _get_habit_or_raise(supabase, habit_id, user_id)

    # 【更新データ構築】: action フィールドを除いた None 以外のフィールドのみ更新
    update_data = request.model_dump(exclude_none=True, exclude={"action"})

    result = (
        supabase.table("habits")
        .update(update_data)
        .eq("id", habit_id)
        .eq("user_id", user_id)
        .execute()
    )
    updated = result.data[0] if result.data else existing.data

    return APIResponse(success=True, data=Habit(**updated)).model_dump(mode="json")


@router.put("/habits/{habit_id}/goals", status_code=200)
async def set_habit_goals(
    habit_id: str,
    request: dict,
    user_id: str = Depends(get_current_user),
):
    """
    【PUT /habits/{habit_id}/goals】Sprint v4-prep P3b:
    habit ↔ goal の N:N 紐付けを一括差し替え。

    Request body: {"goal_ids": ["uuid", "uuid", ...]}
    - habit_goals テーブルの該当 habit の行を全削除 → 新リストで INSERT
    - 各 goal_id は user_id で検証（他人の Goal に紐付けようとしたら 422）
    - habits.goal_id (legacy primary) は変更しない（呼び出し元の責任）

    Advanced モード時のみフロントから呼ばれる前提。OFF 時は使われない。
    """
    supabase = get_supabase()

    # 所有者確認
    _get_habit_or_raise(supabase, habit_id, user_id)

    raw_goal_ids = request.get("goal_ids")
    if not isinstance(raw_goal_ids, list):
        raise AppError(
            code="VALIDATION_ERROR",
            message="goal_ids must be a list",
            status_code=400,
        )
    goal_ids: list[str] = []
    for gid in raw_goal_ids:
        if not isinstance(gid, str) or not gid:
            continue
        # 重複は dedup
        if gid not in goal_ids:
            goal_ids.append(gid)

    # 各 goal_id が user 所有であることを確認（不正な ID を弾く）
    if goal_ids:
        check = (
            supabase.table("goals")
            .select("id")
            .eq("user_id", user_id)
            .in_("id", goal_ids)
            .execute()
        )
        owned = {row["id"] for row in (check.data or [])}
        unknown = [gid for gid in goal_ids if gid not in owned]
        if unknown:
            raise AppError(
                code="VALIDATION_ERROR",
                message=f"goal_ids contain unauthorized or unknown ids: {unknown}",
                status_code=422,
            )

    # 既存 habit_goals 行を削除して再 INSERT (atomic ではないが Phase 1 では許容)
    supabase.table("habit_goals").delete().eq("habit_id", habit_id).eq("user_id", user_id).execute()
    if goal_ids:
        rows = [{"habit_id": habit_id, "goal_id": gid, "user_id": user_id} for gid in goal_ids]
        supabase.table("habit_goals").insert(rows).execute()

    return APIResponse(success=True, data={"habit_id": habit_id, "goal_ids": goal_ids}).model_dump(mode="json")


@router.delete("/habits/{habit_id}", status_code=204)
async def delete_habit(
    habit_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    【DELETE /habits/{habit_id}】: 習慣を論理削除する（is_active=false）
    【物理削除禁止】: is_active=false に更新することで履歴を保持（REQ-306）
    【所有者確認】: 他ユーザーの習慣への操作は 403 FORBIDDEN
    🔵 信頼性レベル: REQ-306・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【所有者確認】: 習慣の存在と所有権を確認（404/403 を自動発生）
    _get_habit_or_raise(supabase, habit_id, user_id)

    # 【論理削除】: is_active=false に更新（物理削除しない）
    supabase.table("habits").update({"is_active": False}).eq("id", habit_id).eq("user_id", user_id).execute()

    return Response(status_code=204)


@router.patch("/habits/{habit_id}/log")
async def update_habit_log(
    habit_id: str,
    request: UpdateHabitLogRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【PATCH /habits/{habit_id}/log】: 習慣ログを記録し、ストリーク・バッジを更新する
    【UPSERT】: (habit_id, log_date) のユニーク制約で同日は上書き（REQ-404）
    【ストリーク】: completed=true なら再計算、false なら0にリセット（REQ-501/503）
    【バッジ】: ストリーク条件達成時にバッジを付与（REQ-901）
    🔵 信頼性レベル: REQ-404/406/501/502/503/901・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【所有者確認 + メタデータ取得】: metric_type 等を後段の達成判定で使う
    habit = _get_habit_or_raise(supabase, habit_id, user_id)

    log_date_str = request.date

    # 【ログ payload 構築】: 同日同習慣は upsert で上書き（EDGE-102）
    log_data: dict = {
        "habit_id": habit_id,
        "user_id": user_id,
        "log_date": log_date_str,
        "completed": request.completed,
    }
    if request.input_method:
        log_data["input_method"] = request.input_method
    if request.numeric_value is not None:
        log_data["numeric_value"] = request.numeric_value
    if request.time_value is not None:
        log_data["time_value"] = request.time_value

    # 【達成判定】: metric_type に応じて、binary は completed、量・時刻系は値ベースで判定
    achieved = streak_service.is_achieved(habit, log_data)

    # 【completed_at】: 達成時のみ刻む。binary 以外でも「閾値を満たした瞬間」の意味で記録する
    if achieved:
        log_data["completed_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("habit_logs")
        .upsert(log_data, on_conflict="habit_id,log_date")
        .execute()
    )
    log = result.data[0] if result.data else log_data

    current_streak = 0
    badge_earned = None

    if achieved:
        # 【ストリーク計算・更新】: 達成日として連続日数を計算して更新
        log_date = date.fromisoformat(log_date_str)
        current_streak = streak_service.calculate_streak(
            supabase, habit_id, user_id, log_date, habit_meta=habit
        )
        streak_service.update_streak(supabase, habit_id, current_streak, user_id)

        # 【バッジ付与チェック】: ストリーク条件を満たす未取得バッジを付与
        badge_earned = badge_service.check_and_award_badges(
            supabase, user_id, habit_id, current_streak
        )
    else:
        # 【ストリークリセット】: 未達成の場合、current_streak を0にリセット（REQ-503）
        supabase.table("habits").update({"current_streak": 0}).eq("id", habit_id).eq("user_id", user_id).execute()

    return APIResponse(
        success=True,
        data={
            "log": log,
            "streak": current_streak,
            "badge_earned": badge_earned,
        },
    ).model_dump(mode="json")


@router.post("/habits/{habit_id}/failure-reason", status_code=201)
async def create_failure_reason(
    habit_id: str,
    request: CreateFailureReasonRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /habits/{habit_id}/failure-reason】: 習慣の未達成理由を記録する
    【紐付け】: (habit_id, log_date) で habit_logs を検索し、habit_log_id を取得して保存
    【認証必須】: 他ユーザーの習慣への操作は 403 FORBIDDEN
    🔵 信頼性レベル: REQ-406・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【所有者確認】: 習慣の存在と所有権を確認
    _get_habit_or_raise(supabase, habit_id, user_id)

    # 【ログ検索】: (habit_id, log_date) で habit_log を取得
    log_result = (
        supabase.table("habit_logs")
        .select("id")
        .eq("habit_id", habit_id)
        .eq("log_date", request.log_date)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not log_result.data:
        raise NotFoundError("習慣ログ")

    habit_log_id = log_result.data["id"]

    # 【未達成理由 INSERT】: failure_reasons テーブルに記録
    insert_result = (
        supabase.table("failure_reasons")
        .insert({
            "habit_log_id": habit_log_id,
            "user_id": user_id,
            "reason": request.reason,
        })
        .execute()
    )

    created = insert_result.data[0] if insert_result.data else {}

    return JSONResponse(
        status_code=201,
        content=APIResponse(
            success=True, data=FailureReason(**created)
        ).model_dump(mode="json"),
    )
