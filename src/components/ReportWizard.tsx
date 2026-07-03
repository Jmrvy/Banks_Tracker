import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  FileText,
  FileSpreadsheet,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Settings2,
  Download,
  Check,
  BarChart3,
  PieChart,
  TrendingUp,
  Receipt,
  Wallet,
  Target,
  ArrowLeftRight
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, startOfQuarter, subMonths, eachDayOfInterval, isSameDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
// Heavy export libs (jspdf, jspdf-autotable, xlsx) are loaded
// dynamically inside the export handlers to keep them out of the initial bundle.
import { toast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useDebts } from "@/hooks/useDebts";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useSpecialBudgets } from "@/hooks/useSpecialBudgets";
import { specialBudgetsForPeriod } from "@/lib/specialBudgetUtils";
import { useReportsData } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getTxDate } from "@/lib/dateUtils";
import { resolvePeriodRange } from "@/lib/periodUtils";
import { filterByPeriod, signedGlobalAmount } from "@/lib/reportsEngine";
import {
  type ReportSection,
  type PageId,
  type PageEntry,
  type PageDef,
  type PresetId,
  PAGE_TO_SECTION,
  PAGE_DEFS,
  DEFAULT_PAGE_ORDER,
  PRESETS,
} from "@/components/report/pageMeta";
import { generateReportPdf } from "@/components/report/generateReportPdf";
// Every report page is drawn natively via jsPDF in its own module
// under @/components/report/pages. This component only gathers data
// and drives the wizard UI.

interface ReportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReportConfig {
  format: 'pdf' | 'excel';
  periodType: 'month' | 'quarter' | 'year' | 'custom';
  startDate: Date;
  endDate: Date;
  dateType: 'accounting' | 'value';
  sections: ReportSection[];
  includeCharts: boolean;
  groupByAccount: boolean;
  /** When the selected period extends into the future, inject projected
   *  entries (recurring future occurrences, remaining installment
   *  payments, unpaid scheduled debt payments) into the report — they
   *  affect category totals, account closing balances, the cashflow
   *  chart, and the transactions ledger, and are tagged as forecast. */
  includeForecasted: boolean;
}

const SECTION_INFO: Record<
  ReportSection,
  { icon: React.ElementType; labelKey: string; labelDefault: string; descKey: string; descDefault: string }
> = {
  summary: { icon: BarChart3, labelKey: 'reports.section.summary.label', labelDefault: 'Summary', descKey: 'reports.section.summary.desc', descDefault: 'Income, expenses, net balance' },
  accounts: { icon: Wallet, labelKey: 'reports.section.accounts.label', labelDefault: 'Account balances', descKey: 'reports.section.accounts.desc', descDefault: 'Current balance of each account' },
  transactions: { icon: Receipt, labelKey: 'reports.section.transactions.label', labelDefault: 'Transactions', descKey: 'reports.section.transactions.desc', descDefault: 'Detailed list of operations' },
  categories: { icon: PieChart, labelKey: 'reports.section.categories.label', labelDefault: 'Expenses by category', descKey: 'reports.section.categories.desc', descDefault: 'Spending breakdown' },
  income: { icon: TrendingUp, labelKey: 'reports.section.income.label', labelDefault: 'Income by category', descKey: 'reports.section.income.desc', descDefault: 'Income analysis' },
  budgets: { icon: Target, labelKey: 'reports.section.budgets.label', labelDefault: 'Budget tracking', descKey: 'reports.section.budgets.desc', descDefault: 'Budget vs actual spending' },
  evolution: { icon: ArrowLeftRight, labelKey: 'reports.section.evolution.label', labelDefault: 'Balance evolution', descKey: 'reports.section.evolution.desc', descDefault: 'Balance trend curve' },
  recurring: { icon: Receipt, labelKey: 'reports.section.recurring.label', labelDefault: 'Recurring', descKey: 'reports.section.recurring.desc', descDefault: 'Recurring transactions' },
};

const DEFAULT_SECTIONS: ReportSection[] = ['summary', 'accounts', 'transactions', 'categories'];

/* ──────────────────────────────────────────────────────────────────
 * PAGE MODEL (v2 wizard, statement-style)
 *
 * The new wizard surfaces report output as an *ordered list of named
 * pages*, not abstract sections. The page list is the source of truth
 * for the user; behind the scenes we still translate selected pages
 * into the legacy ReportSection enum so the existing PDF / Excel
 * generators keep working (Phase 1 = UI only).
 *
 * Cover and Contents are document chrome — they don't map to a
 * ReportSection; the PDF renderer already emits a title page and
 * the contents page is a Phase 2 deliverable. Cover is REQUIRED;
 * Contents is toggleable but enabled by default.
 * ────────────────────────────────────────────────────────────────── */

/* Page model (types, defs, presets, ordering) lives in
 * @/components/report/pageMeta and is shared with the PDF
 * orchestrator so the wizard and the renderer never drift. */

