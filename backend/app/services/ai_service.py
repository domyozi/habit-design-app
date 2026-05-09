"""
AIサービス基盤（SSEストリーミング）
TASK-0010: Claude AI統合・Wanna Be分析+週次レビューSSEストリーミング実装

【設計方針】:
- AsyncAnthropic クライアントで非同期SSEストリーミングを実現
- 送信データは統計・タイトル等に限定（個人情報除外 REQ-605）
- Claude API障害時は AIUnavailableError をraise（EDGE-001）

【Phase 1 ログ基盤】:
- 全 wrapper に user_id / feature を必須引数として追加
- metadata.user_id には hashed_user_id(user_id) を渡す
- streaming は stream.get_final_message().usage で usage 取得、
  cancel 時は current_message_snapshot.usage で部分 usage 取得
- finally で必ず log_claude_call を await（fire-and-forget は generator 切断で消える）

🔵 信頼性レベル: REQ-203/602/702・NFR-002・design-interview.md Q5 より
"""
import asyncio
import json
import logging
import os
import time
from typing import AsyncGenerator

from app.core.anthropic_metadata import hashed_user_id
from app.services.claude_logger import log_claude_call

logger = logging.getLogger(__name__)

# Wanna Be分析プロンプト
_WANNA_BE_SYSTEM_PROMPT = """あなたは習慣設計の専門コーチです。
ユーザーの「なりたい自分」（Wanna Be）のテキストから、
具体的で達成可能な長期目標（最大3件）を提案してください。

目標は以下の条件を満たすこと:
- 具体的で測定可能
- 6〜12ヶ月で達成可能な規模
- Wanna Beのビジョンに直結している

出力は分析テキストに続けて、最後に以下のJSON形式で目標を出力してください:
[GOALS_JSON]
[{"title": "目標1のタイトル", "description": "目標1の説明"}, ...]
[/GOALS_JSON]"""

# 週次レビュープロンプト
_WEEKLY_REVIEW_SYSTEM_PROMPT = """あなたは習慣トラッキングのAIコーチです。
ユーザーの過去1週間の習慣達成データを分析し、
励ましと具体的な改善提案を含むフィードバックを生成してください。

フィードバックの構成:
1. 今週の頑張りを認める（具体的な達成を称える）
2. 改善できる点の提案（課題は1〜2点に絞る）
3. 来週に向けた具体的なアクション提案（AI提案アクション形式）

出力は分析テキストに続けて、最後に以下のJSON形式でアクションを出力してください:
[ACTIONS_JSON]
[{"action_type": "change_time"|"add_habit"|"remove_habit", "habit_id": "...", "params": {}}]
[/ACTIONS_JSON]"""


class AIUnavailableError(Exception):
    """【AI障害エラー】: Claude APIが利用不能な場合（EDGE-001）"""
    pass


