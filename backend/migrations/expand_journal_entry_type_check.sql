-- 2026-05-03 (Sprint 7.4.7-fix)
-- journal_entries.entry_type CHECK 制約に v3 期で追加された 2 種を含める。
--
-- 旧定義: journaling / daily_report / checklist / kpi_update
--         + evening_feedback / evening_notes / morning_journal
--   ↓
-- 新定義: 上記 7 種 + user_context_snapshot + coach_action_log
--
-- 影響: 既存データには影響なし（CHECK は INSERT/UPDATE 時のみ評価）。
-- 経緯: backend `ALLOWED_ENTRY_TYPES` に 'coach_action_log' を追加した時点で
--       FastAPI の Python 側バリデーションは通っていたが、Supabase の CHECK 制約が
--       古いままだったため INSERT で 23514 (CheckViolation) → backend 500 となり、
--       UI で履歴行が一切表示されない状態になっていた。

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_entry_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_entry_type_check
  CHECK (entry_type IN (
    'journaling',
    'daily_report',
    'checklist',
    'kpi_update',
    'evening_feedback',
    'evening_notes',
    'morning_journal',
    'user_context_snapshot',
    'coach_action_log'
  ));
