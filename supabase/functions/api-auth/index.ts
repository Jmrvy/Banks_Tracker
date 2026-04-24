// POST /api-auth
// Exchange email + password for a session token reusable for ~1 hour.
// Clients should prefer this over sending password on every request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  preflightOrError,
  parseJsonBody,
  errorResponse,
  successResponse,
} from '../_shared/api.ts';

interface Body {
  email?: string;
  password?: string;
  refresh_token?: string; // optional: refresh an existing session
}

Deno.serve(async (req) => {
  const pre = preflightOrError(req);
  if (pre) return pre;

  const body = await parseJsonBody<Body>(req);
  if (body instanceof Response) return body;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  if (body.refresh_token) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: body.refresh_token });
    if (error || !data.session) {
      return errorResponse(401, { code: 'invalid_refresh', message: 'Refresh token invalid or expired' });
    }
    return successResponse({
      session_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: { id: data.user?.id, email: data.user?.email },
    });
  }

  if (!body.email || !body.password) {
    return errorResponse(400, { code: 'missing_credentials', message: '`email` and `password` are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  if (error || !data.session || !data.user) {
    return errorResponse(401, { code: 'invalid_credentials', message: 'Email or password is incorrect' });
  }

  return successResponse({
    session_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: { id: data.user.id, email: data.user.email },
  });
});
