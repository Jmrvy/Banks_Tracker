// POST /get-investment-transactions
//
// Historical name; returns ALL transactions (filtered), not just investments.
// Kept under the original path for backward compatibility.
//
// Improvements over v1:
//   - Accepts `session_token` as an alternative to email/password
//   - Queries are scoped by user JWT (RLS-aware); no service-role key
//   - Exposes `refunded_amount` and `net_amount` per transaction
//   - Summary totals use NET expenses (amount - refunded)
//   - Accepts `accounting_date` as an alias for `transaction_date`
//   - Supports `transaction_ids` filter for specific rows
//   - Consistent envelope: { success, version, data, summary, pagination, filters_applied }

import {
  preflightOrError,
  parseJsonBody,
  authenticate,
  errorResponse,
  successResponse,
  round2,
} from '../_shared/api.ts';

type TxType = 'expense' | 'income' | 'transfer';
type DateField = 'transaction_date' | 'value_date';

interface Body {
  email?: string;
  password?: string;
  session_token?: string;

  // Filters
  transaction_ids?: string[];
  categories?: string[];
  transaction_types?: TxType[];
  accounts?: string[];
  description_filter?: string;
  start_date?: string;
  end_date?: string;
  date_type?: DateField | 'accounting_date';
  include_in_stats?: boolean;
  has_refund?: boolean;
  min_amount?: number;
  max_amount?: number;

  // Pagination / sorting
  limit?: number;
  offset?: number;
  sort_by?: 'date' | 'amount' | 'description';
  sort_order?: 'asc' | 'desc';
}

const EMPTY_SUMMARY = {
  total_transactions: 0,
  returned_transactions: 0,
  expense_count: 0,
  income_count: 0,
  transfer_count: 0,
  gross_expenses: 0,
  refunded_amount: 0,
  total_expenses: 0, // net of refunds
  total_income: 0,
  total_transfers: 0,
  total_transfer_fees: 0,
  net_total: 0,
  categories: [] as string[],
  accounts: [] as string[],
  by_category: [] as unknown[],
  by_account: [] as unknown[],
};

