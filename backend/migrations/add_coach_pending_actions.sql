-- Phase 6.5 (2026-05-03): coach の pending actions を Real backend で永続化する。
--
-- Mock 期 (Phase 6 Sprint 1-5) は MockCoachClient が in-memory で持っていたが、
-- Real backend ではブラウザ間 / セッション間で共有可能にする。
-- AI 提案 (Primary Target 更新 / 完了 / 習慣の今日完了 / メモリ追記) を一旦
-- pending として保留し、ユーザーが ActionCard で accept/reject するまで残す。

CREATE TABLE IF NOT EXISTS public.coach_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'pt_update', 'pt_close', 'habit_today_complete', 'memory_patch'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(3, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'expired'
  )),
  source_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coach_pending_actions_user_status
  ON public.coach_pending_actions(user_id, status, created_at DESC);

ALTER TABLE public.coach_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_pending_actions_self_only ON public.coach_pending_actions;
CREATE POLICY coach_pending_actions_self_only ON public.coach_pending_actions
  FOR ALL USING (user_id = auth.uid());

-- 24h で expire するクリーンアップは APScheduler から定期実行するか、
-- read 時に「24h を超えた pending を expired として読み替える」ロジックでも可。