async def create_message(
    messages: list[dict[str, str]],
    *,
    user_id: str,
    feature: str,
    system_prompt: str | None = None,
    max_tokens: int = 1024,
    async_client=None,
    model: str = "claude-haiku-4-5-20251001",
) -> str:
    """
    Browser clients must not call Anthropic directly. This server-side wrapper
    keeps the API key in backend environment variables and returns plain text.
    Sprint G3: model 引数追加（KPI 提案など分析系は Sonnet を指定したい）

    Phase 1 logging: user_id / feature 必須化、usage を claude_api_logs に記録。
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "metadata": {"user_id": hashed_user_id(user_id)},
    }
    if system_prompt:
        kwargs["system"] = system_prompt

    start = time.monotonic()
    status = "ok"
    error_kind: str | None = None
    usage = None
    request_id: str | None = None
    try:
        response = await async_client.messages.create(**kwargs)
        usage = getattr(response, "usage", None)
        request_id = getattr(response, "id", None)
        text_blocks = [
            block.text
            for block in response.content
            if getattr(block, "type", None) == "text" and getattr(block, "text", None)
        ]
        return "".join(text_blocks)
    except anthropic.APIError as e:
        status, error_kind = "error", type(e).__name__
        logger.error("Claude API障害 (create_message): %s", str(e))
        raise AIUnavailableError("Claude API is unavailable") from e
    except Exception as e:
        status, error_kind = "error", type(e).__name__
        raise
    finally:
        await log_claude_call(
            user_id=user_id,
            feature=feature,
            model=model,
            streaming=False,
            usage=usage,
            latency_ms=int((time.monotonic() - start) * 1000),
            status=status,
            error_kind=error_kind,
            request_id=request_id,
        )


async def stream_message(
    messages: list[dict[str, str]],
    *,
    user_id: str,
    feature: str,
    system_prompt: str | None = None,
    max_tokens: int = 1024,
    async_client=None,
    model: str = "claude-haiku-4-5-20251001",
    tools: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream text chunks from Anthropic as plain strings. HTTP/SSE formatting is
    handled by the route layer.

    Sprint 6.5.4: tools パラメータを追加。web_search 等のサーバ側ツールを Claude に
    使わせたい場合に渡す。tool 結果は SDK 内部で処理されてアシスタントの応答に組み込まれ、
    text_stream には最終的なテキストだけが流れる。

    Phase 1 logging: stream.get_final_message().usage で完全 usage 取得、
    cancel 時は current_message_snapshot.usage で部分取得。
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "metadata": {"user_id": hashed_user_id(user_id)},
    }
    if system_prompt:
        kwargs["system"] = system_prompt
    if tools:
        kwargs["tools"] = tools

    start = time.monotonic()
    status = "ok"
    error_kind: str | None = None
    usage = None
    request_id: str | None = None
    try:
        async with async_client.messages.stream(**kwargs) as stream:
            try:
                async for text in stream.text_stream:
                    yield text
            except (asyncio.CancelledError, GeneratorExit):
                status = "cancelled"
                snap = getattr(stream, "current_message_snapshot", None)
                if snap is not None:
                    usage = getattr(snap, "usage", None)
                raise
            # 正常終了 → final message から完全 usage を取得
            final = await stream.get_final_message()
            usage = getattr(final, "usage", None)
            request_id = getattr(final, "id", None)
    except anthropic.APIError as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        logger.error("Claude API障害 (stream_message): %s", str(e))
        raise AIUnavailableError("Claude API is unavailable") from e
    except (asyncio.CancelledError, GeneratorExit):
        # text_stream 抜けた後で起きた cancel
        if status != "cancelled":
            status = "cancelled"
        raise
    except Exception as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        raise
    finally:
        await log_claude_call(
            user_id=user_id,
            feature=feature,
            model=model,
            streaming=True,
            usage=usage,
            latency_ms=int((time.monotonic() - start) * 1000),
            status=status,
            error_kind=error_kind,
            request_id=request_id,
        )


async def stream_message_events(
    # Sprint flow-image: content は str だけでなく list[ContentBlock] も受け付ける
    # （Anthropic SDK が両方サポートしているため）。型注釈を緩和。
    messages: list[dict],
    *,
    user_id: str,
    feature: str,
    system_prompt: str | None = None,
    max_tokens: int = 1024,
    async_client=None,
    model: str = "claude-haiku-4-5-20251001",
    tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    """
    stream_message のリッチ版。テキストチャンクに加えて server-side tool 利用も
    検知して event として yield する。Coach UI で「web 検索中」表示を出すために
    必要（Anthropic SDK の text_stream はテキストしか流さないため別経路）。

    Yields:
        - {"type": "text", "content": "..."}
        - {"type": "web_search_started", "query": "<検索クエリ>" | None}

    Raises:
        AIUnavailableError: Claude API 利用不能
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "metadata": {"user_id": hashed_user_id(user_id)},
    }
    if system_prompt:
        kwargs["system"] = system_prompt
    if tools:
        kwargs["tools"] = tools

    start = time.monotonic()
    status = "ok"
    error_kind: str | None = None
    usage = None
    request_id: str | None = None
    try:
        async with async_client.messages.stream(**kwargs) as stream:
            try:
                async for event in stream:
                    etype = getattr(event, "type", None)
                    if etype == "content_block_start":
                        block = getattr(event, "content_block", None)
                        btype = getattr(block, "type", None) if block else None
                        # Anthropic 純正 web_search はサーバ側ツール扱い (server_tool_use)
                        if btype == "server_tool_use":
                            name = getattr(block, "name", None)
                            if name == "web_search":
                                inp = getattr(block, "input", None)
                                query = None
                                if isinstance(inp, dict):
                                    query = inp.get("query")
                                yield {"type": "web_search_started", "query": query}
                    elif etype == "content_block_delta":
                        delta = getattr(event, "delta", None)
                        dtype = getattr(delta, "type", None) if delta else None
                        if dtype == "text_delta":
                            text = getattr(delta, "text", "")
                            if text:
                                yield {"type": "text", "content": text}
            except (asyncio.CancelledError, GeneratorExit):
                status = "cancelled"
                snap = getattr(stream, "current_message_snapshot", None)
                if snap is not None:
                    usage = getattr(snap, "usage", None)
                raise
            final = await stream.get_final_message()
            usage = getattr(final, "usage", None)
            request_id = getattr(final, "id", None)
    except anthropic.APIError as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        logger.error("Claude API障害 (stream_message_events): %s", str(e))
        raise AIUnavailableError("Claude API is unavailable") from e
    except (asyncio.CancelledError, GeneratorExit):
        if status != "cancelled":
            status = "cancelled"
        raise
    except Exception as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        raise
    finally:
        await log_claude_call(
            user_id=user_id,
            feature=feature,
            model=model,
            streaming=True,
            usage=usage,
            latency_ms=int((time.monotonic() - start) * 1000),
            status=status,
            error_kind=error_kind,
            request_id=request_id,
        )


