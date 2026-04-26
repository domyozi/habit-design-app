"""
AI コーチ API（週次レビューSSEストリーミング）
TASK-0010: Claude AI統合・Wanna Be分析+週次レビューSSEストリーミング実装

【エンドポイント】:
  GET /api/ai/weekly-review/stream - 週次レビューAIフィードバックをSSEで生成

🔵 信頼性レベル: REQ-601/702・api-endpoints.md より
"""
import json
import logging
import time
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from app.core.security import get_current_user, get_current_user_from_header_or_query
from app.core.supabase import get_supabase
from app.models.schemas import APIResponse, ErrorDetail, ErrorResponse
from app.services.ai_service import AIUnavailableError, create_message, generate_weekly_review, stream_message

logger = logging.getLogger(__name__)
router = APIRouter()

_AI_RATE_LIMIT_WINDOW_SECONDS = 60
_AI_RATE_LIMIT_MAX_REQUESTS = 12
_AI_RATE_LIMIT_BUCKETS: dict[str, list[float]] = {}


class AIMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=12000)


class AIMessageRequest(BaseModel):
    messages: list[AIMessage] = Field(..., min_length=1, max_length=20)
    system: str | None = Field(default=None, max_length=12000)
    max_tokens: int = Field(default=1024, ge=1, le=4096)

    @field_validator("messages")
    @classmethod
    def validate_total_input_size(cls, messages: list[AIMessage]):
        total_chars = sum(len(message.content) for message in messages)
        if total_chars > 30000:
            raise ValueError("入力が長すぎます")
        return messages


def _enforce_ai_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    window_start = now - _AI_RATE_LIMIT_WINDOW_SECONDS
    recent = [
        requested_at
        for requested_at in _AI_RATE_LIMIT_BUCKETS.get(user_id, [])
        if requested_at >= window_start
    ]
    if len(recent) >= _AI_RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="AI request rate limit exceeded")

    recent.append(now)
    _AI_RATE_LIMIT_BUCKETS[user_id] = recent


def _to_anthropic_messages(request: AIMessageRequest) -> list[dict[str, str]]:
    return [message.model_dump() for message in request.messages]


def _get_week_start(target_date: date) -> date:
    """【週開始日取得】: 指定日の月曜日を返す"""
    return target_date - timedelta(days=target_date.weekday())


