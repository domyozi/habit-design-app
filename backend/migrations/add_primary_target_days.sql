-- Primary Target daily history for Signals progress.
-- Existing primary_targets remains the "current PT" compatibility table.

ALTER TABLE public.primary_targets
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.primary_target_days (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    set_date     DATE NOT NULL,
    value        TEXT NOT NULL DEFAULT '',
    completed    BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, set_date)
);

INSERT INTO public.primary_target_days (
    user_id,
    set_date,
    value,
    completed,
    completed_at,
    updated_at
)
SELECT
    user_id,
    set_date,
    value,
    COALESCE(completed, FALSE),
    completed_at,
    COALESCE(updated_at, NOW())
FROM public.primary_targets
WHERE set_date IS NOT NULL
ON CONFLICT (user_id, set_date) DO NOTHING;

ALTER TABLE public.primary_target_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "primary_target_days: own rows only" ON public.primary_target_days;
CREATE POLICY "primary_target_days: own rows only"
    ON public.primary_target_days
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
