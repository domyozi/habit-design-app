"""
Primary Target（ボス目標）API

エンドポイント:
  GET /api/primary-target     → {value, set_date, completed} | null
  PUT /api/primary-target     → body: {value, set_date, completed}
  GET /api/primary-target/history?from=YYYY-MM-DD&to=YYYY-MM-DD
"""
from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/primary-target")


@router.get("")
async def get_primary_target(
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("primary_targets")
        .select("value, set_date, completed, completed_at")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


@router.get("/history")
async def get_primary_target_history(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("primary_target_days")
        .select("value, set_date, completed, completed_at")
        .eq("user_id", user_id)
        .gte("set_date", from_date)
        .lte("set_date", to_date)
        .order("set_date")
        .execute()
    )
    return result.data or []


@router.put("")
async def upsert_primary_target(
    payload: dict,
    user_id: str = Depends(get_current_user),
):
    supabase = get_supabase()
    completed = bool(payload.get("completed", False))
    now = datetime.now(timezone.utc).isoformat()

    # gate ロジックの「今日」基準。Railway 等 UTC サーバーでは
    # date_type.today() が JST の日付とずれて「翌日への先回り設定」と
    # 誤判定するため、クライアントの client_today (YYYY-MM-DD) があれば
    # それを優先する。
    server_today = date_type.today()
    client_today_raw = payload.get("client_today")
    today = server_today
    if client_today_raw:
        try:
            today = date_type.fromisoformat(str(client_today_raw))
        except ValueError:
            raise HTTPException(status_code=400, detail="client_today must be YYYY-MM-DD")

    set_date_raw = payload.get("set_date") or str(today)

    # PT close gate: 未来日 (today+1 以降) の Primary Target を upsert しようと
    # しているとき、当日の PT がまだ completed=false なら拒否する。
    # 「今日の PT が clean に閉じるまで翌日のフォーカスを書き換えるな」というポリシー。
    # past 日 (日付訂正など履歴編集用途) は許可。
    try:
        set_date_parsed = date_type.fromisoformat(str(set_date_raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="set_date must be YYYY-MM-DD")

    if set_date_parsed > today:
        existing = (
            supabase.table("primary_targets")
            .select("value, set_date, completed")
            .eq("user_id", user_id)
            .execute()
        )
        row = existing.data[0] if existing.data else None
        if row and row.get("set_date") == str(today) and not row.get("completed"):
            raise HTTPException(
                status_code=400,
                detail="先に今日の Primary Target を完了してから翌日以降の PT を設定してください",
            )

    data = {
        "user_id": user_id,
        "value": payload.get("value", ""),
        "set_date": str(set_date_parsed),
        "completed": completed,
        "completed_at": now if completed else None,
        "updated_at": now,
    }

    result = (
        supabase.table("primary_targets")
        .upsert(data, on_conflict="user_id")
        .execute()
    )
    current = result.data[0] if result.data else data
    supabase.table("primary_target_days").upsert(
        {
            "user_id": user_id,
            "set_date": data["set_date"],
            "value": data["value"],
            "completed": data["completed"],
            "completed_at": data["completed_at"],
            "updated_at": data["updated_at"],
        },
        on_conflict="user_id,set_date",
    ).execute()
    return current
