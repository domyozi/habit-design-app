"""
Todo定義 CRUD API

エンドポイント:
  GET    /api/todo-definitions        - 一覧取得
  POST   /api/todo-definitions        - 一括保存（upsert）
  PATCH  /api/todo-definitions/{id}   - 個別更新
  DELETE /api/todo-definitions/{id}   - 論理削除
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/todo-definitions")


@router.get("")
async def list_todo_definitions(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("todo_definitions")
        .select("*")
        .eq("user_id", user_id)
        .order("display_order", desc=False)
        .execute()
    )
    return result.data


@router.post("", status_code=201)
async def upsert_todo_definitions(
    payload: list,
    user_id: str = Depends(get_current_user),
):
    """配列を受け取り、既存レコードは更新・新規は挿入する。"""
    if not payload:
        return []

    supabase = get_supabase()
    records = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        record = {
            "id": item.get("id") or str(uuid.uuid4()),
            "user_id": user_id,
            "label": item.get("label", ""),
            "section": item.get("section", "system"),
            "timing": item.get("timing", "morning"),
            "minutes": item.get("minutes"),
            "monthly_target": item.get("monthly_target"),
            "is_must": bool(item.get("is_must", False)),
            "is_active": bool(item.get("is_active", True)),
            "display_order": int(item.get("display_order", 0)),
            "field_type": item.get("field_type", "checkbox"),
            "field_options": item.get("field_options", {}),
        }
        records.append(record)

    result = (
        supabase.table("todo_definitions")
        .upsert(records, on_conflict="id")
        .execute()
    )
    return result.data


@router.patch("/{definition_id}")
async def patch_todo_definition(
    definition_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()

    allowed_fields = {"label", "section", "timing", "minutes", "monthly_target", "is_must", "is_active", "display_order", "field_type", "field_options"}
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        supabase.table("todo_definitions")
        .update(update_data)
        .eq("id", definition_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")
    return result.data[0]


@router.delete("/{definition_id}", status_code=204)
async def delete_todo_definition(
    definition_id: str,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    supabase.table("todo_definitions").update({"is_active": False}).eq("id", definition_id).eq("user_id", user_id).execute()
