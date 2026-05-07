-- P4: KPI → milestone Goal 移行用の冪等性カラム
--
-- 目的: scripts/migrate_kpis_to_goals.py が再実行されても二重移行されないように、
--       移行済みの KPI に対応する Goal の ID を kpis テーブルに記録する。
--
-- 動作:
--   - 未移行の kpi: migrated_to_goal_id IS NULL
--   - 移行済み kpi: migrated_to_goal_id = 新 Goal の ID
--   - スクリプトは migrated_to_goal_id IS NULL の行だけを処理
--
-- 後続:
--   - 観察期間（30 日）後、kpis / kpi_habits / kpi_logs を DROP する別 migration を作る
--   - そのときこのカラムも一緒に消える

ALTER TABLE public.kpis
    ADD COLUMN IF NOT EXISTS migrated_to_goal_id UUID
    REFERENCES public.goals(id) ON DELETE SET NULL;
