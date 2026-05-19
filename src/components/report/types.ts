import type jsPDF from 'jspdf';
import type { Locale } from 'date-fns';
import type { Transaction, Account } from '@/hooks/useFinancialData';
import type {
  ReportsStats,
  CategoryData,
  RecurringData,
  PeriodRecurringItem,
} from '@/hooks/useReportsData';
import type { IncomeCategory } from '@/hooks/useIncomeAnalysis';

export type RGB = [number, number, number];

export type ReportPageId =
  | 'cover'
  | 'contents'
  | 'summary'
  | 'cashflow'
  | 'categories'
  | 'budgets'
  | 'accounts'
  | 'income'
  | 'recurring'
  | 'transactions';

export interface KpiCell {
  label: string;
  value: string;
  valueColor?: RGB;
  delta?: string;
  deltaColor?: RGB;
}

/** A category enriched with the figures the statement pages need. */
export interface ReportCategory extends CategoryData {
  spent: number;
  budget: number;
  /** spent − budget (signed). Only meaningful when budget > 0. */
  deltaVsBudget: number;
  /** share of total expenses, 0–100. */
  pctOfTotal: number;
  over: boolean;
  /** ≥ 90 % of budget used but not over. */
  near: boolean;
}

export interface AccountFlow {
  id: string;
  name: string;
  bank: string;
  type: string;
  /** masked tail (best-effort — no IBAN in schema, uses id tail). */
  tail: string;
  opening: number;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
  count: number;
}

export interface IncomeSource {
  name: string;
  category: string;
  count: number;
  amount: number;
  /** share of gross income, 0–100. */
  share: number;
  recurring: boolean;
}

export interface MonthBar {
  label: string;
  value: number;
}

/** Everything a page renderer might need. Raw collections are included so
 *  individual pages can compute their own derivations without touching
 *  shared modules. */
export interface ReportData {
  // headline figures
  stats: ReportsStats;
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
  balanceEnd: number;

  // prior equal-length period (month-over-month)
  prevIncome: number;
  prevExpenses: number;
  prevNet: number;
  /** % change vs previous period, or null when no prior data. */
  incomeMoM: number | null;
  expenseMoM: number | null;
  netMoM: number | null;
  prevPeriodLabel: string;

  // categories
  expenseCats: ReportCategory[];
  totalCatSpent: number;
  /** top 5 named + an aggregated "Other (N)" bucket. */
  topCatsWithOther: { name: string; spent: number; pct: number; over: boolean; count: number }[];
  budgetedCats: ReportCategory[];
  breachedCats: ReportCategory[];
  nearCats: ReportCategory[];
  totalBudget: number;
  totalBudgetedSpent: number;

  // accounts
  accountFlows: AccountFlow[];
  bankCount: number;
  totalBalance: number;

  // income
  incomeCats: IncomeCategory[];
  incomeSources: IncomeSource[];
  grossIncome: number;
  recurringIncomeTotal: number;
  recurringIncomeCount: number;
  oneOffIncomeTotal: number;
  oneOffIncomeCount: number;
  refundItems: Transaction[];
  refundTotal: number;
  refundCount: number;
  grossExpenses: number;
  monthlyIncomeSeries: MonthBar[];
  incomeTrendStable: boolean;

  // recurring
  recurring: RecurringData;
  activeRecurring: PeriodRecurringItem[];
  recurringSubsTotal: number;
  recurringSubsCount: number;
  recurringBillsTotal: number;
  recurringBillsCount: number;
  recurringRentTotal: number;
  recurringActiveCount: number;
  recurringMonthlyNet: number;
  recurringMonthlyExpense: number;
  recurringMonthlyTotal: number;

  // flow
  evolutionChartData: { date: string; balance: number; income: number; expense: number }[];
  sparkPoints: number[];
  /** mean of daily expense, used to flag "over typical" bars. */
  typicalDailyExpense: number;
  topInflows: { date: Date; label: string; amount: number }[];
  topOutflows: { date: Date; label: string; amount: number }[];
  grossInflowCount: number;
  grossOutflowCount: number;

  // ledger
  filteredTransactions: Transaction[];
  /** transactions newest-first with a running balance column. */
  ledgerRows: { tx: Transaction; date: Date; balance: number }[];
  openingBalance: number;
  ledgerPageCount: number;

  // raw collections (page-local computations)
  transactions: Transaction[];
  accounts: Account[];

  // context
  config: {
    dateType: 'accounting' | 'value';
    periodType: 'month' | 'quarter' | 'year' | 'custom';
  };
  actualDates: { start: Date; end: Date };
  periodDays: number;
  orderedEnabledPages: ReportPageId[];
}

export interface ReportCtx {
  pdf: jsPDF;
  // jspdf-autotable's default export — typed loose on purpose.
  autoTable: (doc: jsPDF, options: Record<string, unknown>) => void;

  // geometry (mm, A4 portrait)
  PW: number;
  PH: number;
  MARGIN_X: number;
  TOP_Y: number;
  FOOT_Y: number;
  STRIP_Y: number;
  BODY_TOP: number;
  BODY_BOTTOM: number;
  COL: number;

  // palette
  ink: RGB;
  ink2: RGB;
  ink3: RGB;
  mute: RGB;
  mute2: RGB;
  mute3: RGB;
  lineCol: RGB;
  line2Col: RGB;
  pos: RGB;
  neg: RGB;
  negSoft: RGB;
  amber: RGB;
  amberSoft: RGB;

  // primitives
  setText: (c: RGB) => void;
  setFill: (c: RGB) => void;
  setDraw: (c: RGB) => void;
  sans: (size: number, weight?: 'normal' | 'bold') => void;
  mono: (size: number, weight?: 'normal' | 'bold') => void;
  fmt: (n: number) => string;
  fmtSigned: (n: number) => string;

  // chrome / building blocks
  drawTopChrome: (pageNum: number, totalPages: number) => void;
  drawBottomChrome: (pageNum: number, totalPages: number) => void;
  drawBottomStrip: (label: string, value: string, valueColor?: RGB) => void;
  drawPageTitle: (
    eyebrow: string,
    title: string,
    rightPrimary?: string,
    rightSecondary?: string,
    rightSecondaryColor?: RGB,
  ) => number;
  drawSectionEyebrow: (label: string, meta: string | undefined, y: number) => number;
  drawKpiBand: (y: number, height: number, cells: KpiCell[]) => void;
  drawProgressBar: (
    x: number,
    y: number,
    w: number,
    h: number,
    fraction: number,
    over: boolean,
    color?: RGB,
  ) => void;
  drawDonut: (
    cx: number,
    cy: number,
    rOuter: number,
    rInner: number,
    segments: { value: number; color: RGB }[],
  ) => void;
  drawSparkline: (
    x: number,
    y: number,
    w: number,
    h: number,
    points: number[],
    color?: RGB,
  ) => void;

  // mutable page counter (shared so autoTable pagination can bump it)
  state: { pageIdx: number };
  newPage: () => void;

  // meta
  generatedAt: Date;
  reference: string;
  periodCompact: string;
  totalPagesEstimate: number;
  locale: Locale;
  // i18next TFunction — loose on purpose to avoid version coupling.
  t: (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => string;
  formatCurrency: (n: number) => string;

  data: ReportData;
}

export type PageRenderer = (ctx: ReportCtx) => void;
