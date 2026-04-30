-- ========================================
-- Supabase セットアップ用 完全SQL
-- 習慣設計アプリ
-- ========================================
-- このファイルを Supabase SQL Editor で実行してください。
-- 実行順序: このファイル1つを全選択して実行するだけでOK。

-- ========================================
-- 拡張機能の有効化
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- テーブル定義
-- ========================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
    weekly_review_day SMALLINT DEFAULT 5
        CHECK (weekly_review_day BETWEEN 1 AND 7),
    notification_email VARCHAR(255),
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wanna_be (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wanna_be_id UUID REFERENCES public.wanna_be(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    display_order SMALLINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    goal_id UUID REFERENCES public.goals(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    frequency VARCHAR(20) DEFAULT 'daily'
        CHECK (frequency IN ('daily', 'weekdays', 'weekends', 'custom')),
    scheduled_time TIME,
    display_order SMALLINT DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.habit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    input_method VARCHAR(20)
        CHECK (input_method IN ('manual', 'voice', 'auto')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (habit_id, log_date)
);

CREATE TABLE IF NOT EXISTS public.failure_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_log_id UUID NOT NULL REFERENCES public.habit_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    content TEXT NOT NULL,
    entry_type VARCHAR(30)
        CHECK (entry_type IN ('journaling', 'daily_report', 'checklist', 'kpi_update', 'evening_feedback', 'evening_notes', 'morning_journal')),
    raw_input TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    ai_feedback TEXT,
    achievement_rate DECIMAL(5,2),
    suggested_actions JSONB,
    status VARCHAR(20) DEFAULT 'completed'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS public.badge_definitions (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    condition_type VARCHAR(30) NOT NULL
        CHECK (condition_type IN ('streak', 'total_count', 'weekly_rate')),
    condition_value INTEGER NOT NULL,
    icon_name VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id VARCHAR(50) NOT NULL REFERENCES public.badge_definitions(id),
    habit_id UUID REFERENCES public.habits(id),
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, badge_id, habit_id)
);

-- ========================================
-- インデックス
-- ========================================

CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date
    ON public.habit_logs (user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date
    ON public.habit_logs (habit_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_habits_user_active
    ON public.habits (user_id, is_active, display_order);

CREATE INDEX IF NOT EXISTS idx_failure_reasons_user
    ON public.failure_reasons (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week
    ON public.weekly_reviews (user_id, week_start DESC);

-- ========================================
-- RLS（Row Level Security）
-- ========================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wanna_be ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_self_only" ON public.user_profiles
    FOR ALL USING (id = auth.uid());

CREATE POLICY "wanna_be_self_only" ON public.wanna_be
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "goals_self_only" ON public.goals
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "habits_self_only" ON public.habits
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "habit_logs_self_only" ON public.habit_logs
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "failure_reasons_self_only" ON public.failure_reasons
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "journal_entries_self_only" ON public.journal_entries
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "weekly_reviews_self_only" ON public.weekly_reviews
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "badge_definitions_read_all" ON public.badge_definitions
    FOR SELECT USING (true);

CREATE POLICY "user_badges_self_only" ON public.user_badges
    FOR ALL USING (user_id = auth.uid());

-- ========================================
-- updated_at 自動更新トリガー
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_wanna_be_updated_at
    BEFORE UPDATE ON public.wanna_be
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_habits_updated_at
    BEFORE UPDATE ON public.habits
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- 認証ユーザー作成トリガー
-- （新規ユーザー登録時に user_profiles を自動作成）
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- バッジ定義マスターデータ（5件）
-- ========================================

INSERT INTO public.badge_definitions (id, name, description, condition_type, condition_value, icon_name) VALUES
    ('streak_3',   '3日連続',   '同じ習慣を3日連続達成',   'streak', 3,  'flame_small'),
    ('streak_7',   '7日連続',   '同じ習慣を7日連続達成',   'streak', 7,  'flame'),
    ('streak_14',  '2週間連続', '同じ習慣を14日連続達成',  'streak', 14, 'fire'),
    ('streak_30',  '30日連続',  '同じ習慣を30日連続達成',  'streak', 30, 'trophy'),
    ('streak_100', '100日連続', '同じ習慣を100日連続達成', 'streak', 100,'diamond')
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 確認クエリ（実行後に確認）
-- ========================================

-- テーブル一覧とRLS状態の確認:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- バッジデータの確認:
-- SELECT id, name FROM public.badge_definitions ORDER BY condition_value;

-- ========================================
-- todo_definitions テーブル（ルーティン定義）
-- ========================================

CREATE TABLE IF NOT EXISTS public.todo_definitions (
    id            text PRIMARY KEY,
    user_id       uuid REFERENCES auth.users NOT NULL,
    label         text NOT NULL,
    section       text NOT NULL,
    minutes       integer,
    is_must       boolean DEFAULT false,
    is_active     boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.todo_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todo_definitions: own rows only" ON public.todo_definitions
    FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- daily_logs テーブル（日次データ全般）
-- daily:{date}:{slot}:{field} パターンを Supabase に移行
-- ========================================

CREATE TABLE IF NOT EXISTS public.daily_logs (
  user_id    uuid REFERENCES auth.users NOT NULL,
  log_date   date NOT NULL,
  slot       text NOT NULL,
  field      text NOT NULL,
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, log_date, slot, field)
);
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_logs: own rows only" ON public.daily_logs FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- ops_tasks テーブル（今日のオペレーション）
-- ========================================

CREATE TABLE IF NOT EXISTS public.ops_tasks (
  id          text NOT NULL,
  user_id     uuid REFERENCES auth.users NOT NULL,
  task_date   date NOT NULL,
  title       text NOT NULL,
  done        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, task_date, id)
);
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_tasks: own rows only" ON public.ops_tasks FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- primary_targets テーブル（Primary Target / boss）
-- ========================================

CREATE TABLE IF NOT EXISTS public.primary_targets (
  user_id     uuid PRIMARY KEY REFERENCES auth.users,
  value       text NOT NULL DEFAULT '',
  set_date    date NOT NULL,
  completed   boolean DEFAULT false,
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE public.primary_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "primary_targets: own rows only" ON public.primary_targets FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- monthly_targets テーブル（月次目標）
-- ========================================

CREATE TABLE IF NOT EXISTS public.monthly_targets (
  user_id     uuid REFERENCES auth.users NOT NULL,
  year_month  text NOT NULL,
  targets     jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, year_month)
);
ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_targets: own rows only" ON public.monthly_targets FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- user_context テーブル（AI コーチ用メモリ）
-- ========================================

CREATE TABLE IF NOT EXISTS public.user_context (
  user_id          uuid PRIMARY KEY REFERENCES auth.users,
  identity         text,
  values_keywords  text[],
  goal_summary     text,
  patterns         text,
  insights         jsonb DEFAULT '{}',
  updated_at       timestamptz DEFAULT now()
);
ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_context: own rows only" ON public.user_context FOR ALL USING (auth.uid() = user_id);

-- todo_definitions: フィールドタイプ拡張
ALTER TABLE public.todo_definitions
  ADD COLUMN IF NOT EXISTS field_type text DEFAULT 'checkbox',
  ADD COLUMN IF NOT EXISTS field_options jsonb DEFAULT '{}';

-- ========================================
-- 習慣カテゴリ再設計マイグレーション（2026-04-27）
-- ========================================

-- todo_definitions に timing カラム追加
ALTER TABLE public.todo_definitions
  ADD COLUMN IF NOT EXISTS timing text DEFAULT 'morning';

-- 既存データのマイグレーション（旧セクション値 → 新カテゴリ + timing）
UPDATE public.todo_definitions SET
  timing = CASE section
    WHEN 'morning-must' THEN 'morning'
    WHEN 'morning-routine' THEN 'morning'
    WHEN 'evening-reflection' THEN 'evening'
    WHEN 'evening-prep' THEN 'evening'
    ELSE 'morning'
  END,
  section = CASE section
    WHEN 'morning-must' THEN 'identity'
    WHEN 'morning-routine' THEN 'system'
    WHEN 'evening-reflection' THEN 'system'
    WHEN 'evening-prep' THEN 'system'
    ELSE section
  END
WHERE section IN ('morning-must', 'morning-routine', 'evening-reflection', 'evening-prep');

-- ========================================
-- health_logs テーブル（iOS Shortcuts Webhook）
-- ========================================

CREATE TABLE IF NOT EXISTS public.health_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  metric      text NOT NULL,
  value       numeric NOT NULL,
  unit        text,
  recorded_at timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user own health_logs" ON public.health_logs
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
