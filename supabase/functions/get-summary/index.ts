// POST /get-summary
// One-shot period summary: balances, income/expenses, top categories,
// monthly breakdown. Optimized for dashboards that would otherwise issue
// several queries.

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
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  date_type?: 'transaction_date' | 'value_date' | 'accounting_date';
}

Deno.serve(async (req) => {
  const pre = preflightOrError(req);
  if (pre) return pre;

  const body = await parseJsonBody<Body>(req);
  if (body instanceof Response) return body;

  if (!body.period_start || !body.period_end) {
    return errorResponse(400, { code: 'missing_period', message: '`period_start` and `period_end` are required (YYYY-MM-DD)' });
  }

  const ctx = await authenticate(body);
  if (ctx instanceof Response) return ctx;
  const { supabase, userId } = ctx;

  const dateField = body.date_type === 'transaction_date' || body.date_type === 'accounting_date'
    ? 'transaction_date'
    : 'value_date';

  const [accountsResp, txResp] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, balance, account_type, currency')
      .eq('user_id', userId),
    supabase
      .from('transactions')
      .select('type, amount, refunded_amount, transfer_fee, refund_of_transaction_id, transaction_date, value_date, categories ( name )')
      .eq('user_id', userId)
      .gte(dateField, body.period_start)
      .lte(dateField, body.period_end)
      .neq('include_in_stats', false),
  ]);

  if (accountsResp.error) {
    return errorResponse(500, { code: 'query_failed', message: 'Failed to fetch accounts', details: accountsResp.error.message });
  }
  if (txResp.error) {
    return errorResponse(500, { code: 'query_failed', message: 'Failed to fetch transactions', details: txResp.error.message });
  }

  const txs = txResp.data ?? [];
  const accounts = (accountsResp.data ?? []).map(a => ({ ...a, balance: round2(Number(a.balance)) }));

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalRefunded = 0;
  let totalTransferFees = 0;
  const categoryMap = new Map<string, number>();
  const monthlyMap = new Map<string, { income: number; expenses: number }>();

  for (const t of txs) {
    const month = (t as any)[dateField].substring(0, 7);
    const bucket = monthlyMap.get(month) ?? { income: 0, expenses: 0 };

    if (t.type === 'income' && !t.refund_of_transaction_id) {
      totalIncome += Number(t.amount);
      bucket.income += Number(t.amount);
    } else if (t.type === 'expense') {
      const refunded = Number(t.refunded_amount || 0);
      const net = Math.max(0, Number(t.amount) - refunded);
      totalExpenses += net;
      totalRefunded += refunded;
      bucket.expenses += net;
      const catName = (t as any).categories?.name || 'Sans catégorie';
      categoryMap.set(catName, (categoryMap.get(catName) ?? 0) + net);
    } else if (t.type === 'transfer') {
      totalTransferFees += Number(t.transfer_fee || 0);
    }

    monthlyMap.set(month, bucket);
  }

  const topCategories = Array.from(categoryMap.entries())
    .map(([name, amount]) => ({ name, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const monthlyBreakdown = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      income: round2(v.income),
      expenses: round2(v.expenses),
      net: round2(v.income - v.expenses),
    }));

  const netChange = totalIncome - totalExpenses - totalTransferFees;
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return successResponse({
    period: { start: body.period_start, end: body.period_end, date_type: dateField },
    balances: {
      current_total: round2(totalBalance),
      by_account: accounts.map(a => ({ account: a.name, type: a.account_type, balance: a.balance, currency: a.currency })),
    },
    totals: {
      income: round2(totalIncome),
      expenses: round2(totalExpenses),
      refunded: round2(totalRefunded),
      transfer_fees: round2(totalTransferFees),
      net: round2(netChange),
      transaction_count: txs.length,
    },
    top_categories: topCategories,
    monthly_breakdown: monthlyBreakdown,
  });
});
