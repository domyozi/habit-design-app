-- Notes v2 storage for TipTap documents.
-- Apply in Supabase SQL editor before enabling the real Notes client.

CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_notes();

CREATE INDEX IF NOT EXISTS idx_notes_user_deleted_pinned_updated
  ON public.notes (user_id, deleted_at, pinned, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_order
  ON public.notes (user_id, order_index);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can manage their own notes" ON public.notes;
DROP POLICY IF EXISTS notes_self_only ON public.notes;
CREATE POLICY notes_self_only
  ON public.notes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
