"""
Coach 応答 replay 評価 CLI (Phase C)

通常の run_coach_eval.py は DB から過去ペアを取るが、こちらは fixture から
固定 user_input を取り出して、**現在の prompt で fresh 応答を生成**してから
採点する。**同じ input に対して prompt 変更の効果**を測れる。

CI から呼ばれる前提。Supabase は不要 (Anthropic だけあれば OK)。

使用例:
  python scripts/run_coach_eval_replay.py \\
    --fixture tests/fixtures/coach_eval_pairs.json \\
    --label "pr-current" \\
    --out /tmp/eval-replay.md \\
    --json-out /tmp/eval-replay.json \\
    --baseline tests/fixtures/coach_eval_baseline.json \\
    --fail-threshold 0.3

  # baseline 更新 (= 現状のスコアを baseline に書き込む)
  python scripts/run_coach_eval_replay.py \\
    --fixture tests/fixtures/coach_eval_pairs.json \\
    --update-baseline tests/fixtures/coach_eval_baseline.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))

try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(BACKEND_ROOT / ".env")
except ImportError:
    pass

from app.services.coach_eval import (  # noqa: E402
    DEFAULT_CONCURRENCY,
    DEFAULT_JUDGE_MODEL,
    format_markdown_report,
    judge_pairs,
    summarize,
)
from app.services.coach_eval_replay import load_fixture, replay_and_pair  # noqa: E402


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Coach replay eval (CI 用)")
    p.add_argument(
        "--fixture",
        type=str,
        default="tests/fixtures/coach_eval_pairs.json",
        help="user_input 群を含む JSON fixture",
    )
    p.add_argument("--label", type=str, default="replay")
    p.add_argument("--model", type=str, default=DEFAULT_JUDGE_MODEL)
    p.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    p.add_argument("--out", type=str, default=None, help="markdown レポートの出力先")
    p.add_argument(
        "--json-out",
        type=str,
        default=None,
        help="生スコア JSON の出力先 (CI で baseline 比較に使う)",
    )
    p.add_argument(
        "--baseline",
        type=str,
        default=None,
        help="baseline scores JSON。指定したら比較・regression 判定する",
    )
    p.add_argument(
        "--fail-threshold",
        type=float,
        default=0.3,
        help="baseline 比で任意 dimension が このスコア以上下がったら exit 1",
    )
    p.add_argument(
        "--update-baseline",
        type=str,
        default=None,
        help="このパスに現在の scores を baseline として書き出す (PR ではなく merge 後に使う)",
    )
    return p.parse_args()


async def _amain(args: argparse.Namespace) -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY が未設定です", file=sys.stderr)
        return 2

    fixture_path = (BACKEND_ROOT / args.fixture) if not Path(args.fixture).is_absolute() else Path(args.fixture)
    try:
        entries = load_fixture(fixture_path)
    except FileNotFoundError:
        print(f"ERROR: fixture が見つかりません: {fixture_path}", file=sys.stderr)
        return 2

    print(f"[1/3] replay generating ({len(entries)} pairs, model={args.model})…", file=sys.stderr)
    pairs = await replay_and_pair(
        entries, concurrency=args.concurrency, model=args.model
    )

    print(f"[2/3] judging…", file=sys.stderr)
    results = await judge_pairs(pairs, concurrency=args.concurrency, model=args.model)

    summary = summarize(results, label=args.label, model=args.model)
    print(
        f"[3/3] done. avg_total={summary.avg_total} / 5, errors={summary.error_count}",
        file=sys.stderr,
    )

    # ── レポート ──
    md = format_markdown_report(summary)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(md, encoding="utf-8")
        print(f"[report] {args.out}", file=sys.stderr)
    else:
        print(md)

    # ── JSON 出力 ──
    scores_json = _summary_to_scores_json(summary)
    if args.json_out:
        Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_out).write_text(
            json.dumps(scores_json, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ── baseline 更新 (option) ──
    if args.update_baseline:
        baseline_path = Path(args.update_baseline)
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(
            json.dumps(scores_json, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[baseline updated] {baseline_path}", file=sys.stderr)
        return 0

    # ── baseline 比較 (regression 検出) ──
    if args.baseline:
        baseline_path = Path(args.baseline)
        if not baseline_path.exists():
            print(
                f"WARN: baseline が見つかりません ({baseline_path})。比較スキップ",
                file=sys.stderr,
            )
        else:
            baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
            regressions = _compare_with_baseline(
                baseline, scores_json, args.fail_threshold
            )
            comparison_md = _format_comparison_markdown(baseline, scores_json)
            print("\n" + comparison_md, file=sys.stderr)
            if args.out:
                # 既存 markdown に比較表を append
                with open(args.out, "a", encoding="utf-8") as f:
                    f.write("\n\n" + comparison_md)
            if regressions:
                print(
                    f"\nFAIL: {len(regressions)} dimension(s) regressed by > {args.fail_threshold}:",
                    file=sys.stderr,
                )
                for dim, delta in regressions:
                    print(f"  - {dim}: {delta:+.2f}", file=sys.stderr)
                return 1

    return 0


def _summary_to_scores_json(summary) -> dict:
    return {
        "label": summary.label,
        "model": summary.model,
        "pair_count": summary.pair_count,
        "error_count": summary.error_count,
        "avg_total": summary.avg_total,
        "avg_by_dimension": summary.avg_by_dimension,
    }


def _compare_with_baseline(
    baseline: dict, current: dict, fail_threshold: float
) -> list[tuple[str, float]]:
    """各 dimension の (current - baseline) を計算し、低下が threshold を超えたものを返す。"""
    regressions: list[tuple[str, float]] = []
    base_dims = baseline.get("avg_by_dimension") or {}
    cur_dims = current.get("avg_by_dimension") or {}
    for key, base_val in base_dims.items():
        cur_val = cur_dims.get(key, 0.0)
        delta = cur_val - base_val
        if delta <= -fail_threshold:
            regressions.append((key, delta))
    # 全体平均も判定
    base_total = baseline.get("avg_total", 0.0)
    cur_total = current.get("avg_total", 0.0)
    total_delta = cur_total - base_total
    if total_delta <= -fail_threshold:
        regressions.append(("avg_total", total_delta))
    return regressions


def _format_comparison_markdown(baseline: dict, current: dict) -> str:
    """baseline vs current を表で表示。"""
    base_dims = baseline.get("avg_by_dimension") or {}
    cur_dims = current.get("avg_by_dimension") or {}
    lines = [
        "## Baseline vs Current",
        "",
        f"- baseline label: `{baseline.get('label', 'baseline')}`",
        f"- current label: `{current.get('label', 'current')}`",
        "",
        "| dimension | baseline | current | Δ |",
        "|---|---|---|---|",
    ]
    all_keys = sorted(set(base_dims.keys()) | set(cur_dims.keys()))
    for k in all_keys:
        b = base_dims.get(k, 0.0)
        c = cur_dims.get(k, 0.0)
        delta = c - b
        emoji = "🟢" if delta > 0.05 else "🔴" if delta < -0.05 else "⚪"
        lines.append(f"| {k} | {b:.2f} | {c:.2f} | {emoji} {delta:+.2f} |")
    base_total = baseline.get("avg_total", 0.0)
    cur_total = current.get("avg_total", 0.0)
    total_delta = cur_total - base_total
    total_emoji = "🟢" if total_delta > 0.05 else "🔴" if total_delta < -0.05 else "⚪"
    lines.append(f"| **avg_total** | **{base_total:.2f}** | **{cur_total:.2f}** | {total_emoji} **{total_delta:+.2f}** |")
    return "\n".join(lines)


def main() -> int:
    args = _parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    sys.exit(main())