async def analyze_wanna_be(
    wanna_be_text: str,
    *,
    user_id: str,
    async_client=None,
) -> AsyncGenerator[str, None]:
    """
    【Wanna Be分析SSE】: Wanna Beテキストを分析し、目標候補をSSEチャンクで返す
    【送信データ】: wanna_be テキストのみ（個人情報除外 REQ-605）
    【SSEフォーマット】: data: {JSON}\n\n

    Args:
        wanna_be_text: Wanna Beのテキスト
        user_id: Supabase user UUID（ログ + Anthropic metadata 用）
        async_client: AsyncAnthropic クライアント（テスト用に注入可能）

    Yields:
        str: SSEチャンク文字列

    Raises:
        AIUnavailableError: Claude APIが利用不能な場合
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    full_text = ""
    model = "claude-haiku-4-5-20251001"
    start = time.monotonic()
    status = "ok"
    error_kind: str | None = None
    usage = None
    request_id: str | None = None

    try:
        async with async_client.messages.stream(
            model=model,
            max_tokens=2048,
            system=_WANNA_BE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"私の「なりたい自分」:\n{wanna_be_text}"}],
            metadata={"user_id": hashed_user_id(user_id)},
        ) as stream:
            try:
                async for text in stream.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"
            except (asyncio.CancelledError, GeneratorExit):
                status = "cancelled"
                snap = getattr(stream, "current_message_snapshot", None)
                if snap is not None:
                    usage = getattr(snap, "usage", None)
                raise
            final = await stream.get_final_message()
            usage = getattr(final, "usage", None)
            request_id = getattr(final, "id", None)

        # 【目標JSON抽出】: ストリーム完了後にGoalsJSONをパース
        suggested_goals = _extract_goals_json(full_text)

        yield f"data: {json.dumps({'type': 'done', 'suggested_goals': suggested_goals}, ensure_ascii=False)}\n\n"

    except anthropic.APIError as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        logger.error("Claude API障害 (analyze_wanna_be): %s", str(e))
        raise AIUnavailableError("Claude API is unavailable") from e
    except (asyncio.CancelledError, GeneratorExit):
        if status != "cancelled":
            status = "cancelled"
        raise
    except Exception as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        raise
    finally:
        await log_claude_call(
            user_id=user_id,
            feature="wanna_be_analyze",
            model=model,
            streaming=True,
            usage=usage,
            latency_ms=int((time.monotonic() - start) * 1000),
            status=status,
            error_kind=error_kind,
            request_id=request_id,
        )


async def generate_weekly_review(
    habits_summary: list,
    failure_reasons: list,
    achievement_rate: float,
    *,
    user_id: str,
    async_client=None,
) -> AsyncGenerator[str, None]:
    """
    【週次レビューSSE】: 習慣達成データを分析し、フィードバックをSSEチャンクで返す
    【送信データ】: 習慣タイトル・達成率・未達成理由テキストのみ（個人情報除外 REQ-605）

    Args:
        habits_summary: 習慣ごとの達成サマリー（タイトル・達成率・ストリーク）
        failure_reasons: 未達成理由のリスト（テキストのみ）
        achievement_rate: 週間達成率（%）
        user_id: Supabase user UUID（ログ + Anthropic metadata 用）
        async_client: AsyncAnthropic クライアント（テスト用に注入可能）

    Yields:
        str: SSEチャンク文字列

    Raises:
        AIUnavailableError: Claude APIが利用不能な場合
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    # 【送信データ構築】: 個人情報を除いた統計データのみ
    user_data = {
        "achievement_rate": f"{achievement_rate:.1f}%",
        "habits": habits_summary,
        "failure_reasons": failure_reasons,
    }

    user_message = f"今週の習慣データ:\n{json.dumps(user_data, ensure_ascii=False, indent=2)}"
    full_text = ""
    model = "claude-haiku-4-5-20251001"
    start = time.monotonic()
    status = "ok"
    error_kind: str | None = None
    usage = None
    request_id: str | None = None

    try:
        async with async_client.messages.stream(
            model=model,
            max_tokens=2048,
            system=_WEEKLY_REVIEW_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
            metadata={"user_id": hashed_user_id(user_id)},
        ) as stream:
            try:
                async for text in stream.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"
            except (asyncio.CancelledError, GeneratorExit):
                status = "cancelled"
                snap = getattr(stream, "current_message_snapshot", None)
                if snap is not None:
                    usage = getattr(snap, "usage", None)
                raise
            final = await stream.get_final_message()
            usage = getattr(final, "usage", None)
            request_id = getattr(final, "id", None)

        # 【アクションJSON抽出】: ストリーム完了後にActionsJSONをパース
        suggested_actions = _extract_actions_json(full_text)

        yield f"data: {json.dumps({'type': 'done', 'actions': suggested_actions, 'achievement_rate': achievement_rate}, ensure_ascii=False)}\n\n"

    except anthropic.APIError as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        logger.error("Claude API障害 (generate_weekly_review): %s", str(e))
        raise AIUnavailableError("Claude API is unavailable") from e
    except (asyncio.CancelledError, GeneratorExit):
        if status != "cancelled":
            status = "cancelled"
        raise
    except Exception as e:
        if status != "cancelled":
            status, error_kind = "error", type(e).__name__
        raise
    finally:
        await log_claude_call(
            user_id=user_id,
            feature="weekly_review",
            model=model,
            streaming=True,
            usage=usage,
            latency_ms=int((time.monotonic() - start) * 1000),
            status=status,
            error_kind=error_kind,
            request_id=request_id,
        )


