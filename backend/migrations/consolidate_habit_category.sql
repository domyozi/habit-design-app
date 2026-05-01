-- todo_definitions のセクション（カテゴリ）を 'habit' に集約。
-- 注: DB カラム名は section（フロント上の `category` と同じ意味）。
-- ・チェック式 (field_type='checkbox') の旧 non-HABIT 項目は HABIT へマージ
-- ・それ以外 (text/url/select 等で habit セクション外にあったもの) は is_active=false で HIDDEN へ退避
--
-- 適用前に件数を確認することを推奨:
--   SELECT section, field_type, COUNT(*)
--   FROM public.todo_definitions
--   WHERE section <> 'habit'
--   GROUP BY 1, 2;

-- チェック式の non-HABIT 項目を habit セクションへ集約
UPDATE public.todo_definitions
   SET section = 'habit'
 WHERE section <> 'habit'
   AND COALESCE(field_type, 'checkbox') = 'checkbox';

-- それ以外 (非チェック式かつ non-HABIT) は無効化して HIDDEN セクションへ退避
UPDATE public.todo_definitions
   SET is_active = false
 WHERE section <> 'habit';
