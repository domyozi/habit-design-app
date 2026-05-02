-- Habit に証明方法（proof_type）・記録ソース（source_kind）・XP（xp_base）を追加する。
-- habit_logs に証明 URL（proof_url）・付与 XP（xp_earned）を追加する。
--
-- 背景:
--   Daily OS · AI-native の Habits 画面で、計測タイプ別の習慣に加えて
--   外部デバイス（Apple Watch / Nike Run / Health 等）からの自動取込、
--   写真証明、XP economy（証明方法に応じた重み付け報酬）を扱う。
--
-- 設計方針:
--   - 全カラム NULL 許容 + DEFAULT。既存行の挙動は変えない。
--   - proof_type は CHECK 制約で値の妥当性のみ担保。整合性チェックはアプリ層。
--   - source_kind は外部連携の発展余地を見越して文字列で持つ（CHECK 制約は緩め）。
--   - 写真ストレージは Supabase Storage の `habit-proofs` バケットを別途作成。
--     proof_url は public URL もしくは storage path を保持する想定。
--
-- 適用前確認:
--   SELECT COUNT(*) FROM public.habits;
--   SELECT COUNT(*) FROM public.habit_logs;

-- --------------------------------------------------
-- habits: proof_type / source_kind / xp_base
-- --------------------------------------------------

ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS proof_type   VARCHAR(20) NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS source_kind  VARCHAR(20) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS xp_base      INTEGER     NOT NULL DEFAULT 10;

-- proof_type:
--   none   : 手動チェックのみ（既定）
--   photo  : 写真アップロードで証明
--   auto   : 外部デバイス自動取込
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_proof_type_check;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_proof_type_check
    CHECK (proof_type IN ('none', 'photo', 'auto'));

-- source_kind:
--   manual / apple-watch / nike-run / strava / health-app / photo / calendar / linear / notion ...
-- 値は順次拡張するため CHECK は緩め（長さのみ）。
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_source_kind_check;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_source_kind_check
    CHECK (char_length(source_kind) BETWEEN 1 AND 20);

-- xp_base: 1 回達成あたりの基本 XP（行動の重み）
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_xp_base_check;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_xp_base_check
    CHECK (xp_base >= 0 AND xp_base <= 1000);

-- --------------------------------------------------
-- habit_logs: proof_url / xp_earned
-- --------------------------------------------------

ALTER TABLE public.habit_logs
    ADD COLUMN IF NOT EXISTS proof_url    TEXT,
    ADD COLUMN IF NOT EXISTS xp_earned    INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.habit_logs
    DROP CONSTRAINT IF EXISTS habit_logs_xp_earned_check;
ALTER TABLE public.habit_logs
    ADD CONSTRAINT habit_logs_xp_earned_check
    CHECK (xp_earned >= 0 AND xp_earned <= 100000);

-- --------------------------------------------------
-- 後方互換メモ
-- --------------------------------------------------
-- 既存の habits 行は proof_type='none', source_kind='manual', xp_base=10 として読まれる。
-- 既存の habit_logs 行は proof_url=NULL, xp_earned=0 となる。
-- フロント（frontend-v3）は proof_type/source_kind が未指定の場合 'none'/'manual' として扱う。
