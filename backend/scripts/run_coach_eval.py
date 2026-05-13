"""
Coach 応答 LLM-as-judge 評価 CLI (Phase A — MVP)

【使い方】:
  cd backend && source .venv/bin/activate
  python scripts/run_coach_eval.py --limit 30 --label "baseline" --out reports/eval-$(date +%Y%m%d).md

  # 特定ユーザーだけ:
  python scripts/run_coach_eval.py --user 066f5d05-ad91-4cc1-9afd-8cc50f39d5de --limit 10

  # 期間指定:
  python scripts/run_coach_eval.py --since 2026-04-01 --limit 50

  # 標準出力に出すだけ:
  python scripts/run_coach_eval.py --limit 5

【環境変数】:
  必須:
    - ANTHROPIC_API_KEY: judge 呼び出し用
    - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: journal_entries 取得用
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# プロジェクトルートを sys.path に追加 (`python scripts/...` で実行できる様に)
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))

# Pydantic-settings は os.environ を直接書き換えないため、ai_service.create_message が
# 参照する os.environ["ANTHROPIC_API_KEY"] を埋めるために .env を明示ロードする。
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(BACKEND_ROOT / ".env")
except ImportError:
    pass

from app.core.supabase import init_supabase  # noqa: E402
from app.services.coach_eval import (  # noqa: E402
    DEFAULT_CONCURRENCY,
    DEFAULT_JUDGE_MODEL,
    format_markdown_report,
    judge_pairs,
    persist_run,
    sample_pairs,
    summarize,
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Coach 応答の LLM-as-judge 評価")
    p.add_argument("--limit", type=int, default=30, help="評価する pair 数")
    p.add_argument("--user", type=str, default=None, help="特定ユーザーに絞る (UUID)")
    p.add_argument(
        "--since",
        type=str,
        default=None,
        help="この日 (YYYY-MM-DD) 以降を対象",
    )
    p.add_argument(
        "--max-gap-minutes",
        type=int,
        default=60,
        help="user → AI の許容時間差 (分)。これ以内ならペア成立",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        help="judge 並列度",
    )
    p.add_argument("--model", type=str, default=DEFAULT_JUDGE_MODEL)
    p.add_argument(
        "--label",
        type=str,
        default=datetime.now().strftime("run-%Y%m%d-%H%M"),
        help="比較用のラベル (例: 'before-cot' / 'after-cot')",
    )
    p.add_argument(
        "--out",
        type=str,
        default=None,
        help="markdown レポートの出力先。未指定なら stdout のみ",
    )
    p.add_argument(
        "--json-out",
        type=str,
        default=None,
        help="生スコア JSON の出力先 (省略可)",
    )
    p.add_argument(
        "--save-to-db",
        action="store_true",
        help="coach_eval_runs / coach_eval_scores テーブルに結果を永続化 (Phase B)",
    )
    return p.parse_args()


async def _amain(args: argparse.Namespace) -> int:
    # ── 1. クライアント初期化 ──
    supabase = init_supabase()
    if supabase is None:
        print(
            "ERROR: Supabase 初期化失敗。SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を確認してください",
            file=sys.stderr,
        )
        return 2
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY が未設定です", file=sys.stderr)
        return 2

    # ── 2. ペア抽出 ──
    since_dt = None
    if args.since:
        try:
            since_dt = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
        except ValueError:
            print(f"ERROR: --since の形式が不正: {args.since}", file=sys.stderr)
            return 2

    print(f"[1/3] sampling pairs (limit={args.limit})…", file=sys.stderr)
    pairs = sample_pairs(
        supabase,
        limit=args.limit,
        user_id=args.user,
        since=since_dt,
        max_gap_minutes=args.max_gap_minutes,
    )
    if not pairs:
        print("WARN: 評価対象のペアが見つかりませんでした", file=sys.stderr)
        return 1
    print(f"       → {len(pairs)} pairs", file=sys.stderr)

    # ── 3. 採点 ──
    print(
        f"[2/3] judging (model={args.model}, concurrency={args.concurrency})…",
        file=sys.stderr,
    )
    results = await judge_pairs(
        pairs, concurrency=args.concurrency, model=args.model
    )

    # ── 4. 集計 ──
    summary = summarize(results, label=args.label, model=args.model)
    print(
        f"[3/3] done. avg_total={summary.avg_total} / 5, errors={summary.error_count}",
        file=sys.stderr,
    )

    # ── 4b. DB 永続化 (option) ──
    if args.save_to_db:
        try:
            run_id = persist_run(supabase, summary)
            print(f"[db]     run_id={run_id} (coach_eval_runs)", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"WARN: DB 永続化に失敗: {e}", file=sys.stderr)

    # ── 5. レポート出力 ──
    md = format_markdown_report(summary)
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(md, encoding="utf-8")
        print(f"\n[report] {out_path}", file=sys.stderr)
    else:
        print(md)

    if args.json_out:
        json_path = Path(args.json_out)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(_summary_to_json(summary), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[json]   {json_path}", file=sys.stderr)

    return 0


def _summary_to_json(summary) -> dict:
    return {
        "label": summary.label,
        "model": summary.model,
        "pair_count": summary.pair_count,
        "error_count": summary.error_count,
        "avg_total": summary.avg_total,
        "avg_by_dimension": summary.avg_by_dimension,
        "started_at": summary.started_at.isoformat(),
        "finished_at": summary.finished_at.isoformat(),
        "results": [
            {
                "user_entry_id": r.pair.user_entry_id,
                "ai_entry_id": r.pair.ai_entry_id,
                "user_content": r.pair.user_content,
                "ai_content": r.pair.ai_content,
                "observation": r.observation,
                "error": r.error,
                "scores": [
                    {"key": s.key, "score": s.score, "rationale": s.rationale}
                    for s in r.scores
                ],
                "total": r.total if r.ok else None,
            }
            for r in summary.results
        ],
    }


def main() -> int:
    args = _parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    sys.exit(main())
