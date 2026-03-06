# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a **Vite + React + TypeScript** personal finance tracker ("JMRVY CB") with a cloud-hosted **Supabase** backend. The frontend is the only local service; all backend (DB, auth, edge functions) runs on a remote Supabase instance at `cuanladihtpvkmjhvrln.supabase.co`.

### Key commands

See `package.json` scripts:
- **Dev server:** `npm run dev` (Vite on port 8080)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (ESLint; pre-existing `no-explicit-any` warnings are expected)

### Gotchas

- `npm install` requires `--legacy-peer-deps` due to a `jspdf@4` vs `jspdf-autotable` peer conflict. The update script already handles this.
- The Supabase project credentials are hardcoded in `src/integrations/supabase/client.ts`. Authentication flows (sign-up/login) depend on the remote Supabase instance being accessible and properly configured.
- There are no automated tests in this repository.
- Supabase email verification may need to be disabled in the Supabase dashboard (Authentication > Settings > Email Auth > "Confirm email") for sign-up to work in dev/test without a real inbox.
