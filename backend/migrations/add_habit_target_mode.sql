-- Sprint habit-target-mode: 「毎日達成型 / 推移型」を 1 列で表現する。
--
-- 背景:
--   既存の metric_type は 7 種類（binary / numeric_min / numeric_max / range /
--   duration / time_before / time_after）あり、ユーザーから「方向 (≥/≤) と
--   軌跡型と毎日型が混在していて分かりにくい」と FB を受けた。
--   UI を「実行有無 / 数値 / 目標時刻」の 3 タイプに統合し、判定モードを
--   別の 1 軸として持つことで認知負荷を下げる。
--
-- 追加列:
--   - target_mode: 'daily' (毎日達成型) | 'trajectory' (推移型) | NULL (auto-infer)
--     NULL のときは backend / frontend が metric_type+unit から推論する。
--     既存データは NULL のままで動作互換 (auto-infer に任せる)。
--
-- 既存データ非破壊。frontend / backend が NULL を許容する前提で段階移行する。

ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS target_mode text NULL
    CHECK (target_mode IS NULL OR target_mode IN ('daily', 'trajectory'));

COMMENT ON COLUMN habits.target_mode IS
  '判定モード。daily=毎日達成型、trajectory=推移型、NULL=auto-infer (metric_type+unit から推論)';
