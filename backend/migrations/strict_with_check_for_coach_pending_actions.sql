-- 2026-05-06: coach_pending_actions の RLS ポリシーを USING + with_check の
-- 両側で `user_id = auth.uid()` を強制する。INSERT 経路を厳密に塞ぐため。
--
-- 適用済み (本日 MCP 経由)。

DROP POLICY IF EXISTS coach_pending_actions_self_only ON public.coach_pending_actions;

CREATE POLICY coach_pending_actions_self_only ON public.coach_pending_actions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
