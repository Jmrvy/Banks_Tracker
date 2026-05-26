import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { Locale } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { Transaction, Account } from '@/hooks/useFinancialData';
import type { ReportsStats, CategoryData, RecurringData } from '@/hooks/useReportsData';
import type { IncomeCategory } from '@/hooks/useIncomeAnalysis';
import type { Debt, ScheduledDebtPayment } from '@/hooks/useDebts';
import type { InstallmentPayment } from '@/hooks/useInstallmentPayments';
import type {
  ReportData,
  ReportPageId,
  ReportCategory,
  AccountFlow,
  IncomeSource,
  MonthBar,
} from './types';

export const TX_PER_PAGE = 30;

interface BuildInputs {
  stats: ReportsStats;
  categoryChartData: CategoryData[];
  evolutionChartData: { date: string; balance: number; income: number; expense: number }[];
  incomeAnalysis: IncomeCategory[];
  recurringData: RecurringData;
  accounts: Account[];
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  config: { dateType: 'accounting' | 'value'; periodType: 'month' | 'quarter' | 'year' | 'custom' };
  actualDates: { start: Date; end: Date };
  orderedEnabledPages: ReportPageId[];
  locale: Locale;
  /** When set, synthesise projected entries for every concretely-
   *  scheduled cashflow that falls in [now, end] — recurring future
   *  occurrences, remaining installment payments, scheduled debt
   *  payments. Each gets `isProjection: true` so renderers can mark it. */
  projection?: {
    includeForecasted: boolean;
    now: Date;
    installmentPayments: InstallmentPayment[];
    debts: Debt[];
    scheduledDebtPayments: ScheduledDebtPayment[];
  };
}

const inStats = (t: Transaction) => t.include_in_stats !== false;
const txDateOf = (t: Transaction, dateType: 'accounting' | 'value') =>
  dateType === 'value' ? parseLocalDate(t.value_date || t.transaction_date) : parseLocalDate(t.transaction_date);

const SUBS_RE = /subscription|abonnement|streaming|spotify|netflix|apple|disney|prime/i;
const BILLS_RE = /utilit|electric|water|internet|insurance|facture|énergie|energie|gas|phone|mobile|telecom|edf|veolia|bouygues|orange|free/i;
const RENT_RE = /rent|loyer|housing|logement|mortgage|hypoth/i;

/** Synthesise Transaction-shaped projection entries for every concretely
 *  scheduled cashflow that falls within [windowStart, windowEnd]:
 *  recurring future occurrences, remaining installment payments, and
 *  unpaid scheduled debt payments. Each is flagged with isProjection so
 *  renderers can mark it. */
