"""
Tasks CRUD API for Daily OS v3 Calendar / Flow.

Endpoints:
  GET    /api/tasks                  - list tasks with optional filters
  GET    /api/tasks/stats/weekly     - weekly completed/scheduled stats
  GET    /api/tasks/{task_id}        - fetch one task
  POST   /api/tasks                  - create task
  PATCH  /api/tasks/{task_id}        - update task
  DELETE /api/tasks/{task_id}        - delete task
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/tasks")

VALID_STATUSES = {"inbox", "scheduled", "completed", "dismissed", "archived"}
VALID_SOURCES = {"flow_coach", "manual", "note_ai_extract", "gcal_import"}
PATCH_FIELDS = {
    "title",
    "description",
    "habit_id",
    "note_id",
    "status",
    "scheduled_at",
    "scheduled_end",
    "google_event_id",
    "due_date",
    "completed_at",
}
CREATE_FIELDS = PATCH_FIELDS | {"source", "source_journal_id"}
ACTIVE_STATUSES = {"inbox", "scheduled", "completed"}


def _parse_statuses(status: Optional[list[str]]) -> list[str] | None:
    if not status:
        return None
    values: list[str] = []
    for item in status:
        values.extend(part.strip() for part in item.split(",") if part.strip())
    invalid = [s for s in values if s not in VALID_STATUSES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid status: {', '.join(invalid)}")
    return values or None


def _validate_source(source: Any) -> None:
    if source is not None and source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}")


def _normalize_create_payload(payload: dict[str, Any], user_id: str) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    status = payload.get("status") or "inbox"
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    _validate_source(payload.get("source"))

    now = datetime.now(timezone.utc).isoformat()
    row = {k: payload.get(k) for k in CREATE_FIELDS if k in payload}
    row.update(
        {
            "id": payload.get("id") or str(uuid4()),
            "user_id": user_id,
            "title": title,
            "status": status,
        }
    )
    if status == "completed":
        row["completed_at"] = row.get("completed_at") or now
    else:
        row["completed_at"] = None
    return row


def _normalize_patch_payload(payload: dict[str, Any]) -> dict[str, Any]:
    patch = {k: payload.get(k) for k in PATCH_FIELDS if k in payload}
    if not patch:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    if "title" in patch:
        title = str(patch["title"] or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        patch["title"] = title
    if "status" in patch:
        status = patch["status"]
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        if status == "completed" and not patch.get("completed_at"):
            patch["completed_at"] = datetime.now(timezone.utc).isoformat()
        elif status != "completed":
            patch["completed_at"] = None
    return patch


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("")
async def list_tasks(
    status: Optional[list[str]] = Query(default=None),
    note_id: Optional[str] = None,
    habit_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    statuses = _parse_statuses(status)
    supabase = get_supabase()
    query = supabase.table("tasks").select("*").eq("user_id", user_id)
    if statuses:
        query = query.in_("status", statuses)
    if note_id is not None:
        query = query.eq("note_id", note_id)
    if habit_id is not None:
        query = query.eq("habit_id", habit_id)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


@router.get("/stats/weekly")
async def weekly_stats(
    week_start: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    if week_start:
        try:
            start = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(status_code=400, detail="week_start must be YYYY-MM-DD")
    else:
        start = _monday_of(date.today())
    end = start + timedelta(days=7)
    start_iso = start.isoformat()
    end_iso = end.isoformat()

    supabase = get_supabase()
    result = (
        supabase.table("tasks")
        .select("status, scheduled_at, completed_at")
        .eq("user_id", user_id)
        .in_("status", list(ACTIVE_STATUSES))
        .execute()
    )
    rows = result.data or []

    completed = 0
    total = 0
    for row in rows:
        completed_at = row.get("completed_at")
        scheduled_at = row.get("scheduled_at")
        status_value = row.get("status")
        if status_value == "completed" and completed_at and start_iso <= completed_at[:10] < end_iso:
            completed += 1
            total += 1
        elif status_value == "scheduled" and scheduled_at and start_iso <= scheduled_at[:10] < end_iso:
            total += 1

    return {"week_start": start_iso, "completed": completed, "total": total}


@router.get("/{task_id}")
async def get_task(task_id: str, user_id: str = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return result.data[0]


@router.post("", status_code=201)
async def create_task(payload: dict[str, Any], user_id: str = Depends(get_current_user)):
    row = _normalize_create_payload(payload, user_id)
    supabase = get_supabase()
    result = supabase.table("tasks").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Task insert failed")
    return result.data[0]


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user),
):
    patch = _normalize_patch_payload(payload)
    supabase = get_supabase()
    result = (
        supabase.table("tasks")
        .update(patch)
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return result.data[0]


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str, user_id: str = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("tasks").delete().eq("id", task_id).eq("user_id", user_id).execute()
    return None
