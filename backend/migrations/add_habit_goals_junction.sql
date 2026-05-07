-- P2: Habit ↔ Goal の N:N 中間テーブル
--
-- 背景: 現状 `habits.goal_id` (1 対 N) と `kpi_habits` (M:N、KPI 経由) で
--   多対多を間接的に表現しているが、KPI 層を将来削除するため
--   Habit ↔ Goal を直接 M:N で持てるようにする。
--
-- 動作:
--   - 既存 `habits.goal_id` は backwards-compatible のため温存（後続 PR で deprecated に）
--   - bootstrap: 既存 habits.goal_id が NOT NULL の行を habit_goals に複製挿入
--     （二重所有: habits.goal_id も habit_goals 行も両方真）
--   - 「主たる Goal」は将来別カラム (habits.primary_goal_id) で表現するか、
--     habit_goals に is_primary フラグを足すか、別 PR で決める
--
-- RLS: 他のテーブル同様 user_id でフィルタ。strict_owner_rls_policies と同じパターン。

CREATE TABLE IF NOT EXISTS public.habit_goals (
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (habit_id, goal_id)
);

CREATE INDEX IF NOT EXISTS habit_goals_user_id_idx
    ON public.habit_goals (user_id);
CREATE INDEX IF NOT EXISTS habit_goals_goal_id_idx
    ON public.habit_goals (goal_id);

ALTER TABLE public.habit_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS habit_goals_self_only ON public.habit_goals;
CREATE POLICY habit_goals_self_only ON public.habit_goals
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Bootstrap: 既存 habits.goal_id が設定されている行を habit_goals に複製
INSERT INTO public.habit_goals (habit_id, goal_id, user_id)
SELECT h.id, h.goal_id, h.user_id
FROM public.habits h
WHERE h.goal_id IS NOT NULL
ON CONFLICT (habit_id, goal_id) DO NOTHING;
