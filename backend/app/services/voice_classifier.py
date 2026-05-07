"""
音声入力AI分類サービス
TASK-0009: 音声入力AI分類サービス実装

【設計方針】:
- テキストをClaude APIで分類（checklist/journaling/daily_report/kpi_update/unknown）
- 個人情報（ユーザーID・メール）はClaude APIに送信しない（REQ-605）
- Claude API障害時は AIUnavailableError をraise（EDGE-001）
- JSON出力を強制し、パースエラー時は unknown に分類

【Phase 1 ログ基盤】:
- 同期 Anthropic() を維持しつつ、usage / latency / status を NamedTuple で
  caller に返す。caller (routes/voice_input.py) 側で `await log_claude_call(...)`
  する設計（同期関数を async 化する破壊的変更を避けるため）

🔵 信頼性レベル: REQ-401/402/403・EDGE-001/003 より
"""
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Literal, NamedTuple, Optional

from app.core.anthropic_metadata import hashed_user_id

logger = logging.getLogger(__name__)

# 分類タイプ
ClassificationType = Literal["checklist", "journaling", "daily_report", "kpi_update", "unknown"]


@dataclass
class HabitCheckResult:
    """【習慣チェック結果】: チェックリスト分類時の各習慣の達成状況"""
    habit_id: str
    habit_title: str
    completed: bool
    confidence: float = 1.0


@dataclass
class ClassificationResult:
    """【分類結果】: Claude APIによる入力テキストの分類結果"""
    type: ClassificationType
    habit_results: Optional[list] = None  # checklist時のみ HabitCheckResult のリスト
    content: Optional[str] = None  # journaling/daily_report時のテキスト


class ClaudeCallInfo(NamedTuple):
    """Claude API 呼び出しのメタ情報。caller がログ記録に使う。"""
    model: str
    usage: object  # anthropic.types.Usage 互換 or None
    latency_ms: int
    status: str  # "ok" / "error"
    error_kind: Optional[str]
    request_id: Optional[str]


class AIUnavailableError(Exception):
    """【AI障害エラー】: Claude APIが利用不能な場合（EDGE-001）"""
    pass


# 分類プロンプト
_SYSTEM_PROMPT = """あなたはユーザーの音声入力テキストを分類するアシスタントです。
ユーザーの入力を以下のカテゴリのいずれかに分類してください:

1. **checklist**: 習慣の達成/未達成を報告している（例: 「今日は筋トレができた」「ランニングはできなかった」）
2. **journaling**: 思考や感情の自由記述（例: 「今日は良い一日だった」）
3. **daily_report**: 3行日報形式（例: 「良かったこと: 集中できた。悪かったこと: 睡眠が足りない」）
4. **kpi_update**: 数値KPIの更新（例: 「体重が70kgになった」「売上が100万円」）
5. **unknown**: 上記のどれにも明確に当てはまらない

JSON形式でのみ回答してください。以下の形式で返してください:

チェックリストの場合:
{
  "type": "checklist",
  "habit_results": [
    {"habit_id": "<習慣ID>", "habit_title": "<習慣タイトル>", "completed": true/false, "confidence": 0.0-1.0}
  ]
}

その他の場合:
{
  "type": "journaling" | "daily_report" | "kpi_update" | "unknown",
  "content": "<元のテキストまたは整理されたテキスト>"
}

重要:
- 必ずJSONのみで回答すること（説明文は不要）
- 習慣IDは提供されたリストから正確に使用すること
- 曖昧な場合は confidence を低く設定すること（0.5以下）
- 習慣に言及がない場合は checklist にしないこと
"""


