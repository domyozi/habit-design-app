"""
AIサービス基盤（SSEストリーミング）
TASK-0010: Claude AI統合・Wanna Be分析+週次レビューSSEストリーミング実装

【設計方針】:
- AsyncAnthropic クライアントで非同期SSEストリーミングを実現
- 送信データは統計・タイトル等に限定（個人情報除外 REQ-605）
- Claude API障害時は AIUnavailableError をraise（EDGE-001）

🔵 信頼性レベル: REQ-203/602/702・NFR-002・design-interview.md Q5 より
"""
import json
import logging
import os
from typing import AsyncGenerator

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
    system_prompt: str | None = None,
    max_tokens: int = 1024,
    async_client=None,
) -> str:
    """
    Browser clients must not call Anthropic directly. This server-side wrapper
    keeps the API key in backend environment variables and returns plain text.
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    kwargs = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system_prompt:
        kwargs["system"] = system_prompt

    try:
        response = await async_client.messages.create(**kwargs)
        text_blocks = [
            block.text
            for block in response.content
            if getattr(block, "type", None) == "text" and getattr(block, "text", None)
        ]
        return "".join(text_blocks)
    except anthropic.APIError as e:
        logger.error("Claude API障害 (create_message): %s", str(e))
        raise AIUnavailableError(f"Claude APIが利用不能です: {str(e)}") from e


async def stream_message(
    messages: list[dict[str, str]],
    system_prompt: str | None = None,
    max_tokens: int = 1024,
    async_client=None,
) -> AsyncGenerator[str, None]:
    """
    Stream text chunks from Anthropic as plain strings. HTTP/SSE formatting is
    handled by the route layer.
    """
    import anthropic

    if async_client is None:
        async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    kwargs = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system_prompt:
        kwargs["system"] = system_prompt

    try:
        async with async_client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
    except anthropic.APIError as e:
        logger.error("Claude API障害 (stream_message): %s", str(e))
        raise AIUnavailableError(f"Claude APIが利用不能です: {str(e)}") from e


async def analyze_wanna_be(
    wanna_be_text: str,
    async_client=None,
) -> AsyncGenerator[str, None]:
    """
    【Wanna Be分析SSE】: Wanna Beテキストを分析し、目標候補をSSEチャンクで返す
    【送信データ】: wanna_be テキストのみ（個人情報除外 REQ-605）
    【SSEフォーマット】: data: {JSON}\n\n

    Args:
        wanna_be_text: Wanna Beのテキスト
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

    try:
        async with async_client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=_WANNA_BE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"私の「なりたい自分」:\n{wanna_be_text}"}],
        ) as stream:
            async for text in stream.text_stream:
                full_text += text
                yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"

        # 【目標JSON抽出】: ストリーム完了後にGoalsJSONをパース
        suggested_goals = _extract_goals_json(full_text)

        yield f"data: {json.dumps({'type': 'done', 'suggested_goals': suggested_goals}, ensure_ascii=False)}\n\n"

    except anthropic.APIError as e:
        logger.error("Claude API障害 (analyze_wanna_be): %s", str(e))
        raise AIUnavailableError(f"Claude APIが利用不能です: {str(e)}") from e


async def generate_weekly_review(
    habits_summary: list,
    failure_reasons: list,
    achievement_rate: float,
    async_client=None,
) -> AsyncGenerator[str, None]:
    """
    【週次レビューSSE】: 習慣達成データを分析し、フィードバックをSSEチャンクで返す
    【送信データ】: 習慣タイトル・達成率・未達成理由テキストのみ（個人情報除外 REQ-605）

    Args:
        habits_summary: 習慣ごとの達成サマリー（タイトル・達成率・ストリーク）
        failure_reasons: 未達成理由のリスト（テキストのみ）
        achievement_rate: 週間達成率（%）
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

    try:
        async with async_client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=_WEEKLY_REVIEW_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            async for text in stream.text_stream:
                full_text += text
                yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"

        # 【アクションJSON抽出】: ストリーム完了後にActionsJSONをパース
        suggested_actions = _extract_actions_json(full_text)

        yield f"data: {json.dumps({'type': 'done', 'actions': suggested_actions, 'achievement_rate': achievement_rate}, ensure_ascii=False)}\n\n"

    except anthropic.APIError as e:
        logger.error("Claude API障害 (generate_weekly_review): %s", str(e))
        raise AIUnavailableError(f"Claude APIが利用不能です: {str(e)}") from e


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