function synthesiseProjections(
  windowStart: Date,
  windowEnd: Date,
  accounts: Account[],
  recurring: RecurringData,
  installmentPayments: InstallmentPayment[],
  debts: Debt[],
  scheduledDebtPayments: ScheduledDebtPayment[],
): Transaction[] {
  const out: Transaction[] = [];
  const defaultAccount = accounts.find((a) => a.account_type === 'checking') ?? accounts[0];
  if (!defaultAccount) return out;

  // 1. Recurring future occurrences (occurrenceDetails is precomputed).
  for (const item of recurring.periodItems) {
    const rec = item.recurring;
    const acc = accounts.find((a) => a.id === rec.account_id) ?? defaultAccount;
    for (const occ of item.occurrenceDetails) {
      if (!occ.isFuture) continue;
      const d = parseLocalDate(occ.date);
      if (d < windowStart || d > windowEnd) continue;
      out.push({
        id: `proj-rec-${rec.id}-${occ.date}`,
        account_id: acc.id,
        description: rec.description,
        amount: Math.abs(Number(occ.amount)),
        type: item.effectiveType,
        transaction_date: occ.date,
        value_date: occ.date,
        include_in_stats: true,
        account: { name: acc.name, bank: acc.bank },
        category: rec.category
          ? { id: rec.category.id, name: rec.category.name, color: rec.category.color, icon: rec.category.icon ?? null }
          : null,
        recurring_transaction_id: rec.id,
        isProjection: true,
        projectedSource: 'recurring',
      });
    }
  }

  // 2. Installment future payments — iterate next_payment_date by
  //    frequency while remaining > 0 and within the window.
  for (const ip of installmentPayments) {
    if (!ip.is_active) continue;
    let remaining = Number(ip.remaining_amount);
    let cursor = parseLocalDate(ip.next_payment_date);
    const acc = accounts.find((a) => a.id === ip.account_id) ?? defaultAccount;
    let safety = 0;
    while (remaining > 0 && cursor <= windowEnd && safety < 240) {
      if (cursor >= windowStart) {
        const amt = Math.min(Number(ip.installment_amount), remaining);
        const ds = format(cursor, 'yyyy-MM-dd');
        out.push({
          id: `proj-ip-${ip.id}-${ds}`,
          account_id: acc.id,
          description: ip.description,
          amount: amt,
          type: 'expense',
          transaction_date: ds,
          value_date: ds,
          include_in_stats: true,
          account: { name: acc.name, bank: acc.bank },
          category: null,
          installment_payment_id: ip.id,
          isProjection: true,
          projectedSource: 'installment',
        });
      }
      remaining -= Number(ip.installment_amount);
      const next = new Date(cursor);
      if (ip.frequency === 'weekly') next.setDate(next.getDate() + 7);
      else if (ip.frequency === 'quarterly') next.setMonth(next.getMonth() + 3);
      else next.setMonth(next.getMonth() + 1);
      cursor = next;
      safety++;
    }
  }

  // 3. Unpaid scheduled debt payments. Debt direction sets the sign:
  //    loan_given → being repaid → income; loan_received → I owe → expense.
  const debtById = new Map(debts.map((d) => [d.id, d]));
  for (const sp of scheduledDebtPayments) {
    if (sp.is_paid) continue;
    const d = parseLocalDate(sp.scheduled_date);
    if (d < windowStart || d > windowEnd) continue;
    const debt = debtById.get(sp.debt_id);
    if (!debt) continue;
    const txType: 'income' | 'expense' = debt.type === 'loan_given' ? 'income' : 'expense';
    out.push({
      id: `proj-debt-${sp.id}`,
      account_id: defaultAccount.id,
      description: debt.description,
      amount: Number(sp.scheduled_amount),
      type: txType,
      transaction_date: sp.scheduled_date,
      value_date: sp.scheduled_date,
      include_in_stats: true,
      account: { name: defaultAccount.name, bank: defaultAccount.bank },
      category: null,
      isProjection: true,
      projectedSource: 'debt',
    });
  }

  return out;
}