def _extract_goals_json(text: str) -> list:
    """
    【目標JSON抽出】: テキスト中の [GOALS_JSON]...[/GOALS_JSON] ブロックをパース
    パース失敗時は空リストを返す
    """
    import re
    match = re.search(r'\[GOALS_JSON\](.*?)\[/GOALS_JSON\]', text, re.DOTALL)
    if not match:
        return []
    try:
        goals = json.loads(match.group(1).strip())
        # 最大3件に制限（REQ-204）
        return goals[:3] if isinstance(goals, list) else []
    except (json.JSONDecodeError, TypeError):
        logger.warning("目標JSONのパース失敗")
        return []


async def build_weekly_review_prompt_with_kgi(
    user_id: str,
    habit_stats: dict,
    supabase,
) -> str:
    """
    【KGI/KPI 付き週次レビュープロンプト構築】
    KGI 達成率・KPI 週次平均を含むプロンプトを構築する。
    個人情報（タイトル）は送信せず、統計値のみを含む。（NFR-KPI-102）
    TASK-0033: REQ-REVIEW-001〜004 対応

    Args:
        user_id: ユーザー ID
        habit_stats: 習慣達成統計（既存の週次レビューから渡される）
        supabase: Supabase クライアント

    Returns:
        KGI/KPI コンテキストを含むプロンプト文字列
    🔵 信頼性レベル: REQ-REVIEW-001〜003・NFR-KPI-102 より
    """
    from datetime import date, timedelta
    from statistics import mean

    # KGI 一覧と達成率を取得（タイトルは除外）
    goals_result = (
        supabase.table("goals")
        .select("metric_type, target_value, current_value, target_date")
        .eq("user_id", user_id)
        .not_.is_("target_date", "null")
        .execute()
    )

    kgi_stats = []
    for g in goals_result.data:
        achievement_rate = None
        if g.get("target_value") and g.get("current_value") is not None:
            achievement_rate = round(min(100.0, (g["current_value"] / g["target_value"]) * 100), 1)
        kgi_stats.append({
            "metric_type": g["metric_type"],
            "achievement_rate": achievement_rate,
        })

    # KPI 週次平均を取得（タイトルは除外）
    week_start = str(date.today() - timedelta(days=7))
    kpis_result = (
        supabase.table("kpis")
        .select("id, metric_type, target_value, tracking_frequency")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )

    kpi_stats = []
    for kpi in kpis_result.data:
        logs_result = (
            supabase.table("kpi_logs")
            .select("value")
            .eq("kpi_id", kpi["id"])
            .gte("log_date", week_start)
            .execute()
        )
        values = [log["value"] for log in logs_result.data]
        kpi_stats.append({
            "metric_type": kpi["metric_type"],
            "target_value": kpi.get("target_value"),
            "weekly_avg": round(mean(values), 2) if values else None,
            "tracking_frequency": kpi["tracking_frequency"],
        })

    # プロンプト構築（個人情報なし）
    prompt = f"""KGI進捗（{len(kgi_stats)}件）:
{json.dumps(kgi_stats, ensure_ascii=False)}

KPI週次状況（{len(kpi_stats)}件）:
{json.dumps(kpi_stats, ensure_ascii=False)}

習慣達成状況:
{json.dumps(habit_stats, ensure_ascii=False)}

上記のデータを分析して:
1. KGIへの今週の貢献度と来週の重点をコメントしてください
2. KPIの達成要因（習慣との相関）を分析してください
3. 習慣の調整提案を具体的に生成してください（change_time/add_habit/remove_habit の範囲で）
"""
    return prompt


