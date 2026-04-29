-- Apple Health 連携: health_logs テーブル + shortcuts_token カラム

-- health_logs テーブル
CREATE TABLE IF NOT EXISTS public.health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    value NUMERIC NOT NULL,
    unit TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_logs_self_only" ON public.health_logs
    FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS health_logs_user_recorded ON public.health_logs (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS health_logs_user_metric ON public.health_logs (user_id, metric, recorded_at DESC);

-- user_profiles に shortcuts_token カラムを追加（iOS Shortcuts 用の静的トークン）
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS shortcuts_token UUID DEFAULT gen_random_uuid();
