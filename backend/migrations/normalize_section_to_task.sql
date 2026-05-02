-- todo_definitions のセクションを 'habit' / 'task' の 2 軸に正規化。
-- 旧 6 カテゴリ（growth / body / mind / system 等）と過去の AI ジャーナル由来の値を
-- すべて 'task' に集約する。'habit' はそのまま保持。
--
-- 適用前に件数を確認することを推奨:
--   SELECT section, COUNT(*)
--   FROM public.todo_definitions
--   WHERE section NOT IN ('habit', 'task')
--   GROUP BY 1;

UPDATE public.todo_definitions
   SET section = 'task'
 WHERE section NOT IN ('habit', 'task');