export function buildReportData(input: BuildInputs): ReportData {
  const {
    stats, categoryChartData, evolutionChartData, incomeAnalysis, recurringData,
    accounts, transactions, filteredTransactions, config, actualDates,
    orderedEnabledPages, locale,
  } = input;

  const { start, end } = actualDates;
  const totalIncome = stats.income;
  const totalExpenses = stats.expenses;
  const netResult = stats.netPeriodBalance;
  const balanceEnd = stats.finalBalance;
  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));

  // ── Prior equal-length period (month-over-month) ─────────────────
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  let prevIncome = 0;
  let prevExpenses = 0;
  for (const t of transactions) {
    if (!inStats(t)) continue;
    const d = txDateOf(t, config.dateType);
    if (d < prevStart || d > prevEnd) continue;
    if (t.type === 'income' && !t.refund_of_transaction_id) prevIncome += Number(t.amount);
    else if (t.type === 'expense') prevExpenses += Number(t.amount);
  }
  const prevNet = prevIncome - prevExpenses;
  const pct = (cur: number, prev: number): number | null =>
    prev > 0 ? ((cur - prev) / prev) * 100 : null;
  const incomeMoM = pct(totalIncome, prevIncome);
  const expenseMoM = pct(totalExpenses, prevExpenses);
  const netMoM = prevNet !== 0 ? ((netResult - prevNet) / Math.abs(prevNet)) * 100 : null;
  const prevPeriodLabel = format(prevEnd, 'MMM', { locale });

  // ── Categories ───────────────────────────────────────────────────
  const baseCats = categoryChartData
    // Keep any category with actual spend OR a defined budget — the
    // latter so a budgeted category that only sees projected spend
    // still surfaces on the Categories/Budgets pages.
    .filter((c) => Number(c.spent) > 0 || Number(c.budget) > 0)
    .map((c) => {
      const spent = Number(c.spent);
      const budget = Number(c.budget) || 0;
      const over = budget > 0 && spent > budget;
      const near = budget > 0 && !over && spent / budget >= 0.9;
      return { ...c, spent, budget, deltaVsBudget: budget > 0 ? spent - budget : 0, over, near };
    })
    .sort((a, b) => b.spent - a.spent);
  const totalCatSpent = baseCats.reduce((s, c) => s + c.spent, 0);
  const expenseCats: ReportCategory[] = baseCats.map((c) => ({
    ...c,
    pctOfTotal: totalCatSpent > 0 ? (c.spent / totalCatSpent) * 100 : 0,
    // Forecast fields are populated below if projection is enabled.
    projectedSpent: 0,
    combinedSpent: c.spent,
    combinedOver: c.over,
  }));

  // Top-cats donut is rebuilt later if projections kick in so the
  // breakdown stays consistent with the headline figures. This factory
  // picks the spent accessor so it can be reused before & after.
  const buildTopCats = (use: 'spent' | 'combinedSpent', denom: number) => {
    const sortedByUse = expenseCats.slice().sort((a, b) => b[use] - a[use]);
    const named = sortedByUse.slice(0, 5).map((c) => ({
      name: c.name,
      spent: c[use],
      pct: denom > 0 ? (c[use] / denom) * 100 : 0,
      over: use === 'combinedSpent' ? c.combinedOver : c.over,
      count: 1,
    }));
    const rest = sortedByUse.slice(5);
    if (rest.length > 0) {
      const restSpent = rest.reduce((s, c) => s + c[use], 0);
      named.push({
        name: `Other (${rest.length})`,
        spent: restSpent,
        pct: denom > 0 ? (restSpent / denom) * 100 : 0,
        over: false,
        count: rest.length,
      });
    }
    return named;
  };
  let topCatsWithOther = buildTopCats('spent', totalCatSpent);

  const budgetedCats = expenseCats.filter((c) => c.budget > 0).sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  const breachedCats = budgetedCats.filter((c) => c.over);
  const nearCats = budgetedCats.filter((c) => c.near);
  const totalBudget = budgetedCats.reduce((s, c) => s + c.budget, 0);
  const totalBudgetedSpent = budgetedCats.reduce((s, c) => s + c.spent, 0);

  // ── Account flows (opening / closing inferred from period net) ────
  const accountFlows: AccountFlow[] = accounts.map((acc) => {
    const accTx = filteredTransactions.filter((t) => t.account_id === acc.id);
    const inflow = accTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const outflow = accTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const net = inflow - outflow;
    const closing = Number(acc.balance);
    return {
      id: acc.id,
      name: acc.name,
      bank: acc.bank,
      type: acc.account_type,
      tail: acc.id.replace(/[^0-9a-z]/gi, '').slice(-4).toUpperCase(),
      opening: closing - net,
      inflow,
      outflow,
      net,
      closing,
      count: accTx.length,
      // Forecast fields are populated below if projection is enabled.
      projectedInflow: 0,
      projectedOutflow: 0,
      projectedClosing: closing,
    };
  });
  const bankCount = new Set(accounts.map((a) => a.bank)).size;
  const totalBalance = accountFlows.reduce((s, a) => s + a.closing, 0);

  // ── Income sources / refunds ─────────────────────────────────────
  const refundItems = filteredTransactions.filter((t) => !!t.refund_of_transaction_id);
  const refundTotal = refundItems.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const refundCount = refundItems.length;

  // Income aggregation runs first against the actual transactions and
  // is later refreshed in the projection block so the Income page's
  // PER SOURCE table and recurring/one-off totals naturally include
  // the projected income when forecast is on.
  const aggregateIncome = (txs: Transaction[]) => {
    const ix = txs.filter((t) => t.type === 'income' && !t.refund_of_transaction_id && inStats(t));
    const sm = new Map<string, { amount: number; count: number; recurring: boolean; category: string }>();
    for (const t of ix) {
      const key = t.description || t.category?.name || 'Income';
      const prev = sm.get(key) ?? {
        amount: 0,
        count: 0,
        recurring: false,
        category: t.category?.name || 'Income',
      };
      prev.amount += Number(t.amount);
      prev.count += 1;
      if (t.recurring_transaction_id) prev.recurring = true;
      sm.set(key, prev);
    }
    const gross = ix.reduce((s, t) => s + Number(t.amount), 0);
    const sources: IncomeSource[] = Array.from(sm.entries())
      .map(([name, v]) => ({
        name, category: v.category, count: v.count, amount: v.amount,
        share: gross > 0 ? (v.amount / gross) * 100 : 0, recurring: v.recurring,
      }))
      .sort((a, b) => b.amount - a.amount);
    return {
      sources,
      gross: gross || 0,
      recurringTotal: sources.filter((s) => s.recurring).reduce((s, x) => s + x.amount, 0),
      recurringCount: sources.filter((s) => s.recurring).length,
      oneOffTotal: gross - sources.filter((s) => s.recurring).reduce((s, x) => s + x.amount, 0),
      oneOffCount: sources.filter((s) => !s.recurring).length,
    };
  };
  const incomeAgg0 = aggregateIncome(filteredTransactions);
  let incomeSources = incomeAgg0.sources;
  let grossIncome = incomeAgg0.gross || totalIncome;
  let recurringIncomeTotal = incomeAgg0.recurringTotal;
  let recurringIncomeCount = incomeAgg0.recurringCount;
  let oneOffIncomeTotal = incomeAgg0.oneOffTotal;
  let oneOffIncomeCount = incomeAgg0.oneOffCount;
  // Refunds are treated as income (shown positive/green), so they do not
  // offset or inflate gross expenses.
  const grossExpenses = totalExpenses;

  // 12-month income trend (calendar months ending at period end).
  // The last bar represents the current report period — when forecast
  // is on we expose its projected portion alongside the actual so the
  // renderer can stack them and clearly mark the forecast slice.
  const monthlyIncomeSeries: MonthBar[] = [];
  for (let i = 11; i >= 0; i--) {
    const mStart = startOfMonth(subMonths(end, i));
    const mEnd = endOfMonth(mStart);
    let v = 0;
    for (const t of transactions) {
      if (t.type !== 'income' || t.refund_of_transaction_id || !inStats(t)) continue;
      const d = txDateOf(t, config.dateType);
      if (d >= mStart && d <= mEnd) v += Number(t.amount);
    }
    monthlyIncomeSeries.push({ label: format(mStart, 'MMM', { locale }), value: v });
  }
  const incomeTrendStable = monthlyIncomeSeries.every((m) => m.value > 0);

  // ── Recurring classification ─────────────────────────────────────
  const activeRecurring = recurringData.periodItems.slice().sort((a, b) => b.periodAmount - a.periodAmount);
  const classify = (name: string) =>
    RENT_RE.test(name) ? 'rent' : BILLS_RE.test(name) ? 'bills' : SUBS_RE.test(name) ? 'subs' : 'other';
  let recurringSubsTotal = 0,
    recurringSubsCount = 0,
    recurringBillsTotal = 0,
    recurringBillsCount = 0,
    recurringRentTotal = 0;
  for (const it of recurringData.periodItems) {
    if (it.effectiveType !== 'expense') continue;
    const tag = classify(`${it.recurring.description} ${it.recurring.category?.name ?? ''}`);
    if (tag === 'subs') {
      recurringSubsTotal += it.periodAmount;
      recurringSubsCount += 1;
    } else if (tag === 'bills') {
      recurringBillsTotal += it.periodAmount;
      recurringBillsCount += 1;
    } else if (tag === 'rent') {
      recurringRentTotal += it.periodAmount;
    }
  }

  // ── Daily flow extras ────────────────────────────────────────────
  const expDays = evolutionChartData.map((d) => d.expense).filter((v) => v > 0);
  const typicalDailyExpense = expDays.length ? expDays.reduce((s, v) => s + v, 0) / expDays.length : 0;

  const sortByAmtDesc = (a: Transaction, b: Transaction) => Number(b.amount) - Number(a.amount);
  // Cashflow movements are net of refunds and exclude rows the user
  // marked as not-included-in-stats — those belong on the Income page's
  // "Excluded movements" section, not in the headline cashflow.
  const isCashflowRow = (t: Transaction) =>
    !t.refund_of_transaction_id && t.include_in_stats !== false;

  // Map every original expense to the total refunds that hit it within
  // this period, so outflow rows can rank and display by their net
  // impact (e.g. a 467 € Dentiste expense with 423 € of in-period
  // refunds shows up as a 44 € effective outflow).
  const refundsByOriginal = new Map<string, number>();
  for (const t of filteredTransactions) {
    if (t.refund_of_transaction_id) {
      refundsByOriginal.set(
        t.refund_of_transaction_id,
        (refundsByOriginal.get(t.refund_of_transaction_id) ?? 0) + Number(t.amount),
      );
    }
  }

  const inflowTx = filteredTransactions.filter((t) => t.type === 'income' && isCashflowRow(t)).sort(sortByAmtDesc);
  const outflowRanked = filteredTransactions
    .filter((t) => t.type === 'expense' && isCashflowRow(t))
    .map((t) => ({ tx: t, effective: Number(t.amount) - (refundsByOriginal.get(t.id) ?? 0) }))
    .filter((x) => x.effective > 0.01) // fully-refunded expenses drop out of the cashflow story
    .sort((a, b) => b.effective - a.effective);
  // Movement rows mirror the template, which shows the bare description
  // (e.g. "Salary · Acme SAS") without the category appended.
  const labelOf = (t: Transaction) => t.description;
  const topInflows = inflowTx.slice(0, 4).map((t) => ({
    date: txDateOf(t, config.dateType),
    label: labelOf(t),
    amount: Number(t.amount),
  }));
  const topOutflows = outflowRanked.slice(0, 4).map((x) => ({
    date: txDateOf(x.tx, config.dateType),
    label: labelOf(x.tx),
    amount: -x.effective,
  }));

  // ── Ledger (newest-first with running balance) ───────────────────
  const ascending = filteredTransactions
    .slice()
    .sort((a, b) => txDateOf(a, config.dateType).getTime() - txDateOf(b, config.dateType).getTime());
  let running = stats.initialBalance;
  const ascRows = ascending.map((tx) => {
    const signed = tx.type === 'income' ? Number(tx.amount) : tx.type === 'expense' ? -Number(tx.amount) : 0;
    running += signed;
    return { tx, date: txDateOf(tx, config.dateType), balance: running };
  });
  let augmentedLedgerRows: { tx: Transaction; date: Date; balance: number; isProjection?: boolean }[]
    = ascRows.slice().reverse();
  let augmentedFiltered: Transaction[] = filteredTransactions;
  let augmentedEvolution = evolutionChartData.map((d) => ({ ...d, isProjection: false }));
  let projectionStartIndex = -1;
  let forecastIncome = 0;
  let forecastExpenses = 0;
  let includeForecasted = false;
  let recurringUpcoming = 0;

  // ── Projection / forecast merge (optional) ───────────────────────
  if (input.projection?.includeForecasted) {
    const { now, installmentPayments, debts, scheduledDebtPayments } = input.projection;
    const windowStart = now > actualDates.start ? now : actualDates.start;
    if (windowStart < actualDates.end) {
      const projectedTx = synthesiseProjections(
        windowStart, actualDates.end, accounts, recurringData,
        installmentPayments, debts, scheduledDebtPayments,
      );
      if (projectedTx.length > 0) {
        includeForecasted = true;

        // Per-category projected spend (mutate expenseCats in place).
        const projectedByCat = new Map<string, number>();
        for (const t of projectedTx) {
          if (t.type !== 'expense') continue;
          const key = t.category?.name ?? 'Uncategorised';
          projectedByCat.set(key, (projectedByCat.get(key) ?? 0) + Number(t.amount));
        }
        for (const c of expenseCats) {
          c.projectedSpent = projectedByCat.get(c.name) ?? 0;
          c.combinedSpent = c.spent + c.projectedSpent;
          c.combinedOver = c.budget > 0 && c.combinedSpent > c.budget;
        }
        // Rebuild the top-cats donut breakdown so the segments and the
        // centre figure match the combined headline total.
        const combinedCatTotal = expenseCats.reduce((s, c) => s + c.combinedSpent, 0);
        topCatsWithOther = buildTopCats('combinedSpent', combinedCatTotal);

        // Per-account projected inflow/outflow.
        const projByAcc = new Map<string, { in: number; out: number }>();
        for (const t of projectedTx) {
          const cur = projByAcc.get(t.account_id) ?? { in: 0, out: 0 };
          if (t.type === 'income') cur.in += Number(t.amount);
          else if (t.type === 'expense') cur.out += Number(t.amount);
          projByAcc.set(t.account_id, cur);
        }
        for (const af of accountFlows) {
          const p = projByAcc.get(af.id) ?? { in: 0, out: 0 };
          af.projectedInflow = p.in;
          af.projectedOutflow = p.out;
          af.projectedClosing = af.closing + (p.in - p.out);
        }

        // Forecast aggregates.
        for (const t of projectedTx) {
          if (t.type === 'income') forecastIncome += Number(t.amount);
          else if (t.type === 'expense') forecastExpenses += Number(t.amount);
        }

        // Extend daily evolution: bucket projected income/expense into
        // the matching day, mark the day as projected, recompute running
        // balance from initial balance forward across the whole period.
        const startMs = actualDates.start.getTime();
        for (const t of projectedTx) {
          const d = txDateOf(t, config.dateType);
          const idx = Math.floor((d.getTime() - startMs) / 86400000);
          if (idx < 0 || idx >= augmentedEvolution.length) continue;
          if (t.type === 'income') augmentedEvolution[idx].income += Number(t.amount);
          else if (t.type === 'expense') augmentedEvolution[idx].expense += Number(t.amount);
          augmentedEvolution[idx].isProjection = true;
        }
        let bal = stats.initialBalance;
        for (let i = 0; i < augmentedEvolution.length; i++) {
          bal += augmentedEvolution[i].income - augmentedEvolution[i].expense;
          augmentedEvolution[i].balance = bal;
        }
        projectionStartIndex = augmentedEvolution.findIndex((d) => d.isProjection);

        // Merge projections into the ledger and recompute the running
        // balance so projected rows show a (mute) projected balance.
        augmentedFiltered = [...filteredTransactions, ...projectedTx];
        const ascProj = augmentedFiltered.slice().sort(
          (a, b) => txDateOf(a, config.dateType).getTime() - txDateOf(b, config.dateType).getTime(),
        );
        let r = stats.initialBalance;
        const ascRowsProj = ascProj.map((tx) => {
          const signed = tx.type === 'income' ? Number(tx.amount) : tx.type === 'expense' ? -Number(tx.amount) : 0;
          r += signed;
          return { tx, date: txDateOf(tx, config.dateType), balance: r, isProjection: !!tx.isProjection };
        });
        augmentedLedgerRows = ascRowsProj.slice().reverse();

        // Re-aggregate income from the merged set so the Income page
        // (PER SOURCE table + Recurring/One-offs/Gross income KPIs and
        // strip) naturally reflects the projected income too.
        const agg = aggregateIncome(augmentedFiltered);
        incomeSources = agg.sources;
        grossIncome = agg.gross || totalIncome + forecastIncome;
        recurringIncomeTotal = agg.recurringTotal;
        recurringIncomeCount = agg.recurringCount;
        oneOffIncomeTotal = agg.oneOffTotal;
        oneOffIncomeCount = agg.oneOffCount;
      }

      // Count distinct recurring items with at least one future occurrence
      // inside the window — used by the Recurring page's right-secondary.
      recurringUpcoming = recurringData.periodItems.filter((it) =>
        it.occurrenceDetails.some((o) => {
          if (!o.isFuture) return false;
          const d = parseLocalDate(o.date);
          return d >= windowStart && d <= actualDates.end;
        }),
      ).length;
    }
  }

  const ledgerPageCount = orderedEnabledPages.includes('transactions')
    ? Math.max(1, Math.ceil(augmentedFiltered.length / TX_PER_PAGE))
    : 0;

  return {
    stats,
    totalIncome,
    totalExpenses,
    netResult,
    balanceEnd,
    prevIncome,
    prevExpenses,
    prevNet,
    incomeMoM,
    expenseMoM,
    netMoM,
    prevPeriodLabel,
    expenseCats,
    totalCatSpent,
    topCatsWithOther,
    budgetedCats,
    breachedCats,
    nearCats,
    totalBudget,
    totalBudgetedSpent,
    accountFlows,
    bankCount,
    totalBalance,
    incomeCats: incomeAnalysis,
    incomeSources,
    grossIncome,
    recurringIncomeTotal,
    recurringIncomeCount,
    oneOffIncomeTotal,
    oneOffIncomeCount,
    refundItems,
    refundTotal,
    refundCount,
    grossExpenses,
    monthlyIncomeSeries,
    monthlyIncomeProjected: forecastIncome,
    incomeTrendStable,
    recurring: recurringData,
    activeRecurring,
    recurringSubsTotal,
    recurringSubsCount,
    recurringBillsTotal,
    recurringBillsCount,
    recurringRentTotal,
    recurringActiveCount: recurringData.activeRecurring.length,
    recurringMonthlyNet: recurringData.monthlyNet,
    recurringMonthlyExpense: recurringData.monthlyExpenses,
    recurringMonthlyTotal: recurringData.monthlyIncome - recurringData.monthlyExpenses,
    evolutionChartData: augmentedEvolution,
    sparkPoints: augmentedEvolution.map((d) => d.balance),
    projectionStartIndex,
    typicalDailyExpense,
    topInflows,
    topOutflows,
    grossInflowCount: inflowTx.length,
    grossOutflowCount: outflowRanked.length,
    filteredTransactions: augmentedFiltered,
    ledgerRows: augmentedLedgerRows,
    includeForecasted,
    forecastIncome,
    forecastExpenses,
    forecastNet: forecastIncome - forecastExpenses,
    // Headline combined figures — when forecast is on these are the
    // forward-looking totals that every page should display by default;
    // when forecast is off they collapse to the actuals.
    combinedIncome: totalIncome + forecastIncome,
    combinedExpenses: totalExpenses + forecastExpenses,
    combinedNet: (totalIncome + forecastIncome) - (totalExpenses + forecastExpenses),
    combinedFinalBalance: balanceEnd + (forecastIncome - forecastExpenses),
    combinedTotalCatSpent: expenseCats.reduce((s, c) => s + c.combinedSpent, 0),
    combinedTotalBudgetedSpent: budgetedCats.reduce((s, c) => s + c.combinedSpent, 0),
    // `grossIncome` is refreshed when forecast is on (includes projected
    // entries), and equals the actual when forecast is off, so it is
    // already the combined headline figure.
    combinedGrossIncome: grossIncome,
    combinedGrossExpenses: grossExpenses + forecastExpenses,
    recurringUpcoming,
    openingBalance: stats.initialBalance,
    ledgerPageCount,
    transactions,
    accounts,
    config,
    actualDates,
    periodDays,
    orderedEnabledPages,
  };
}
