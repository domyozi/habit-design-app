"""
Coach 応答の LLM-as-judge オフライン評価モジュール (Phase A — MVP)

【目的】:
- 過去の (ユーザー独白, AI 応答) ペアを Claude Haiku で採点して、
  prompt 改修前後の品質変化を定量化する。
- portfolio として「実運用 LLM 機能の measurability を設計できる」を示す。

【設計方針】:
- 既存の app.services.ai_service.create_message を再利用 (logging も自動)。
- judge prompt は XML タグで「観察 → 採点」を強制する CoT 風構造。これで
  単純な数値出力よりも採点根拠が確認できる (rationale が必須)。
- rubric は 4 dimension × 1/2/4/5 Likert (中央 3 を排除して中央値逃避を防ぐ)。
- ペア化は entry_date / created_at で最近接ユーザー entry → AI evening_feedback。

【Phase B 以降】:
- 結果を coach_eval_runs / coach_eval_scores に永続化
- /api/admin/eval/* で frontend dashboard に出す
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from app.services.ai_service import AIUnavailableError, create_message

logger = logging.getLogger(__name__)


# ───────────────────────── Constants ─────────────────────────

# AI が出力する entry_type (= judge する対象)
AI_ENTRY_TYPES = frozenset({"evening_feedback"})

# ユーザー入力として扱う entry_type
USER_ENTRY_TYPES = frozenset(
    {"morning_journal", "evening_notes", "journaling", "daily_report"}
)

# 4 dimension の rubric。各 dimension は anchor 例文付き。
# 1/2/4/5 の binary-skewed scale (3 を抜く) で「どちらかと言うと」判断を強制する。
RUBRIC: list[dict[str, Any]] = [
    {
        "key": "relevance",
        "label": "関連性",
        "description": (
            "ユーザーの独白の核心的な悩み / 宣言 / 文脈に直接応答しているか。"
            "話題ずれや一般論で終わっていれば低い。"
        ),
        "anchors": {
            5: "発言の核心を捉え、文脈を踏まえて応答している",
            4: "核心は捉えているが文脈の活用がやや弱い",
            2: "話題には触れるが核心からはズレている",
            1: "完全に話題がズレているか定型応答",
        },
    },
    {
        "key": "specificity",
        "label": "具体性",
        "description": (
            "抽象的な励ましではなく、具体的な観察・数字・期限・方法を含むか。"
            "「頑張りましょう」「素敵ですね」のみだと低い。"
        ),
        "anchors": {
            5: "数値 / 期限 / 具体的アクションを含む",
            4: "具体例はあるが数値や期限は不足",
            2: "やや具体だが大半は抽象的励まし",
            1: "完全に抽象的・一般論",
        },
    },
    {
        "key": "actionability",
        "label": "実行可能性",
        "description": (
            "ユーザーが今日〜明日中に実行できる粒度の提案が含まれているか。"
            "大きすぎる / 漠然としている提案だと低い。"
        ),
        "anchors": {
            5: "今日 / 明日に実行できる具体的アクションが明示",
            4: "実行可能だが時刻 / 単位が曖昧",
            2: "方向性のみで実行手順が不明",
            1: "実行困難 / 提案無し",
        },
    },
    {
        "key": "tone_fit",
        "label": "口調適合",
        "description": (
            "ユーザーに対して説教臭くない、押し付けがましくない、共感的だが"
            "媚びていない、コーチとして対等な口調か。"
        ),
        "anchors": {
            5: "対等で温かく、押し付けがましくない",
            4: "概ね良いが一部説教臭い",
            2: "やや上から目線 or 媚びている",
            1: "説教 / 否定 / 過剰な迎合",
        },
    },
]

# Anthropic API のレート対策。同時実行は控えめに。
DEFAULT_CONCURRENCY = 4

# judge に使うモデル (cost 重視で Haiku デフォルト)
DEFAULT_JUDGE_MODEL = "claude-haiku-4-5-20251001"


# ───────────────────────── Data structures ─────────────────────────


@dataclass
class JudgePair:
    """評価対象の 1 ペア。"""

    user_id: str
    user_entry_id: str
    user_entry_type: str
    user_content: str
    user_created_at: str  # ISO
    ai_entry_id: str
    ai_content: str
    ai_created_at: str

    def short_user(self, n: int = 200) -> str:
        return self.user_content[:n] + ("…" if len(self.user_content) > n else "")

    def short_ai(self, n: int = 240) -> str:
        return self.ai_content[:n] + ("…" if len(self.ai_content) > n else "")


@dataclass
class DimensionScore:
    key: str
    score: int  # 1, 2, 4, 5 のいずれか
    rationale: str


@dataclass
class JudgeResult:
    pair: JudgePair
    scores: list[DimensionScore]
    observation: str = ""
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.error is None and len(self.scores) == len(RUBRIC)

    @property
    def total(self) -> float:
        if not self.scores:
            return 0.0
        return sum(s.score for s in self.scores) / len(self.scores)


@dataclass
class EvalRunSummary:
    label: str
    model: str
    pair_count: int
    avg_total: float
    avg_by_dimension: dict[str, float]
    error_count: int
    started_at: datetime
    finished_at: datetime
    results: list[JudgeResult] = field(default_factory=list)


# ───────────────────────── Sampling ─────────────────────────


def sample_pairs(
    supabase_client: Any,
    *,
    limit: int = 30,
    user_id: Optional[str] = None,
    since: Optional[datetime] = None,
    max_gap_minutes: int = 60,
) -> list[JudgePair]:
    """
    journal_entries から (user_input → AI evening_feedback) のペアを抽出する。

    アルゴリズム:
      1. AI entry (evening_feedback) を新しい順に取得 (limit * 3 程度)
      2. 各 AI entry に対して、その created_at より前で最も近い user entry を探す
      3. max_gap_minutes 以内なら採用、超えていれば破棄 (会話の関連性が低い)
      4. limit 件埋まったら終了

    Args:
        supabase_client: 既に初期化済みの Supabase Client
        limit: 取得したいペア数
        user_id: 特定ユーザに絞る (None なら全ユーザ)
        since: この日時より前は無視
        max_gap_minutes: user → AI の時間差の上限 (これ以内ならペア成立)
    """
    if limit <= 0:
        return []

    # AI 側を先に取る (新しい順)
    ai_q = (
        supabase_client.table("journal_entries")
        .select("id, user_id, content, entry_date, created_at, entry_type")
        .in_("entry_type", list(AI_ENTRY_TYPES))
        .order("created_at", desc=True)
        .limit(limit * 3)
    )
    if user_id:
        ai_q = ai_q.eq("user_id", user_id)
    if since:
        ai_q = ai_q.gte("created_at", since.astimezone(timezone.utc).isoformat())
    ai_rows = ai_q.execute().data or []

    pairs: list[JudgePair] = []
    seen_user_entry_ids: set[str] = set()

    for ai in ai_rows:
        ai_created = ai.get("created_at")
        ai_user_id = ai.get("user_id")
        if not ai_created or not ai_user_id:
            continue
        ai_dt = _parse_iso(ai_created)
        if ai_dt is None:
            continue

        # その AI entry の直前 (max_gap 以内) のユーザー entry を探す
        gap_floor = ai_dt - _timedelta_minutes(max_gap_minutes)
        u_q = (
            supabase_client.table("journal_entries")
            .select("id, user_id, content, entry_date, created_at, entry_type")
            .eq("user_id", ai_user_id)
            .in_("entry_type", list(USER_ENTRY_TYPES))
            .gte("created_at", gap_floor.astimezone(timezone.utc).isoformat())
            .lt("created_at", ai_dt.astimezone(timezone.utc).isoformat())
            .order("created_at", desc=True)
            .limit(1)
        )
        u_rows = u_q.execute().data or []
        if not u_rows:
            continue
        u = u_rows[0]
        u_id = u.get("id")
        if not u_id or u_id in seen_user_entry_ids:
            continue
        u_content = (u.get("content") or "").strip()
        a_content = (ai.get("content") or "").strip()
        if not u_content or not a_content:
            continue

        seen_user_entry_ids.add(u_id)
        pairs.append(
            JudgePair(
                user_id=ai_user_id,
                user_entry_id=u_id,
                user_entry_type=u.get("entry_type") or "",
                user_content=u_content,
                user_created_at=u.get("created_at") or "",
                ai_entry_id=ai.get("id") or "",
                ai_content=a_content,
                ai_created_at=ai_created,
            )
        )
        if len(pairs) >= limit:
            break

    logger.info("sample_pairs: %d pairs collected (requested=%d)", len(pairs), limit)
    return pairs


# ───────────────────────── Judging ─────────────────────────


def _rubric_block_for_prompt() -> str:
    """judge prompt に embed する rubric の XML 表現。"""
    parts: list[str] = []
    for r in RUBRIC:
        anchors = "\n".join(
            f"      <anchor score=\"{s}\">{txt}</anchor>" for s, txt in sorted(r["anchors"].items())
        )
        parts.append(
            f"  <dimension key=\"{r['key']}\" label=\"{r['label']}\">\n"
            f"    <description>{r['description']}</description>\n"
            f"    <anchors>\n{anchors}\n    </anchors>\n"
            f"  </dimension>"
        )
    return "<rubric>\n" + "\n".join(parts) + "\n</rubric>"


JUDGE_SYSTEM_PROMPT = (
    "あなたは AI コーチ応答品質の評価者です。\n"
    "ユーザー独白に対する AI コーチ応答を rubric に従って 1〜5 で採点します。\n"
    "ただし 3 (中央) は採用せず、1/2/4/5 のいずれかから選んでください。\n"
    "採点前に <observation> セクションで核心の論点と AI 応答の特徴を 1〜2 行で述べ、\n"
    "その後 <scores> 内に JSON で各 dimension の {score, rationale} を返してください。\n"
    "rationale は 30〜80 字程度の日本語で具体的に。\n"
    f"\n{_rubric_block_for_prompt()}\n"
)


def _build_judge_user_message(pair: JudgePair) -> str:
    return (
        "<eval_pair>\n"
        "  <user_input>\n"
        f"{pair.user_content}\n"
        "  </user_input>\n"
        "  <ai_response>\n"
        f"{pair.ai_content}\n"
        "  </ai_response>\n"
        "</eval_pair>\n"
        "\n"
        "上記を rubric に従って採点してください。\n"
        "回答フォーマット:\n"
        "<observation>...</observation>\n"
        "<scores>\n"
        "{\n"
        "  \"relevance\": {\"score\": 4, \"rationale\": \"...\"},\n"
        "  \"specificity\": {\"score\": 2, \"rationale\": \"...\"},\n"
        "  \"actionability\": {\"score\": 4, \"rationale\": \"...\"},\n"
        "  \"tone_fit\": {\"score\": 5, \"rationale\": \"...\"}\n"
        "}\n"
        "</scores>"
    )


_OBSERVATION_RE = re.compile(r"<observation>(.*?)</observation>", re.S)
_SCORES_RE = re.compile(r"<scores>\s*(\{.*?\})\s*</scores>", re.S)


def _parse_judge_output(text: str) -> tuple[str, dict[str, dict[str, Any]]]:
    """LLM 出力から observation と scores JSON を抽出。"""
    obs_match = _OBSERVATION_RE.search(text)
    scores_match = _SCORES_RE.search(text)
    observation = (obs_match.group(1).strip() if obs_match else "").strip()
    if not scores_match:
        # フォールバック: 最初の { ... } を抜き出す
        brace_match = re.search(r"\{[\s\S]+\}", text)
        if not brace_match:
            raise ValueError("scores JSON が見つかりません")
        scores_json = brace_match.group(0)
    else:
        scores_json = scores_match.group(1)
    parsed = json.loads(scores_json)
    if not isinstance(parsed, dict):
        raise ValueError("scores JSON が dict ではありません")
    return observation, parsed


async def judge_pair(
    pair: JudgePair,
    *,
    eval_user_id: Optional[str] = None,
    model: str = DEFAULT_JUDGE_MODEL,
    max_tokens: int = 800,
) -> JudgeResult:
    """1 ペアを LLM-as-judge で採点する。エラーは JudgeResult.error に詰める。

    eval_user_id: claude_api_logs に記録する user_id。デフォルトは pair.user_id
                  (= 評価対象応答を受け取った本物のユーザ)。claude_api_logs の
                  feature を 'coach_eval' で絞れば eval コストだけ集計可能。
    """
    log_user_id = eval_user_id or pair.user_id
    user_msg = _build_judge_user_message(pair)
    try:
        text = await create_message(
            messages=[{"role": "user", "content": user_msg}],
            user_id=log_user_id,
            feature="coach_eval",
            system_prompt=JUDGE_SYSTEM_PROMPT,
            max_tokens=max_tokens,
            model=model,
        )
    except AIUnavailableError as e:
        return JudgeResult(pair=pair, scores=[], error=f"AIUnavailable: {e}")
    except Exception as e:  # noqa: BLE001
        logger.exception("judge_pair: unexpected error")
        return JudgeResult(pair=pair, scores=[], error=f"{type(e).__name__}: {e}")

    try:
        observation, scores_dict = _parse_judge_output(text)
    except Exception as e:  # noqa: BLE001
        logger.warning("judge_pair: parse failed: %s", e)
        return JudgeResult(pair=pair, scores=[], error=f"ParseError: {e}")

    parsed_scores: list[DimensionScore] = []
    for r in RUBRIC:
        key = r["key"]
        entry = scores_dict.get(key)
        if not isinstance(entry, dict):
            return JudgeResult(
                pair=pair,
                scores=[],
                observation=observation,
                error=f"missing dimension: {key}",
            )
        score = entry.get("score")
        rationale = entry.get("rationale") or ""
        if not isinstance(score, (int, float)) or int(score) not in (1, 2, 4, 5):
            return JudgeResult(
                pair=pair,
                scores=[],
                observation=observation,
                error=f"invalid score for {key}: {score}",
            )
        parsed_scores.append(
            DimensionScore(key=key, score=int(score), rationale=str(rationale))
        )

    return JudgeResult(pair=pair, scores=parsed_scores, observation=observation)


async def judge_pairs(
    pairs: Iterable[JudgePair],
    *,
    concurrency: int = DEFAULT_CONCURRENCY,
    model: str = DEFAULT_JUDGE_MODEL,
) -> list[JudgeResult]:
    """複数ペアを並列で採点。"""
    sem = asyncio.Semaphore(concurrency)

    async def _bound(p: JudgePair) -> JudgeResult:
        async with sem:
            return await judge_pair(p, model=model)

    return await asyncio.gather(*[_bound(p) for p in pairs])


# ───────────────────────── Aggregation ─────────────────────────


def summarize(results: list[JudgeResult], *, label: str, model: str) -> EvalRunSummary:
    ok_results = [r for r in results if r.ok]
    error_count = len(results) - len(ok_results)
    avg_by_dim: dict[str, float] = {}
    for r in RUBRIC:
        scores = [
            next(s.score for s in res.scores if s.key == r["key"])
            for res in ok_results
        ]
        avg_by_dim[r["key"]] = (
            round(statistics.mean(scores), 2) if scores else 0.0
        )
    avg_total = (
        round(statistics.mean([r.total for r in ok_results]), 2) if ok_results else 0.0
    )
    now = datetime.now(timezone.utc)
    return EvalRunSummary(
        label=label,
        model=model,
        pair_count=len(ok_results),
        avg_total=avg_total,
        avg_by_dimension=avg_by_dim,
        error_count=error_count,
        started_at=now,
        finished_at=now,
        results=results,
    )


def format_markdown_report(summary: EvalRunSummary, *, worst_n: int = 3) -> str:
    """採点結果を markdown レポートに整形。CI / PR コメント / portfolio 用。"""
    lines: list[str] = []
    lines.append(f"# Coach Eval — {summary.label}")
    lines.append("")
    lines.append(f"- model: `{summary.model}`")
    lines.append(f"- pairs evaluated: **{summary.pair_count}** (errors: {summary.error_count})")
    lines.append(f"- timestamp: {summary.started_at.isoformat()}")
    lines.append(f"- **avg total**: **{summary.avg_total}** / 5")
    lines.append("")
    lines.append("## Dimension averages")
    lines.append("")
    lines.append("| dimension | avg |")
    lines.append("|---|---|")
    for r in RUBRIC:
        lines.append(f"| {r['key']} ({r['label']}) | {summary.avg_by_dimension.get(r['key'], 0.0)} |")
    lines.append("")
    lines.append("## Worst examples")
    lines.append("")
    worst = sorted([r for r in summary.results if r.ok], key=lambda r: r.total)[:worst_n]
    if not worst:
        lines.append("_(評価成功例なし)_")
    for i, res in enumerate(worst, 1):
        lines.append(f"### #{i} — total {res.total:.2f}")
        lines.append("")
        lines.append(f"- pair: user `{res.pair.user_entry_id[:8]}…` → ai `{res.pair.ai_entry_id[:8]}…`")
        lines.append(f"- observation: {res.observation or '(なし)'}")
        lines.append("")
        lines.append(f"> **user**: {res.pair.short_user()}")
        lines.append(f"> **ai**: {res.pair.short_ai()}")
        lines.append("")
        for s in res.scores:
            lines.append(f"- **{s.key}**: {s.score} — {s.rationale}")
        lines.append("")
    if summary.error_count > 0:
        lines.append("## Errors")
        lines.append("")
        for res in summary.results:
            if not res.ok:
                lines.append(
                    f"- pair {res.pair.user_entry_id[:8]}…/{res.pair.ai_entry_id[:8]}…: {res.error}"
                )
        lines.append("")
    return "\n".join(lines)


# ───────────────────────── helpers ─────────────────────────


# ───────────────────────── Persistence (Phase B) ─────────────────────────


def persist_run(supabase_client: Any, summary: EvalRunSummary) -> str:
    """summarize() の結果を coach_eval_runs / coach_eval_scores に永続化し、run_id を返す。

    Phase B: 過去 run の比較を frontend dashboard で見られる様にするため。
    Phase A (CLI のみ) からは `--save-to-db` オプションで明示的に呼び出す。
    """
    summary_json = {
        **summary.avg_by_dimension,
        "_total": summary.avg_total,
    }
    run_row = (
        supabase_client.table("coach_eval_runs")
        .insert(
            {
                "label": summary.label,
                "model": summary.model,
                "pair_count": summary.pair_count,
                "success_count": sum(1 for r in summary.results if r.ok),
                "error_count": summary.error_count,
                "summary_json": summary_json,
                "started_at": summary.started_at.isoformat(),
                "finished_at": summary.finished_at.isoformat(),
            }
        )
        .execute()
    )
    run_id = run_row.data[0]["id"]

    # scores を bulk insert
    score_rows: list[dict[str, Any]] = []
    for r in summary.results:
        scores_dict = {
            s.key: {"score": s.score, "rationale": s.rationale}
            for s in r.scores
        } if r.ok else None
        score_rows.append(
            {
                "run_id": run_id,
                "user_entry_id": r.pair.user_entry_id,
                "ai_entry_id": r.pair.ai_entry_id,
                "ok": r.ok,
                "error_kind": r.error,
                "observation": r.observation or None,
                "scores_json": scores_dict,
                "total": round(r.total, 2) if r.ok else None,
            }
        )
    if score_rows:
        supabase_client.table("coach_eval_scores").insert(score_rows).execute()

    return run_id


def fetch_runs(supabase_client: Any, *, limit: int = 50) -> list[dict[str, Any]]:
    """最近の eval run の一覧 (label / model / 平均スコア等) を返す。dashboard 用。"""
    result = (
        supabase_client.table("coach_eval_runs")
        .select(
            "id, label, model, pair_count, success_count, error_count, "
            "summary_json, started_at, finished_at"
        )
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def fetch_run_scores(supabase_client: Any, run_id: str) -> list[dict[str, Any]]:
    """特定 run 内のすべての score 行 (worst 抽出 / dimension 別チャート用)。

    並び替えは Python 側で行う: postgrest 2.x では .order() に nulls_first を
    渡せないため。ok=true を total 昇順 (= 悪い順) で先に並べ、ok=false (=total None)
    は末尾に押し込む。
    """
    result = (
        supabase_client.table("coach_eval_scores")
        .select(
            "id, user_entry_id, ai_entry_id, ok, error_kind, "
            "observation, scores_json, total, created_at"
        )
        .eq("run_id", run_id)
        .execute()
    )
    rows = result.data or []
    rows.sort(
        # ok=true で total が小さいほど worst として先に。ok=false (total None) は最後に。
        key=lambda r: (
            0 if r.get("ok") and r.get("total") is not None else 1,
            r.get("total") if r.get("total") is not None else 999,
        )
    )
    return rows


# ───────────────────────── helpers ─────────────────────────


def _parse_iso(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # supabase は "...+00:00" 形式で返すが、稀に "Z" / 末尾なしもあり得るので吸収
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _timedelta_minutes(m: int):
    from datetime import timedelta

    return timedelta(minutes=m)
