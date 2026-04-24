// POST /get-categories
// Returns all categories for the authenticated user with budgets and
// optional period spending (when `period_start`/`period_end` are provided).

import {
  preflightOrError,
  parseJsonBody,
  authenticate,
  errorResponse,
  successResponse,
  round2,
  AuthCredentials,
} from '../_shared/api.ts';

interface Body extends AuthCredentials {
  period_start?: string;
  period_end?: string;
  date_type?: 'transaction_date' | 'value_date' | 'accounting_date';
}

Deno.serve(async (req) => {
  const pre = preflightOrError(req);
  if (pre) return pre;

  const body = await parseJsonBody<Body>(req);
  if (body instanceof Response) return body;

  const ctx = await authenticate(body);
  if (ctx instanceof Response) return ctx;
  const { supabase, userId } = ctx;

  const { data: cats, error } = await supabase
    .from('categories')
    .select('id, name, color, budget, created_at, updated_at')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    return errorResponse(500, { code: 'query_failed', message: 'Failed to fetch categories', details: error.message });
  }

  const categories = cats ?? [];
  let withSpending: (typeof categories[number] & { period_spent?: number; period_net_spent?: number; period_refunded?: number; remaining_budget?: number })[] = categories;

  if (body.period_start || body.period_end) {
    const dateField = body.date_type === 'transaction_date' || body.date_type === 'accounting_date'
      ? 'transaction_date'
      : 'value_date';

    let q = supabase
      .from('transactions')
      .select('category_id, amount, refunded_amount, type')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .neq('include_in_stats', false);
    if (body.period_start) q = q.gte(dateField, body.period_start);
    if (body.period_end) q = q.lte(dateField, body.period_end);

    const { data: txs, error: txErr } = await q;
    if (txErr) {
      return errorResponse(500, { code: 'query_failed', message: 'Failed to compute spending', details: txErr.message });
    }

    const spentMap = new Map<string, { gross: number; refunded: number }>();
    for (const t of txs ?? []) {
      if (!t.category_id) continue;
      const prev = spentMap.get(t.category_id) ?? { gross: 0, refunded: 0 };
      prev.gross += Number(t.amount);
      prev.refunded += Number(t.refunded_amount || 0);
      spentMap.set(t.category_id, prev);
    }

    withSpending = categories.map(cat => {
      const s = spentMap.get(cat.id) ?? { gross: 0, refunded: 0 };
      const net = Math.max(0, s.gross - s.refunded);
      return {
        ...cat,
        period_spent: round2(s.gross),
        period_refunded: round2(s.refunded),
        period_net_spent: round2(net),
        remaining_budget: cat.budget ? round2(Math.max(0, Number(cat.budget) - net)) : null,
      };
    });
  }

  const totalBudget = categories.reduce((s, c) => s + Number(c.budget || 0), 0);

  return successResponse({
    data: withSpending,
    summary: {
      total_categories: categories.length,
      categories_with_budget: categories.filter(c => c.budget && Number(c.budget) > 0).length,
      total_monthly_budget: round2(totalBudget),
    },
  });
});
