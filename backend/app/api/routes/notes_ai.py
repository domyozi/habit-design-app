"""
Notes inline AI endpoint.

POST /api/ai/notes-prompt-stream
  - 選択範囲 + ノート全文を context として Claude Haiku に投げる
  - SSE で text_chunk → done を返す
  - レート制限: admin (ADMIN_USER_IDS allowlist) は無制限、一般ユーザは 1 日 10 回 (UTC)
  - 課金/usage 記録は ai_service.stream_message_events 内で自動的に claude_api_logs に書かれる
    (feature='notes_ai_inline')。レート制限カウンタも同じテーブルを SELECT して算出する。
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user, is_admin_user
from app.core.supabase import get_supabase
from app.services import ai_service
from app.services.notes_prompts import (
    NOTE_CONTEXT_MAX_CHARS,
    PROMPT_MAX_CHARS,
    SELECTION_MAX_CHARS,
    build_notes_prompt,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai")

FEATURE_NAME = "notes_ai_inline"
DAILY_LIMIT_NON_ADMIN = 10
ALLOWED_MODES = {"freeform", "summarize", "rewrite", "translate", "continue", "tone"}


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _today_utc_iso() -> str:
    """rate-limit window 用に "今日 (UTC) の 00:00" を ISO で返す。"""
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _count_today_calls(user_id: str) -> int:
    """claude_api_logs で notes_ai_inline の本日 (UTC) コール数を返す。
    失敗時は 0 を返す (= レート判定を fail-open にする。観測性は logger に残る)。
    """
    try:
        client = get_supabase()
        res = (
            client.table("claude_api_logs")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("feature", FEATURE_NAME)
            .gte("created_at", _today_utc_iso())
            .limit(1)
            .execute()
        )
        return int(getattr(res, "count", 0) or 0)
    except Exception as e:  # noqa: BLE001
        logger.warning("notes-ai rate-count failed user=%s: %s", user_id, e)
        return 0


@router.post("/notes-prompt-stream")
async def notes_prompt_stream(
    request: Request,
    user_id: str = Depends(get_current_user),
):
    """Notes inline AI SSE.

    Body:
      {
        "note_id": "uuid" (optional, ログ用),
        "note_markdown": "全文 markdown",
        "selection_text": "選択範囲 (空可)",
        "prompt": "ユーザ入力 + preset 統合後のテキスト",
        "mode": "freeform" | "summarize" | "rewrite" | "translate" | "continue" | "tone"
      }
    """
    body = await request.json()
    note_md = str(body.get("note_markdown") or "")
    selection = str(body.get("selection_text") or "")
    prompt = str(body.get("prompt") or "")
    mode = str(body.get("mode") or "freeform")
    if mode not in ALLOWED_MODES:
        mode = "freeform"

    # 入力上限: フロントが暴走しても backend 側で head/tail truncate するので
    # ここでは「明らかに巨大」だけ早期 reject (10x margin で 413 を返す)。
    if (
        len(note_md) > NOTE_CONTEXT_MAX_CHARS * 10
        or len(selection) > SELECTION_MAX_CHARS * 10
        or len(prompt) > PROMPT_MAX_CHARS * 10
    ):
        raise HTTPException(status_code=413, detail="payload too large")

    # 空 prompt + 空 selection は弾く (AI 呼び出しの無意味なコスト発生防止)
    if not prompt.strip() and not selection.strip():
        raise HTTPException(status_code=400, detail="prompt or selection required")

    # ─── レート制限 ──────────────────────────────────────
    if not is_admin_user(user_id):
        used = _count_today_calls(user_id)
        if used >= DAILY_LIMIT_NON_ADMIN:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "daily_limit_exceeded",
                    "limit": DAILY_LIMIT_NON_ADMIN,
                    "used": used,
                },
            )

    system_prompt, user_prompt = build_notes_prompt(
        note_markdown=note_md,
        selection_text=selection,
        prompt=prompt,
        mode=mode,
    )
    messages = [{"role": "user", "content": user_prompt}]

    logger.info(
        "notes-ai-stream user=%s mode=%s ctx_len=%d sel_len=%d prompt_len=%d",
        user_id, mode, len(note_md), len(selection), len(prompt),
    )

    started_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    async def generate():
        yield _sse({
            "type": "meta",
            "tracing_id": f"notes-ai-{started_ms}",
            "mode": mode,
            "model": "claude-haiku-4-5-20251001",
        })
        try:
            async for ev in ai_service.stream_message_events(
                messages=messages,
                user_id=user_id,
                feature=FEATURE_NAME,
                system_prompt=system_prompt,
                max_tokens=1024,
                model="claude-haiku-4-5-20251001",
            ):
                if ev.get("type") == "text":
                    chunk = ev.get("content", "")
                    if chunk:
                        yield _sse({"type": "text_chunk", "content": chunk})
        except ai_service.AIUnavailableError as e:
            logger.error("notes-ai-stream: claude unavailable: %s", e)
            yield _sse({"type": "error", "code": "STREAM_FAILED", "message": str(e)})
            return
        except asyncio.CancelledError:
            # クライアントが abort した場合は静かに終わる
            raise
        except Exception as e:  # noqa: BLE001
            logger.error("notes-ai-stream: unexpected error: %s", e)
            yield _sse({"type": "error", "code": "STREAM_FAILED", "message": str(e)})
            return

        yield _sse({"type": "done"})

    return StreamingResponse(generate(), media_type="text/event-stream")
