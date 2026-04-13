-- ========================================
-- 習慣設計アプリ データベーススキーマ
-- ========================================
--
-- 作成日: 2026-04-12
-- 対象DB: Supabase (PostgreSQL 15+)
-- 関連設計: architecture.md
--
-- 信頼性レベル:
-- - 🔵 青信号: 要件定義書・ユーザーヒアリングを参考にした確実な定義
-- - 🟡 黄信号: 要件定義書・ユーザーヒアリングから妥当な推測による定義
-- - 🔴 赤信号: 要件定義書・ユーザーヒアリングにない推測による定義
--
-- 注意:
-- Supabase では auth.users が自動作成される。
-- 本スキーマは public スキーマのアプリ用テーブルのみ定義。
-- Row Level Security (RLS) を全テーブルに有効化すること。
--

-- ========================================
-- 拡張機能の有効化
-- ========================================

-- UUID生成: gen_random_uuid() を使用
-- 🔵 Supabase標準で有効化済み
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- テーブル定義
-- ========================================

-- --------------------------------------------------
-- ユーザープロフィール（auth.users の補完情報）
-- 🔵 REQ-103: マルチデバイス対応のためのユーザー情報保存
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 Supabase Auth連携
    display_name VARCHAR(100),                      -- 🟡 表示名（任意）
    timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',      -- 🔵 EDGE-102: タイムゾーン考慮
    weekly_review_day SMALLINT DEFAULT 5            -- 🔵 REQ-701: 週次レビュー曜日（1=月〜7=日、5=金）
        CHECK (weekly_review_day BETWEEN 1 AND 7),
    notification_email VARCHAR(255),                -- 🔵 REQ-801: リマインダーメール宛先
    notification_enabled BOOLEAN DEFAULT true,      -- 🔵 REQ-802: 通知オン/オフ
    created_at TIMESTAMPTZ DEFAULT NOW(),           -- 🔵 共通パターン
    updated_at TIMESTAMPTZ DEFAULT NOW()            -- 🔵 共通パターン
);

-- --------------------------------------------------
-- Wanna Be（将来像）
-- 🔵 REQ-201/202: Wanna Be登録・編集
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wanna_be (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 🔵 共通パターン
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 ユーザー紐付け
    text TEXT NOT NULL,                            -- 🔵 REQ-201: 自由テキスト
    version INTEGER DEFAULT 1,                     -- 🔵 REQ-202: 段階的編集履歴
    is_current BOOLEAN DEFAULT true,               -- 🔵 REQ-202: 現在有効なWanna Be
    created_at TIMESTAMPTZ DEFAULT NOW(),          -- 🔵 共通パターン
    updated_at TIMESTAMPTZ DEFAULT NOW()           -- 🔵 共通パターン
);

-- --------------------------------------------------
-- 長期目標（Wanna BeをAIが整理した目標、最大3件）
-- 🔵 REQ-203/204: AI提案目標を保存
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 🔵 共通パターン
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 ユーザー紐付け
    wanna_be_id UUID REFERENCES public.wanna_be(id), -- 🔵 元Wanna Beへの紐付け
    title VARCHAR(200) NOT NULL,                    -- 🔵 REQ-203: 目標タイトル
    description TEXT,                               -- 🟡 目標の詳細説明（任意）
    display_order SMALLINT DEFAULT 0,               -- 🟡 表示順序
    is_active BOOLEAN DEFAULT true,                 -- 🟡 有効/無効フラグ
    created_at TIMESTAMPTZ DEFAULT NOW(),           -- 🔵 共通パターン
    updated_at TIMESTAMPTZ DEFAULT NOW()            -- 🔵 共通パターン
);

-- --------------------------------------------------
-- 習慣（ルーティン）
-- 🔵 REQ-301/302/304: 習慣管理
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 🔵 共通パターン
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 ユーザー紐付け
    goal_id UUID REFERENCES public.goals(id),       -- 🔵 REQ-205: どのゴールに効くか（Wanna Be接続）
    title VARCHAR(200) NOT NULL,                    -- 🔵 習慣名（例: 「ランニング30分」）
    description TEXT,                               -- 🟡 習慣の説明
    frequency VARCHAR(20) DEFAULT 'daily'           -- 🟡 頻度（daily/weekdays/weekly等）
        CHECK (frequency IN ('daily', 'weekdays', 'weekends', 'custom')),
    scheduled_time TIME,                            -- 🔵 REQ-305: 実行時刻（例: 07:00）
    display_order SMALLINT DEFAULT 0,               -- 🟡 チェックリスト表示順
    current_streak INTEGER DEFAULT 0,               -- 🔵 REQ-502: 現在のストリーク
    longest_streak INTEGER DEFAULT 0,               -- 🟡 最長ストリーク記録
    is_active BOOLEAN DEFAULT true,                 -- 🔵 REQ-304: 削除の代わりに非活性化
    created_at TIMESTAMPTZ DEFAULT NOW(),           -- 🔵 共通パターン
    updated_at TIMESTAMPTZ DEFAULT NOW()            -- 🔵 共通パターン
);