def _extract_actions_json(text: str) -> list:
    """
    【アクションJSON抽出】: テキスト中の [ACTIONS_JSON]...[/ACTIONS_JSON] ブロックをパース
    パース失敗時は空リストを返す
    """
    import re
    match = re.search(r'\[ACTIONS_JSON\](.*?)\[/ACTIONS_JSON\]', text, re.DOTALL)
    if not match:
        return []
    try:
        actions = json.loads(match.group(1).strip())
        return actions if isinstance(actions, list) else []
    except (json.JSONDecodeError, TypeError):
        logger.warning("アクションJSONのパース失敗")
        return []


# =============================================
# メモリ自動抽出（ジャーナル投稿フック用）
# =============================================

# 抽出対象フィールドの最低入力長。短すぎる投稿では抽出を行わない。
_MEMORY_EXTRACTION_MIN_LENGTH = 80


async def extract_memory_facts(
    session_text: str,
    current_ctx: dict | None,
    *,
    user_id: str,
    async_client=None,
) -> dict | None:
    """
    【メモリ抽出】: ジャーナル投稿テキストから user_context への差分パッチを抽出する。

    内部で create_message を使う。**二重ログ防止**のため、本関数は独自に log_claude_call
    を呼ばず、create_message に feature="memory_extract" を渡して識別する。

    Args:
        session_text: 抽出対象の投稿テキスト（content など）
        current_ctx: 既存の user_context レコード（identity / patterns / values_keywords / insights）
        user_id: Supabase user UUID（内側 create_message へのログ識別子）
        async_client: AsyncAnthropic（テスト用に注入可能）

    Returns:
        dict: 差分パッチ（identity / patterns / values_keywords / insights のサブセット）。
        None: 短すぎる入力・AI 失敗・JSON パース失敗・新情報なし
    """
    if not session_text or len(session_text) < _MEMORY_EXTRACTION_MIN_LENGTH:
        return None

    current_summary_parts: list[str] = []
    if current_ctx:
        if current_ctx.get("identity"):
            current_summary_parts.append(f"identity: {current_ctx['identity']}")
        if current_ctx.get("patterns"):
            current_summary_parts.append(f"patterns: {current_ctx['patterns']}")
        kw = current_ctx.get("values_keywords") or []
        if isinstance(kw, list) and kw:
            current_summary_parts.append(f"values_keywords: {', '.join(str(x) for x in kw)}")
        if current_ctx.get("insights"):
            current_summary_parts.append(
                f"insights: {json.dumps(current_ctx['insights'], ensure_ascii=False)}"
            )
    current_summary = "\n".join(current_summary_parts) or "なし"

    system_prompt = (
        "あなたはユーザーのパーソナリティ分析を行うAIです。"
        "セッションテキストから客観的な洞察のみを抽出し、JSON形式で返してください。"
    )
    user_prompt = f"""以下のジャーナル投稿テキストから、ユーザーに関する新しい洞察のみを抽出してください。
既存メモリと重複する内容は含めないでください。

## 現在のユーザーメモリ（既存情報）
{current_summary}

## 今回の投稿テキスト
<user_input>
{session_text}
</user_input>

以下のJSON形式で回答してください。更新不要なフィールドは含めないでください。新情報がない場合は {{}} を返してください。

```json
{{
  "identity": "新たに判明したアイデンティティ情報（追記用）",
  "patterns": "新たに観察された行動パターン",
  "values_keywords": ["新キーワード"],
  "insights": {{ "キー": "具体的な発見" }}
}}
```

ルール：確実に読み取れた事実のみ。推測・一般論は除く。"""

    try:
        response = await create_message(
            messages=[{"role": "user", "content": user_prompt}],
            user_id=user_id,
            feature="memory_extract",
            system_prompt=system_prompt,
            max_tokens=512,
            async_client=async_client,
        )
    except AIUnavailableError:
        logger.warning("メモリ抽出: Claude API 利用不可")
        return None
    except Exception as e:  # noqa: BLE001 - 抽出失敗はメインフローを壊さない
        logger.warning("メモリ抽出: 予期しない例外 %s", e)
        return None

    return _extract_memory_json(response)


