-- BODY タブ: 筋トレ / ランニング セッション記録機能のためのテーブル群
--
-- 背景:
--   既存 habit_logs は numeric_value / time_value の scalar 1 個しか持てず、
--   筋トレの「種目×セット×重量×レップ」や、ランニングの GPS ポリラインなど
--   構造化された物理量データを扱えない。BODY タブからのセッション記録は
--   workout_sessions / workout_exercises / workout_routines の 3 テーブルで保持し、
--   セッション完了時に backend が habit_logs にも upsert することで、既存の
--   streak / XP / badge パイプラインをそのまま流用する。
--
-- 設計方針:
--   - 既存 habits 行は workout_kind = NULL のまま壊さない。
--   - workout_kind が 'strength' / 'running' の habit のみ、Today で特別行として描画され、
--     タップで BODY タブのセッション画面に遷移する。
--   - habit_id, habit_log_id は NULL 許容（ad-hoc セッションのため）。
--     habit 削除時は ON DELETE SET NULL で履歴は残す。
--   - GPS は workout_sessions.gps_route JSONB に圧縮済みポリラインを格納する
--     ([{lat, lng, t}] 形式, 目標 <50KB)。

-- --------------------------------------------------
-- 1) habits: workout_kind 列を追加
-- --------------------------------------------------

ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS workout_kind text NULL;

ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_workout_kind_check;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_workout_kind_check
    CHECK (workout_kind IS NULL OR workout_kind IN ('strength', 'running'));

COMMENT ON COLUMN public.habits.workout_kind IS
    'BODY タブ連携: strength / running の特別 habit。NULL は通常 habit';

-- --------------------------------------------------
-- 2) workout_sessions: セッション 1 回ごとの親レコード
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    habit_id UUID NULL REFERENCES public.habits(id) ON DELETE SET NULL,
    habit_log_id UUID NULL REFERENCES public.habit_logs(id) ON DELETE SET NULL,
    session_type text NOT NULL,
    routine_id UUID NULL,  -- workout_routines への FK は後段で追加
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NULL,
    duration_s INTEGER NULL,
    total_volume_kg NUMERIC NULL,        -- strength: Σ(weight × reps)
    distance_m NUMERIC NULL,             -- running
    avg_pace_s_per_km NUMERIC NULL,      -- running
    gps_route JSONB NULL,                -- 圧縮済みポリライン
    notes text NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workout_sessions_session_type_check
        CHECK (session_type IN ('strength', 'running'))
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_started
    ON public.workout_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_habit
    ON public.workout_sessions (habit_id)
    WHERE habit_id IS NOT NULL;

COMMENT ON TABLE public.workout_sessions IS
    'BODY タブ: 筋トレ・ランニング 1 セッションの親レコード';

-- --------------------------------------------------
-- 3) workout_exercises: strength セッション内の種目 1 件ごとの子レコード
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workout_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
    exercise_name text NOT NULL,
    order_index INTEGER NOT NULL,
    sets JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- sets スキーマ: [
    --   { "set_num": 1, "weight": 60, "reps": 8, "completed": true,
    --     "rest_s": 90, "set_type": "normal" }
    -- ]
    -- set_type: 'warmup' | 'normal' | 'drop' | 'fail'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_session
    ON public.workout_exercises (session_id, order_index);

COMMENT ON TABLE public.workout_exercises IS
    'BODY タブ: strength セッション内の種目ごとのセット記録';

-- --------------------------------------------------
-- 4) workout_routines: ユーザーごとのテンプレ
-- --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workout_routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    routine_type text NOT NULL,
    template JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- template スキーマ (strength):
    --   { "exercises": [
    --       { "exercise_name": "ベンチプレス",
    --         "sets": [{ "weight": 60, "reps": 8 }, ...]
    --       }
    --   ]}
    -- template スキーマ (running):
    --   { "kind": "jog" | "interval" | "long" | "lsd",
    --     "target_distance_m": 5000, "target_pace_s_per_km": 360 }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workout_routines_routine_type_check
        CHECK (routine_type IN ('strength', 'running'))
);

CREATE INDEX IF NOT EXISTS idx_workout_routines_user
    ON public.workout_routines (user_id, updated_at DESC);

COMMENT ON TABLE public.workout_routines IS
    'BODY タブ: ユーザーごとの筋トレ / ランニング テンプレ';

-- workout_sessions.routine_id への FK 制約を追加
ALTER TABLE public.workout_sessions
    DROP CONSTRAINT IF EXISTS workout_sessions_routine_id_fkey;
ALTER TABLE public.workout_sessions
    ADD CONSTRAINT workout_sessions_routine_id_fkey
    FOREIGN KEY (routine_id)
    REFERENCES public.workout_routines(id)
    ON DELETE SET NULL;

-- --------------------------------------------------
-- 5) updated_at トリガー (既存パターンを踏襲)
-- --------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workout_sessions_touch ON public.workout_sessions;
CREATE TRIGGER trg_workout_sessions_touch
    BEFORE UPDATE ON public.workout_sessions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_workout_exercises_touch ON public.workout_exercises;
CREATE TRIGGER trg_workout_exercises_touch
    BEFORE UPDATE ON public.workout_exercises
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_workout_routines_touch ON public.workout_routines;
CREATE TRIGGER trg_workout_routines_touch
    BEFORE UPDATE ON public.workout_routines
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- --------------------------------------------------
-- 6) Row Level Security
-- --------------------------------------------------

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_sessions_owner_select ON public.workout_sessions;
CREATE POLICY workout_sessions_owner_select ON public.workout_sessions
    FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS workout_sessions_owner_modify ON public.workout_sessions;
CREATE POLICY workout_sessions_owner_modify ON public.workout_sessions
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS workout_exercises_owner_select ON public.workout_exercises;
CREATE POLICY workout_exercises_owner_select ON public.workout_exercises
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workout_sessions s
                WHERE s.id = workout_exercises.session_id AND s.user_id = auth.uid())
    );
DROP POLICY IF EXISTS workout_exercises_owner_modify ON public.workout_exercises;
CREATE POLICY workout_exercises_owner_modify ON public.workout_exercises
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workout_sessions s
                WHERE s.id = workout_exercises.session_id AND s.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.workout_sessions s
                WHERE s.id = workout_exercises.session_id AND s.user_id = auth.uid())
    );

DROP POLICY IF EXISTS workout_routines_owner_select ON public.workout_routines;
CREATE POLICY workout_routines_owner_select ON public.workout_routines
    FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS workout_routines_owner_modify ON public.workout_routines;
CREATE POLICY workout_routines_owner_modify ON public.workout_routines
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- --------------------------------------------------
-- 後方互換メモ
-- --------------------------------------------------
-- 既存 habits 行は workout_kind=NULL のままで、UI 上は通常 habit として描画される。
-- BODY タブ初回起動時に POST /api/workouts/bootstrap を叩くと、
-- workout_kind='strength' / 'running' の habit が 2 件 pre-seed される (冪等)。
