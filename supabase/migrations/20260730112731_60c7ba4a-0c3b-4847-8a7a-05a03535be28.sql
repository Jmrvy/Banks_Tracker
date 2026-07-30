CREATE TABLE IF NOT EXISTS public.trace_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  undo_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trace_activity TO authenticated;
GRANT ALL ON public.trace_activity TO service_role;

CREATE INDEX IF NOT EXISTS trace_activity_user_created_idx
  ON public.trace_activity (user_id, created_at DESC);

ALTER TABLE public.trace_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own trace activity" ON public.trace_activity;
CREATE POLICY "Users manage their own trace activity"
  ON public.trace_activity
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

COMMENT ON TABLE public.trace_activity IS
  'Audit + undo log for changes applied from a Trace copilot proposal.';