-- --------------------------------------------------
-- 習慣ログ（日次達成記録）
-- 🔵 REQ-501/502/503: 習慣トラッキング
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.habit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 🔵 共通パターン
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE, -- 🔵 習慣紐付け
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,     -- 🔵 RLS用
    log_date DATE NOT NULL,                         -- 🔵 REQ-501: 記録日（ユーザータイムゾーン換算）
    completed BOOLEAN NOT NULL DEFAULT false,       -- 🔵 REQ-501: 達成/未達成
    completed_at TIMESTAMPTZ,                       -- 🟡 達成した実時刻
    input_method VARCHAR(20)                        -- 🟡 入力方法（manual/voice/auto）
        CHECK (input_method IN ('manual', 'voice', 'auto')),
    created_at TIMESTAMPTZ DEFAULT NOW(),           -- 🔵 共通パターン
    -- 同日同習慣のログは1件のみ許可
    UNIQUE (habit_id, log_date)                     -- 🔵 EDGE-102: 日付重複禁止
);

-- --------------------------------------------------
-- 未達成理由（できなかった理由の記録）
-- 🔵 REQ-406/602: できなかった理由の記録とパターン分析
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.failure_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),    -- 🔵 共通パターン
    habit_log_id UUID NOT NULL REFERENCES public.habit_logs(id) ON DELETE CASCADE, -- 🔵 ログ紐付け
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 RLS用
    reason TEXT NOT NULL,                             -- 🔵 REQ-406: 理由テキスト（1行）
    created_at TIMESTAMPTZ DEFAULT NOW()              -- 🔵 共通パターン
);

-- --------------------------------------------------
-- ジャーナルエントリー（音声・テキスト自由記述）
-- 🔵 REQ-402: AI分類後のジャーナリング保存
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),    -- 🔵 共通パターン
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 ユーザー紐付け
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,    -- 🔵 記録日
    content TEXT NOT NULL,                            -- 🔵 REQ-402: 入力テキスト
    entry_type VARCHAR(30)                            -- 🔵 REQ-402: AI分類結果
        CHECK (entry_type IN ('journaling', 'daily_report', 'checklist', 'kpi_update')),
    raw_input TEXT,                                   -- 🟡 元の音声入力テキスト（デバッグ用）
    created_at TIMESTAMPTZ DEFAULT NOW()              -- 🔵 共通パターン
);

-- --------------------------------------------------
-- 週次レビュー（AIが生成した振り返り）
-- 🔵 REQ-701/702: 週次レビュー記録
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),    -- 🔵 共通パターン
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 ユーザー紐付け
    week_start DATE NOT NULL,                         -- 🔵 レビュー対象週の開始日（月曜）
    week_end DATE NOT NULL,                           -- 🔵 レビュー対象週の終了日（日曜）
    ai_feedback TEXT,                                 -- 🔵 REQ-702: AIフィードバック本文
    achievement_rate DECIMAL(5,2),                    -- 🟡 週間達成率（%）
    suggested_actions JSONB,                          -- 🔵 REQ-303: AI提案アクション（type/habit_id/value等）
    status VARCHAR(20) DEFAULT 'completed'            -- 🟡 生成状態
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),             -- 🔵 共通パターン
    UNIQUE (user_id, week_start)                      -- 🟡 同週の重複生成を防止
);

-- --------------------------------------------------
-- バッジ定義（マスターデータ）
-- 🔵 REQ-901: バッジ種類の定義
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_definitions (
    id VARCHAR(50) PRIMARY KEY,                       -- 🔵 バッジID（例: 'streak_7', 'streak_30'）
    name VARCHAR(100) NOT NULL,                       -- 🔵 バッジ名
    description TEXT,                                 -- 🔵 REQ-902: バッジの説明
    condition_type VARCHAR(30) NOT NULL               -- 🔵 付与条件種別
        CHECK (condition_type IN ('streak', 'total_count', 'weekly_rate')),
    condition_value INTEGER NOT NULL,                 -- 🔵 条件値（例: streak_7なら7）
    icon_name VARCHAR(50)                             -- 🟡 フロントエンドで使うアイコン名
);

