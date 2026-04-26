-- マンダラチャートテーブル追加
-- Sprint 1: F-01 mandala_charts テーブル追加

CREATE TABLE IF NOT EXISTS public.mandala_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wanna_be_id UUID REFERENCES public.wanna_be(id),
    cells JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mandala_charts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandala_charts_self_only" ON public.mandala_charts
    FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_mandala_charts_user
    ON public.mandala_charts (user_id, created_at DESC);
