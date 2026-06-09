import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import type { Transaction, Account } from '@/hooks/useFinancialData';
import type { ReportsStats, CategoryData, RecurringData } from '@/hooks/useReportsData';
import type { IncomeCategory } from '@/hooks/useIncomeAnalysis';
import type { Debt, ScheduledDebtPayment } from '@/hooks/useDebts';
import type { InstallmentPayment } from '@/hooks/useInstallmentPayments';
import type { SpecialBudget } from '@/hooks/useSpecialBudgets';
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
  specialBudgets?: SpecialBudget[];
  config: { dateType: 'accounting' | 'value'; periodType: 'month' | 'quarter' | 'year' | 'custom' };
  actualDates: { start: Date; end: Date };
  pages: PageEntry[];
  locale: Locale;
  t: (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => string;
  formatCurrency: (n: number) => string;
  /** Optional forecast input. When `includeForecasted` is true and the
   *  period extends past `now`, projected entries from these sources
   *  are synthesised at build time and merged into the report. */
  forecast?: {
    includeForecasted: boolean;
    installmentPayments: InstallmentPayment[];
    debts: Debt[];
    scheduledDebtPayments: ScheduledDebtPayment[];
  };
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

/** Build the report document without triggering a download. Exported so
 *  the rendering pipeline can be exercised headlessly in tests. */
export async function buildReportPdf(input: GenerateReportPdfInput) {
  const [{ default: jsPDF }, { default: autoTable }, fonts] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./fonts/geistFonts'),
  ]);

  const pdf = new jsPDF('p', 'mm', 'a4');

  // Render in the app brand typeface. The document spec defines two
  // working weights only — Medium (500) for body/figures, SemiBold (600)
  // for titles/labels — so we map Medium→'normal' and SemiBold→'bold'
  // on both the sans ('helvetica') and mono ('courier') slots; every
  // existing setFont call and jspdf-autotable cell style then renders at
  // the spec weight with no per-call changes.
  pdf.addFileToVFS('Geist-Medium.ttf', fonts.geistMedium);
  pdf.addFont('Geist-Medium.ttf', 'helvetica', 'normal');
  pdf.addFileToVFS('Geist-SemiBold.ttf', fonts.geistSemiBold);
  pdf.addFont('Geist-SemiBold.ttf', 'helvetica', 'bold');
  pdf.addFileToVFS('GeistMono-Medium.ttf', fonts.geistMonoMedium);
  pdf.addFont('GeistMono-Medium.ttf', 'courier', 'normal');
  pdf.addFileToVFS('GeistMono-SemiBold.ttf', fonts.geistMonoSemiBold);
  pdf.addFont('GeistMono-SemiBold.ttf', 'courier', 'bold');

  const { actualDates, locale } = input;

  const orderedEnabledPages = input.pages
    .filter((p) => p.enabled)
    .map((p) => p.id) as ReportPageId[];

  const generatedAt = new Date();

  const data = buildReportData({
    stats: input.stats,
    categoryChartData: input.categoryChartData,
    evolutionChartData: input.evolutionChartData,
    incomeAnalysis: input.incomeAnalysis,
    recurringData: input.recurringData,
    accounts: input.accounts,
    transactions: input.transactions,
    filteredTransactions: input.filteredTransactions,
    specialBudgets: input.specialBudgets,
    config: input.config,
    actualDates,
    orderedEnabledPages,
    locale,
    projection: input.forecast
      ? {
          includeForecasted: input.forecast.includeForecasted,
          now: generatedAt,
          installmentPayments: input.forecast.installmentPayments,
          debts: input.forecast.debts,
          scheduledDebtPayments: input.forecast.scheduledDebtPayments,
        }
      : undefined,
  });
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

  // Second pass: the true page count is only known after layout (the
  // ledger paginates dynamically). Re-stamp every page's top- and
  // bottom-chrome page legend — plus the cover's two custom legends —
  // with the real total so top and bottom never disagree.
  const finalTotal = pdf.getNumberOfPages();
  const { PW, MARGIN_X, TOP_Y, FOOT_Y, ink2, mute, setText, mono } = ctx;
  const coverIsFirst = orderedEnabledPages[0] === 'cover';
  const white = () => pdf.setFillColor(255, 255, 255);
  for (let p = 1; p <= finalTotal; p++) {
    pdf.setPage(p);
    if (coverIsFirst && p === 1) {
      // Cover: "1 PAGE OF N" (header) and "01 / NN" (key-figures footer).
      white();
      pdf.rect(PW - MARGIN_X - 44, 29, 44, 4.5, 'F');
      mono(7);
      setText(mute);
      pdf.text(`1 PAGE OF ${finalTotal}`, PW - MARGIN_X, 32, { align: 'right' });
      white();
      pdf.rect(PW - MARGIN_X - 30, 257.5, 30, 5, 'F');
      mono(8);
      setText(mute);
      pdf.text(
        `01 / ${String(finalTotal).padStart(2, '0')}`,
        PW - MARGIN_X, 261, { align: 'right' },
      );
      continue;
    }
    const legend = `${String(p).padStart(2, '0')} / ${String(finalTotal).padStart(2, '0')}`;
    // top-right (drawTopChrome prints at TOP_Y + 3)
    white();
    pdf.rect(PW - MARGIN_X - 28, TOP_Y, 28, 5, 'F');
    mono(7, 'bold');
    setText(ink2);
    pdf.text(legend, PW - MARGIN_X, TOP_Y + 3, { align: 'right' });
    // bottom-right (drawBottomChrome prints at FOOT_Y - 1)
    white();
    pdf.rect(PW - MARGIN_X - 28, FOOT_Y - 4, 28, 5, 'F');
    mono(7);
    setText(mute);
    pdf.text(legend, PW - MARGIN_X, FOOT_Y - 1, { align: 'right' });
  }

  return pdf;
}

export async function generateReportPdf(input: GenerateReportPdfInput): Promise<void> {
  const pdf = await buildReportPdf(input);
  pdf.save(`spending-tracker-report-${format(input.actualDates.start, 'yyyy-MM')}.pdf`);
}

export type { PageId };
