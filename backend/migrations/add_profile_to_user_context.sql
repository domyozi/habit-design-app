-- Phase 6.5.3 (2026-05-03): user_context に profile JSONB を追加。
--
-- 既存カラム: identity / patterns / values_keywords / insights / goal_summary
-- これに加えて、ユーザーの構造化された属性情報（年齢 / 居住地 / 職業 /
-- 家族構成 / 体格メモ / 予算感 / 興味 / 制約条件など）を JSONB で保持する。
--
-- coach prompt の <user_memory> に profile を 1 行で注入し、AI が個別化
-- された応答を返せるようにする（例: 東京の 32 歳 PM 向けの提案）。
--
-- MVP では Memory ページの編集 UI のみで更新する（AI が memory_patch で
-- 上書きする経路は MVP では見送り）。

ALTER TABLE public.user_context
  ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT '{}'::jsonb;