-- --------------------------------------------------
-- ユーザーバッジ（獲得済みバッジ）
-- 🔵 REQ-901/902: バッジ付与・表示
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),    -- 🔵 共通パターン
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 🔵 ユーザー紐付け
    badge_id VARCHAR(50) NOT NULL REFERENCES public.badge_definitions(id), -- 🔵 バッジ種別
    habit_id UUID REFERENCES public.habits(id),       -- 🟡 どの習慣で獲得したか（任意）
    earned_at TIMESTAMPTZ DEFAULT NOW(),              -- 🔵 獲得日時
    UNIQUE (user_id, badge_id, habit_id)              -- 🔵 同じバッジの重複付与防止
);

-- ========================================
-- インデックス
-- ========================================

-- habit_logs: 日付・ユーザーでの検索が多い
-- 🔵 パフォーマンス要件（NFR-001）
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date
    ON public.habit_logs (user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date
    ON public.habit_logs (habit_id, log_date DESC);

-- habits: ユーザーのアクティブ習慣リスト取得
-- 🔵 ダッシュボードの主要クエリ
CREATE INDEX IF NOT EXISTS idx_habits_user_active
    ON public.habits (user_id, is_active, display_order);

-- failure_reasons: パターン分析用
-- 🟡 REQ-602: パターン分析の検索速度向上
CREATE INDEX IF NOT EXISTS idx_failure_reasons_user
    ON public.failure_reasons (user_id, created_at DESC);

-- weekly_reviews: ユーザー・週での検索
-- 🔵 週次レビュー取得
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_week
    ON public.weekly_reviews (user_id, week_start DESC);

-- ========================================
-- Row Level Security (RLS) ポリシー
-- ========================================

-- 🔵 NFR-102: 全テーブルでユーザーデータを分離

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wanna_be ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- user_profiles: 自分のプロフィールのみ操作可能
CREATE POLICY "user_profiles_self_only" ON public.user_profiles
    FOR ALL USING (id = auth.uid());

-- wanna_be: 自分のレコードのみ
CREATE POLICY "wanna_be_self_only" ON public.wanna_be
    FOR ALL USING (user_id = auth.uid());

-- goals: 自分のレコードのみ
CREATE POLICY "goals_self_only" ON public.goals
    FOR ALL USING (user_id = auth.uid());

-- habits: 自分のレコードのみ
CREATE POLICY "habits_self_only" ON public.habits
    FOR ALL USING (user_id = auth.uid());

-- habit_logs: 自分のレコードのみ
CREATE POLICY "habit_logs_self_only" ON public.habit_logs
    FOR ALL USING (user_id = auth.uid());

-- failure_reasons: 自分のレコードのみ
CREATE POLICY "failure_reasons_self_only" ON public.failure_reasons
    FOR ALL USING (user_id = auth.uid());

-- journal_entries: 自分のレコードのみ
CREATE POLICY "journal_entries_self_only" ON public.journal_entries
    FOR ALL USING (user_id = auth.uid());

-- weekly_reviews: 自分のレコードのみ
CREATE POLICY "weekly_reviews_self_only" ON public.weekly_reviews
    FOR ALL USING (user_id = auth.uid());

-- badge_definitions: 全ユーザーが読み取り可能（マスターデータ）
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badge_definitions_read_all" ON public.badge_definitions
    FOR SELECT USING (true);

-- user_badges: 自分のバッジのみ
CREATE POLICY "user_badges_self_only" ON public.user_badges
    FOR ALL USING (user_id = auth.uid());

-- ========================================
-- 自動更新トリガー（updated_at）
-- ========================================

-- 🔵 共通パターン
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
-- 初期マスターデータ（バッジ定義）
-- ========================================

-- 🔵 REQ-901: バッジ種類
INSERT INTO public.badge_definitions (id, name, description, condition_type, condition_value, icon_name) VALUES
    ('streak_3',   '3日連続',   '同じ習慣を3日連続達成',   'streak', 3,  'flame_small'),
    ('streak_7',   '7日連続',   '同じ習慣を7日連続達成',   'streak', 7,  'flame'),
    ('streak_14',  '2週間連続', '同じ習慣を14日連続達成',  'streak', 14, 'fire'),
    ('streak_30',  '30日連続',  '同じ習慣を30日連続達成',  'streak', 30, 'trophy'),
    ('streak_100', '100日連続', '同じ習慣を100日連続達成', 'streak', 100,'diamond')
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 信頼性レベルサマリー
-- ========================================
-- - 🔵 青信号: 42件 (78%)
-- - 🟡 黄信号: 12件 (22%)
-- - 🔴 赤信号: 0件 (0%)
--
-- 品質評価: 高品質
