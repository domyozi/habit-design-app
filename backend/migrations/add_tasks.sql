-- Calendar / Flow / Notes で共有する実タスクテーブル（Sprint 7.6）。
--
-- 設計方針:
--   - frontend-v3/src/lib/tasks/types.ts の Task contract と揃える。
--   - inbox → scheduled → completed の状態遷移を Calendar から扱えるようにする。
--   - Google Calendar event id を保持し、アプリ由来予定との対応を維持する。
--
-- ロールバック:
--   DROP TABLE IF EXISTS public.tasks;

CREATE TABLE IF NOT EXISTS public.tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    description       TEXT,
    habit_id          UUID REFERENCES public.habits(id) ON DELETE SET NULL,
    -- Notes は Phase 8 で本実装予定。カラムだけ先に持ち、FK は notes 作成後に後付けする。
    note_id           UUID,
    status            TEXT NOT NULL DEFAULT 'inbox'
        CHECK (status IN ('inbox', 'scheduled', 'completed', 'dismissed', 'archived')),
    scheduled_at      TIMESTAMPTZ,
    scheduled_end     TIMESTAMPTZ,
    google_event_id   TEXT,
    due_date          DATE,
    source            TEXT
        CHECK (
            source IS NULL
            OR source IN ('flow_coach', 'manual', 'note_ai_extract', 'gcal_import')
        ),
    source_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.set_updated_at_tasks()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_tasks();

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON public.tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_scheduled ON public.tasks(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON public.tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_google_event_id ON public.tasks(user_id, google_event_id)
    WHERE google_event_id IS NOT NULL;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_self_only ON public.tasks;
CREATE POLICY tasks_self_only
    ON public.tasks
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
