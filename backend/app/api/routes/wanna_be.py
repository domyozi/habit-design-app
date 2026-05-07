"""
Wanna Be API
TASK-0006: Wanna Be・長期目標・ユーザープロフィールAPI実装
TASK-0010: Claude AI統合・SSEストリーミング実装

【エンドポイント】:
  GET  /api/wanna-be         - 現在有効な Wanna Be 取得（未登録時 204）
  POST /api/wanna-be/analyze - Wanna BeをClaude AIで分析してSSEストリーミング

🔵 信頼性レベル: REQ-201/202/203・api-endpoints.md より
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app.core.exceptions import AppError
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import APIResponse, ErrorDetail, ErrorResponse, UpsertWannaBeRequest, WannaBe
from app.services.ai_service import AIUnavailableError, analyze_wanna_be

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/wanna-be")
async def get_wanna_be(
    user_id: str = Depends(get_current_user),
):
    """
    【GET /wanna-be】: 現在有効な Wanna Be 取得
    【204レスポンス】: Wanna Be 未登録の場合は 204 No Content
    【認証必須】: JWTから user_id を取得
    🔵 信頼性レベル: REQ-201/202・api-endpoints.md より
    """
    # 【DB取得】: user_id と is_current=true でフィルタ
    supabase = get_supabase()
    result = (
        supabase.table("wanna_be")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_current", True)
        .single()
        .execute()
    )

    # 【未登録チェック】: レコードがない場合は 204 No Content を返す
    if result.data is None:
        return Response(status_code=204)

    return APIResponse(success=True, data=WannaBe(**result.data))


@router.post("/wanna-be/analyze")
async def analyze_wanna_be_endpoint(
    request: UpsertWannaBeRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /wanna-be/analyze】: Wanna BeをDB保存してClaude AIで分析、SSEでストリーミング
    【保存】: wanna_be テーブルに UPSERT（version+1, is_current=true で保存）
    【SSE】: StreamingResponse で text/event-stream を返す
    【AI障害】: 503 を返し、Wanna Beテキストは保存済みであることを示す（EDGE-001）
    🔵 信頼性レベル: REQ-201/203・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【現在のWanna Be取得】: version管理のため現在のバージョンを確認
    current = (
        supabase.table("wanna_be")
        .select("version")
        .eq("user_id", user_id)
        .eq("is_current", True)
        .execute()
    )
    current_version = current.data[0]["version"] if current.data else 0

    # 【既存を非活性化】: is_current=false に更新
    supabase.table("wanna_be").update({"is_current": False}).eq("user_id", user_id).execute()

    # 【新しいWanna Be保存】: version+1 で INSERT
    insert_result = supabase.table("wanna_be").insert({
        "user_id": user_id,
        "text": request.text,
        "version": current_version + 1,
        "is_current": True,
    }).execute()

    saved_wanna_be = insert_result.data[0] if insert_result.data else {}

    async def sse_generator():
        """【SSEジェネレータ】: Claude APIのストリームをSSEフォーマットで送信"""
        try:
            async for chunk in analyze_wanna_be(wanna_be_text=request.text, user_id=user_id):
                yield chunk
        except AIUnavailableError:
            import json
            logger.error("Wanna Be分析中にClaude API障害が発生")
            # 【AI障害】: エラーイベントをSSEで送信
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI_UNAVAILABLE'})}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
