-- Trace copilot — per-user OpenRouter credentials.
--
-- The key was a deployment-wide edge-function secret, which meant only
-- whoever owns the Supabase project could turn Trace on. Storing it per
-- user lets each account bring its own key from the app's own settings.
--
-- SECURITY — this table is deliberately unreachable from the client.
-- RLS is enabled and *no policies are created*, so the `anon` and
-- `authenticated` roles can neither read nor write it. Every access goes
-- through the `trace-settings` edge function, which authenticates the
-- caller's JWT and uses the service role (which bypasses RLS) to act on
-- exactly that user's row. Consequences worth being explicit about:
--   • the key can never be read back by a browser session, even a
--     compromised one — the UI only ever sees `key_hint`
--   • PostgREST cannot expose it, so there is no policy to get wrong
--
-- The key is stored as plaintext protected by Postgres' at-rest
-- encryption. Moving it into Supabase Vault would add envelope
-- encryption, at the cost of coupling this migration to the
-- `supabase_vault` extension; that is a reasonable follow-up rather than
-- a prerequisite.

CREATE TABLE IF NOT EXISTS public.trace_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- OpenRouter API key. Read only by the service role.
  api_key TEXT NOT NULL,
  -- Last few characters, safe to show so the user can recognise which key
  -- is installed without it ever being retrievable.
  key_hint TEXT NOT NULL,
  -- Null falls back to the function's TRACE_MODEL default.
  model TEXT,
  reasoning_effort TEXT NOT NULL DEFAULT 'medium'
    CHECK (reasoning_effort IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.trace_credentials ENABLE ROW LEVEL SECURITY;

-- No policies by design. See the note above: the service role bypasses RLS,
-- and nothing else is permitted to touch this table.

COMMENT ON TABLE public.trace_credentials IS
  'Per-user OpenRouter credentials for the Trace copilot. Service-role access only — the client goes through the trace-settings edge function.';
