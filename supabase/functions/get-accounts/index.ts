// POST /get-accounts
// Returns all accounts owned by the authenticated user with current balances.

import {
  preflightOrError,
  parseJsonBody,
  authenticate,
  errorResponse,
  successResponse,
  round2,
  AuthCredentials,
} from '../_shared/api.ts';
import { valueAccount } from '../_shared/accountValue.ts';

interface Body extends AuthCredentials {
  account_types?: ('checking' | 'savings' | 'credit' | 'investment')[];
  banks?: string[];
  active_only?: boolean;
}

Deno.serve(async (req) => {
  const pre = preflightOrError(req);
  if (pre) return pre;

  const body = await parseJsonBody<Body>(req);
  if (body instanceof Response) return body;

  const ctx = await authenticate(body);
  if (ctx instanceof Response) return ctx;
  const { supabase, userId } = ctx;

  let query = supabase
    .from('accounts')
    .select('id, name, bank, account_type, balance, currency, parent_account_id, fx_rate, initial_fx_rate, created_at, updated_at')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (body.account_types && body.account_types.length > 0) {
    query = query.in('account_type', body.account_types);
  }
  if (body.banks && body.banks.length > 0) {
    query = query.in('bank', body.banks);
  }

  const { data, error } = await query;
  if (error) {
    return errorResponse(500, { code: 'query_failed', message: 'Failed to fetch accounts', details: error.message });
  }

  // `balance` is always base currency. A currency subaccount also reports
  // its own-currency `native_balance` and the average rate it is valued at.
  const accounts = (data ?? []).map((a) => {
    const v = valueAccount(a);
    const { fx_rate: _r, initial_fx_rate: _i, ...rest } = a;
    return {
      ...rest,
      balance: v.base_balance ?? 0,
      native_balance: v.native_balance,
      currency: v.currency,
      avg_rate: v.avg_rate,
      valued: v.base_balance != null,
    };
  });
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const byType = accounts.reduce((acc: Record<string, { count: number; total: number }>, a) => {
    const t = a.account_type || 'other';
    if (!acc[t]) acc[t] = { count: 0, total: 0 };
    acc[t].count++;
    acc[t].total += a.balance;
    return acc;
  }, {});

  return successResponse({
    data: accounts,
    summary: {
      total_accounts: accounts.length,
      total_balance: round2(total),
      by_type: Object.entries(byType).map(([type, d]) => ({ type, count: d.count, total: round2(d.total) })),
    },
  });
});