def classify_voice_input(
    text: str,
    user_habits: list,
    log_date: date,
    *,
    user_id: str,
    anthropic_client=None,
) -> tuple[ClassificationResult, ClaudeCallInfo]:
    """
    【音声入力分類】: テキストをClaude APIで分類する
    【個人情報除外】: 習慣タイトルのみ送信（ID、メール等は含めない）（REQ-605）
    【障害対応】: Claude API障害時は AIUnavailableError をraise（EDGE-001）

    Phase 1 logging: ClaudeCallInfo を一緒に返す。caller (routes/voice_input.py) が
    `await log_claude_call(...)` で記録する責務を持つ。

    Args:
        text: 分類対象テキスト
        user_habits: ユーザーの習慣リスト（dict のリスト）
        log_date: 記録日
        user_id: Supabase user UUID（Anthropic metadata + ログ用）
        anthropic_client: Anthropic クライアント（テスト用に注入可能）

    Returns:
        (ClassificationResult, ClaudeCallInfo): 分類結果と呼び出しメタ情報

    Raises:
        AIUnavailableError: Claude APIが利用不能な場合（その場合でも caller は
            ClaudeCallInfo(status="error") を別経路で記録すべきだが、本関数は raise する）
    """
    import anthropic

    if anthropic_client is None:
        anthropic_client = anthropic.Anthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY", "")
        )

    # 【習慣リスト構築】: habit_id と title のみ送信（個人情報除外）
    habits_info = [
        {"habit_id": h["id"], "habit_title": h["title"]}
        for h in user_habits
    ]

    user_message = f"""日付: {log_date}
入力テキスト: {text}

利用可能な習慣リスト:
{json.dumps(habits_info, ensure_ascii=False, indent=2)}

上記の入力テキストを分類してください。"""

    model = "claude-haiku-4-5-20251001"
    start = time.monotonic()
    try:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
            metadata={"user_id": hashed_user_id(user_id)},
        )

        usage = getattr(response, "usage", None)
        request_id = getattr(response, "id", None)
        latency_ms = int((time.monotonic() - start) * 1000)
        info_ok = ClaudeCallInfo(
            model=model, usage=usage, latency_ms=latency_ms,
            status="ok", error_kind=None, request_id=request_id,
        )

        response_text = response.content[0].text.strip()

        # 【JSONパース】: パースエラー時は unknown に分類
        try:
            result_dict = json.loads(response_text)
        except json.JSONDecodeError:
            logger.warning("Claude APIのレスポンスがJSONでありませんでした: %s", response_text)
            return ClassificationResult(type="unknown", content=text), info_ok

        result_type = result_dict.get("type", "unknown")

        # 分類タイプの検証
        valid_types = {"checklist", "journaling", "daily_report", "kpi_update", "unknown"}
        if result_type not in valid_types:
            logger.warning("未知の分類タイプ: %s", result_type)
            return ClassificationResult(type="unknown", content=text), info_ok

        if result_type == "checklist":
            raw_results = result_dict.get("habit_results", [])
            habit_results = [
                HabitCheckResult(
                    habit_id=r.get("habit_id", ""),
                    habit_title=r.get("habit_title", ""),
                    completed=bool(r.get("completed", False)),
                    confidence=float(r.get("confidence", 1.0)),
                )
                for r in raw_results
            ]
            return ClassificationResult(type="checklist", habit_results=habit_results), info_ok

        return (
            ClassificationResult(
                type=result_type,
                content=result_dict.get("content", text),
            ),
            info_ok,
        )

    except anthropic.APIError as e:
        logger.error("Claude API障害: %s", str(e))
        raise AIUnavailableError("Claude API is unavailable") from e


async def match_kpi_candidates(
    unit_hint: str,
    user_id: str,
    supabase,
) -> list[dict]:
    """
    【KPI 候補マッチング】: unit_hint に一致する KPI 候補を返す
    TASK-0033: EDGE-KPI-006 対応 - 音声入力で kpi_update 分類後に候補 KPI をマッチング

    Args:
        unit_hint: 発話から抽出した単位ヒント（例: "kg", "時間"）
        user_id: 検索対象のユーザー ID
        supabase: Supabase クライアント

    Returns:
        候補 KPI のリスト（kpi_id, title, unit）。候補なしは空リスト。
    🔵 信頼性レベル: REQ-LOG-003・EDGE-KPI-006 より
    """
    if not unit_hint:
        return []

    kpis = (
        supabase.table("kpis")
        .select("id, title, unit")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )

    candidates = []
    for kpi in kpis.data:
        kpi_unit = (kpi.get("unit") or "").lower()
        hint = unit_hint.lower()
        # 単位の部分一致（例: "kg" ⊆ "kg" または前後方向での包含）
        if hint in kpi_unit or kpi_unit in hint:
            candidates.append({
                "kpi_id": kpi["id"],
                "title": kpi["title"],
                "unit": kpi.get("unit"),
            })

    return candidates
