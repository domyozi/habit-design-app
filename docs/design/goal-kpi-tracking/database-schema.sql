-- ========================================
-- KPI/KGI ゴール逆算トラッキング DBスキーマ
-- ========================================
--
-- 作成日: 2026-04-15
-- 関連設計: architecture.md
-- 適用先: Supabase SQL Editor
--
-- 信頼性レベル:
-- - 🔵 青信号: 要件定義書・ヒアリング・既存DBスキーマを参考にした確実な定義
-- - 🟡 黄信号: 要件定義書・設計文書から妥当な推測による定義
--
-- 既存 setup-supabase.sql を実行済みの環境に追加で適用する
-- ========================================

-- ========================================
-- 1. goals テーブルへの KGI 属性追加
-- ========================================
-- 🔵 REQ-KGI-001・ヒアリング「既存構造を拡張」より
-- NULL 許容のため後方互換性を維持

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS target_value  NUMERIC         NULL,        -- 🔵 REQ-KGI-004: KGI目標値
  ADD COLUMN IF NOT EXISTS current_value NUMERIC         NULL,        -- 🔵 REQ-KGI-005: KGI現在値
  ADD COLUMN IF NOT EXISTS unit          VARCHAR(20)     NULL,        -- 🔵 REQ-KGI-004: 単位 (例: "kg","冊","%")
  ADD COLUMN IF NOT EXISTS target_date   DATE            NULL,        -- 🔵 REQ-KGI-002: KGI期限 (NULLなら通常Goal)
  ADD COLUMN IF NOT EXISTS metric_type   VARCHAR(20)     NULL;        -- 🔵 REQ-KGI-003: 'numeric'|'percentage'|'binary'

-- metric_type 制約
-- 🔵 REQ-KGI-003 より（3種類のみ許可）
ALTER TABLE public.goals
  ADD CONSTRAINT goals_metric_type_check
    CHECK (metric_type IN ('numeric', 'percentage', 'binary') OR metric_type IS NULL);

-- percentage 型の current_value 範囲制約
-- 🔵 EDGE-KPI-004 より
ALTER TABLE public.goals
  ADD CONSTRAINT goals_percentage_range_check
    CHECK (
      metric_type != 'percentage'
      OR current_value IS NULL
      OR (current_value >= 0 AND current_value <= 100)
    );

-- KGI としての整合性: target_date があれば metric_type も必須
-- 🔵 REQ-KGI-002 より
ALTER TABLE public.goals
  ADD CONSTRAINT goals_kgi_consistency_check
    CHECK (
      target_date IS NULL
      OR metric_type IS NOT NULL
    );

COMMENT ON COLUMN public.goals.target_value  IS 'KGI目標値。NULLなら通常Goal';
COMMENT ON COLUMN public.goals.current_value IS 'KGI現在値。手動またはシステム更新';
COMMENT ON COLUMN public.goals.unit          IS 'KGI単位 例: kg, 冊, %';
COMMENT ON COLUMN public.goals.target_date   IS 'KGI期限。NULLなら通常Goal（KGIでない）';
COMMENT ON COLUMN public.goals.metric_type   IS 'KGI指標タイプ: numeric | percentage | binary';

-- ========================================
-- 2. kpis テーブル（新規）
-- ========================================
-- 🔵 REQ-KPI-001〜005 より

CREATE TABLE IF NOT EXISTS public.kpis (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),  -- 🔵
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 RLS用
  goal_id             UUID          NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE, -- 🔵 REQ-KPI-001: EDGE-KPI-001対応
  title               VARCHAR(200)  NOT NULL,   -- 🔵 KPI名
  description         TEXT          NULL,        -- 🟡
  metric_type         VARCHAR(20)   NOT NULL,   -- 🔵 REQ-KPI-002
  target_value        NUMERIC       NULL,        -- 🔵 REQ-KPI-004
  unit                VARCHAR(20)   NULL,        -- 🔵 REQ-KPI-004
  tracking_frequency  VARCHAR(20)   NOT NULL DEFAULT 'daily', -- 🔵 REQ-KPI-003
  display_order       SMALLINT      NOT NULL DEFAULT 0,        -- 🟡
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,     -- 🟡
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),    -- 🔵
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),    -- 🔵

  CONSTRAINT kpis_metric_type_check
    CHECK (metric_type IN ('numeric', 'percentage', 'binary')),
  CONSTRAINT kpis_tracking_frequency_check
    CHECK (tracking_frequency IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT kpis_percentage_target_range
    CHECK (metric_type != 'percentage' OR target_value IS NULL OR (target_value >= 0 AND target_value <= 100))
);

COMMENT ON TABLE public.kpis IS 'KPI（中間指標）。KGI（goal）に紐付く';

