// Shared helpers for the public Banks Tracker API edge functions.
// Each endpoint accepts either:
//   - email + password      (legacy, simple, produces a fresh session)
//   - session_token         (recommended, returned by POST /auth)
// Both require `x-api-key` as a shared secret.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

export const API_VERSION = '2.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export const errorResponse = (status: number, error: ApiError): Response =>
  new Response(JSON.stringify({ success: false, error, version: API_VERSION }), {
    status,
    headers: jsonHeaders,
  });

export const successResponse = (payload: Record<string, unknown>): Response =>
  new Response(JSON.stringify({ success: true, version: API_VERSION, ...payload }), {
    status: 200,
    headers: jsonHeaders,
  });

export interface AuthCredentials {
  email?: string;
  password?: string;
  session_token?: string; // alternative to email/password
}

export interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
  email: string;
}

/**
 * Authenticates the caller and returns an authenticated Supabase client
 * whose requests will be subject to the user's RLS policies.
 *
 * Returns either a `Response` (to short-circuit with an error) or an `AuthedContext`.
 */
export async function authenticate(body: AuthCredentials): Promise<Response | AuthedContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Session token path: faster, no password needed, respects RLS via user's JWT.
  if (body.session_token) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${body.session_token}` } },
    });
    const { data: userResp, error } = await supabase.auth.getUser(body.session_token);
    if (error || !userResp.user) {
      return errorResponse(401, { code: 'invalid_session', message: 'Invalid or expired session token' });
    }
    return { supabase, userId: userResp.user.id, email: userResp.user.email ?? '' };
  }

  if (!body.email || !body.password) {
    return errorResponse(400, {
      code: 'missing_credentials',
      message: 'Provide either `session_token` or both `email` and `password`',
    });
  }

  // Email/password path: sign in, capture access token, build RLS-scoped client.
  const signInClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await signInClient.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  if (authError || !authData.user || !authData.session) {
    return errorResponse(401, { code: 'invalid_credentials', message: 'Email or password is incorrect' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });
  return { supabase, userId: authData.user.id, email: authData.user.email ?? '' };
}

/** Verifies the shared `x-api-key` header and rejects other HTTP methods. */
export function preflightOrError(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse(405, { code: 'method_not_allowed', message: 'Only POST is supported' });
  }
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
    return errorResponse(401, { code: 'invalid_api_key', message: 'Missing or invalid x-api-key header' });
  }
  return null;
}

export async function parseJsonBody<T = Record<string, unknown>>(req: Request): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return errorResponse(400, { code: 'invalid_json', message: 'Request body is not valid JSON' });
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
