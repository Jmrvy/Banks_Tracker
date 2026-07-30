-- Trace copilot — activity log.
--
-- Every proposal the user applies is written here with the inverse edit
-- stored alongside it, so "Undo" is a replay of `undo_payload` rather than
-- a guess at what the previous state was. The log is also what the Radar
-- rail reads to show what Trace has been doing.
--
-- Trace itself never writes to this table: the client applies a proposal
-- under the user's own session and records the result, so RLS covers both
-- the edit and its audit row.

CREATE TABLE IF NOT EXISTS public.trace_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'categorize' | 'budget' — matches the proposal kinds the copilot emits.
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  -- What was applied, for display.
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- The inverse edit, replayed verbatim on undo.
  undo_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trace_activity_user_created_idx
  ON public.trace_activity (user_id, created_at DESC);

ALTER TABLE public.trace_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own trace activity" ON public.trace_activity;
CREATE POLICY "Users manage their own trace activity"
  ON public.trace_activity
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.trace_activity IS
  'Audit + undo log for changes applied from a Trace copilot proposal.';
