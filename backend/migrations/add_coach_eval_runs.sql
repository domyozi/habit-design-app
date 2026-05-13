-- Sprint coach-eval Phase B: LLM-as-judge 評価結果の永続化
--
-- run: 1 回の eval 実行 (CLI / API 呼び出し単位)
-- score: その run 内の (pair, dimension) ごとの採点
--
-- すべて service_role でのみ書き込み・読み出し可能 (admin 用途、RLS deny-by-default)。

CREATE TABLE IF NOT EXISTS public.coach_eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 比較用ラベル (例: 'baseline' / 'after-cot-v2')
    label TEXT NOT NULL,
    -- judge に使った Anthropic モデル
    model TEXT NOT NULL,
    -- 評価対象 pair の総数 (= judge 呼び出し回数)
    pair_count INTEGER NOT NULL DEFAULT 0,
    -- judge 結果が rubric 通り parse できた件数
    success_count INTEGER NOT NULL DEFAULT 0,
    -- parse 失敗 / API error の件数
    error_count INTEGER NOT NULL DEFAULT 0,
    -- success_count 件の dimension 別平均と全体平均 (JSON で永続化、列追加せず柔軟)
    -- 例: {"relevance": 4.2, "specificity": 3.1, "actionability": 4.0, "tone_fit": 4.8, "_total": 4.05}
    summary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

ALTER TABLE public.coach_eval_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS coach_eval_runs_started_idx
    ON public.coach_eval_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS coach_eval_runs_label_idx
    ON public.coach_eval_runs (label, started_at DESC);


CREATE TABLE IF NOT EXISTS public.coach_eval_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.coach_eval_runs(id) ON DELETE CASCADE,
    -- 評価対象だった journal_entries の id 2 つ
    user_entry_id UUID NOT NULL,
    ai_entry_id UUID NOT NULL,
    -- 採点 OK / NG (NG なら scores / total は null、error_kind に理由)
    ok BOOLEAN NOT NULL,
    error_kind TEXT,
    -- judge が出した observation (CoT 風のメモ)
    observation TEXT,
    -- 各 dimension の {score, rationale} を JSON で。dimension 追加に migration 不要にしたい
    -- 例: {"relevance": {"score": 4, "rationale": "..."}, ...}
    scores_json JSONB,
    -- success 時の dimension 平均
    total NUMERIC(3, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coach_eval_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS coach_eval_scores_run_idx
    ON public.coach_eval_scores (run_id, created_at);

CREATE INDEX IF NOT EXISTS coach_eval_scores_total_idx
    ON public.coach_eval_scores (run_id, total ASC);
