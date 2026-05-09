"""
表示タイミング (user_time_windows) CRUD API
Sprint v6: habit.display_window のカスタマイズ機能

【エンドポイント】:
  GET    /api/user/time-windows         - 自分の枠一覧 (sort_order 昇順)
  POST   /api/user/time-windows         - カスタム枠作成
  PATCH  /api/user/time-windows/{id}    - 枠の境界・ラベル・並びを更新
  DELETE /api/user/time-windows/{id}    - カスタム枠削除 (予約 key は不可)

【設計方針】:
- 予約 key (morning/noon/evening/anytime) は label / start_hour / end_hour / sort_order を編集可、削除は不可
- is_anytime=true の行は start_hour / end_hour の変更を無視する
- カスタム枠の key はサーバーで生成 (cw_<random>)
- 削除時、その枠を参照する habits.display_window は anytime にリセット
"""
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    CreateTimeWindowRequest,
    RESERVED_TIME_WINDOW_KEYS,
    UpdateTimeWindowRequest,
    UserTimeWindowResponse,
)

router = APIRouter()


def _row_to_response(row: dict) -> UserTimeWindowResponse:
    return UserTimeWindowResponse(
        id=row["id"],
        key=row["key"],
        label=row["label"],
        start_hour=row["start_hour"],
        end_hour=row["end_hour"],
        is_anytime=row["is_anytime"],
        sort_order=row["sort_order"],
    )


def _get_window_or_raise(supabase, window_id: str, user_id: str) -> dict:
    result = (
        supabase.table("user_time_windows")
        .select("*")
        .eq("id", window_id)
        .single()
        .execute()
    )
    if not result.data:
        raise NotFoundError("表示タイミング")
    if result.data["user_id"] != user_id:
        raise ForbiddenError()
    return result.data


def _ensure_default_windows(supabase, user_id: str) -> None:
    """ユーザーに予約 4 行が無ければ作成する。
    マイグレーション後に新規作成されたユーザーへのフェイルセーフ。"""
    existing = (
        supabase.table("user_time_windows")
        .select("key")
        .eq("user_id", user_id)
        .execute()
    )
    existing_keys = {row["key"] for row in existing.data or []}
    seeds = [
        {"key": "anytime", "label": "全日", "start_hour": 0, "end_hour": 0, "is_anytime": True, "sort_order": 0},
        {"key": "morning", "label": "朝", "start_hour": 4, "end_hour": 12, "is_anytime": False, "sort_order": 1},
        {"key": "noon", "label": "昼", "start_hour": 12, "end_hour": 18, "is_anytime": False, "sort_order": 2},
        {"key": "evening", "label": "夜", "start_hour": 18, "end_hour": 4, "is_anytime": False, "sort_order": 3},
    ]
    rows_to_insert = [
        {**s, "user_id": user_id} for s in seeds if s["key"] not in existing_keys
    ]
    if rows_to_insert:
        supabase.table("user_time_windows").insert(rows_to_insert).execute()


@router.get("/user/time-windows")
async def list_time_windows(user_id: str = Depends(get_current_user)):
    """自分の表示タイミング枠一覧 (sort_order 昇順)。"""
    supabase = get_supabase()
    _ensure_default_windows(supabase, user_id)
    result = (
        supabase.table("user_time_windows")
        .select("*")
        .eq("user_id", user_id)
        .order("sort_order")
        .execute()
    )
    rows = result.data or []
    return APIResponse[list[UserTimeWindowResponse]](
        success=True,
        data=[_row_to_response(r) for r in rows],
    )


@router.post("/user/time-windows", status_code=201)
async def create_time_window(
    body: CreateTimeWindowRequest,
    user_id: str = Depends(get_current_user),
):
    """カスタム枠を作成する。key はサーバー生成 (cw_<random>)。"""
    supabase = get_supabase()
    new_key = f"cw_{token_hex(6)}"

    # sort_order 未指定なら末尾に置く
    sort_order = body.sort_order
    if sort_order is None:
        existing = (
            supabase.table("user_time_windows")
            .select("sort_order")
            .eq("user_id", user_id)
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        last = existing.data[0]["sort_order"] if existing.data else 0
        sort_order = last + 1

    insert_row = {
        "user_id": user_id,
        "key": new_key,
        "label": body.label,
        "start_hour": body.start_hour,
        "end_hour": body.end_hour,
        "is_anytime": False,
        "sort_order": sort_order,
    }
    result = supabase.table("user_time_windows").insert(insert_row).execute()
    return APIResponse[UserTimeWindowResponse](
        success=True,
        data=_row_to_response(result.data[0]),
    )


@router.patch("/user/time-windows/{window_id}")
async def update_time_window(
    window_id: str,
    body: UpdateTimeWindowRequest,
    user_id: str = Depends(get_current_user),
):
    """境界・ラベル・並び順を更新。is_anytime 行は start/end の変更を無視。"""
    supabase = get_supabase()
    current = _get_window_or_raise(supabase, window_id, user_id)

    update: dict = {}
    if body.label is not None:
        update["label"] = body.label
    if body.sort_order is not None:
        update["sort_order"] = body.sort_order
    if not current["is_anytime"]:
        if body.start_hour is not None:
            update["start_hour"] = body.start_hour
        if body.end_hour is not None:
            update["end_hour"] = body.end_hour

    if not update:
        return APIResponse[UserTimeWindowResponse](
            success=True,
            data=_row_to_response(current),
        )

    result = (
        supabase.table("user_time_windows")
        .update(update)
        .eq("id", window_id)
        .execute()
    )
    return APIResponse[UserTimeWindowResponse](
        success=True,
        data=_row_to_response(result.data[0]),
    )


@router.delete("/user/time-windows/{window_id}", status_code=204)
async def delete_time_window(
    window_id: str,
    user_id: str = Depends(get_current_user),
):
    """カスタム枠を削除する。予約 key (morning/noon/evening/anytime) は削除不可。
    削除した枠を参照していた habits.display_window は anytime にリセットする。"""
    supabase = get_supabase()
    current = _get_window_or_raise(supabase, window_id, user_id)

    if current["key"] in RESERVED_TIME_WINDOW_KEYS:
        raise HTTPException(status_code=400, detail="予約された表示タイミングは削除できません")

    deleted_key = current["key"]
    supabase.table("user_time_windows").delete().eq("id", window_id).execute()

    # 関連 habit を anytime にリセット
    supabase.table("habits").update({"display_window": "anytime"}).eq(
        "user_id", user_id
    ).eq("display_window", deleted_key).execute()

    return Response(status_code=204)