Deno.serve(async (req) => {
  const pre = preflightOrError(req);
  if (pre) return pre;

  const body = await parseJsonBody<Body>(req);
  if (body instanceof Response) return body;

  const ctx = await authenticate(body);
  if (ctx instanceof Response) return ctx;
  const { supabase, userId } = ctx;

  const {
    transaction_ids,
    categories,
    transaction_types,
    accounts,
    description_filter,
    start_date,
    end_date,
    date_type: rawDateType = 'value_date',
    include_in_stats,
    has_refund,
    min_amount,
    max_amount,
    limit = 1000,
    offset = 0,
    sort_by = 'date',
    sort_order = 'desc',
  } = body;

  const dateField: DateField = rawDateType === 'transaction_date' || rawDateType === 'accounting_date'
    ? 'transaction_date'
    : 'value_date';

  const effectiveLimit = Math.min(Math.max(1, limit), 5000);
  const effectiveOffset = Math.max(0, offset);

  const pagination = (total: number, returned: number) => ({
    limit: effectiveLimit,
    offset: effectiveOffset,
    total,
    returned,
    has_more: effectiveOffset + returned < total,
  });

  const filtersApplied = () => ({
    transaction_ids: transaction_ids ?? null,
    categories: categories ?? null,
    transaction_types: transaction_types ?? null,
    accounts: accounts ?? null,
    description_filter: description_filter ?? null,
    date_range: start_date || end_date ? { start: start_date ?? null, end: end_date ?? null, date_type: dateField } : null,
    amount_range: min_amount !== undefined || max_amount !== undefined ? { min: min_amount ?? null, max: max_amount ?? null } : null,
    include_in_stats: include_in_stats ?? null,
    has_refund: has_refund ?? null,
    sorting: { sort_by, sort_order },
  });

  // Build base query
  let query = supabase
    .from('transactions')
    .select(`
      id,
      description,
      amount,
      refunded_amount,
      type,
      transaction_date,
      value_date,
      created_at,
      updated_at,
      include_in_stats,
      transfer_fee,
      transfer_to_account_id,
      refund_of_transaction_id,
      category_id,
      categories ( id, name, color, budget ),
      account_id,
      accounts!transactions_account_id_fkey ( id, name, account_type, bank )
    `, { count: 'exact' })
    .eq('user_id', userId);

  if (transaction_ids && transaction_ids.length > 0) {
    query = query.in('id', transaction_ids);
  }
  if (include_in_stats !== undefined) {
    query = query.eq('include_in_stats', include_in_stats);
  }
  if (transaction_types && transaction_types.length > 0) {
    query = query.in('type', transaction_types);
  }
  if (has_refund === true) {
    query = query.gt('refunded_amount', 0);
  } else if (has_refund === false) {
    // coalesce null to 0 via or filter
    query = query.or('refunded_amount.is.null,refunded_amount.eq.0');
  }

  // Resolve category name filter → ids
  if (categories && categories.length > 0) {
    const { data: catRows, error: catErr } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .in('name', categories);
    if (catErr) {
      return errorResponse(500, { code: 'query_failed', message: 'Failed to resolve categories', details: catErr.message });
    }
    if (!catRows || catRows.length === 0) {
      return successResponse({ data: [], summary: EMPTY_SUMMARY, pagination: pagination(0, 0), filters_applied: filtersApplied() });
    }
    query = query.in('category_id', catRows.map(c => c.id));
  }

  // Resolve account name filter → ids
  if (accounts && accounts.length > 0) {
    const { data: accRows, error: accErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .in('name', accounts);
    if (accErr) {
      return errorResponse(500, { code: 'query_failed', message: 'Failed to resolve accounts', details: accErr.message });
    }
    if (!accRows || accRows.length === 0) {
      return successResponse({ data: [], summary: EMPTY_SUMMARY, pagination: pagination(0, 0), filters_applied: filtersApplied() });
    }
    query = query.in('account_id', accRows.map(a => a.id));
  }

  if (start_date) query = query.gte(dateField, start_date);
  if (end_date) query = query.lte(dateField, end_date);
  if (description_filter) query = query.ilike('description', `%${description_filter}%`);
  if (min_amount !== undefined) query = query.gte('amount', min_amount);
  if (max_amount !== undefined) query = query.lte('amount', max_amount);

  const sortField = sort_by === 'amount' ? 'amount' : sort_by === 'description' ? 'description' : dateField;
  query = query.order(sortField, { ascending: sort_order === 'asc' });
  query = query.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

  const { data: rows, error: txErr, count } = await query;
  if (txErr) {
    return errorResponse(500, { code: 'query_failed', message: 'Failed to fetch transactions', details: txErr.message });
  }

  const transactions = (rows ?? []).map((tx: any) => {
    const refunded = Number(tx.refunded_amount || 0);
    const gross = Number(tx.amount);
    return {
      ...tx,
      refunded_amount: refunded,
      net_amount: tx.type === 'expense' ? Math.max(0, gross - refunded) : gross,
    };
  });

  const totalCount = count ?? 0;
  const expenses = transactions.filter(t => t.type === 'expense');
  const income = transactions.filter(t => t.type === 'income' && !t.refund_of_transaction_id);
  const transfers = transactions.filter(t => t.type === 'transfer');

  const grossExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const refundedAmount = expenses.reduce((s, t) => s + t.refunded_amount, 0);
  const totalExpenses = grossExpenses - refundedAmount;
  const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
  const totalTransfers = transfers.reduce((s, t) => s + Number(t.amount), 0);
  const totalTransferFees = transfers.reduce((s, t) => s + Number(t.transfer_fee || 0), 0);
  const netTotal = totalIncome - totalExpenses - totalTransferFees;

  const uniqueCategories = Array.from(new Set(transactions.map(t => t.categories?.name).filter(Boolean))) as string[];
  const uniqueAccounts = Array.from(new Set(transactions.map(t => t.accounts?.name).filter(Boolean))) as string[];

  const categoryAccum = transactions.reduce((acc: Record<string, { count: number; total: number; expenses: number; income: number; refunded: number }>, t) => {
    const name = t.categories?.name || 'Sans catégorie';
    if (!acc[name]) acc[name] = { count: 0, total: 0, expenses: 0, income: 0, refunded: 0 };
    acc[name].count++;
    acc[name].total += Number(t.amount);
    if (t.type === 'expense') {
      acc[name].expenses += t.net_amount;
      acc[name].refunded += t.refunded_amount;
    } else if (t.type === 'income' && !t.refund_of_transaction_id) {
      acc[name].income += Number(t.amount);
    }
    return acc;
  }, {});
  const byCategory = Object.entries(categoryAccum).map(([category, d]) => ({
    category,
    count: d.count,
    total: round2(d.total),
    expenses: round2(d.expenses),
    income: round2(d.income),
    refunded: round2(d.refunded),
  }));

  const accountAccum = transactions.reduce((acc: Record<string, { count: number; expenses: number; income: number; transfers: number }>, t) => {
    const name = t.accounts?.name || 'Inconnu';
    if (!acc[name]) acc[name] = { count: 0, expenses: 0, income: 0, transfers: 0 };
    acc[name].count++;
    if (t.type === 'expense') acc[name].expenses += t.net_amount;
    else if (t.type === 'income' && !t.refund_of_transaction_id) acc[name].income += Number(t.amount);
    else if (t.type === 'transfer') acc[name].transfers += Number(t.amount);
    return acc;
  }, {});
  const byAccount = Object.entries(accountAccum).map(([account, d]) => ({
    account,
    count: d.count,
    expenses: round2(d.expenses),
    income: round2(d.income),
    transfers: round2(d.transfers),
  }));

  const summary = {
    total_transactions: totalCount,
    returned_transactions: transactions.length,
    expense_count: expenses.length,
    income_count: income.length,
    transfer_count: transfers.length,
    gross_expenses: round2(grossExpenses),
    refunded_amount: round2(refundedAmount),
    total_expenses: round2(totalExpenses),
    total_income: round2(totalIncome),
    total_transfers: round2(totalTransfers),
    total_transfer_fees: round2(totalTransferFees),
    net_total: round2(netTotal),
    categories: uniqueCategories,
    accounts: uniqueAccounts,
    by_category: byCategory,
    by_account: byAccount,
  };

  return successResponse({
    data: transactions,
    summary,
    pagination: pagination(totalCount, transactions.length),
    filters_applied: filtersApplied(),
  });
});
