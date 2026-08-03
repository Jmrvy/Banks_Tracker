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
  /** Income only: came back on its category rather than being earnings. */
  offsets_category?: boolean | null;
  category_id?: string | null;
  special_budget_id?: string | null;
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

/** Expense amount net of linked refunds, which may be negative.
 *
 *  Getting back more than you paid makes the category cheaper, not merely
 *  free: 160 returned on a 100 purchase leaves you 60 up, and that belongs
 *  to whatever category the purchase was in. Flooring at 0 swallowed it,
 *  which is why the surplus used to be split into a separate income row and
 *  why the budget page and Trace disagreed about the same category.
 *
 *  Linking is the decision. A surplus attached to the expense reduces its
 *  category; left unlinked under an income category it is ordinary income. */
export const netExpenseAmount = (t: EngineTx): number =>
  Number(t.amount) - Number(t.refunded_amount || 0);

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

/**
 * What a category actually cost, and the three figures behind it.
 *
 * Category spend was being derived independently in the budget page, the
 * reports engine, the alert emails, Trace and the radar, and they drifted:
 * the same category read 672 in one place and 612 in another because each
 * had its own idea of what to subtract. This is the one definition.
 *
 *   gross         what was charged, before anything came back
 *   refunded      refunds attached to those charges
 *   offsetIncome  income from categories that declare they offset this one
 *   net           gross − refunded − offsetIncome
 *
 * `net` may be negative: more can come back than went out, and that makes
 * the category cheaper rather than merely free.
 */
export interface CategoryNet {
  gross: number;
  refunded: number;
  offsetIncome: number;
  net: number;
}

/**
 * Net per category, keyed by category id.
 *
 * Takes transactions already filtered to the period. Rows excluded from
 * statistics, tagged to a special budget, or settling an advance are not
 * spending and do not appear.
 *
 * Income reduces a category only when it says so. A category works in both
 * directions, so most income filed on one is earnings that merely shares a
 * name with the spending beside it — netting all of it would quietly make a
 * salary look like a discount. Two things say otherwise, and both are per
 * transaction rather than per category:
 *
 *   - a refund link, which nets through its expense's `refunded_amount`
 *     and so is already inside `refunded` below;
 *   - `offsets_category`, for money that came back on the category without
 *     mapping to one specific expense — a gambling payout against its
 *     stakes, a reimbursement filed among genuine transfers.
 *
 * The two are mutually exclusive at the database level, so nothing here can
 * subtract the same money twice.
 */
export const computeCategoryNets = (txs: EngineTx[]): Map<string, CategoryNet> => {
  const out = new Map<string, CategoryNet>();
  const blank = (): CategoryNet => ({ gross: 0, refunded: 0, offsetIncome: 0, net: 0 });

  for (const t of txs) {
    if (t.include_in_stats === false) continue;
    const categoryId = (t as EngineTx & { category_id?: string | null }).category_id;
    if (!categoryId) continue;

    if (t.type === 'expense') {
      // Settling an advance is not spending; a special budget counts elsewhere.
      if (t.repayment_of_transaction_id) continue;
      if ((t as EngineTx & { special_budget_id?: string | null }).special_budget_id) continue;
      const row = out.get(categoryId) ?? blank();
      row.gross += Number(t.amount);
      row.refunded += Number(t.refunded_amount || 0);
      out.set(categoryId, row);
    } else if (t.type === 'income') {
      if (!(t as EngineTx & { offsets_category?: boolean | null }).offsets_category) continue;
      // Belt and braces: a refund link nets through the expense instead, and
      // the DB constraint forbids a row carrying both.
      if (t.refund_of_transaction_id) continue;
      const row = out.get(categoryId) ?? blank();
      row.offsetIncome += netIncomeAmount(t);
      out.set(categoryId, row);
    }
  }

  for (const row of out.values()) {
    row.net = row.gross - row.refunded - row.offsetIncome;
  }
  return out;
};

/** Headline stats for an already-filtered set of transactions.
 *  Rules: rows with include_in_stats === false are skipped; refund
 *  incomes are excluded (they net against their original expense);
 *  income marked `offsets_category` is likewise not earnings and comes
 *  off expenses instead; expenses count net of refunds; income counts net
 *  of repayments; repayment expenses are excluded (they net against the
 *  income they settle); transfers contribute only their fee. */
export const computePeriodStats = (txs: EngineTx[]): PeriodStats => {
  let income = 0;
  let expenses = 0;
  let transferFees = 0;
  for (const t of txs) {
    if (t.include_in_stats === false) continue;
    // Money that came back on a category is a reduction of what that
    // category cost, not earnings — the same treatment a refund gets, so
    // that "income" keeps meaning money earned on both screens.
    if (t.type === 'income' && (t as EngineTx & { offsets_category?: boolean | null }).offsets_category
        && !t.refund_of_transaction_id) expenses -= netIncomeAmount(t);
    else if (t.type === 'income' && !t.refund_of_transaction_id) income += netIncomeAmount(t);
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
