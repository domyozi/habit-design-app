"""
ノート CRUD API

エンドポイント:
  GET    /api/notes            - 一覧取得
  POST   /api/notes            - 新規作成
  PATCH  /api/notes/{id}       - 更新
  DELETE /api/notes/{id}       - 論理削除
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/notes")


@router.get("")
async def list_notes(user_id: str = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("notes")
        .select("*")
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.post("", status_code=201)
async def create_note(payload: dict, user_id: str = Depends(get_current_user)):
    supabase = get_supabase()
    record = {
        "id": payload.get("id") or str(uuid.uuid4()),
        "user_id": user_id,
        "title": payload.get("title", ""),
        "body": payload.get("body", ""),
        "order_index": int(payload.get("order_index", 0)),
    }
    result = supabase.table("notes").insert(record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create note")
    return result.data[0]


@router.patch("/{note_id}")
async def patch_note(note_id: str, payload: dict, user_id: str = Depends(get_current_user)):
    supabase = get_supabase()
    allowed = {"title", "body", "order_index"}
    update_data = {k: v for k, v in payload.items() if k in allowed}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("notes")
        .update(update_data)
        .eq("id", note_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")
    return result.data[0]


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: str, user_id: str = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("notes").update(
        {"deleted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", note_id).eq("user_id", user_id).execute()
