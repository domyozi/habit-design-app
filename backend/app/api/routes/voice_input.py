"""
音声入力API
TASK-0009: 音声入力AI分類サービス実装

【エンドポイント】:
  POST /api/voice-input - テキスト分類・習慣ログ更新またはジャーナル保存

【処理フロー】:
  1. ユーザーの有効な習慣一覧を取得
  2. Claude APIで入力テキストを分類
  3. 分類結果に応じて後処理（ログ更新/ジャーナル保存）
  4. Claude API障害時は 503 AI_UNAVAILABLE を返す（EDGE-001）

🔵 信頼性レベル: REQ-401/402/403・EDGE-001/003・api-endpoints.md より
"""
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import (
    APIResponse,
    ErrorDetail,
    ErrorResponse,
    HabitLog,
    JournalEntry,
    VoiceInputRequest,
)
from app.services import badge_service, streak_service
from app.services.voice_classifier import (
    AIUnavailableError,
    ClassificationResult,
    classify_voice_input,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/voice-input")
async def process_voice_input(
    request: VoiceInputRequest,
    user_id: str = Depends(get_current_user),
):
    """
    【POST /voice-input】: 音声入力テキストをAI分類し、適切な後処理を実行する
    【チェックリスト】: 習慣ログを自動更新（ストリーク・バッジも更新）
    【ジャーナリング/日報】: journal_entries に保存
    【unknown】: DBへの保存は行わず、確認メッセージを返す（EDGE-003）
    【AI障害】: 503 AI_UNAVAILABLE を返し、通常トラッキング機能の継続を案内（EDGE-001）
    🔵 信頼性レベル: REQ-401/402/403・EDGE-001/003・api-endpoints.md より
    """
    supabase = get_supabase()
    log_date = date.fromisoformat(request.date)

    # 【習慣一覧取得】: 有効な習慣リストをClaude APIに渡す（タイトルのみ）
    habits_result = (
        supabase.table("habits")
        .select("id, title")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )
    user_habits = habits_result.data or []

    # 【AI分類】: Claude APIでテキストを分類
    try:
        classification = classify_voice_input(
            text=request.text,
            user_habits=user_habits,
            log_date=log_date,
        )
    except AIUnavailableError:
        # 【AI障害処理】: EDGE-001 - 503 を返し、通常機能継続を案内
        return JSONResponse(
            status_code=503,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="AI_UNAVAILABLE",
                    message="AIサービスが一時的に利用できません。通常のトラッキング機能は継続して使用できます。",
                )
            ).model_dump(),
        )

    # 【分類後処理】: 分類タイプに応じた処理を実行
    return await _handle_classification(
        supabase=supabase,
        classification=classification,
        user_id=user_id,
        log_date=log_date,
        original_text=request.text,
    )


async def _handle_classification(
    supabase,
    classification: ClassificationResult,
    user_id: str,
    log_date: date,
    original_text: str,
):
    """
    【分類後処理】: 分類タイプに応じてDB操作を実行する
    🔵 信頼性レベル: REQ-401/402/403・EDGE-003 より
    """
    if classification.type == "checklist":
        return await _handle_checklist(supabase, classification, user_id, log_date)

    if classification.type in ("journaling", "daily_report", "kpi_update"):
        return await _handle_journal(
            supabase, classification, user_id, log_date, original_text
        )

    # 【unknown処理】: EDGE-003 - 確認メッセージを返す
    return JSONResponse(
        status_code=200,
        content=APIResponse(
            success=True,
            data={"message": "どの操作ですか？入力内容を確認してください。"},
            message="unknown",
        ).model_dump(),
    )


async def _handle_checklist(supabase, classification: ClassificationResult, user_id: str, log_date: date):
    """
    【チェックリスト処理】: 各習慣のログを更新し、ストリーク・バッジも更新する
    🔵 信頼性レベル: REQ-401/403 より
    """
    updated_habits = []
    failed_habits = []

    for habit_result in (classification.habit_results or []):
        habit_id = habit_result.habit_id
        completed = habit_result.completed

        try:
            # 【ログUPSERT】
            log_data = {
                "habit_id": habit_id,
                "user_id": user_id,
                "log_date": str(log_date),
                "completed": completed,
                "input_method": "voice",
            }
            if completed:
                log_data["completed_at"] = datetime.now(timezone.utc).isoformat()

            result = (
                supabase.table("habit_logs")
                .upsert(log_data, on_conflict="habit_id,log_date")
                .execute()
            )
            log = result.data[0] if result.data else log_data

            # 【ストリーク更新】
            if completed:
                current_streak = streak_service.calculate_streak(
                    supabase, habit_id, user_id, log_date
                )
                streak_service.update_streak(supabase, habit_id, current_streak)
                badge_service.check_and_award_badges(supabase, user_id, habit_id, current_streak)
            else:
                supabase.table("habits").update({"current_streak": 0}).eq("id", habit_id).execute()

            updated_habits.append(log)

        except Exception as e:
            logger.error("習慣ログ更新エラー habit_id=%s: %s", habit_id, str(e))
            failed_habits.append({
                "habit_id": habit_id,
                "habit_title": habit_result.habit_title,
                "error": str(e),
            })

    return APIResponse(
        success=True,
        data={
            "type": "checklist",
            "updated_habits": updated_habits,
            "failed_habits": failed_habits,
        },
    ).model_dump(mode="json")


async def _handle_journal(
    supabase,
    classification: ClassificationResult,
    user_id: str,
    log_date: date,
    original_text: str,
):
    """
    【ジャーナル処理】: journal_entries テーブルに記録する
    🔵 信頼性レベル: REQ-402 より
    """
    content = classification.content or original_text

    result = (
        supabase.table("journal_entries")
        .insert({
            "user_id": user_id,
            "entry_date": str(log_date),
            "content": content,
            "entry_type": classification.type,
            "raw_input": original_text,
        })
        .execute()
    )

    journal_data = result.data[0] if result.data else {
        "user_id": user_id,
        "entry_date": str(log_date),
        "content": content,
        "entry_type": classification.type,
    }

    return APIResponse(
        success=True,
        data={
            "type": classification.type,
            "journal_entry": journal_data,
        },
    ).model_dump(mode="json")
