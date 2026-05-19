import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { Locale } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { Transaction, Account } from '@/hooks/useFinancialData';
import type { ReportsStats, CategoryData, RecurringData } from '@/hooks/useReportsData';
import type { IncomeCategory } from '@/hooks/useIncomeAnalysis';
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
}

const inStats = (t: Transaction) => t.include_in_stats !== false;
const txDateOf = (t: Transaction, dateType: 'accounting' | 'value') =>
  dateType === 'value' ? parseLocalDate(t.value_date || t.transaction_date) : parseLocalDate(t.transaction_date);

const SUBS_RE = /subscription|abonnement|streaming|spotify|netflix|apple|disney|prime/i;
const BILLS_RE = /utilit|electric|water|internet|insurance|facture|énergie|energie|gas|phone|mobile|telecom|edf|veolia|bouygues|orange|free/i;
const RENT_RE = /rent|loyer|housing|logement|mortgage|hypoth/i;

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
    .filter((c) => Number(c.spent) > 0)
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
  }));

  const namedTop = expenseCats.slice(0, 5).map((c) => ({
    name: c.name,
    spent: c.spent,
    pct: totalCatSpent > 0 ? (c.spent / totalCatSpent) * 100 : 0,
    over: c.over,
    count: 1,
  }));
  const restCats = expenseCats.slice(5);
  const topCatsWithOther = [...namedTop];
  if (restCats.length > 0) {
    const restSpent = restCats.reduce((s, c) => s + c.spent, 0);
    topCatsWithOther.push({
      name: `Other (${restCats.length})`,
      spent: restSpent,
      pct: totalCatSpent > 0 ? (restSpent / totalCatSpent) * 100 : 0,
      over: false,
      count: restCats.length,
    });
  }

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
    };
  });
  const bankCount = new Set(accounts.map((a) => a.bank)).size;
  const totalBalance = accountFlows.reduce((s, a) => s + a.closing, 0);

  // ── Income sources / refunds ─────────────────────────────────────
  const refundItems = filteredTransactions.filter((t) => !!t.refund_of_transaction_id);
  const refundTotal = refundItems.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const refundCount = refundItems.length;

  const incomeTx = filteredTransactions.filter(
    (t) => t.type === 'income' && !t.refund_of_transaction_id && inStats(t),
  );
  const sourceMap = new Map<string, { amount: number; count: number; recurring: boolean; category: string }>();
  for (const t of incomeTx) {
    const key = t.description || t.category?.name || 'Income';
    const prev = sourceMap.get(key) ?? {
      amount: 0,
      count: 0,
      recurring: false,
      category: t.category?.name || 'Income',
    };
    prev.amount += Number(t.amount);
    prev.count += 1;
    if (t.recurring_transaction_id) prev.recurring = true;
    sourceMap.set(key, prev);
  }
  const grossIncome = incomeTx.reduce((s, t) => s + Number(t.amount), 0) || totalIncome;
  const incomeSources: IncomeSource[] = Array.from(sourceMap.entries())
    .map(([name, v]) => ({
      name,
      category: v.category,
      count: v.count,
      amount: v.amount,
      share: grossIncome > 0 ? (v.amount / grossIncome) * 100 : 0,
      recurring: v.recurring,
    }))
    .sort((a, b) => b.amount - a.amount);
  const recurringIncomeTotal = incomeSources.filter((s) => s.recurring).reduce((s, x) => s + x.amount, 0);
  const recurringIncomeCount = incomeSources.filter((s) => s.recurring).length;
  const oneOffIncomeTotal = grossIncome - recurringIncomeTotal;
  const oneOffIncomeCount = incomeSources.filter((s) => !s.recurring).length;
  const grossExpenses = totalExpenses + refundTotal;

  // 12-month income trend (calendar months ending at period end)
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
  const inflowTx = filteredTransactions.filter((t) => t.type === 'income').sort(sortByAmtDesc);
  const outflowTx = filteredTransactions.filter((t) => t.type === 'expense').sort(sortByAmtDesc);
  // Movement rows mirror the template, which shows the bare description
  // (e.g. "Salary · Acme SAS") without the category appended.
  const labelOf = (t: Transaction) => t.description;
  const topInflows = inflowTx.slice(0, 4).map((t) => ({
    date: txDateOf(t, config.dateType),
    label: labelOf(t),
    amount: Number(t.amount),
  }));
  const topOutflows = outflowTx.slice(0, 4).map((t) => ({
    date: txDateOf(t, config.dateType),
    label: labelOf(t),
    amount: -Number(t.amount),
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
  const ledgerRows = ascRows.slice().reverse();
  const ledgerPageCount = orderedEnabledPages.includes('transactions')
    ? Math.max(1, Math.ceil(filteredTransactions.length / TX_PER_PAGE))
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
    evolutionChartData,
    sparkPoints: evolutionChartData.map((d) => d.balance),
    typicalDailyExpense,
    topInflows,
    topOutflows,
    grossInflowCount: filteredTransactions.filter((t) => t.type === 'income').length,
    grossOutflowCount: filteredTransactions.filter((t) => t.type === 'expense').length,
    filteredTransactions,
    ledgerRows,
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
