// POST /get-recurring
// Returns all recurring transactions for the authenticated user,
// with resolved monthly-equivalent amounts and totals.

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
  active_only?: boolean;
  types?: ('expense' | 'income')[];
  categories?: string[];
}

const monthlyEquivalent = (amount: number, recurrence: string): number => {
  switch (recurrence) {
    case 'daily': return amount * 30;
    case 'weekly': return (amount * 52) / 12;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return amount;
  }
};

Deno.serve(async (req) => {
  const pre = preflightOrError(req);
  if (pre) return pre;

  const body = await parseJsonBody<Body>(req);
  if (body instanceof Response) return body;

  const ctx = await authenticate(body);
  if (ctx instanceof Response) return ctx;
  const { supabase, userId } = ctx;

  let query = supabase
    .from('recurring_transactions')
    .select(`
      id, description, amount, type, recurrence_type,
      start_date, end_date, next_due_date, is_active,
      installment_payment_id, debt_id,
      category_id, categories ( id, name, color, budget ),
      account_id, accounts!recurring_transactions_account_id_fkey ( id, name, bank, account_type )
    `)
    .eq('user_id', userId)
    .order('next_due_date', { ascending: true });

  if (body.active_only) query = query.eq('is_active', true);
  if (body.types && body.types.length > 0) query = query.in('type', body.types);

  if (body.categories && body.categories.length > 0) {
    const { data: catRows, error: catErr } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .in('name', body.categories);
    if (catErr) {
      return errorResponse(500, { code: 'query_failed', message: 'Failed to resolve categories', details: catErr.message });
    }
    if (!catRows || catRows.length === 0) {
      return successResponse({
        data: [],
        summary: {
          total: 0, active: 0, inactive: 0,
          monthly_income: 0, monthly_expenses: 0, monthly_net: 0,
          yearly_income: 0, yearly_expenses: 0, yearly_net: 0,
        },
      });
    }
    query = query.in('category_id', catRows.map(c => c.id));
  }

  const { data, error } = await query;
  if (error) {
    return errorResponse(500, { code: 'query_failed', message: 'Failed to fetch recurring transactions', details: error.message });
  }

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    amount: Number(r.amount),
    monthly_equivalent: round2(monthlyEquivalent(Number(r.amount), r.recurrence_type)),
  }));

  const active = rows.filter(r => r.is_active);
  const monthlyIncome = active.filter(r => r.type === 'income').reduce((s, r) => s + r.monthly_equivalent, 0);
  const monthlyExpenses = active.filter(r => r.type === 'expense').reduce((s, r) => s + r.monthly_equivalent, 0);

  return successResponse({
    data: rows,
    summary: {
      total: rows.length,
      active: active.length,
      inactive: rows.length - active.length,
      monthly_income: round2(monthlyIncome),
      monthly_expenses: round2(monthlyExpenses),
      monthly_net: round2(monthlyIncome - monthlyExpenses),
      yearly_income: round2(monthlyIncome * 12),
      yearly_expenses: round2(monthlyExpenses * 12),
      yearly_net: round2((monthlyIncome - monthlyExpenses) * 12),
    },
  });
});
