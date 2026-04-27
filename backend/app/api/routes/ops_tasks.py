"""
オペレーションタスク CRUD API

エンドポイント:
  GET    /api/ops-tasks?date={YYYY-MM-DD}  → OpsTask[]
  POST   /api/ops-tasks                    → body: OpsTask[] (date 含む) → upsert
  PATCH  /api/ops-tasks/{id}               → body: {done: bool, task_date: str}
  DELETE /api/ops-tasks/{id}               → body: {task_date: str}
"""
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/ops-tasks")


@router.get("")
async def get_ops_tasks(
    date: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    task_date = date or str(date_type.today())

    result = (
        supabase.table("ops_tasks")
        .select("id, title, done, created_at")
        .eq("user_id", user_id)
        .eq("task_date", task_date)
        .order("created_at")
        .execute()
    )
    return result.data or []


@router.post("", status_code=201)
async def upsert_ops_tasks(
    payload: List[dict],
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    rows = []
    for task in payload:
        rows.append({
            "user_id": user_id,
            "task_date": task.get("task_date", str(date_type.today())),
            "id": task["id"],
            "title": task["title"],
            "done": task.get("done", False),
        })

    if not rows:
        return []

    result = (
        supabase.table("ops_tasks")
        .upsert(rows, on_conflict="user_id,task_date,id")
        .execute()
    )
    return result.data or []


@router.patch("/{task_id}")
async def patch_ops_task(
    task_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    task_date = payload.get("task_date", str(date_type.today()))

    result = (
        supabase.table("ops_tasks")
        .update({"done": payload["done"]})
        .eq("user_id", user_id)
        .eq("task_date", task_date)
        .eq("id", task_id)
        .execute()
    )
    return result.data[0] if result.data else {}


@router.delete("/{task_id}", status_code=204)
async def delete_ops_task(
    task_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    task_date = payload.get("task_date", str(date_type.today()))

    supabase.table("ops_tasks").delete().eq("user_id", user_id).eq("task_date", task_date).eq("id", task_id).execute()
    return None
