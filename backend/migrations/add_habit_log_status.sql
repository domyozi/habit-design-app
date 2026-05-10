-- Sprint habit-skip: habit_logs に status 列を追加して
-- 「意図的な休み (skip)」を「未達 (miss)」と区別する。
--
-- - status='done'    : 既存挙動 (completed=true なら達成、false なら未達/未入力)
-- - status='skipped' : 意図的な休み。streak を切らない、週次/月次の達成カウントにも含めない
--
-- 既存レコードはすべて 'done' で埋まる (DEFAULT 適用)。
-- CHECK 制約で 'done' / 'skipped' のみ許容。

ALTER TABLE habit_logs
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'
  CHECK (status IN ('done', 'skipped'));

-- status='skipped' を高頻度に絞り込むためのインデックス (streak 計算で参照)。
CREATE INDEX IF NOT EXISTS idx_habit_logs_skipped
  ON habit_logs (habit_id, user_id, log_date)
  WHERE status = 'skipped';
