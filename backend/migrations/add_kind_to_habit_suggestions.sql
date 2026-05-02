-- habit_suggestions に kind カラムを追加。
-- AI 抽出時に candidates を「習慣化対象 (habit)」と「個別タスク (task)」に分類できるようにする。
-- 既存行は習慣候補として扱う（DEFAULT 'habit'）ので後方互換。

ALTER TABLE public.habit_suggestions
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'habit'
    CHECK (kind IN ('habit', 'task'));

CREATE INDEX IF NOT EXISTS habit_suggestions_user_kind_status
    ON public.habit_suggestions (user_id, kind, status);
