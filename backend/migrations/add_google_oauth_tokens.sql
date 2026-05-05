-- Google OAuth refresh_token 保存テーブル（Phase 7.3）
--
-- 背景:
--   frontend-v3 の Calendar 連携で Google Calendar API を使うため、
--   ユーザーごとに Authorization Code Flow で取得した refresh_token を
--   サーバー側に保存し、access_token を必要なタイミングで再発行する。
--
-- 設計方針:
--   - user_id を PK にし、1 ユーザー 1 行（再連携時は upsert で上書き）。
--   - refresh_token は backend からのみ参照される（FE には返さない）。
--   - access_token は短命だが、頻繁な refresh を避けるため一緒に保存し
--     有効期限切れ 5 分前で再 refresh する。
--   - RLS は user_id = auth.uid() の self only。Service role は backend
--     経由で expires_at の自動更新等を行う。
--
-- 適用前確認:
--   SELECT EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'google_oauth_tokens'
--   );
--
-- ロールバック:
--   DROP TABLE IF EXISTS public.google_oauth_tokens;

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
    user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token  TEXT        NOT NULL,
    refresh_token TEXT        NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    scope         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.set_updated_at_google_oauth_tokens()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_google_oauth_tokens_updated_at ON public.google_oauth_tokens;
CREATE TRIGGER trg_google_oauth_tokens_updated_at
BEFORE UPDATE ON public.google_oauth_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_google_oauth_tokens();

-- RLS
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_oauth_tokens_self_select ON public.google_oauth_tokens;
CREATE POLICY google_oauth_tokens_self_select
    ON public.google_oauth_tokens FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS google_oauth_tokens_self_modify ON public.google_oauth_tokens;
CREATE POLICY google_oauth_tokens_self_modify
    ON public.google_oauth_tokens FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 索引（user_id は PK なので不要）
