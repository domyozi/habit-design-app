-- Sprint v5: Habit に 4 列追加 (KPI 完全吸収 + 表示タイミング)
--
-- KPI 層を Habit に統合するため、集計タイプ / 集計単位 / 期間目標 / 表示タイミング
-- を Habit 自身に持たせる。既存 habit には NOT NULL DEFAULT で値が自動で入る。
--
-- 追加列:
--   - aggregation_kind: 'count' (達成回数集計) | 'sum' (累積値集計)
--   - aggregation_period: 'daily' | 'weekly' | 'monthly'
--   - period_target: 期間目標値 (count なら回数、sum なら unit ベースの累積値)
--   - display_window: 'morning' | 'noon' | 'evening' | 'anytime' (Today 表示帯)

ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS aggregation_kind text NOT NULL DEFAULT 'count'
    CHECK (aggregation_kind IN ('count', 'sum')),
  ADD COLUMN IF NOT EXISTS aggregation_period text NOT NULL DEFAULT 'daily'
    CHECK (aggregation_period IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS period_target numeric NULL,
  ADD COLUMN IF NOT EXISTS display_window text NOT NULL DEFAULT 'anytime'
    CHECK (display_window IN ('morning', 'noon', 'evening', 'anytime'));

COMMENT ON COLUMN habits.aggregation_kind IS 'count = 達成回数集計 / sum = 累積値集計';
COMMENT ON COLUMN habits.aggregation_period IS 'daily / weekly / monthly';
COMMENT ON COLUMN habits.period_target IS 'count なら回数、sum なら unit ベースの累積目標値 (NULL = 未設定)';
COMMENT ON COLUMN habits.display_window IS 'Today への表示時間帯 (morning=04-12, noon=12-18, evening=18-04, anytime=常時)';