def _extract_memory_json(text: str) -> dict | None:
    """
    ```json ... ``` フェンスドブロック、もしくは最初の { から最後の } までを抽出して dict を返す。
    パース失敗・空 dict・想定外形式は None。
    """
    import re

    match = re.search(r'```json\s*(.*?)```', text, re.DOTALL)
    if match:
        candidate = match.group(1).strip()
    else:
        first = text.find("{")
        last = text.rfind("}")
        if first < 0 or last < 0 or last <= first:
            return None
        candidate = text[first : last + 1]

    try:
        data = json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        logger.warning("メモリ JSON のパース失敗")
        return None

    if not isinstance(data, dict):
        return None

    cleaned: dict = {}
    identity = data.get("identity")
    if isinstance(identity, str) and identity.strip():
        cleaned["identity"] = identity.strip()
    patterns = data.get("patterns")
    if isinstance(patterns, str) and patterns.strip():
        cleaned["patterns"] = patterns.strip()
    kw = data.get("values_keywords")
    if isinstance(kw, list):
        kw_clean = [s.strip() for s in kw if isinstance(s, str) and s.strip()]
        if kw_clean:
            cleaned["values_keywords"] = kw_clean
    insights = data.get("insights")
    if isinstance(insights, dict) and insights:
        cleaned["insights"] = insights

    return cleaned or None


def merge_memory_patch(current: dict | None, patch: dict) -> dict:
    """
    既存メモリと新しい差分を追記型でマージする（破壊的上書きを避ける）。
    返り値は user_context テーブルへ送る upsert 用の dict（変更フィールドのみ）。
    """
    result: dict = {}
    current = current or {}

    if patch.get("identity"):
        existing = current.get("identity")
        result["identity"] = f"{existing}\n{patch['identity']}" if existing else patch["identity"]

    if patch.get("patterns"):
        existing = current.get("patterns")
        result["patterns"] = f"{existing}\n{patch['patterns']}" if existing else patch["patterns"]

    if patch.get("values_keywords"):
        existing_kw = current.get("values_keywords") or []
        merged_kw = list(existing_kw)
        for kw in patch["values_keywords"]:
            if kw and kw not in merged_kw:
                merged_kw.append(kw)
        if merged_kw != list(existing_kw):
            result["values_keywords"] = merged_kw

    if patch.get("insights"):
        existing_insights = current.get("insights") or {}
        merged = {**existing_insights, **patch["insights"]}
        if merged != existing_insights:
            result["insights"] = merged

    return result
