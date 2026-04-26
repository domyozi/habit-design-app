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

from fastapi import APIRouter, Depends, Query
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
    UpdateHabitLogRequest,
    UpdateHabitRequest,
)
from app.services import badge_service, streak_service

router = APIRouter()

# 【許可アクション一覧】: REQ-303 に基づく許可リスト（change_time/add_habit/remove_habit + 手動編集）
ALLOWED_ACTIONS = {"change_time", "add_habit", "remove_habit", "manual_edit"}


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


@router.get("/habits")
async def get_habits(
    include_today_log: bool = Query(default=True),
    user_id: str = Depends(get_current_user),
):
    """
    【GET /habits】: 有効な習慣一覧を取得（今日のログ付き）
    【フィルタ】: is_active=true かつログインユーザーのもののみ
    【ログ付き】: include_today_log=true の場合、今日の habit_logs も取得
    🔵 信頼性レベル: REQ-301・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【習慣一覧取得】: is_active=true かつ自ユーザーの習慣を display_order 順に取得
    result = (
        supabase.table("habits")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )
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

    # 【レスポンス構築】: 各習慣に today_log を付与
    habits_with_log = []
    for habit in habits:
        habit_data = dict(habit)
        if include_today_log:
            habit_data["today_log"] = today_logs_map.get(habit["id"])
        habits_with_log.append(habit_data)

    return APIResponse(success=True, data=habits_with_log).model_dump(mode="json")


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
    }
    if request.goal_id is not None:
        new_habit["goal_id"] = request.goal_id
    if request.description is not None:
        new_habit["description"] = request.description
    if request.scheduled_time is not None:
        new_habit["scheduled_time"] = request.scheduled_time
    if request.display_order is not None:
        new_habit["display_order"] = request.display_order
    if request.wanna_be_connection_text is not None:
        new_habit["wanna_be_connection_text"] = request.wanna_be_connection_text

    result = supabase.table("habits").insert(new_habit).execute()
    created = result.data[0] if result.data else {}

    return JSONResponse(
        status_code=201,
        content=APIResponse(success=True, data=Habit(**created)).model_dump(mode="json"),
    )


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
        .execute()
    )
    updated = result.data[0] if result.data else existing.data

    return APIResponse(success=True, data=Habit(**updated)).model_dump(mode="json")


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
    supabase.table("habits").update({"is_active": False}).eq("id", habit_id).execute()

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

    # 【所有者確認】: 習慣の存在と所有権を確認
    _get_habit_or_raise(supabase, habit_id, user_id)

    log_date_str = request.date

    # 【ログUPSERT】: 同日同習慣は上書き（EDGE-102: ユニーク制約 habit_id, log_date）
    log_data: dict = {
        "habit_id": habit_id,
        "user_id": user_id,
        "log_date": log_date_str,
        "completed": request.completed,
    }
    if request.input_method:
        log_data["input_method"] = request.input_method
    if request.completed:
        log_data["completed_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("habit_logs")
        .upsert(log_data, on_conflict="habit_id,log_date")
        .execute()
    )
    log = result.data[0] if result.data else log_data

    current_streak = 0
    badge_earned = None

    if request.completed:
        # 【ストリーク計算・更新】: completed=true の場合、連続日数を計算して更新
        log_date = date.fromisoformat(log_date_str)
        current_streak = streak_service.calculate_streak(supabase, habit_id, user_id, log_date)
        streak_service.update_streak(supabase, habit_id, current_streak)

        # 【バッジ付与チェック】: ストリーク条件を満たす未取得バッジを付与
        badge_earned = badge_service.check_and_award_badges(
            supabase, user_id, habit_id, current_streak
        )
    else:
        # 【ストリークリセット】: completed=false の場合、current_streak を0にリセット（REQ-503）
        supabase.table("habits").update({"current_streak": 0}).eq("id", habit_id).execute()

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