@router.post("/ai/messages")
async def create_ai_message(
    request: AIMessageRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /ai/messages】: ブラウザにAI APIキーを露出せず、サーバー側でClaudeを呼び出す。
    """
    _enforce_ai_rate_limit(user_id)

    try:
        text = await create_message(
            messages=_to_anthropic_messages(request),
            system_prompt=request.system,
            max_tokens=request.max_tokens,
        )
    except AIUnavailableError:
        return JSONResponse(
            status_code=503,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="AI_UNAVAILABLE",
                    message="AIサービスが一時的に利用できません。",
                )
            ).model_dump(),
        )

    return APIResponse(success=True, data={"text": text}).model_dump()


@router.post("/ai/messages/stream")
async def stream_ai_message(
    request: Request,
    body: AIMessageRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /ai/messages/stream】: Claudeのテキスト生成をSSEで返す。
    """
    _enforce_ai_rate_limit(user_id)

    async def sse_generator():
        try:
            async for chunk in stream_message(
                messages=_to_anthropic_messages(body),
                system_prompt=body.system,
                max_tokens=body.max_tokens,
            ):
                if await request.is_disconnected():
                    break
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except AIUnavailableError:
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI_UNAVAILABLE'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/ai/weekly-review/stream")
async def stream_weekly_review(
    week_start: str = Query(default=None, description="週開始日（YYYY-MM-DD、省略時は今週月曜）"),
    user_id: str = Depends(get_current_user_from_header_or_query),
):
    """
    【GET /ai/weekly-review/stream】: 週次レビューAIフィードバックをSSEで生成
    【DB保存】: weekly_reviews テーブルに pending → completed で更新
    【送信データ】: 習慣タイトル・達成率・未達成理由のみ（個人情報除外 REQ-605）
    【AI障害】: SSEでエラーイベントを送信（EDGE-001）
    🔵 信頼性レベル: REQ-601/702・api-endpoints.md より
    """
    supabase = get_supabase()

    # 【週開始日決定】: 省略時は今週の月曜日
    if week_start:
        week_start_date = date.fromisoformat(week_start)
    else:
        week_start_date = _get_week_start(date.today())

    week_end_date = week_start_date + timedelta(days=6)
    week_start_str = str(week_start_date)
    week_end_str = str(week_end_date)

    # 【weekly_reviews INSERT/UPDATE】: pending 状態で記録開始
    existing = (
        supabase.table("weekly_reviews")
        .select("id")
        .eq("user_id", user_id)
        .eq("week_start", week_start_str)
        .execute()
    )

    if existing.data:
        review_id = existing.data[0]["id"]
        supabase.table("weekly_reviews").update({"status": "generating"}).eq("id", review_id).execute()
    else:
        insert_result = supabase.table("weekly_reviews").insert({
            "user_id": user_id,
            "week_start": week_start_str,
            "week_end": week_end_str,
            "status": "generating",
        }).execute()
        review_id = insert_result.data[0]["id"] if insert_result.data else None

    # 【習慣データ取得】: タイトルと達成サマリー（個人情報なし）
    habits_result = (
        supabase.table("habits")
        .select("id, title, current_streak")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    habits = habits_result.data or []

    # 【週間ログ取得】: 当週の habit_logs を集計
    logs_result = (
        supabase.table("habit_logs")
        .select("habit_id, completed, log_date")
        .eq("user_id", user_id)
        .gte("log_date", week_start_str)
        .lte("log_date", week_end_str)
        .execute()
    )
    logs = logs_result.data or []

    # 【達成率計算】
    total = len(logs)
    completed_count = sum(1 for log in logs if log.get("completed"))
    achievement_rate = (completed_count / total * 100) if total > 0 else 0.0

    # 【習慣別サマリー構築】: タイトルのみ（IDは除外）
    habit_title_map = {h["id"]: h["title"] for h in habits}
    habits_summary = []
    for h in habits:
        habit_logs = [log for log in logs if log["habit_id"] == h["id"]]
        achieved = sum(1 for log in habit_logs if log.get("completed"))
        habits_summary.append({
            "habit_title": h["title"],
            "achieved_days": achieved,
            "total_days": len(habit_logs),
            "streak": h.get("current_streak", 0),
        })

    # 【未達成理由取得】: テキストのみ送信（個人情報除外）
    failure_result = (
        supabase.table("failure_reasons")
        .select("reason")
        .eq("user_id", user_id)
        .execute()
    )
    failure_reasons = [r["reason"] for r in (failure_result.data or [])]

    async def sse_generator():
        """【SSEジェネレータ】: 週次レビューをSSEでストリーミング"""
        try:
            actions = []
            async for chunk in generate_weekly_review(
                habits_summary=habits_summary,
                failure_reasons=failure_reasons,
                achievement_rate=achievement_rate,
            ):
                # doneチャンクからアクションを抽出
                if '"type": "done"' in chunk or '"type":"done"' in chunk:
                    try:
                        data_str = chunk.replace("data: ", "").strip()
                        done_data = json.loads(data_str)
                        actions = done_data.get("actions", [])
                    except (json.JSONDecodeError, ValueError):
                        pass
                yield chunk

            # 【DB更新】: completed に更新
            if review_id:
                supabase.table("weekly_reviews").update({
                    "status": "completed",
                    "achievement_rate": achievement_rate,
                    "suggested_actions": actions,
                }).eq("id", review_id).execute()

        except AIUnavailableError:
            logger.error("週次レビュー生成中にClaude API障害が発生")
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI_UNAVAILABLE'})}\n\n"

            # 【DB更新】: failed に更新
            if review_id:
                supabase.table("weekly_reviews").update({"status": "failed"}).eq("id", review_id).execute()

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
