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
import { LEDGER_COLUMNS, computeCategoryNets } from '../_shared/ledgerRules.ts';

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
  let withSpending: (typeof categories[number] & {
    period_spent?: number;
    period_net_spent?: number;
    period_refunded?: number;
    period_offsetting_income?: number;
    remaining_budget?: number;
  })[] = categories;

  if (body.period_start || body.period_end) {
    const dateField = body.date_type === 'transaction_date' || body.date_type === 'accounting_date'
      ? 'transaction_date'
      : 'value_date';

    let q = supabase
      .from('transactions')
      .select(LEDGER_COLUMNS)
      .eq('user_id', userId)
      // Income belongs in this query too. A row the user marked as having
      // come back on its category reduces what that category cost, so
      // asking only for expenses reported a spend the user never bore.
      .in('type', ['expense', 'income'])
      .neq('include_in_stats', false);
    if (body.period_start) q = q.gte(dateField, body.period_start);
    if (body.period_end) q = q.lte(dateField, body.period_end);

    const { data: txs, error: txErr } = await q;
    if (txErr) {
      return errorResponse(500, { code: 'query_failed', message: 'Failed to compute spending', details: txErr.message });
    }

    // One definition of what a category cost, shared with the app, the
    // alert emails and Trace. It also drops advance settlements and
    // special-budget rows, which this endpoint used to count as spending.
    const nets = computeCategoryNets((txs ?? []) as any[]);

    withSpending = categories.map(cat => {
      const s = nets.get(cat.id);
      const net = s?.net ?? 0;
      return {
        ...cat,
        period_spent: round2(s?.gross ?? 0),
        period_refunded: round2(s?.refunded ?? 0),
        period_offsetting_income: round2(s?.offsetIncome ?? 0),
        // Not floored: more can come back than went out, and that makes the
        // category cheaper rather than merely free. Flooring here reported
        // a surplus as a zero and hid it from whoever consumes this API.
        period_net_spent: round2(net),
        // Likewise signed — a negative remaining budget is an overspend,
        // which is exactly what a caller checking a budget needs to see.
        remaining_budget: cat.budget ? round2(Number(cat.budget) - net) : null,
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