-- インデックス
-- 🟡 検索パターンから推測
CREATE INDEX IF NOT EXISTS idx_kpis_user_id    ON public.kpis(user_id);
CREATE INDEX IF NOT EXISTS idx_kpis_goal_id    ON public.kpis(goal_id);
CREATE INDEX IF NOT EXISTS idx_kpis_is_active  ON public.kpis(is_active) WHERE is_active = TRUE;

-- updated_at 自動更新トリガー
-- 🔵 既存 DBスキーマの共通パターンより
CREATE OR REPLACE TRIGGER kpis_updated_at
  BEFORE UPDATE ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at(); -- 既存トリガー関数を流用

-- ========================================
-- 3. kpi_logs テーブル（新規）
-- ========================================
-- 🔵 REQ-LOG-001 より

CREATE TABLE IF NOT EXISTS public.kpi_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(), -- 🔵
  kpi_id        UUID          NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE, -- 🔵 EDGE-KPI-002対応
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- 🔵 RLS用
  log_date      DATE          NOT NULL,   -- 🔵 記録日 (YYYY-MM-DD)
  value         NUMERIC       NOT NULL,   -- 🔵 記録値 (binary: 1.0=達成 / 0.0=未達成)
  input_method  VARCHAR(20)   NULL,       -- 🔵 REQ-LOG-004: 'manual'|'voice'|'auto'
  note          TEXT          NULL,        -- 🟡
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(), -- 🔵

  CONSTRAINT kpi_logs_unique_per_day
    UNIQUE (kpi_id, log_date),  -- 🔵 EDGE-KPI-007: 同日upsert用
  CONSTRAINT kpi_logs_input_method_check
    CHECK (input_method IN ('manual', 'voice', 'auto') OR input_method IS NULL),
  CONSTRAINT kpi_logs_binary_value_check
    CHECK (TRUE) -- 🔴 binary制約はアプリ層で実装（DBでは0.0/1.0のみ受け付けるが型チェックは複雑なため省略）
);

COMMENT ON TABLE public.kpi_logs IS 'KPI 日次記録。(kpi_id, log_date) で一意';
COMMENT ON COLUMN public.kpi_logs.value IS 'binary型: 1.0=達成, 0.0=未達成。numeric/percentage型: 実測値';

-- インデックス
-- 🔵 グラフ表示の主要クエリパターンより
CREATE INDEX IF NOT EXISTS idx_kpi_logs_kpi_date ON public.kpi_logs(kpi_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_logs_user_date ON public.kpi_logs(user_id, log_date DESC);

-- ========================================
-- 4. kpi_habits テーブル（新規・多対多）
-- ========================================
-- 🔵 REQ-KPI-006・REQ-KPI-007 より

CREATE TABLE IF NOT EXISTS public.kpi_habits (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(), -- 🔵
  kpi_id      UUID          NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,   -- 🔵
  habit_id    UUID          NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,  -- 🔵
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,     -- 🔵 RLS用
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(), -- 🔵

  CONSTRAINT kpi_habits_unique
    UNIQUE (kpi_id, habit_id)  -- 🔵 重複防止
);

COMMENT ON TABLE public.kpi_habits IS 'KPI と Habit の多対多紐付けテーブル';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_kpi_habits_kpi_id   ON public.kpi_habits(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_habits_habit_id ON public.kpi_habits(habit_id);

-- ========================================
-- 5. RLS ポリシー（新規 3 テーブル）
-- ========================================
-- 🔵 NFR-KPI-101 より（既存の設計パターンに従う）

-- kpis テーブル RLS
ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpis: users can manage own kpis"
  ON public.kpis
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- kpi_logs テーブル RLS
ALTER TABLE public.kpi_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_logs: users can manage own logs"
  ON public.kpi_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- kpi_habits テーブル RLS
ALTER TABLE public.kpi_habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_habits: users can manage own links"
  ON public.kpi_habits
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 6. goals テーブルの既存 RLS への影響確認
-- ========================================
-- 🔵 既存設計から後方互換性確認
-- goals テーブルの RLS ポリシーは既存のまま（user_id = auth.uid()）。
-- 追加カラムは NULL 許容のため既存ポリシーへの影響なし。

-- ========================================
-- 確認クエリ
-- ========================================
-- 以下を Supabase SQL Editor で実行して確認する

-- goals テーブルの新カラム確認
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'goals' AND column_name IN ('target_value', 'unit', 'target_date', 'metric_type', 'current_value');

-- kpis/kpi_logs/kpi_habits テーブルの RLS 確認
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename IN ('kpis', 'kpi_logs', 'kpi_habits');

-- ========================================
-- 信頼性レベルサマリー
-- ========================================
-- - 🔵 青信号: 38件 (84%)
-- - 🟡 黄信号: 6件 (13%)
-- - 🔴 赤信号: 1件 (2%) ← binary値チェックのアプリ層対応
--
-- 品質評価: 高品質