export const ReportWizard = ({ open, onOpenChange }: ReportWizardProps) => {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const locale = i18n.language === 'fr' ? fr : enUS;

  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const totalSteps = 3;

  const { formatCurrency, preferences } = useUserPreferences();

  const [config, setConfig] = useState<ReportConfig>({
    format: 'pdf',
    periodType: 'month',
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date()),
    // Seed from the user's preference so the export shows the same
    // numbers as the Reports page by default.
    dateType: preferences.dateType,
    sections: DEFAULT_SECTIONS,
    includeCharts: true,
    groupByAccount: false,
    includeForecasted: false,
  });

  // ── PAGE-BASED MODEL (v2) ─────────────────────────────────────────
  // Source of truth for the new wizard. We mirror this into
  // config.sections via the effect below so the existing PDF / Excel
  // generators (which read config.sections) keep working unchanged.
  const [pages, setPages] = useState<PageEntry[]>(() =>
    DEFAULT_PAGE_ORDER.map((id) => ({
      id,
      // Standard preset by default — matches what most users want for a
      // monthly statement: chrome + summary + categories + accounts + ledger.
      enabled: PRESETS.standard.includes(id),
    }))
  );
  const [activePreset, setActivePreset] = useState<PresetId | 'custom'>('standard');
  const [draggingId, setDraggingId] = useState<PageId | null>(null);
  const [hoverId, setHoverId] = useState<PageId | null>(null);

  // Keep config.sections in sync with the page selection so the legacy
  // generators (which still read config.sections) stay correct without
  // rewrites. Phase 2 will replace those generators with page-aware
  // renderers and this bridge will go away.
  useEffect(() => {
    const next = pages
      .filter((p) => p.enabled)
      .map((p) => PAGE_TO_SECTION[p.id])
      .filter((s): s is ReportSection => s !== null);
    setConfig((prev) =>
      JSON.stringify(prev.sections) === JSON.stringify(next) ? prev : { ...prev, sections: next }
    );
  }, [pages]);

  const enabledPageCount = pages.filter((p) => p.enabled).length;
  const totalToggleablePages = pages.filter((p) => !PAGE_DEFS[p.id].required).length;

  const togglePage = useCallback((id: PageId) => {
    if (PAGE_DEFS[id].required) return;
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
    setActivePreset('custom');
  }, []);

  const applyPreset = useCallback((preset: PresetId) => {
    const target = new Set(PRESETS[preset]);
    setPages((prev) =>
      // Re-order so preset pages appear in their default order at top of
      // the rail, then the disabled rest in their default order too.
      DEFAULT_PAGE_ORDER.map((id) => ({
        id,
        enabled: target.has(id) || PAGE_DEFS[id].required,
      }))
    );
    setActivePreset(preset);
  }, []);

  const movePage = useCallback((sourceId: PageId, targetId: PageId) => {
    if (sourceId === targetId) return;
    if (PAGE_DEFS[sourceId].required || PAGE_DEFS[targetId].required) return;
    setPages((prev) => {
      const src = prev.findIndex((p) => p.id === sourceId);
      const dst = prev.findIndex((p) => p.id === targetId);
      if (src === -1 || dst === -1) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(src, 1);
      copy.splice(dst, 0, item);
      return copy;
    });
    setActivePreset('custom');
  }, []);

  const selectAllPages = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, enabled: true })));
    setActivePreset('custom');
  }, []);
  const selectNonePages = useCallback(() => {
    setPages((prev) => prev.map((p) => ({ ...p, enabled: !!PAGE_DEFS[p.id].required })));
    setActivePreset('custom');
  }, []);
  const resetDefaultPages = useCallback(() => applyPreset('standard'), [applyPreset]);

  const { accounts, transactions } = useFinancialData();
  const { debts, scheduledPayments: scheduledDebtPayments } = useDebts();
  const { installmentPayments } = useInstallmentPayments();
  const { specialBudgets } = useSpecialBudgets();

  // Chart refs for PDF export
  // Phase 2 renders every chart natively via jsPDF; the off-screen
  // Recharts capture pipeline has been removed.

  // Calculate actual date range based on period type. Bounds come from
  // the shared periodUtils (custom periods normalized to whole days there,
  // so noon-anchored picker dates can't exclude first-day transactions).
  const actualDates = useMemo(() => {
    const range = resolvePeriodRange(
      config.periodType,
      config.startDate,
      { from: config.startDate, to: config.endDate },
    );
    return { start: range.from, end: range.to };
  }, [config.periodType, config.startDate, config.endDate]);

  const { stats, categoryChartData, balanceEvolutionData, incomeAnalysis, recurringData } = useReportsData(
    config.periodType === 'custom' || config.periodType === 'quarter' ? 'custom' : config.periodType === 'year' ? 'year' : 'month',
    config.startDate,
    { from: actualDates.start, to: actualDates.end },
    false,
    config.dateType
  );

  // Filter transactions for the period
  const filteredTransactions = useMemo(() => {
    return filterByPeriod(transactions, actualDates.start, actualDates.end, config.dateType)
      .sort((a, b) => getTxDate(a, config.dateType).getTime() - getTxDate(b, config.dateType).getTime());
  }, [transactions, actualDates, config.dateType]);

  // Calculate evolution data for charts
  const evolutionChartData = useMemo(() => {
    const days = eachDayOfInterval({ start: actualDates.start, end: actualDates.end });
    let runningBalance = stats.initialBalance;

    return days.map(day => {
      const dayTransactions = filteredTransactions.filter(t =>
        isSameDay(getTxDate(t, config.dateType), day)
      );

      const dayIncome = dayTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const dayExpense = dayTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      runningBalance += dayIncome - dayExpense;

      return {
        date: format(day, 'd MMM', { locale }),
        balance: runningBalance,
        income: dayIncome,
        expense: dayExpense
      };
    });
  }, [actualDates, filteredTransactions, stats.initialBalance, config.dateType, locale]);

  const toggleSection = (section: ReportSection) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.includes(section)
        ? prev.sections.filter(s => s !== section)
        : [...prev.sections, section]
    }));
  };

  const handlePeriodPreset = (preset: string) => {
    const now = new Date();
    switch (preset) {
      case 'thisMonth':
        setConfig(prev => ({ ...prev, periodType: 'month', startDate: now }));
        break;
      case 'lastMonth':
        setConfig(prev => ({ ...prev, periodType: 'month', startDate: subMonths(now, 1) }));
        break;
      case 'thisQuarter':
        setConfig(prev => ({ ...prev, periodType: 'quarter', startDate: now }));
        break;
      case 'thisYear':
        setConfig(prev => ({ ...prev, periodType: 'year', startDate: now }));
        break;
    }
  };

  /* ──────────────────────────────────────────────────────────────────
   * PDF GENERATION — statement-style, page-driven
   *
   * Each enabled page is laid out from scratch with portrait A4 chrome
   * (logo + period + page no top, brand + ref + page no bottom, plus a
   * heavy bottom-rule strip showing the section's headline figure).
   *
   * Fonts: jsPDF's built-in Helvetica (Geist substitute) and Courier
   * (Geist Mono substitute). Embedding Geist would add ~250 KB to the
   * bundle; the substitutes are visually close enough for a statement
   * document and ship for free.
   * ────────────────────────────────────────────────────────────────── */
  const generatePDF = async () => {
    await generateReportPdf({
      stats,
      categoryChartData,
      evolutionChartData,
      incomeAnalysis,
      recurringData,
      accounts,
      transactions,
      filteredTransactions,
      specialBudgets,
      config: { dateType: config.dateType, periodType: config.periodType },
      actualDates: { start: actualDates.start, end: actualDates.end },
      pages,
      locale,
      t,
      formatCurrency,
      forecast: {
        includeForecasted: config.includeForecasted,
        installmentPayments,
        debts,
        scheduledDebtPayments,
      },
    });
  };

  // Excel Generation
  const generateExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const formatNum = (n: number) => Number(n.toFixed(2));
    // All user-visible workbook strings go through i18n (keys under
    // reports.excel.*) so English users no longer get a French document.
    const L = (key: string, defaultValue: string) => t(`reports.excel.${key}`, { defaultValue });

    // Summary sheet
    if (config.sections.includes('summary')) {
      const summaryData = [
        [L('title', 'Financial report')],
        [`${L('periodLabel', 'Period')}: ${format(actualDates.start, 'dd/MM/yyyy')} - ${format(actualDates.end, 'dd/MM/yyyy')}`],
        [`${L('generatedLabel', 'Generated on')}: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
        [],
        [L('summaryTitle', 'Summary')],
        [L('income', 'Income'), formatNum(stats.income)],
        [L('expenses', 'Expenses'), formatNum(stats.expenses)],
        [L('netBalance', 'Net balance'), formatNum(stats.netPeriodBalance)],
        [L('initialBalance', 'Opening balance'), formatNum(stats.initialBalance)],
        [L('finalBalance', 'Closing balance'), formatNum(stats.finalBalance)],
      ];
      const ws = XLSX.utils.aoa_to_sheet(summaryData);
      ws['!cols'] = [{ wch: 20 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, L('summarySheet', 'Summary'));
    }

    // Accounts sheet
    if (config.sections.includes('accounts')) {
      const data = [
        [L('accountsTitle', 'Account balances')],
        [],
        [L('account', 'Account'), L('bank', 'Bank'), L('type', 'Type'), L('balance', 'Balance')],
        ...accounts.map(a => [a.name, a.bank, a.account_type, formatNum(Number(a.balance))])
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, L('accountsSheet', 'Accounts'));
    }

    // Categories sheet
    if (config.sections.includes('categories')) {
      const data = [
        [L('categoriesTitle', 'Expenses by category')],
        [],
        [L('category', 'Category'), L('amount', 'Amount'), L('share', 'Share (%)')],
        ...categoryChartData
          .filter(c => c.spent > 0)
          .sort((a, b) => b.spent - a.spent)
          .map(c => [
            c.name,
            formatNum(c.spent),
            stats.expenses > 0 ? Number(((c.spent / stats.expenses) * 100).toFixed(1)) : 0
          ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, L('categoriesSheet', 'Categories'));
    }

    // Income sheet
    if (config.sections.includes('income') && incomeAnalysis.length > 0) {
      const data = [
        [L('incomeTitle', 'Income by category')],
        [],
        [L('source', 'Source'), L('amount', 'Amount'), L('share', 'Share (%)'), L('count', 'Count')],
        ...incomeAnalysis.map(i => [
          i.category,
          formatNum(i.totalAmount),
          stats.income > 0 ? Number(((i.totalAmount / stats.income) * 100).toFixed(1)) : 0,
          i.count
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, L('incomeSheet', 'Income'));
    }

    // Budgets sheet
    if (config.sections.includes('budgets')) {
      const budgetCats = categoryChartData.filter(c => c.budget > 0);
      // Special (event/trip) budgets relevant to the period — spend scoped
      // to the report range, compared to the lifetime envelope.
      const specialSummaries = specialBudgetsForPeriod(
        specialBudgets,
        filteredTransactions,
        actualDates.start,
        actualDates.end,
      );
      const statusOver = L('statusOver', 'Over budget');
      const statusWarn = L('statusWarn', 'Warning');
      const statusOk = L('statusOk', 'OK');
      if (budgetCats.length > 0 || specialSummaries.length > 0) {
        const data: (string | number)[][] = [
          [L('budgetsTitle', 'Budget tracking')],
          [],
          [L('category', 'Category'), L('spent', 'Spent'), L('budget', 'Budget'), L('remaining', 'Remaining'), L('usedPct', '% Used'), L('status', 'Status')],
          ...budgetCats.map(c => {
            const pct = c.budget > 0 ? (c.spent / c.budget * 100) : 0;
            return [
              c.name,
              formatNum(c.spent),
              formatNum(c.budget),
              formatNum(c.budget - c.spent),
              Number(pct.toFixed(0)),
              pct >= 100 ? statusOver : pct >= 80 ? statusWarn : statusOk
            ];
          })
        ];
        if (specialSummaries.length > 0) {
          data.push([], [L('specialBudgetsTitle', 'Special budgets')], [L('name', 'Name'), L('spentPeriod', 'Spent (period)'), L('totalBudget', 'Total budget'), L('remaining', 'Remaining'), L('usedPct', '% Used'), L('status', 'Status')]);
          for (const s of specialSummaries) {
            const pct = s.total > 0 ? (s.spent / s.total * 100) : 0;
            const statut = s.budget.status === 'closed'
              ? L('statusClosed', 'Closed')
              : s.over ? statusOver : pct >= 80 ? statusWarn : statusOk;
            data.push([
              s.budget.name,
              formatNum(s.spent),
              formatNum(s.total),
              formatNum(s.remaining),
              Number(pct.toFixed(0)),
              statut,
            ]);
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, L('budgetsSheet', 'Budgets'));
      }
    }

    // Transactions sheet
    if (config.sections.includes('transactions')) {
      let runningBalance = stats.initialBalance;
      const txRows = filteredTransactions.map(tx => {
        // Transfers between own accounts are globally balance-neutral
        // except for their fee; using the fee as the signed amount keeps
        // the Amount column reconciling with the running Balance column.
        const signed = signedGlobalAmount(tx);
        runningBalance += signed;

        return [
          format(getTxDate(tx, config.dateType), 'dd/MM/yyyy'),
          accounts.find(a => a.id === tx.account_id)?.name || '',
          tx.description,
          tx.category?.name || '',
          tx.type === 'income' ? t('transactions.income') : tx.type === 'expense' ? t('transactions.expense') : t('transactions.transfer'),
          signed,
          formatNum(runningBalance)
        ];
      });

      const data = [
        [L('transactionsTitle', 'Transactions')],
        [],
        [L('date', 'Date'), L('account', 'Account'), L('description', 'Description'), L('category', 'Category'), L('type', 'Type'), L('amount', 'Amount'), L('balance', 'Balance')],
        ...txRows
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 40 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, L('transactionsSheet', 'Transactions'));
    }

    XLSX.writeFile(wb, `${L('fileprefix', 'report')}-${format(actualDates.start, 'yyyy-MM')}.xlsx`);
  };

  const handleGenerate = async () => {
    if (config.sections.length === 0) {
      toast({
        title: "Erreur",
        description: t("reports.selectAtLeastOne", { defaultValue: "Select at least one section to include" }),
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      if (config.format === 'pdf') {
        await generatePDF();
      } else {
        await generateExcel();
      }
      toast({
        title: "Rapport genere",
        description: `Le fichier ${config.format.toUpperCase()} a ete telecharge`
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Erreur",
        description: t("reports.generateError", { defaultValue: "Unable to generate the report" }),
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-5">
      {/* Format Selection - Apple style cards */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t('reports.format', { defaultValue: 'Report format' })}</Label>
        <div className="grid grid-cols-2 gap-3">
          <div
            className={cn(
              "relative cursor-pointer rounded-xl p-4 transition-all duration-200",
              "border bg-card",
              config.format === 'pdf'
                ? "border-primary bg-primary/5 to-primary/10 shadow-lg shadow-primary/10"
                : "border-border/50 from-muted/30 to-muted/10 hover:border-muted-foreground/30 hover:shadow-md"
            )}
            onClick={() => setConfig(prev => ({ ...prev, format: 'pdf' }))}
          >
            {config.format === 'pdf' && (
              <div className="absolute top-2 right-2">
                <Check className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "p-3 rounded-xl",
                config.format === 'pdf' ? "bg-primary/10" : "bg-muted"
              )}>
                <FileText className={cn("h-6 w-6", config.format === 'pdf' ? "text-primary" : "text-muted-foreground")} />
              </div>
              <span className="font-semibold text-sm">PDF</span>
              <span className="text-[11px] text-muted-foreground text-center leading-tight">Avec graphiques</span>
            </div>
          </div>
          <div
            className={cn(
              "relative cursor-pointer rounded-xl p-4 transition-all duration-200",
              "border bg-card",
              config.format === 'excel'
                ? "border-green-500 bg-green-500/5 to-green-500/10 shadow-lg shadow-green-500/10"
                : "border-border/50 from-muted/30 to-muted/10 hover:border-muted-foreground/30 hover:shadow-md"
            )}
            onClick={() => setConfig(prev => ({ ...prev, format: 'excel' }))}
          >
            {config.format === 'excel' && (
              <div className="absolute top-2 right-2">
                <Check className="h-4 w-4 text-green-500" />
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "p-3 rounded-xl",
                config.format === 'excel' ? "bg-green-500/10" : "bg-muted"
              )}>
                <FileSpreadsheet className={cn("h-6 w-6", config.format === 'excel' ? "text-green-500" : "text-muted-foreground")} />
              </div>
              <span className="font-semibold text-sm">Excel</span>
              <span className="text-[11px] text-muted-foreground text-center leading-tight">Donnees brutes</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Period Selection - Apple style pills */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t('reports.period')}</Label>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'thisMonth', label: t('reports.thisMonth'), active: config.periodType === 'month' && config.startDate.getMonth() === new Date().getMonth() },
            { key: 'lastMonth', label: t('reports.lastMonth'), active: false },
            { key: 'thisQuarter', label: 'Trimestre', active: config.periodType === 'quarter' },
            { key: 'thisYear', label: t('reports.thisYear'), active: config.periodType === 'year' },
          ].map(({ key, label, active }) => (
            <button
              key={key}
              onClick={() => handlePeriodPreset(key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={config.periodType}
              onValueChange={(v: any) => setConfig(prev => ({ ...prev, periodType: v }))}
            >
              <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Annee</SelectItem>
                <SelectItem value="custom">{t('reports.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Select
              value={config.dateType}
              onValueChange={(v: any) => setConfig(prev => ({ ...prev, dateType: v }))}
            >
              <SelectTrigger className="h-10 rounded-xl bg-muted/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accounting">{t('settings.accountingDate')}</SelectItem>
                <SelectItem value="value">{t('settings.valueDate')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.periodType === 'month' && (
          <MonthPicker
            value={config.startDate}
            onChange={(d) => setConfig(prev => ({ ...prev, startDate: d || new Date() }))}
            className="rounded-xl bg-muted/30 border-border/50"
          />
        )}
        {config.periodType === 'year' && (
          <YearPicker
            value={config.startDate}
            onChange={(d) => setConfig(prev => ({ ...prev, startDate: d || new Date() }))}
            className="rounded-xl bg-muted/30 border-border/50"
          />
        )}
        {config.periodType === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('common.from', { defaultValue: 'From' })}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-10 rounded-xl bg-muted/30 border-border/50 justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(config.startDate, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={config.startDate}
                    onSelect={(d) => d && setConfig(prev => ({ ...prev, startDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('common.to', { defaultValue: 'To' })}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-10 rounded-xl bg-muted/30 border-border/50 justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(config.endDate, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={config.endDate}
                    onSelect={(d) => d && setConfig(prev => ({ ...prev, endDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>

      {/* Forecast toggle — always visible so users discover it. Disabled
       *  with a hint when the period ends in the past (nothing to project). */}
      {(() => {
        const hasFuture = actualDates.end.getTime() > Date.now();
        return (
          <label
            className={cn(
              'flex items-center gap-3 p-3 bg-bg-subtle rounded-xl border border-line',
              hasFuture ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed',
            )}
          >
            <Checkbox
              checked={config.includeForecasted && hasFuture}
              disabled={!hasFuture}
              onCheckedChange={(v) =>
                setConfig((prev) => ({ ...prev, includeForecasted: v === true }))
              }
            />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {t('reports.includeForecasted.label', { defaultValue: 'Include forecasted entries' })}
              </div>
              <div className="text-xs text-muted-foreground">
                {hasFuture
                  ? t('reports.includeForecasted.hint', {
                      defaultValue:
                        'Adds upcoming recurring transactions, scheduled debt payments and remaining installments through the end of the period. Tagged as forecast in the report.',
                    })
                  : t('reports.includeForecasted.hintPastOnly', {
                      defaultValue:
                        'Period ends in the past — nothing to forecast. Pick a period that extends into the future to enable this.',
                    })}
              </div>
            </div>
          </label>
        );
      })()}

      {/* Selected Period Display - Apple style card */}
      <div className="p-4 bg-bg-subtle rounded-xl border border-line">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{t('reports.period')}:</span>
          <span className="font-semibold text-foreground">
            {format(actualDates.start, 'dd MMM yyyy', { locale })} - {format(actualDates.end, 'dd MMM yyyy', { locale })}
          </span>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Sections a inclure</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (config.sections.length === Object.keys(SECTION_INFO).length) {
              setConfig(prev => ({ ...prev, sections: ['summary'] }));
            } else {
              setConfig(prev => ({ ...prev, sections: Object.keys(SECTION_INFO) as ReportSection[] }));
            }
          }}
        >
          {config.sections.length === Object.keys(SECTION_INFO).length ? 'Deselectionner tout' : 'Tout selectionner'}
        </Button>
      </div>

      <ScrollArea className={isMobile ? "h-[300px]" : "h-[350px]"}>
        <div className="space-y-2 pr-4">
          {(Object.entries(SECTION_INFO) as [ReportSection, typeof SECTION_INFO[ReportSection]][]).map(([key, info]) => {
            const Icon = info.icon;
            const isSelected = config.sections.includes(key);
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                )}
                onClick={() => toggleSection(key)}
              >
                <Checkbox checked={isSelected} />
                <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium text-sm", isSelected && "text-primary")}>{t(info.labelKey, { defaultValue: info.labelDefault })}</p>
                  <p className="text-xs text-muted-foreground">{t(info.descKey, { defaultValue: info.descDefault })}</p>
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{config.sections.length}</span> section(s) selectionnee(s)
        </p>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
        <h3 className="font-medium">{t('reports.summary', { defaultValue: 'Report summary' })}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-muted-foreground">Format</div>
          <div className="font-medium flex items-center gap-1">
            {config.format === 'pdf' ? <FileText className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
            {config.format.toUpperCase()}
          </div>
          <div className="text-muted-foreground">Periode</div>
          <div className="font-medium">
            {format(actualDates.start, 'dd/MM/yy')} - {format(actualDates.end, 'dd/MM/yy')}
          </div>
          <div className="text-muted-foreground">Type de date</div>
          <div className="font-medium">{config.dateType === 'accounting' ? 'Comptable' : 'Valeur'}</div>
          <div className="text-muted-foreground">Transactions</div>
          <div className="font-medium">{filteredTransactions.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t('reports.includedSections', { defaultValue: 'Included sections' })}</Label>
        <div className="flex flex-wrap gap-2">
          {config.sections.map(s => (
            <Badge key={s} variant="secondary" className="gap-1">
              {t(SECTION_INFO[s].labelKey, { defaultValue: SECTION_INFO[s].labelDefault })}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t('reports.data', { defaultValue: 'Report data' })}</Label>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Revenus</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(stats.income)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Depenses</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(stats.expenses)}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  // Period preset pills.
  const periodPresets = [
    { key: 'thisMonth', label: t('reports.thisMonth', { defaultValue: 'This month' }) },
    { key: 'lastMonth', label: t('reports.lastMonth', { defaultValue: 'Last month' }) },
    { key: 'thisQuarter', label: t('reports.thisQuarter', { defaultValue: 'This quarter' }) },
    { key: 'thisYear', label: t('reports.thisYear', { defaultValue: 'YTD' }) },
    { key: 'lastYear', label: t('reports.lastYear', { defaultValue: 'Last year' }) },
  ] as const;
  const today = new Date();
  const isPresetActive = (key: string): boolean => {
    const startOfThisMonth = startOfMonth(today);
    const startOfLastMonth = startOfMonth(subMonths(today, 1));
    const startOfThisQuarter = startOfQuarter(today);
    const startOfThisYear = startOfYear(today);
    const startOfLastYear = startOfYear(subMonths(today, 12));
    if (key === 'thisMonth') return isSameDay(config.startDate, startOfThisMonth);
    if (key === 'lastMonth') return isSameDay(config.startDate, startOfLastMonth);
    if (key === 'thisQuarter') return isSameDay(config.startDate, startOfThisQuarter);
    if (key === 'thisYear') return isSameDay(config.startDate, startOfThisYear);
    if (key === 'lastYear') return isSameDay(config.startDate, startOfLastYear);
    return false;
  };

  // Page / transaction counts surfaced in the v2 wizard footer and the
  // thumbnail badges. Multi-page ledger contributes one A4 per 40 rows.
  const txCount = filteredTransactions.length;
  const includesTx = pages.find((p) => p.id === 'transactions')?.enabled ?? false;
  const ledgerPages = includesTx ? Math.max(1, Math.ceil(txCount / 40)) : 0;
  const documentPages = enabledPageCount + Math.max(0, ledgerPages - (includesTx ? 1 : 0));
  const estimatedKb = Math.round(60 + documentPages * 32 + (includesTx ? txCount * 0.4 : 0));

  // Per-page thumbnail body shown inside an A4-aspect card in the
  // preview pane. Kept abstract (placeholder lines and stripes) so the
  // wizard works even before Phase 2 (real page renderers) ships.
  const renderPageThumbBody = (id: PageId) => {
    const line = (w: string, opts?: { bold?: boolean; tall?: boolean }) => (
      <div
        className={cn(
          "rounded-[1px]",
          opts?.bold ? "bg-foreground" : "bg-muted-foreground/40",
          opts?.tall ? "h-2" : "h-1"
        )}
        style={{ width: w }}
      />
    );
    switch (id) {
      case 'cover':
        return (
          <div className="flex h-full flex-col justify-between">
            <div className="space-y-1.5">
              <div className="h-1.5 w-12 rounded-[1px] bg-muted-foreground/40" />
              <div className="h-3 w-32 rounded-[1px] bg-foreground" />
            </div>
            <div className="space-y-1">
              {line('60%')}
              {line('50%')}
              {line('70%')}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-foreground pt-2">
              <div className="space-y-1"><div className="h-1 w-8 bg-muted-foreground/40 rounded-[1px]"/><div className="h-2 w-12 bg-pos rounded-[1px]"/></div>
              <div className="space-y-1"><div className="h-1 w-8 bg-muted-foreground/40 rounded-[1px]"/><div className="h-2 w-12 bg-neg rounded-[1px]"/></div>
              <div className="space-y-1"><div className="h-1 w-8 bg-muted-foreground/40 rounded-[1px]"/><div className="h-2 w-12 bg-foreground rounded-[1px]"/></div>
            </div>
          </div>
        );
      case 'contents':
        return (
          <div className="space-y-1.5 pt-1">
            <div className="h-2 w-20 rounded-[1px] bg-foreground border-b border-foreground pb-0.5" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="h-1 w-4 rounded-[1px] bg-muted-foreground/40" />
                <div className="flex-1 border-b border-dotted border-muted-foreground/40 h-0.5" />
                <div className="h-1 w-3 rounded-[1px] bg-foreground" />
              </div>
            ))}
          </div>
        );
      case 'summary':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1 border border-line p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="h-0.5 w-full bg-muted-foreground/30 rounded-[1px]" />
                  <div className={cn("h-1.5 rounded-[1px]", i === 1 ? "bg-neg" : i === 2 ? "bg-pos" : "bg-foreground")} />
                </div>
              ))}
            </div>
            {line('80%')}{line('60%')}
            <div className="flex items-center gap-2 pt-1">
              <div className="h-10 w-10 rounded-full border-[3px] border-foreground" style={{ borderRightColor: 'transparent', borderTopColor: 'transparent' }} />
              <div className="flex-1 space-y-1">
                {line('70%')}{line('50%')}{line('40%')}
              </div>
            </div>
          </div>
        );
      case 'cashflow':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1 border border-line p-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="h-0.5 w-full bg-muted-foreground/30 rounded-[1px]" />
                  <div className={cn("h-1.5 rounded-[1px]", i === 0 ? "bg-pos" : i === 1 ? "bg-neg" : "bg-foreground")} />
                </div>
              ))}
            </div>
            <div className="flex items-end gap-px h-12">
              {Array.from({ length: 22 }).map((_, i) => {
                const h = 12 + ((i * 7) % 28);
                return <div key={i} className="flex-1 bg-foreground rounded-[1px]" style={{ height: `${h}px` }} />;
              })}
            </div>
          </div>
        );
      case 'categories':
        return (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-1 w-12 rounded-[1px] bg-foreground" />
                <div className="flex-1 h-1 bg-muted-foreground/20 rounded-[1px] overflow-hidden">
                  <div className="h-full bg-foreground" style={{ width: `${90 - i * 9}%` }} />
                </div>
                <div className="h-1 w-6 rounded-[1px] bg-muted-foreground/40" />
              </div>
            ))}
          </div>
        );
      case 'budgets':
        return (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => {
              const over = i === 1;
              return (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="h-1 w-14 rounded-[1px] bg-foreground" />
                    <div className={cn("h-1 w-5 rounded-[1px]", over ? "bg-neg" : "bg-muted-foreground/40")} />
                  </div>
                  <div className="h-1 bg-muted-foreground/20 rounded-[1px] overflow-hidden">
                    <div className={cn("h-full", over ? "bg-neg" : "bg-foreground")} style={{ width: over ? '100%' : `${50 + i * 8}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      case 'accounts':
        return (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-line/60 pb-1">
                <div className="space-y-0.5">
                  <div className="h-1 w-16 rounded-[1px] bg-foreground" />
                  <div className="h-0.5 w-10 rounded-[1px] bg-muted-foreground/30" />
                </div>
                <div className={cn("h-1 w-10 rounded-[1px]", i === 2 ? "bg-neg" : "bg-foreground")} />
              </div>
            ))}
            <div className="flex items-center justify-between border-t-2 border-foreground pt-1">
              <div className="h-1 w-12 rounded-[1px] bg-foreground" />
              <div className="h-1.5 w-12 rounded-[1px] bg-foreground" />
            </div>
          </div>
        );
      case 'income':
        return (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-pos" />
                <div className="flex-1 h-1 bg-muted-foreground/20 rounded-[1px] overflow-hidden">
                  <div className="h-full bg-pos" style={{ width: `${85 - i * 18}%` }} />
                </div>
                <div className="h-1 w-8 rounded-[1px] bg-pos" />
              </div>
            ))}
          </div>
        );
      case 'recurring':
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between border-b border-foreground pb-0.5">
              <div className="h-1 w-12 rounded-[1px] bg-foreground" />
              <div className="h-1 w-10 rounded-[1px] bg-foreground" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-1 w-16 rounded-[1px] bg-muted-foreground/60" />
                <div className="h-1 w-8 rounded-[1px] bg-muted-foreground/40" />
                <div className="h-1 w-6 rounded-[1px] bg-foreground" />
              </div>
            ))}
          </div>
        );
      case 'transactions':
        return (
          <div className="space-y-0.5">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1 border-b border-line/40 pb-0.5">
                <div className="h-0.5 w-6 rounded-[1px] bg-muted-foreground/30" />
                <div className="h-0.5 flex-1 rounded-[1px] bg-foreground/70" />
                <div className="h-0.5 w-8 rounded-[1px] bg-muted-foreground/40" />
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  // Renders a single A4-aspect thumbnail card for the preview pane.
  const A4Thumb = ({ pageId, idx }: { pageId: PageId; idx: number }) => {
    const def = PAGE_DEFS[pageId];
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">
          {t('reports.pageBadge', {
            n: String(idx + 1).padStart(2, '0'),
            name: t(def.labelKey, { defaultValue: def.labelDefault }),
            defaultValue: `Page ${String(idx + 1).padStart(2, '0')} · ${t(def.labelKey, { defaultValue: def.labelDefault })}`,
          })}
        </div>
        <div
          className="bg-card border border-line shadow-sm overflow-hidden flex flex-col"
          style={{ width: '200px', height: '283px' /* ≈ 1:1.414 portrait A4 */ }}
        >
          {/* Top chrome */}
          <div className="px-3 pt-2 pb-1.5 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 bg-foreground rounded-sm" />
              <div className="font-mono text-[6px] font-semibold text-foreground/80">SPENDING TRACKER</div>
            </div>
            <div className="font-mono text-[6px] text-muted-foreground">{String(idx + 1).padStart(2, '0')} / {String(enabledPageCount).padStart(2, '0')}</div>
          </div>
          {/* Body */}
          <div className="flex-1 px-3 py-2 overflow-hidden">
            <div className="flex items-end justify-between border-b border-foreground pb-1 mb-2">
              <div className="space-y-0.5">
                <div className="font-mono text-[6px] tracking-[0.12em] uppercase text-muted-foreground">
                  {t('reports.sectionLabel', { num: def.num, defaultValue: `Section ${def.num}` })}
                </div>
                <div className="text-[10px] font-semibold leading-tight">
                  {t(def.labelKey, { defaultValue: def.labelDefault })}
                </div>
              </div>
            </div>
            {renderPageThumbBody(pageId)}
          </div>
          {/* Bottom rule + footer */}
          <div className="px-3 py-1 border-t border-line">
            <div className="font-mono text-[6px] text-muted-foreground flex justify-between">
              <span>SPENDING TRACKER · REPORT</span>
              <span>{String(idx + 1).padStart(2, '0')} / {String(enabledPageCount).padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Order matters for the preview: walk pages in their current order and
  // only render the enabled ones.
  const enabledPagesInOrder = pages
    .map((p, i) => ({ ...p, displayIdx: i }))
    .filter((p) => p.enabled);

  const periodSummary = `${format(actualDates.start, 'd MMM', { locale })} → ${format(actualDates.end, 'd MMM yyyy', { locale })}`;

  // Single-screen layout — toolbar at top (presets + period + date
  // type), two-column body (page rail + preview), footer with format
  // and Generate action. Matches the v2 design.
  const content = (
    <div className="flex flex-col flex-1 min-h-0 -mx-6 -mb-6">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="border-t border-line bg-bg-subtle/40 flex-shrink-0">
        {/* Presets row */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-line flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground font-medium">
            {t('reports.presetLabel', { defaultValue: 'Preset' })}
          </span>
          {(['standard', 'detailed', 'taxReady', 'receipts'] as PresetId[]).map((p) => {
            const presetKey =
              p === 'standard' ? 'reports.presetStandard'
                : p === 'detailed' ? 'reports.presetDetailed'
                : p === 'taxReady' ? 'reports.presetTaxReady'
                : 'reports.presetReceipts';
            const fallback =
              p === 'standard' ? 'Standard'
                : p === 'detailed' ? 'Detailed'
                : p === 'taxReady' ? 'Tax-ready'
                : 'Receipts only';
            return (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                  activePreset === p
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card border-line text-foreground/80 hover:bg-bg-hover'
                )}
              >
                {activePreset === p && <span className="mr-1 text-[8px]">●</span>}
                {t(presetKey, { defaultValue: fallback })}
              </button>
            );
          })}
          {activePreset === 'custom' && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-warning/10 text-warning border border-warning/30">
              {t('reports.presetCustom', { defaultValue: 'Custom' })}
            </span>
          )}
        </div>

        {/* Period + date type row */}
        <div className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground font-medium">
            {t('reports.period', { defaultValue: 'Period' })}
          </span>
          <div className="flex border border-line rounded-md p-0.5 bg-card">
            {(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'] as const).map((key) => {
              const periodKey =
                key === 'thisMonth' ? 'reports.periodThisMonth'
                  : key === 'lastMonth' ? 'reports.periodLastMonth'
                  : key === 'thisQuarter' ? 'reports.periodThisQuarter'
                  : 'reports.periodThisYear';
              const fallback =
                key === 'thisMonth' ? 'This month'
                  : key === 'lastMonth' ? 'Last month'
                  : key === 'thisQuarter' ? 'This quarter'
                  : 'YTD';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePeriodPreset(key)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    isPresetActive(key)
                      ? 'bg-foreground text-background'
                      : 'text-foreground/70 hover:bg-bg-hover'
                  )}
                >
                  {t(periodKey, { defaultValue: fallback })}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setConfig((p) => ({ ...p, periodType: 'custom' }))}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                config.periodType === 'custom'
                  ? 'bg-foreground text-background'
                  : 'text-foreground/70 hover:bg-bg-hover'
              )}
            >
              {t('common.custom', { defaultValue: 'Custom' })}
            </button>
          </div>

          {/* Inline pickers for month / year / custom */}
          {config.periodType === 'month' && (
            <MonthPicker
              value={config.startDate}
              onChange={(d) => d && setConfig(prev => ({ ...prev, startDate: d }))}
              className="h-7 w-auto text-xs"
            />
          )}
          {config.periodType === 'year' && (
            <YearPicker
              value={config.startDate}
              onChange={(d) => d && setConfig(prev => ({ ...prev, startDate: d }))}
              className="h-7 w-auto text-xs"
            />
          )}
          {config.periodType === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {format(config.startDate, 'dd/MM/yy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={config.startDate}
                    onSelect={(d) => d && setConfig(prev => ({ ...prev, startDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {format(config.endDate, 'dd/MM/yy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={config.endDate}
                    onSelect={(d) => d && setConfig(prev => ({ ...prev, endDate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            <Calendar className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            {periodSummary}
          </span>

          <Select
            value={config.dateType}
            onValueChange={(v: 'accounting' | 'value') => setConfig((p) => ({ ...p, dateType: v }))}
          >
            <SelectTrigger className="h-7 w-auto text-xs font-mono gap-1 ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accounting">
                {t('reports.byAccountingDate', { defaultValue: 'By accounting date' })}
              </SelectItem>
              <SelectItem value="value">
                {t('reports.byValueDate', { defaultValue: 'By value date' })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Forecast toggle row — visible whenever the period reaches
            past today. Greyed out with a hint otherwise so users still
            see the option exists. */}
        <div className="flex items-center gap-3 px-5 py-2 border-t border-line">
          <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground font-medium">
            {t('reports.forecastToolbarLabel', { defaultValue: 'Forecast' })}
          </span>
          {(() => {
            const hasFuture = actualDates.end.getTime() > Date.now();
            return (
              <label
                className={cn(
                  'flex items-center gap-2 cursor-pointer select-none',
                  !hasFuture && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Checkbox
                  checked={config.includeForecasted && hasFuture}
                  disabled={!hasFuture}
                  onCheckedChange={(v) =>
                    setConfig((prev) => ({ ...prev, includeForecasted: v === true }))
                  }
                  className="h-4 w-4"
                />
                <span className="text-xs font-medium">
                  {t('reports.includeForecasted.label', {
                    defaultValue: 'Include forecasted entries',
                  })}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {hasFuture
                    ? t('reports.includeForecasted.toolbarHint', {
                        defaultValue: 'recurring · installments · scheduled debt payments',
                      })
                    : t('reports.includeForecasted.hintPastOnly', {
                        defaultValue: 'Period ends in the past — nothing to forecast.',
                      })}
                </span>
              </label>
            );
          })()}
        </div>
      </div>

      {/* ── Body: page rail + preview. Flex-grows inside the dialog
            so the toolbar + footer always remain visible; the rail and
            preview each scroll internally. ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] flex-1 min-h-0 overflow-hidden">
        {/* Page rail */}
        <div className="border-r border-line flex flex-col bg-card min-h-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-line flex items-baseline justify-between">
            <div className="text-xs font-semibold">
              {t('reports.documentOutline', { defaultValue: 'Document outline' })}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              <span className="text-foreground font-semibold">{enabledPageCount - (PAGE_DEFS.cover.required ? 1 : 0)}</span>
              {' '}/ {totalToggleablePages}
            </div>
          </div>
          <div className="flex gap-1.5 px-3 py-1.5 border-b border-line bg-bg-subtle/40 text-[10px] font-mono uppercase tracking-[0.04em]">
            <button onClick={selectAllPages} className="text-muted-foreground hover:text-foreground hover:bg-bg-hover px-1 rounded">
              {t('reports.selectAllShort', { defaultValue: 'All' })}
            </button>
            <button onClick={selectNonePages} className="text-muted-foreground hover:text-foreground hover:bg-bg-hover px-1 rounded">
              {t('reports.selectNoneShort', { defaultValue: 'None' })}
            </button>
            <button onClick={resetDefaultPages} className="text-muted-foreground hover:text-foreground hover:bg-bg-hover px-1 rounded">
              {t('reports.selectDefault', { defaultValue: 'Default' })}
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-0.5">
              {pages.map((p) => {
                const def = PAGE_DEFS[p.id];
                const required = !!def.required;
                const isDragOver = hoverId === p.id && draggingId !== null && draggingId !== p.id;
                return (
                  <div
                    key={p.id}
                    draggable={!required}
                    onDragStart={(e) => {
                      if (required) {
                        e.preventDefault();
                        return;
                      }
                      setDraggingId(p.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnter={(e) => { e.preventDefault(); setHoverId(p.id); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDragLeave={(e) => {
                      // Only clear hover if leaving the row entirely
                      const related = e.relatedTarget as Node | null;
                      if (!related || !(e.currentTarget as Node).contains(related)) {
                        setHoverId((cur) => (cur === p.id ? null : cur));
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingId && draggingId !== p.id) movePage(draggingId, p.id);
                      setDraggingId(null);
                      setHoverId(null);
                    }}
                    onDragEnd={() => { setDraggingId(null); setHoverId(null); }}
                    className={cn(
                      'group flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors',
                      p.enabled ? 'bg-card border-transparent' : 'opacity-60 bg-card border-transparent',
                      isDragOver && 'border-foreground/40 bg-bg-subtle',
                      draggingId === p.id && 'opacity-30'
                    )}
                  >
                    <span
                      className={cn(
                        'font-mono text-[10px] text-muted-foreground/60 flex-shrink-0 select-none',
                        required ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
                      )}
                    >
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePage(p.id)}
                      disabled={required}
                      aria-label={t('reports.togglePage', { defaultValue: 'Toggle page' })}
                      className={cn(
                        'w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0',
                        p.enabled
                          ? 'bg-foreground border-foreground text-background'
                          : 'bg-card border-line',
                        required && 'cursor-not-allowed'
                      )}
                    >
                      {p.enabled && <Check className="h-2 w-2" strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[9px] text-muted-foreground/70 leading-none">
                        {t('reports.pageNum', { num: def.num, defaultValue: `PAGE ${def.num}` })}
                      </div>
                      <div className={cn('text-xs font-medium mt-0.5 truncate', !p.enabled && 'text-muted-foreground')}>
                        {t(def.labelKey, { defaultValue: def.labelDefault })}
                      </div>
                      <div className="font-mono text-[9px] text-muted-foreground mt-0.5 truncate">
                        {p.id === 'transactions'
                          ? t('reports.page.transactions.meta_dynamic', {
                              n: ledgerPages,
                              rows: txCount,
                              defaultValue: `${ledgerPages} page${ledgerPages !== 1 ? 's' : ''} · ${txCount} rows`,
                            })
                          : t(def.metaKey, { defaultValue: def.metaDefault })}
                      </div>
                    </div>
                    {required && (
                      <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/80 border border-line px-1 py-0.5 rounded">
                        {t('reports.required', { defaultValue: 'REQ' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="px-3 py-2 border-t border-line bg-bg-subtle/40 flex items-center justify-between font-mono text-[10px]">
            <span className="text-muted-foreground uppercase tracking-[0.06em]">
              {t('reports.pagesTotal', { defaultValue: 'Pages' })}
            </span>
            <span className="text-foreground font-semibold">{documentPages}</span>
          </div>
        </div>

        {/* Preview pane */}
        <div className="bg-bg-subtle/30 overflow-y-auto p-5">
          <div className="flex flex-col items-center gap-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold bg-card border border-line rounded-full px-2.5 py-1">
              {t('reports.a4Badge', { defaultValue: 'A4 portrait · 210 × 297 mm' })}
            </div>
            {enabledPagesInOrder.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10">
                {t('reports.noPagesSelected', { defaultValue: 'No pages selected. Pick a preset or check at least one page.' })}
              </div>
            ) : (
              enabledPagesInOrder.map((p, i) => (
                <A4Thumb key={p.id} pageId={p.id} idx={i} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="border-t border-line bg-card px-5 py-3 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span><b className="text-foreground/90 font-semibold">{documentPages}</b> {t('reports.pagesShort', { defaultValue: 'pages' })}</span>
          <span className="text-muted-foreground/50">·</span>
          <span><b className="text-foreground/90 font-semibold">{txCount}</b> {t('reports.transactionsShort', { defaultValue: 'transactions' })}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>≈ <b className="text-foreground/90 font-semibold">{estimatedKb} KB</b></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-line rounded-md p-0.5 bg-bg-subtle/40">
            {(['pdf', 'excel'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setConfig((p) => ({ ...p, format: fmt }))}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium uppercase font-mono transition-colors',
                  config.format === fmt
                    ? 'bg-foreground text-background'
                    : 'text-foreground/70 hover:bg-bg-hover'
                )}
              >
                {fmt}
              </button>
            ))}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || enabledPageCount === 0}
            className="h-9 text-sm gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.loading', { defaultValue: 'Generating...' })}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                {config.format === 'pdf'
                  ? t('reports.generatePdf', { defaultValue: 'Generate PDF' })
                  : t('reports.generateXls', { defaultValue: 'Generate Excel' })}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );


  // Step state is no longer used — keep referenced to satisfy lint with the
  // previous step1/2/3 helpers (they're unused but left in place for future
  // re-use without re-deriving the configuration logic).
  void step;
  void setStep;
  void totalSteps;
  void renderStep1;
  void renderStep2;
  void renderStep3;

  // Phase 2 draws every chart natively in jsPDF — the off-screen
  // chartsContainer that previously fed html2canvas is no longer
  // needed. Keep an empty fragment so the existing {chartsContainer}
  // mount points in the Drawer / Dialog don't need surgery.
  const chartsContainer = null;

  // Use Drawer on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <>
        {chartsContainer}
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[92vh] bg-background  border-t border-white/20 shadow-2xl">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted-foreground/20 my-3" />
            <DrawerHeader className="pb-2 px-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/12">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DrawerTitle className="text-lg font-semibold">
                    {t('reports.export')}
                  </DrawerTitle>
                  <DrawerDescription className="text-sm text-muted-foreground">
                    {t('reports.generate')}
                  </DrawerDescription>
                </div>
              </div>
            </DrawerHeader>
            <div className="px-6 pb-0 pt-2 overflow-y-auto flex-1">
              {content}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {chartsContainer}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          // v2 wizard sits at ~1200px wide on the design board. We use
          // max-w-6xl + flex column + overflow-hidden so the page rail
          // and preview pane can scroll independently of the chrome.
          // Note: keep `p-6` (not pb-0) so the content's `-mb-6` lands
          // flush with the dialog edge instead of extending below it,
          // which previously clipped the footer + Generate button.
          className="max-w-6xl w-[95vw] max-h-[92vh] p-6 overflow-hidden bg-background border border-line shadow-xl rounded-xl flex flex-col"
        >
          <DialogHeader className="pb-3 flex-shrink-0">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {t('reports.generateReport', { defaultValue: 'Generate report' })}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t('reports.generateSubtitle', {
                defaultValue: 'Pick pages, set period, export. Reorder by dragging.',
              })}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
};
