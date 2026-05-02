-- Habit モデルの単位拡張：量的・時刻系の習慣に対応する。
--
-- 背景:
--   既存の habits / habit_logs は completed BOOLEAN のみで「達成/未達成」を表現していた。
--   今後は「起床時刻 ≤ 07:00」「読書 ≥ 15分」「歩数 ≥ 8000」など、量・時刻ベースの
--   習慣を一つのモデルで扱うため、metric_type と数値/時刻ログ列を追加する。
--
-- 設計方針:
--   - 既存データを壊さない: 全カラム NULL 許容、metric_type は DEFAULT 'binary'。
--   - 整合性チェックはアプリ層で実施（target_* と metric_type の対応など）。
--     SQL の CHECK は enum 値の妥当性のみに留める。
--   - 自動取得（HealthKit/Shortcuts）の布石として input_method に 'shortcut' を許可する。
--
-- 適用前確認:
--   SELECT COUNT(*) FROM public.habits;
--   SELECT COUNT(*) FROM public.habit_logs;

-- --------------------------------------------------
-- habits: 単位・目標値カラムの追加
-- --------------------------------------------------

ALTER TABLE public.habits
    ADD COLUMN IF NOT EXISTS metric_type VARCHAR(20) NOT NULL DEFAULT 'binary',
    ADD COLUMN IF NOT EXISTS target_value NUMERIC,
    ADD COLUMN IF NOT EXISTS target_value_max NUMERIC,
    ADD COLUMN IF NOT EXISTS target_time TIME,
    ADD COLUMN IF NOT EXISTS unit VARCHAR(20),
    ADD COLUMN IF NOT EXISTS aggregation VARCHAR(20) NOT NULL DEFAULT 'exists';

-- metric_type: 達成判定の種類
--   binary       : log.completed が true なら達成
--   numeric_min  : log.numeric_value >= target_value
--   numeric_max  : log.numeric_value <= target_value
--   duration     : numeric_min と同等（unit='分' 固定の意味付け）
--   range        : target_value <= log.numeric_value <= target_value_max
--   time_before  : log.time_value <= target_time
--   time_after   : log.time_value >= target_time
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_metric_type_check;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_metric_type_check
    CHECK (metric_type IN ('binary', 'numeric_min', 'numeric_max', 'duration', 'range', 'time_before', 'time_after'));

-- aggregation: 同日複数ログを集約する関数
--   exists : 達成ログが1件でもあれば達成（binary 既定）
--   sum    : 当日合計が target を満たすか
--   max    : 当日最大値で判定
--   first  : 当日最初のイベントで判定（time_before などで使う）
--   avg    : 当日平均で判定
ALTER TABLE public.habits
    DROP CONSTRAINT IF EXISTS habits_aggregation_check;
ALTER TABLE public.habits
    ADD CONSTRAINT habits_aggregation_check
    CHECK (aggregation IN ('exists', 'sum', 'max', 'first', 'avg'));

-- --------------------------------------------------
-- habit_logs: 量・時刻の値カラムを追加
-- --------------------------------------------------

ALTER TABLE public.habit_logs
    ADD COLUMN IF NOT EXISTS numeric_value NUMERIC,
    ADD COLUMN IF NOT EXISTS time_value TIME;

-- input_method の許容値に 'shortcut' を追加（HealthKit / iOS Shortcuts 自動取得用の布石）。
-- 既存制約を一旦 DROP して再作成する。NULL は引き続き許容。
ALTER TABLE public.habit_logs
    DROP CONSTRAINT IF EXISTS habit_logs_input_method_check;
ALTER TABLE public.habit_logs
    ADD CONSTRAINT habit_logs_input_method_check
    CHECK (input_method IS NULL OR input_method IN ('manual', 'voice', 'auto', 'shortcut'));

-- --------------------------------------------------
-- インデックス（量的集計用）
-- --------------------------------------------------

-- 量的習慣の集計クエリ（直近X日の numeric_value/time_value を取り出す）を高速化。
-- 既存の (user_id, log_date DESC) と (habit_id, log_date DESC) は既に存在するので追加不要。

-- --------------------------------------------------
-- 後方互換メモ
-- --------------------------------------------------
-- 既存の habits 行は metric_type='binary', aggregation='exists' として読まれる。
-- 既存の habit_logs 行は numeric_value=NULL, time_value=NULL で、
-- streak 判定は従来どおり completed カラムで行われる（streak_service 側で metric_type 分岐）。
