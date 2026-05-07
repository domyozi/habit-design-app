-- Claude API トークン消費ログ
-- Phase 1: per-user / per-feature の usage と cost を記録するためのテーブル
-- service_role 経由でのみアクセス可能（RLS deny-by-default = policy ゼロ）

CREATE TABLE IF NOT EXISTS public.claude_api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- coach_stream / kpi_suggest / habit_suggest / voice_classify /
    -- wanna_be_analyze / weekly_review / memory_extract /
    -- ai_coach_chat / ai_coach_stream / ai_coach_weekly_review
    -- 文字列 raw で保存（CHECK 制約は付けない: taxonomy 拡張で migration を増やしたくない）
    feature TEXT NOT NULL,
    model TEXT NOT NULL,
    streaming BOOLEAN NOT NULL,
    -- ok / error / cancelled
    status TEXT NOT NULL,
    -- 例: APIError / RateLimitError / Timeout / Unknown （error / cancelled 時のみ）
    error_kind TEXT,
    -- response.id（取得できた場合のみ）
    request_id TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 有効化 + policy ゼロ = service_role 以外は完全に拒否される。
-- admin が読むときも service_role 経由（backend admin endpoint or Supabase Studio）。
ALTER TABLE public.claude_api_logs ENABLE ROW LEVEL SECURITY;

-- per-user の最近のログを引く想定（admin での per-user breakdown 用）
CREATE INDEX IF NOT EXISTS claude_api_logs_user_created_idx
    ON public.claude_api_logs (user_id, created_at DESC);

-- feature 別の最近のログを引く想定（feature breakdown 用）
CREATE INDEX IF NOT EXISTS claude_api_logs_feature_created_idx
    ON public.claude_api_logs (feature, created_at DESC);

-- 全体の時系列スキャン用（DAU / 日別 cost 集計）
CREATE INDEX IF NOT EXISTS claude_api_logs_created_idx
    ON public.claude_api_logs (created_at DESC);
