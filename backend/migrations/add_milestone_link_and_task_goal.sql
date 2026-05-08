-- INBOX-link: Note ↔ Milestone と Task ↔ Goal の直接リンク追加。
--
-- 背景:
--   - Goal は parent_goal_id でツリー化済（add_goals_parent_id_for_hierarchy）。
--   - parent_goal_id を持つ Goal を「Milestone」とみなす。
--   - Milestone に自由メモ帳としての Note を 1 対 N で紐付ける。
--   - INBOX 経由で Habit / Milestone に時間をリンクするため、Task に goal_id 列を追加。
--
-- ロールバック:
--   ALTER TABLE public.notes DROP COLUMN IF EXISTS milestone_id;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS goal_id;

-- 1) notes.milestone_id (Milestone = parent_goal_id を持つ Goal)
--    ON DELETE SET NULL: Milestone (Goal) が消えても Note は残す（孤児化＝自由 Note 化）。
ALTER TABLE public.notes
    ADD COLUMN IF NOT EXISTS milestone_id UUID
    REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_milestone
    ON public.notes (milestone_id)
    WHERE milestone_id IS NOT NULL;

-- 2) tasks.goal_id (Habit / Note と並ぶ参照フィールド)
--    INBOX のタスクが Milestone (= 親付き Goal) にリンクされたとき埋まる。
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS goal_id UUID
    REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_goal
    ON public.tasks (user_id, goal_id)
    WHERE goal_id IS NOT NULL;
