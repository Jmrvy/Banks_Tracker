import { isWithinInterval } from 'date-fns';
import { getTxDate, type TxDateType } from './dateUtils';

/* ────────────────────────────────────────────────────────────────────
 * Pure reports engine
 *
 * Framework-free money/date arithmetic shared by the Reports page hook
 * (useReportsData), the PDF report builder (buildReportData) and the
 * Excel generator (ReportWizard). Having exactly one implementation of
 * "filter by period", "sum a period's stats" and "how does a
 * transaction move the global balance" is what keeps the on-screen
 * numbers, the PDF and the spreadsheet reconciled with each other.
 *
 * Structural types only — no dependency on hooks or Supabase types, so
 * everything here is unit-testable with plain objects.
 * ──────────────────────────────────────────────────────────────────── */

export interface EngineTx {
  amount: number | string;
  type: string; // 'income' | 'expense' | 'transfer'
  transaction_date: string;
  value_date?: string | null;
  include_in_stats?: boolean | null;
  refund_of_transaction_id?: string | null;
  refunded_amount?: number | null;
  repayment_of_transaction_id?: string | null;
  repaid_amount?: number | null;
  transfer_fee?: number | string | null;
  account_id?: string;
  transfer_to_account_id?: string | null;
}

export interface AccountLike {
  id: string;
  balance: number | string;
}

export interface PeriodStats {
  income: number;
  expenses: number;
  transferFees: number;
  net: number;
}

/** Transactions whose active date falls inside [start, end]. */
export const filterByPeriod = <T extends EngineTx>(
  txs: T[],
  start: Date,
  end: Date,
  dateType: TxDateType,
): T[] => txs.filter((t) => isWithinInterval(getTxDate(t, dateType), { start, end }));

/** Expense amount net of linked refunds, floored at 0 (an over-refunded
 *  expense contributes nothing; the excess arrives as separate income). */
export const netExpenseAmount = (t: EngineTx): number =>
  Math.max(0, Number(t.amount) - Number(t.refunded_amount || 0));

/** Income net of anything repaid against it, floored at 0. The mirror of
 *  netExpenseAmount: an advance that has been paid back is not earnings. */
export const netIncomeAmount = (t: EngineTx): number =>
  Math.max(0, Number(t.amount) - Number(t.repaid_amount || 0));

/** Signed effect of one transaction on the GLOBAL (all-accounts) balance.
 *  Transfers between own accounts are neutral except for their fee. */
export const signedGlobalAmount = (t: EngineTx): number =>
  t.type === 'income'
    ? Number(t.amount)
    : t.type === 'expense'
      ? -Number(t.amount)
      : -Number(t.transfer_fee || 0);

/** Headline stats for an already-filtered set of transactions.
 *  Rules: rows with include_in_stats === false are skipped; refund
 *  incomes are excluded (they net against their original expense);
 *  expenses count net of refunds; income counts net of repayments;
 *  repayment expenses are excluded (they net against the income they
 *  settle); transfers contribute only their fee. */
export const computePeriodStats = (txs: EngineTx[]): PeriodStats => {
  let income = 0;
  let expenses = 0;
  let transferFees = 0;
  for (const t of txs) {
    if (t.include_in_stats === false) continue;
    if (t.type === 'income' && !t.refund_of_transaction_id) income += netIncomeAmount(t);
    // An expense repaying an advance is a settlement, not spending — the
    // income it repays already counts net of it, so counting it here too
    // would subtract the same money twice.
    else if (t.type === 'expense' && !t.repayment_of_transaction_id) expenses += netExpenseAmount(t);
    else if (t.type === 'transfer') transferFees += Number(t.transfer_fee || 0);
  }
  return { income, expenses, transferFees, net: income - expenses - transferFees };
};

/** Filter + stats in one call, for arbitrary comparison ranges. */
export const statsForRange = (
  txs: EngineTx[],
  start: Date,
  end: Date,
  dateType: TxDateType,
): PeriodStats => computePeriodStats(filterByPeriod(txs, start, end, dateType));

/** REAL net change of the global balance over an already-filtered set:
 *  every transaction counts (no stats exclusions, no refund netting),
 *  because the bank moved that money regardless of reporting flags. */
export const realNetChange = (txs: EngineTx[]): number =>
  txs.reduce((sum, t) => sum + signedGlobalAmount(t), 0);

/** Net balance change of ONE account over [from, to] (null = unbounded),
 *  counting both transfer legs and fees the same way the DB's
 *  update_account_balance trigger does. */
export const computeAccountDelta = (
  accountId: string,
  txs: EngineTx[],
  from: Date | null,
  to: Date | null,
  dateType: TxDateType,
): number => {
  let delta = 0;
  for (const t of txs) {
    const td = getTxDate(t, dateType);
    if (from && td < from) continue;
    if (to && td > to) continue;
    const amt = Number(t.amount);
    if (t.account_id === accountId) {
      if (t.type === 'income') delta += amt;
      else if (t.type === 'expense') delta -= amt;
      else if (t.type === 'transfer') delta -= amt + Number(t.transfer_fee || 0);
    }
    if (t.transfer_to_account_id === accountId && t.type === 'transfer') delta += amt;
  }
  return delta;
};

/** Global balance at the START of the period: today's account balances
 *  with every transaction dated on/after periodFrom reversed out.
 *  Uses ALL transactions (account balances don't know about
 *  include_in_stats), and per-account transfer legs so transfers to or
 *  from accounts outside the set are handled correctly. */
export const computeInitialBalance = (
  accounts: AccountLike[],
  txs: EngineTx[],
  periodFrom: Date,
  dateType: TxDateType,
): number => {
  const accountIds = new Set(accounts.map((a) => a.id));
  const netChangeByAccount = new Map<string, number>();

  for (const t of txs) {
    if (getTxDate(t, dateType) < periodFrom) continue;

    const srcId = t.account_id;
    const dstId = t.transfer_to_account_id;

    if (srcId && accountIds.has(srcId)) {
      const prev = netChangeByAccount.get(srcId) || 0;
      switch (t.type) {
        case 'income':
          netChangeByAccount.set(srcId, prev - Number(t.amount));
          break;
        case 'expense':
          netChangeByAccount.set(srcId, prev + Number(t.amount));
          break;
        case 'transfer':
          netChangeByAccount.set(srcId, prev + Number(t.amount) + Number(t.transfer_fee || 0));
          break;
      }
    }
    if (dstId && accountIds.has(dstId)) {
      const prev = netChangeByAccount.get(dstId) || 0;
      netChangeByAccount.set(dstId, prev - Number(t.amount));
    }
  }

  return accounts.reduce((sum, account) => {
    const netChange = netChangeByAccount.get(account.id) || 0;
    return sum + Number(account.balance) + netChange;
  }, 0);
};
