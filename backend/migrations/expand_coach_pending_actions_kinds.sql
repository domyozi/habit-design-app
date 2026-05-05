-- Phase MVP-prep (2026-05-05): coach_pending_actions の kind に task / habit を追加。
--
-- 経緯:
--   従来 Coach の tasks[] / habits[] は coach_pending_actions に保存されず、
--   中央フローの inline ActionCard としてしか露出していなかった。
--   結果、右ペインの 24h PROPOSALS に新規タスク/習慣の提案が残らず、
--   ドライラン参加者から「PROPOSAL に出ない」と指摘された（同日対応）。
--
-- 対応:
--   CHECK 制約を緩めて 'task' / 'habit' を許可。アプリ側の to_pending_action_rows
--   と _PENDING_KINDS / PENDING_KINDS にも追加する（別コミット）。
--
-- ロールバック:
--   ALTER TABLE public.coach_pending_actions
--   DROP CONSTRAINT coach_pending_actions_kind_check;
--   ALTER TABLE public.coach_pending_actions
--   ADD CONSTRAINT coach_pending_actions_kind_check
--   CHECK (kind IN ('pt_update', 'pt_close', 'habit_today_complete', 'memory_patch'));

ALTER TABLE public.coach_pending_actions
DROP CONSTRAINT IF EXISTS coach_pending_actions_kind_check;

ALTER TABLE public.coach_pending_actions
ADD CONSTRAINT coach_pending_actions_kind_check
CHECK (kind IN (
  'pt_update',
  'pt_close',
  'habit_today_complete',
  'memory_patch',
  'task',
  'habit'
));
