-- Phase coach-policy (2026-05-09): coach_pending_actions の kind CHECK 制約を
-- Slice B/C/D/E で増やした kind 6 種に拡張する。
--
-- 経緯:
--   Slice B (habit_update / task_update), Slice C (task_delete),
--   Slice D (goal / goal_update), Slice E (memory_clear) で AI が emit する
--   action kind を増やしたが、DB の CHECK 制約が前回の v1 拡張 (task / habit
--   までの 6 種) のままだった。結果、新 kind を coach_pending_actions に
--   INSERT しようとすると CHECK 違反で失敗し、_persist_pending_actions の
--   try/except で silent に warning ログだけ残して row が出来ない。
--   live coach bubble にカードは一瞬出るが、bubble が永続化 entry に置き換わる
--   際に DB 上に row が無いので右ペインに残らず「2 秒で消える」現象として
--   観測された。
--
-- 対応:
--   CHECK 制約を緩めて Slice B/C/D/E の 6 kind を追加。アプリ側の
--   _PENDING_KINDS / PENDING_KINDS にはすでに追加済み（コミット a8b002b 以降）。
--
-- ロールバック:
--   ALTER TABLE public.coach_pending_actions
--     DROP CONSTRAINT coach_pending_actions_kind_check;
--   ALTER TABLE public.coach_pending_actions
--     ADD CONSTRAINT coach_pending_actions_kind_check
--     CHECK (kind IN ('pt_update', 'pt_close', 'habit_today_complete',
--                     'memory_patch', 'task', 'habit'));

ALTER TABLE public.coach_pending_actions
DROP CONSTRAINT IF EXISTS coach_pending_actions_kind_check;

ALTER TABLE public.coach_pending_actions
ADD CONSTRAINT coach_pending_actions_kind_check
CHECK (kind IN (
  -- v1: 元々の 4 kind
  'pt_update',
  'pt_close',
  'habit_today_complete',
  'memory_patch',
  -- v1.1: tasks / habits 提案カードを右ペインに残すための拡張
  'task',
  'habit',
  -- v2 (Slice B): 既存 entity 編集
  'habit_update',
  'task_update',
  -- v2 (Slice C): 削除提案
  'task_delete',
  -- v2 (Slice D): 中長期 Goal の新規 / 編集
  'goal',
  'goal_update',
  -- v2 (Slice E): Memory 特定キー削除
  'memory_clear'
));
