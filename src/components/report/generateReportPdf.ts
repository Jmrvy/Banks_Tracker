import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import type { Transaction, Account } from '@/hooks/useFinancialData';
import type { ReportsStats, CategoryData, RecurringData } from '@/hooks/useReportsData';
import type { IncomeCategory } from '@/hooks/useIncomeAnalysis';
import type { PageEntry, PageId } from './pageMeta';
import type { ReportPageId, PageRenderer } from './types';
import { buildReportData } from './buildReportData';
import { createReportCtx } from './createReportCtx';
import { renderCover } from './pages/cover';
import { renderContents } from './pages/contents';
import { renderSummary } from './pages/summary';
import { renderCashflow } from './pages/cashflow';
import { renderCategories } from './pages/categories';
import { renderBudgets } from './pages/budgets';
import { renderAccounts } from './pages/accounts';
import { renderIncome } from './pages/income';
import { renderRecurring } from './pages/recurring';
import { renderTransactions } from './pages/transactions';

export interface GenerateReportPdfInput {
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
  pages: PageEntry[];
  locale: Locale;
  t: (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => string;
  formatCurrency: (n: number) => string;
}

const RENDERERS: Record<ReportPageId, PageRenderer> = {
  cover: renderCover,
  contents: renderContents,
  summary: renderSummary,
  cashflow: renderCashflow,
  categories: renderCategories,
  budgets: renderBudgets,
  accounts: renderAccounts,
  income: renderIncome,
  recurring: renderRecurring,
  transactions: renderTransactions,
};

export async function generateReportPdf(input: GenerateReportPdfInput): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const pdf = new jsPDF('p', 'mm', 'a4');
  const { actualDates, locale } = input;

  const orderedEnabledPages = input.pages
    .filter((p) => p.enabled)
    .map((p) => p.id) as ReportPageId[];

  const data = buildReportData({
    stats: input.stats,
    categoryChartData: input.categoryChartData,
    evolutionChartData: input.evolutionChartData,
    incomeAnalysis: input.incomeAnalysis,
    recurringData: input.recurringData,
    accounts: input.accounts,
    transactions: input.transactions,
    filteredTransactions: input.filteredTransactions,
    config: input.config,
    actualDates,
    orderedEnabledPages,
    locale,
  });

  const generatedAt = new Date();
  const reference = `ST-${format(actualDates.start, 'yyyy-MM-dd')}`;
  const periodCompact = `${format(actualDates.start, 'd MMM', { locale })} → ${format(
    actualDates.end,
    'd MMM yyyy',
    { locale },
  )}`;
  const ledgerPageCount = data.ledgerPageCount;
  const totalPagesEstimate =
    orderedEnabledPages.length - (ledgerPageCount > 0 ? 1 : 0) + Math.max(0, ledgerPageCount);

  const ctx = createReportCtx({
    pdf,
    autoTable: autoTable as unknown as (doc: typeof pdf, options: Record<string, unknown>) => void,
    formatCurrency: input.formatCurrency,
    locale,
    t: input.t,
    generatedAt,
    reference,
    periodCompact,
    totalPagesEstimate,
    data,
  });

  for (const id of orderedEnabledPages) {
    try {
      RENDERERS[id]?.(ctx);
    } catch (e) {
      console.error(`Error rendering page "${id}":`, e);
    }
  }

  // Second pass: re-stamp the bottom-chrome page numbers with the true
  // total. The cover (page 1 when present) has its own page legend at a
  // different y, so we skip it.
  const finalTotal = pdf.getNumberOfPages();
  if (finalTotal !== totalPagesEstimate) {
    const { PW, MARGIN_X, FOOT_Y, mute, setText, mono } = ctx;
    const coverIsFirst = orderedEnabledPages[0] === 'cover';
    for (let p = 1; p <= finalTotal; p++) {
      if (coverIsFirst && p === 1) continue;
      pdf.setPage(p);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(PW - MARGIN_X - 26, FOOT_Y - 4, 26, 5, 'F');
      mono(7);
      setText(mute);
      pdf.text(
        `${String(p).padStart(2, '0')} / ${String(finalTotal).padStart(2, '0')}`,
        PW - MARGIN_X,
        FOOT_Y - 1,
        { align: 'right' },
      );
    }
  }

  pdf.save(`spending-tracker-report-${format(actualDates.start, 'yyyy-MM')}.pdf`);
}

export type { PageId };
