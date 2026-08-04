/**
 * The ledger's netting rules, for the server.
 *
 * `src/lib/reportsEngine.ts` is the definition of what a category cost and
 * what a period earned, but it is a browser module and the edge functions
 * are Deno — they cannot import it. So each function grew its own copy of
 * the rules, and the three copies drifted: a budget-alert email counted an
 * advance settlement as spending, the monthly report summed income gross,
 * and Trace answered the same question two different ways depending on
 * which of its own tools it reached for.
 *
 * This is the one server-side statement of those rules. It is deliberately
 * a mirror of the browser engine rather than a clever abstraction over it:
 * when a rule changes it has to change in exactly two files, and a reader
 * comparing them should be able to see at a glance that they agree.
 *
 * Anything shaped like a transaction row will do — the functions all select
 * different column subsets, so these take a structural type and read
 * defensively.
 */

export interface LedgerRow {
  amount: number | string;
  type: string;
  include_in_stats?: boolean | null;
  refunded_amount?: number | string | null;
  repaid_amount?: number | string | null;
  refund_of_transaction_id?: string | null;
  repayment_of_transaction_id?: string | null;
  offsets_category?: boolean | null;
  special_budget_id?: string | null;
  transfer_fee?: number | string | null;
  category_id?: string | null;
}

/** Every column these rules read. Select at least this much, or a guard
 *  silently passes on a column that simply was not fetched — which is how
 *  the monthly report ended up unable to honour flags it never asked for. */
export const LEDGER_COLUMNS =
  'amount, type, include_in_stats, refunded_amount, repaid_amount, ' +
  'refund_of_transaction_id, repayment_of_transaction_id, offsets_category, ' +
  'special_budget_id, transfer_fee, category_id';

const num = (v: unknown): number => Number(v ?? 0) || 0;

/** Expense net of linked refunds. MAY GO NEGATIVE: getting back more than
 *  you paid makes the category cheaper, not merely free. */
export const netExpenseAmount = (t: LedgerRow): number =>
  num(t.amount) - num(t.refunded_amount);

/** Income net of anything repaid against it, floored at 0. An advance that
 *  has been paid back was never earnings. */
export const netIncomeAmount = (t: LedgerRow): number =>
  Math.max(0, num(t.amount) - num(t.repaid_amount));

/** Signed effect on the GLOBAL balance. Transfers between own accounts are
 *  neutral except for their fee. Used for balance replays, where every row
 *  counts and nothing is netted. */
export const signedGlobalAmount = (t: LedgerRow): number =>
  t.type === 'income'
    ? num(t.amount)
    : t.type === 'expense'
      ? -num(t.amount)
      : -num(t.transfer_fee);

/** Does this expense count toward its category's budget? */
export const countsAsSpending = (t: LedgerRow): boolean =>
  t.type === 'expense' &&
  t.include_in_stats !== false &&
  !t.special_budget_id &&
  !t.repayment_of_transaction_id;

/** Does this income reduce its category's spend rather than being earnings?
 *  Only when the user said so. A linked refund is excluded because it
 *  already nets through its expense's `refunded_amount`. */
export const offsetsItsCategory = (t: LedgerRow): boolean =>
  t.type === 'income' &&
  t.include_in_stats !== false &&
  !!t.offsets_category &&
  !t.refund_of_transaction_id;

/** Is this income earnings? */
export const countsAsIncome = (t: LedgerRow): boolean =>
  t.type === 'income' &&
  t.include_in_stats !== false &&
  !t.refund_of_transaction_id &&
  !t.offsets_category;

export interface PeriodStats {
  income: number;
  expenses: number;
  transferFees: number;
  net: number;
}

/** Headline stats for a set of rows. Mirrors computePeriodStats. */
export function computePeriodStats(rows: LedgerRow[]): PeriodStats {
  let income = 0;
  let expenses = 0;
  let transferFees = 0;
  for (const t of rows) {
    if (t.include_in_stats === false) continue;
    if (t.type === 'income') {
      if (t.refund_of_transaction_id) continue;
      // Money that came back is a reduction of what was spent, not earnings
      // — the same treatment a refund gets, so "income" keeps meaning
      // income on the email as it does in the app.
      if (t.offsets_category) expenses -= netIncomeAmount(t);
      else income += netIncomeAmount(t);
    } else if (t.type === 'expense') {
      if (t.repayment_of_transaction_id) continue;
      expenses += netExpenseAmount(t);
    } else if (t.type === 'transfer') {
      transferFees += num(t.transfer_fee);
    }
  }
  return { income, expenses, transferFees, net: income - expenses - transferFees };
}

export interface CategoryNet {
  gross: number;
  refunded: number;
  offsetIncome: number;
  net: number;
  count: number;
}

/** Net per category id. Mirrors computeCategoryNets. */
export function computeCategoryNets(rows: LedgerRow[]): Map<string, CategoryNet> {
  const out = new Map<string, CategoryNet>();
  const blank = (): CategoryNet => ({ gross: 0, refunded: 0, offsetIncome: 0, net: 0, count: 0 });

  for (const t of rows) {
    const key = t.category_id;
    if (!key) continue;
    if (countsAsSpending(t)) {
      const row = out.get(key) ?? blank();
      row.gross += num(t.amount);
      row.refunded += num(t.refunded_amount);
      row.count += 1;
      out.set(key, row);
    } else if (offsetsItsCategory(t)) {
      const row = out.get(key) ?? blank();
      row.offsetIncome += netIncomeAmount(t);
      out.set(key, row);
    }
  }

  for (const row of out.values()) {
    row.net = row.gross - row.refunded - row.offsetIncome;
  }
  return out;
}
