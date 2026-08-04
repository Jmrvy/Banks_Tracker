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
import { LEDGER_COLUMNS, periodContribution } from '../_shared/ledgerRules.ts';

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
      .select(`${LEDGER_COLUMNS}, transaction_date, value_date, categories ( name )`)
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

  // Every figure below is a fold of the same shared contribution rule, so
  // the monthly breakdown and the top categories add up to the totals
  // printed beside them. This loop used to test the rules itself: it
  // counted income gross of repayments, treated money marked as coming
  // back on a category as earnings, counted advance settlements as
  // spending, and floored a refund at the expense it refunded — four ways
  // to disagree with the app about the same period.
  for (const t of txs) {
    const { role, amount } = periodContribution(t as any);
    if (role === 'ignored') continue;

    const month = (t as any)[dateField].substring(0, 7);
    const bucket = monthlyMap.get(month) ?? { income: 0, expenses: 0 };

    if (role === 'income') {
      totalIncome += amount;
      bucket.income += amount;
    } else if (role === 'expense') {
      // `amount` is negative for income that came back on its category,
      // which is what makes it reduce the category rather than inflate it.
      totalExpenses += amount;
      totalRefunded += Number((t as any).refunded_amount || 0);
      bucket.expenses += amount;
      const catName = (t as any).categories?.name || 'Sans catégorie';
      categoryMap.set(catName, (categoryMap.get(catName) ?? 0) + amount);
    } else {
      totalTransferFees += amount;
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
