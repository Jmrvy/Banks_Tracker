import { useState, useMemo, useRef, useCallback } from "react";
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
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfQuarter, endOfQuarter, subMonths, eachDayOfInterval, isSameDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
// Heavy export libs (jspdf, jspdf-autotable, html2canvas, xlsx) are loaded
// dynamically inside the export handlers to keep them out of the initial bundle.
import { toast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useReportsData } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateUtils";
import {
  CategoryPieChart,
  BalanceEvolutionChart,
  IncomeExpensesChart,
  BudgetProgressChart,
  SummaryCards,
  TopCategoriesChart
} from "@/components/reports/ReportCharts";

interface ReportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ReportSection =
  | 'summary'
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'income'
  | 'budgets'
  | 'evolution'
  | 'recurring';

interface ReportConfig {
  format: 'pdf' | 'excel';
  periodType: 'month' | 'quarter' | 'year' | 'custom';
  startDate: Date;
  endDate: Date;
  dateType: 'accounting' | 'value';
  sections: ReportSection[];
  includeCharts: boolean;
  groupByAccount: boolean;
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

export const ReportWizard = ({ open, onOpenChange }: ReportWizardProps) => {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const locale = i18n.language === 'fr' ? fr : enUS;

  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const totalSteps = 3;

  const [config, setConfig] = useState<ReportConfig>({
    format: 'pdf',
    periodType: 'month',
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date()),
    dateType: 'accounting',
    sections: DEFAULT_SECTIONS,
    includeCharts: true,
    groupByAccount: false,
  });

  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();

  // Chart refs for PDF export
  const summaryChartRef = useRef<HTMLDivElement>(null);
  const categoryPieRef = useRef<HTMLDivElement>(null);
  const evolutionChartRef = useRef<HTMLDivElement>(null);
  const incomeExpenseRef = useRef<HTMLDivElement>(null);
  const budgetChartRef = useRef<HTMLDivElement>(null);
  const topCategoriesRef = useRef<HTMLDivElement>(null);
  const [chartsReady, setChartsReady] = useState(false);

  // Calculate actual date range based on period type
  const actualDates = useMemo(() => {
    const now = new Date();
    switch (config.periodType) {
      case 'month':
        return { start: startOfMonth(config.startDate), end: endOfMonth(config.startDate) };
      case 'quarter':
        return { start: startOfQuarter(config.startDate), end: endOfQuarter(config.startDate) };
      case 'year':
        return { start: startOfYear(config.startDate), end: endOfYear(config.startDate) };
      case 'custom':
        return { start: config.startDate, end: config.endDate };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
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
    return transactions.filter(t => {
      const date = config.dateType === 'value'
        ? parseLocalDate(t.value_date || t.transaction_date)
        : parseLocalDate(t.transaction_date);
      return date >= actualDates.start && date <= actualDates.end;
    }).sort((a, b) => {
      const dateA = config.dateType === 'value'
        ? parseLocalDate(a.value_date || a.transaction_date)
        : parseLocalDate(a.transaction_date);
      const dateB = config.dateType === 'value'
        ? parseLocalDate(b.value_date || b.transaction_date)
        : parseLocalDate(b.transaction_date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [transactions, actualDates, config.dateType]);

  // Calculate evolution data for charts
  const evolutionChartData = useMemo(() => {
    const days = eachDayOfInterval({ start: actualDates.start, end: actualDates.end });
    let runningBalance = stats.initialBalance;

    return days.map(day => {
      const dayTransactions = filteredTransactions.filter(t => {
        const date = config.dateType === 'value'
          ? parseLocalDate(t.value_date || t.transaction_date)
          : parseLocalDate(t.transaction_date);
        return isSameDay(date, day);
      });

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

  // Budget data for charts
  const budgetChartData = useMemo(() => {
    return categoryChartData
      .filter(c => c.budget > 0)
      .map(c => ({
        name: c.name,
        spent: c.spent,
        budget: c.budget,
        color: c.color || '#3B82F6'
      }));
  }, [categoryChartData]);

  // Category data for pie chart
  const categoryPieData = useMemo(() => {
    return categoryChartData
      .filter(c => c.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map(c => ({
        name: c.name,
        spent: c.spent,
        color: c.color || '#3B82F6'
      }));
  }, [categoryChartData]);

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

  // PDF Generation with Charts
  const generatePDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      import('html2canvas'),
    ]);

    const captureChartAsImage = async (ref: React.RefObject<HTMLDivElement>): Promise<string | null> => {
      if (!ref.current) return null;
      try {
        const canvas = await html2canvas(ref.current, {
          scale: 2,
          backgroundColor: 'transparent',
          logging: false,
          useCORS: true,
        });
        return canvas.toDataURL('image/png');
      } catch (error) {
        console.error('Error capturing chart:', error);
        return null;
      }
    };

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    let yPos = 20;

    // Design tokens — mirrors the redesign's :root colour set so on-demand
    // PDFs match the email + monthly PDF visual vocabulary.
    const ink: [number, number, number] = [12, 13, 12];        // #0c0d0c
    const ink2: [number, number, number] = [31, 33, 31];       // #1f211f
    const mute: [number, number, number] = [110, 113, 108];    // #6e716c
    const mute2: [number, number, number] = [154, 156, 151];   // #9a9c97
    const lineCol: [number, number, number] = [231, 229, 221]; // #e7e5dd
    const negCol: [number, number, number] = [200, 58, 42];    // ≈ neg
    const posCol: [number, number, number] = [44, 138, 74];    // ≈ pos

    const addPageIfNeeded = (requiredSpace: number) => {
      if (yPos + requiredSpace > pageHeight - 25) {
        pdf.addPage();
        yPos = 22;
        return true;
      }
      return false;
    };

    const formatAmount = (value: number) => {
      return new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value) + ' EUR';
    };

    /** Statement-style section header — eyebrow + serif title + thin rule. */
    const drawSectionHeader = (eyebrow: string, title: string) => {
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...mute);
      pdf.text(eyebrow.toUpperCase(), margin, yPos);
      yPos += 7;
      pdf.setFont('times', 'normal');
      pdf.setFontSize(20);
      pdf.setTextColor(...ink);
      pdf.text(title, margin, yPos);
      yPos += 4;
      pdf.setDrawColor(...lineCol);
      pdf.setLineWidth(0.2);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;
    };

    const addFooter = () => {
      pdf.setDrawColor(...lineCol);
      pdf.setLineWidth(0.2);
      pdf.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...mute2);
      pdf.text('SPENDING TRACKER · ON DEMAND', margin, pageHeight - 11);
      pdf.text(
        String(pdf.getCurrentPageInfo().pageNumber).padStart(2, '0'),
        pageWidth - margin, pageHeight - 11, { align: 'right' },
      );
    };

    // ======= COVER PAGE — magazine-style, off-white paper =======
    // Off-white canvas
    pdf.setFillColor(245, 244, 240);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // Top brand row — small ink square + "Spending Tracker" + "ON DEMAND" tag.
    pdf.setFillColor(...ink);
    pdf.rect(margin, 22, 6, 6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...ink2);
    pdf.text('Spending Tracker', margin + 9, 27);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...mute);
    pdf.text('RAPPORT À LA DEMANDE', pageWidth - margin, 27, { align: 'right' });

    // Mid-page hairline ~ 52% down (matches the redesign's cover composition).
    pdf.setDrawColor(...lineCol);
    pdf.setLineWidth(0.2);
    pdf.line(margin, pageHeight * 0.48, pageWidth - margin, pageHeight * 0.48);

    // Eyebrow above the title
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...mute);
    pdf.text('Rapport financier', margin, pageHeight * 0.45);

    // Magazine-style serif title — period range as the headline.
    pdf.setFont('times', 'normal');
    pdf.setFontSize(36);
    pdf.setTextColor(...ink);
    const periodTitle = `${format(actualDates.start, 'd MMM', { locale })} — ${format(actualDates.end, 'd MMM yyyy', { locale })}`;
    pdf.text(periodTitle, margin, pageHeight * 0.40);

    // Verdict subline (italic serif)
    pdf.setFont('times', 'italic');
    pdf.setFontSize(13);
    pdf.setTextColor(...mute);
    const verdictNet = stats.netPeriodBalance;
    const verdictLine = verdictNet >= 0
      ? `Vous avez mis de cote ${formatAmount(Math.abs(verdictNet))}.`
      : `Solde de la periode : ${formatAmount(verdictNet)}.`;
    pdf.text(verdictLine, margin, pageHeight * 0.40 + 8);

    // Bottom hairline + meta row (date, transactions, sections).
    pdf.setDrawColor(...lineCol);
    pdf.line(margin, pageHeight - 35, pageWidth - margin, pageHeight - 35);
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...mute2);
    pdf.text('GENERE', margin, pageHeight - 28);
    pdf.text('TRANSACTIONS', margin + 60, pageHeight - 28);
    pdf.text('SECTIONS', margin + 110, pageHeight - 28);
    pdf.setFontSize(10);
    pdf.setTextColor(...ink2);
    pdf.text(format(new Date(), 'd MMMM yyyy', { locale }), margin, pageHeight - 22);
    pdf.setFont('courier', 'bold');
    pdf.text(String(filteredTransactions.length), margin + 60, pageHeight - 22);
    pdf.text(String(config.sections.length), margin + 110, pageHeight - 22);

    pdf.addPage();
    yPos = 22;
    pdf.setTextColor(0, 0, 0);

    // ======= SUMMARY SECTION WITH CHARTS =======
    if (config.sections.includes('summary') && config.includeCharts) {
      // Capture summary cards chart
      const summaryImg = await captureChartAsImage(summaryChartRef);
      if (summaryImg) {
        const imgWidth = 160;
        const imgHeight = 60;
        pdf.addImage(summaryImg, 'PNG', (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      }

      // Capture income vs expenses chart
      const incExpImg = await captureChartAsImage(incomeExpenseRef);
      if (incExpImg) {
        addPageIfNeeded(90);
        const imgWidth = 120;
        const imgHeight = 85;
        pdf.addImage(incExpImg, 'PNG', (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 15;
      }
    } else if (config.sections.includes('summary')) {
      drawSectionHeader('01 · Synthese', 'Bilan de la periode');

      const summaryData = [
        ['Revenus', formatAmount(stats.income), 'pos'],
        ['Depenses', formatAmount(stats.expenses), 'neg'],
        ['Solde net', formatAmount(stats.netPeriodBalance), stats.netPeriodBalance >= 0 ? 'pos' : 'neg'],
        ['Solde initial', formatAmount(stats.initialBalance), 'mute'],
        ['Solde final', formatAmount(stats.finalBalance), 'mute'],
      ];

      autoTable(pdf, {
        startY: yPos,
        head: [['Indicateur', 'Montant']],
        body: summaryData.map(([label, value]) => [label, value]),
        theme: 'plain',
        headStyles: { fillColor: [255, 255, 255], textColor: mute, fontStyle: 'normal', fontSize: 8.5 },
        styles: { fontSize: 11, cellPadding: 5, lineColor: lineCol, lineWidth: 0.2 },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { halign: 'right', cellWidth: 80, font: 'courier', fontStyle: 'bold' },
        },
        margin: { left: margin, right: margin },
        didParseCell: (data: any) => {
          if (data.section === 'body') {
            // Hairline bottom border per row
            data.cell.styles.lineColor = lineCol;
            data.cell.styles.lineWidth = { top: 0, bottom: 0.2, left: 0, right: 0 };
            if (data.column.index === 1) {
              const colorType = summaryData[data.row.index]?.[2];
              if (colorType === 'pos') data.cell.styles.textColor = posCol;
              else if (colorType === 'neg') data.cell.styles.textColor = negCol;
              else data.cell.styles.textColor = ink;
            }
          }
        },
      });
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    }

    // ======= ACCOUNTS SECTION =======
    if (config.sections.includes('accounts')) {
      addPageIfNeeded(60);
      drawSectionHeader('02 · Comptes', 'Soldes des comptes');

      const accountData = accounts.map(acc => [
        acc.name,
        acc.bank,
        acc.account_type === 'checking' ? 'Courant' :
          acc.account_type === 'savings' ? 'Epargne' :
          acc.account_type === 'credit' ? 'Credit' : 'Titre',
        formatAmount(Number(acc.balance))
      ]);

      const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

      autoTable(pdf, {
        startY: yPos,
        head: [['Compte', 'Banque', 'Type', 'Solde']],
        body: accountData,
        foot: [['', '', 'TOTAL', formatAmount(totalBalance)]],
        theme: 'plain',
        headStyles: { fillColor: [255, 255, 255], textColor: mute, fontStyle: 'normal', fontSize: 8.5 },
        footStyles: { fillColor: [255, 255, 255], textColor: ink, fontStyle: 'bold', font: 'courier', lineWidth: { top: 0.4, bottom: 0, left: 0, right: 0 }, lineColor: ink },
        styles: { fontSize: 10, cellPadding: 4, textColor: ink, lineColor: lineCol, lineWidth: { top: 0, bottom: 0.2, left: 0, right: 0 } },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 45 },
          2: { cellWidth: 30 },
          3: { halign: 'right', cellWidth: 45, font: 'courier', fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin },
      });
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    }

    // ======= CATEGORIES SECTION WITH PIE CHART =======
    if (config.sections.includes('categories')) {
      pdf.addPage();
      yPos = 22;
      drawSectionHeader('03 · Repartition', 'Depenses par categorie');

      // Capture pie chart
      if (config.includeCharts) {
        const pieImg = await captureChartAsImage(categoryPieRef);
        if (pieImg) {
          const imgWidth = 150;
          const imgHeight = 100;
          pdf.addImage(pieImg, 'PNG', (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }

        // Also add top categories bar chart
        const topCatImg = await captureChartAsImage(topCategoriesRef);
        if (topCatImg) {
          const imgWidth = 140;
          const imgHeight = 85;
          pdf.addImage(topCatImg, 'PNG', (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }
      }

      // Category table
      const catData = categoryChartData
        .filter(c => c.spent > 0)
        .sort((a, b) => b.spent - a.spent)
        .map(cat => {
          const pct = stats.expenses > 0 ? ((cat.spent / stats.expenses) * 100).toFixed(1) : '0.0';
          return [cat.name, formatAmount(cat.spent), pct + '%'];
        });

      if (catData.length > 0) {
        addPageIfNeeded(catData.length * 8 + 20);
        autoTable(pdf, {
          startY: yPos,
          head: [['Categorie', 'Montant', 'Part']],
          body: catData,
          theme: 'plain',
          headStyles: { fillColor: [255, 255, 255], textColor: mute, fontStyle: 'normal', fontSize: 8.5 },
          styles: { fontSize: 10, cellPadding: 4, textColor: ink, lineColor: lineCol, lineWidth: { top: 0, bottom: 0.2, left: 0, right: 0 } },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { halign: 'right', cellWidth: 50, font: 'courier', fontStyle: 'bold' },
            2: { halign: 'center', cellWidth: 30, font: 'courier', textColor: mute }
          },
          margin: { left: margin, right: margin },
        });
        yPos = (pdf as any).lastAutoTable.finalY + 15;
      }
    }

    // ======= EVOLUTION SECTION WITH CHART =======
    if (config.sections.includes('evolution')) {
      pdf.addPage();
      yPos = 22;
      drawSectionHeader('04 · Evolution', 'Evolution du solde');

      if (config.includeCharts) {
        const evolutionImg = await captureChartAsImage(evolutionChartRef);
        if (evolutionImg) {
          const imgWidth = 170;
          const imgHeight = 95;
          pdf.addImage(evolutionImg, 'PNG', (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 15;
        }
      }

      // Add key stats
      pdf.setFontSize(11);
      pdf.setTextColor(55, 65, 81);
      pdf.text(`Solde de depart: ${formatAmount(stats.initialBalance)}`, margin, yPos);
      yPos += 7;
      pdf.text(`Solde de fin: ${formatAmount(stats.finalBalance)}`, margin, yPos);
      yPos += 7;
      const change = stats.finalBalance - stats.initialBalance;
      pdf.setTextColor(change >= 0 ? 22 : 220, change >= 0 ? 163 : 38, change >= 0 ? 74 : 38);
      pdf.text(`Variation: ${change >= 0 ? '+' : ''}${formatAmount(change)}`, margin, yPos);
      yPos += 15;
    }

    // ======= INCOME SECTION =======
    if (config.sections.includes('income') && incomeAnalysis.length > 0) {
      addPageIfNeeded(70);
      drawSectionHeader('05 · Revenus', 'Revenus par categorie');

      const incData = incomeAnalysis.map(inc => {
        const pct = stats.income > 0 ? ((inc.totalAmount / stats.income) * 100).toFixed(1) : '0.0';
        return [inc.category, formatAmount(inc.totalAmount), pct + '%', String(inc.count)];
      });

      autoTable(pdf, {
        startY: yPos,
        head: [['Source', 'Montant', 'Part', 'Nb']],
        body: incData,
        foot: [['TOTAL', formatAmount(stats.income), '100%', '']],
        theme: 'plain',
        headStyles: { fillColor: [255, 255, 255], textColor: mute, fontStyle: 'normal', fontSize: 8.5 },
        footStyles: { fillColor: [255, 255, 255], textColor: ink, fontStyle: 'bold', font: 'courier', lineWidth: { top: 0.4, bottom: 0, left: 0, right: 0 }, lineColor: ink },
        styles: { fontSize: 10, cellPadding: 4, textColor: ink, lineColor: lineCol, lineWidth: { top: 0, bottom: 0.2, left: 0, right: 0 } },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { halign: 'right', cellWidth: 50, font: 'courier', fontStyle: 'bold', textColor: posCol },
          2: { halign: 'center', cellWidth: 25, font: 'courier', textColor: mute },
          3: { halign: 'center', cellWidth: 20, font: 'courier', textColor: mute }
        },
        margin: { left: margin, right: margin },
      });
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    }

    // ======= BUDGETS SECTION WITH CHART =======
    if (config.sections.includes('budgets')) {
      const budgetCategories = categoryChartData.filter(c => c.budget > 0);
      if (budgetCategories.length > 0) {
        pdf.addPage();
        yPos = 22;
        drawSectionHeader('06 · Budgets', 'Suivi des budgets');

        if (config.includeCharts) {
          const budgetImg = await captureChartAsImage(budgetChartRef);
          if (budgetImg) {
            const imgWidth = 145;
            const imgHeight = 95;
            pdf.addImage(budgetImg, 'PNG', (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;
          }
        }

        const budgetData = budgetCategories.map(cat => {
          const pct = cat.budget > 0 ? (cat.spent / cat.budget * 100) : 0;
          const remaining = cat.budget - cat.spent;
          const status = pct >= 100 ? 'Depasse' : pct >= 80 ? 'Attention' : 'OK';
          return [
            cat.name,
            formatAmount(cat.spent),
            formatAmount(cat.budget),
            formatAmount(remaining),
            pct.toFixed(0) + '%',
            status
          ];
        });

        autoTable(pdf, {
          startY: yPos,
          head: [['Categorie', 'Depense', 'Budget', 'Restant', '%', 'Statut']],
          body: budgetData,
          theme: 'plain',
          headStyles: { fillColor: [255, 255, 255], textColor: mute, fontStyle: 'normal', fontSize: 8.5 },
          styles: { fontSize: 9, cellPadding: 3, textColor: ink, lineColor: lineCol, lineWidth: { top: 0, bottom: 0.2, left: 0, right: 0 } },
          columnStyles: {
            0: { cellWidth: 40 },
            1: { halign: 'right', cellWidth: 28, font: 'courier' },
            2: { halign: 'right', cellWidth: 28, font: 'courier', textColor: mute },
            3: { halign: 'right', cellWidth: 28, font: 'courier' },
            4: { halign: 'center', cellWidth: 18, font: 'courier', textColor: mute },
            5: { halign: 'center', cellWidth: 22, font: 'courier' }
          },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 5) {
              const status = data.cell.raw;
              if (status === 'Depasse') data.cell.styles.textColor = negCol;
              else if (status === 'Attention') data.cell.styles.textColor = [192, 102, 26];
              else data.cell.styles.textColor = posCol;
              data.cell.styles.fontStyle = 'bold';
            }
            // Restant: red when negative, neutral otherwise
            if (data.section === 'body' && data.column.index === 3) {
              const raw = String(data.cell.raw);
              if (raw.includes('-')) data.cell.styles.textColor = negCol;
            }
          }
        });
        yPos = (pdf as any).lastAutoTable.finalY + 15;
      }
    }

    // ======= TRANSACTIONS SECTION =======
    if (config.sections.includes('transactions')) {
      pdf.addPage();
      yPos = 22;
      drawSectionHeader('07 · Transactions', 'Detail des transactions');
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...mute);
      pdf.text(`${filteredTransactions.length} OPERATIONS`, pageWidth - margin, yPos - 6, { align: 'right' });

      // Calculate running balance
      let runningBalance = stats.initialBalance;
      const txData = filteredTransactions.map(t => {
        const amount = Number(t.amount);
        if (t.type === 'income') runningBalance += amount;
        else if (t.type === 'expense') runningBalance -= amount;

        const displayDate = config.dateType === 'value'
          ? parseLocalDate(t.value_date || t.transaction_date)
          : parseLocalDate(t.transaction_date);

        return [
          format(displayDate, 'dd/MM/yy'),
          accounts.find(a => a.id === t.account_id)?.name?.substring(0, 15) || '-',
          t.description.substring(0, 35) + (t.description.length > 35 ? '...' : ''),
          t.category?.name?.substring(0, 12) || '-',
          t.type === 'income' ? '+' + formatAmount(amount).replace(' EUR', '') :
            '-' + formatAmount(amount).replace(' EUR', ''),
          formatAmount(runningBalance).replace(' EUR', '')
        ];
      });

      autoTable(pdf, {
        startY: yPos,
        head: [['Date', 'Compte', 'Description', 'Cat.', 'Montant', 'Solde']],
        body: txData,
        theme: 'plain',
        headStyles: { fillColor: [255, 255, 255], textColor: mute, fontStyle: 'normal', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'ellipsize', textColor: ink, lineColor: lineCol, lineWidth: { top: 0, bottom: 0.15, left: 0, right: 0 } },
        columnStyles: {
          0: { cellWidth: 18, font: 'courier', textColor: mute },
          1: { cellWidth: 26 },
          2: { cellWidth: 58 },
          3: { cellWidth: 24, textColor: mute },
          4: { halign: 'right', cellWidth: 26, font: 'courier' },
          5: { halign: 'right', cellWidth: 26, font: 'courier', fontStyle: 'bold', textColor: mute }
        },
        margin: { left: margin, right: margin },
        showHead: 'everyPage',
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 4) {
            const value = String(data.cell.raw);
            if (value.startsWith('+')) data.cell.styles.textColor = posCol;
            else if (value.startsWith('-')) data.cell.styles.textColor = negCol;
          }
        },
        didDrawPage: () => {
          addFooter();
        }
      });
    }

    // Add footer to all pages
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      addFooter();
    }

    pdf.save(`rapport-financier-${format(actualDates.start, 'yyyy-MM')}.pdf`);
  };

  // Excel Generation
  const generateExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const formatNum = (n: number) => Number(n.toFixed(2));

    // Summary sheet
    if (config.sections.includes('summary')) {
      const summaryData = [
        ['Rapport Financier'],
        [`Periode: ${format(actualDates.start, 'dd/MM/yyyy')} - ${format(actualDates.end, 'dd/MM/yyyy')}`],
        [`Genere le: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
        [],
        ['Synthese'],
        ['Revenus', formatNum(stats.income)],
        ['Depenses', formatNum(stats.expenses)],
        ['Solde net', formatNum(stats.netPeriodBalance)],
        ['Solde initial', formatNum(stats.initialBalance)],
        ['Solde final', formatNum(stats.finalBalance)],
      ];
      const ws = XLSX.utils.aoa_to_sheet(summaryData);
      ws['!cols'] = [{ wch: 20 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Synthese');
    }

    // Accounts sheet
    if (config.sections.includes('accounts')) {
      const data = [
        ['Soldes des comptes'],
        [],
        ['Compte', 'Banque', 'Type', 'Solde'],
        ...accounts.map(a => [a.name, a.bank, a.account_type, formatNum(Number(a.balance))])
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Comptes');
    }

    // Categories sheet
    if (config.sections.includes('categories')) {
      const data = [
        ['Depenses par categorie'],
        [],
        ['Categorie', 'Montant', 'Part (%)'],
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
      XLSX.utils.book_append_sheet(wb, ws, 'Categories');
    }

    // Income sheet
    if (config.sections.includes('income') && incomeAnalysis.length > 0) {
      const data = [
        ['Revenus par categorie'],
        [],
        ['Source', 'Montant', 'Part (%)', 'Nombre'],
        ...incomeAnalysis.map(i => [
          i.category,
          formatNum(i.totalAmount),
          stats.income > 0 ? Number(((i.totalAmount / stats.income) * 100).toFixed(1)) : 0,
          i.count
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Revenus');
    }

    // Budgets sheet
    if (config.sections.includes('budgets')) {
      const budgetCats = categoryChartData.filter(c => c.budget > 0);
      if (budgetCats.length > 0) {
        const data = [
          ['Suivi des budgets'],
          [],
          ['Categorie', 'Depense', 'Budget', 'Restant', '% Utilise', 'Statut'],
          ...budgetCats.map(c => {
            const pct = c.budget > 0 ? (c.spent / c.budget * 100) : 0;
            return [
              c.name,
              formatNum(c.spent),
              formatNum(c.budget),
              formatNum(c.budget - c.spent),
              Number(pct.toFixed(0)),
              pct >= 100 ? 'Depasse' : pct >= 80 ? 'Attention' : 'OK'
            ];
          })
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Budgets');
      }
    }

    // Transactions sheet
    if (config.sections.includes('transactions')) {
      let runningBalance = stats.initialBalance;
      const txRows = filteredTransactions.map(tx => {
        const amount = Number(tx.amount);
        if (tx.type === 'income') runningBalance += amount;
        else if (tx.type === 'expense') runningBalance -= amount;

        const displayDate = config.dateType === 'value'
          ? parseLocalDate(tx.value_date || tx.transaction_date)
          : parseLocalDate(tx.transaction_date);

        return [
          format(displayDate, 'dd/MM/yyyy'),
          accounts.find(a => a.id === tx.account_id)?.name || '',
          tx.description,
          tx.category?.name || '',
          tx.type === 'income' ? t('transactions.income') : tx.type === 'expense' ? t('transactions.expense') : t('transactions.transfer'),
          tx.type === 'expense' ? -amount : amount,
          formatNum(runningBalance)
        ];
      });

      const data = [
        ['Transactions'],
        [],
        ['Date', 'Compte', 'Description', 'Categorie', 'Type', 'Montant', 'Solde'],
        ...txRows
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 40 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    }

    XLSX.writeFile(wb, `rapport-${format(actualDates.start, 'yyyy-MM')}.xlsx`);
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
      </div>

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

  // Live preview — mocks a document layout that reacts to selected sections.
  // Page-count estimate: 1 (cover) + ⌈sections / 2⌉ + (transactions section ? ⌈n/40⌉ : 0).
  const txCount = filteredTransactions.length;
  const includesTx = config.sections.includes('transactions');
  const estimatedPages =
    1 +
    Math.ceil(config.sections.filter((s) => s !== 'transactions').length / 2) +
    (includesTx ? Math.max(1, Math.ceil(txCount / 40)) : 0);
  const estimatedKb = Math.round(60 + estimatedPages * 32 + (includesTx ? txCount * 0.4 : 0));
  const previewBlocks = [
    config.sections.includes('summary') && {
      title: t('reports.section.summary.label', { defaultValue: 'Summary' }),
      shape: 'row3',
    },
    config.sections.includes('categories') && {
      title: t('reports.section.categories.label', { defaultValue: 'Categories' }),
      shape: 'list',
    },
    config.sections.includes('evolution') && {
      title: t('reports.section.evolution.label', { defaultValue: 'Evolution' }),
      shape: 'chart',
    },
    config.sections.includes('accounts') && {
      title: t('reports.section.accounts.label', { defaultValue: 'Accounts' }),
      shape: 'list',
    },
    config.sections.includes('income') && {
      title: t('reports.section.income.label', { defaultValue: 'Income' }),
      shape: 'list',
    },
    config.sections.includes('recurring') && {
      title: t('reports.section.recurring.label', { defaultValue: 'Recurring' }),
      shape: 'list',
    },
    config.sections.includes('budgets') && {
      title: t('reports.section.budgets.label', { defaultValue: 'Budgets' }),
      shape: 'list',
    },
    config.sections.includes('transactions') && {
      title: `${t('reports.section.transactions.label', { defaultValue: 'Transactions' })} · ${txCount} rows`,
      shape: 'rows',
    },
  ].filter(Boolean) as { title: string; shape: 'row3' | 'list' | 'chart' | 'rows' }[];

  const totalSectionCount = Object.keys(SECTION_INFO).length;

  // Single-screen layout — sections + period + format on the left, document
  // preview + page-count estimate on the right (collapses to a stack on mobile).
  const content = (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 md:gap-6">
        {/* ── Left: configuration ─────────────────────── */}
        <div className="space-y-5 min-w-0">
          {/* Period */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <Label className="text-sm font-medium">
                {t('reports.period', { defaultValue: 'Period' })}
              </Label>
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {format(actualDates.start, 'd MMM yyyy', { locale })} →{' '}
                {format(actualDates.end, 'd MMM yyyy', { locale })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {periodPresets.map(({ key, label }) => {
                const active = isPresetActive(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePeriodPreset(key)}
                    className={cn(
                      'h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                      active
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-line text-muted-foreground hover:text-foreground hover:bg-bg-hover bg-card'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setConfig((p) => ({ ...p, periodType: 'custom' }))}
                className={cn(
                  'h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                  config.periodType === 'custom'
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-line text-muted-foreground hover:text-foreground hover:bg-bg-hover bg-card'
                )}
              >
                {t('reports.custom', { defaultValue: 'Custom' })}
              </button>
            </div>
            {config.periodType === 'month' && (
              <MonthPicker
                value={config.startDate}
                onChange={(d) =>
                  setConfig((prev) => ({ ...prev, startDate: d || new Date() }))
                }
                className="rounded-lg bg-bg-subtle border-line"
              />
            )}
            {config.periodType === 'year' && (
              <YearPicker
                value={config.startDate}
                onChange={(d) =>
                  setConfig((prev) => ({ ...prev, startDate: d || new Date() }))
                }
                className="rounded-lg bg-bg-subtle border-line"
              />
            )}
            <Select
              value={config.dateType}
              onValueChange={(v: any) => setConfig((prev) => ({ ...prev, dateType: v }))}
            >
              <SelectTrigger className="h-8 w-full sm:w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accounting">
                  {t('settings.accountingDate', { defaultValue: 'By accounting' })}
                </SelectItem>
                <SelectItem value="value">
                  {t('settings.valueDate', { defaultValue: 'By value' })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <Label className="text-sm font-medium">
                {t('reports.sections', { defaultValue: 'Sections' })}
                <span className="text-fg-dim font-normal ml-1.5">
                  · {config.sections.length} of {totalSectionCount}
                </span>
              </Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (config.sections.length === totalSectionCount) {
                    setConfig((prev) => ({ ...prev, sections: ['summary'] }));
                  } else {
                    setConfig((prev) => ({
                      ...prev,
                      sections: Object.keys(SECTION_INFO) as ReportSection[],
                    }));
                  }
                }}
              >
                {config.sections.length === totalSectionCount
                  ? t('common.deselectAll', { defaultValue: 'Deselect all' })
                  : t('common.selectAll', { defaultValue: 'Select all' })}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.entries(SECTION_INFO) as [ReportSection, typeof SECTION_INFO[ReportSection]][]).map(
                ([key, info]) => {
                  const Icon = info.icon;
                  const isSelected = config.sections.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSection(key)}
                      className={cn(
                        'flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors min-w-0',
                        isSelected
                          ? 'border-foreground bg-bg-subtle'
                          : 'border-line bg-card hover:bg-bg-hover'
                      )}
                    >
                      <span
                        className={cn(
                          'flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-md border text-[11px] font-bold mt-0.5',
                          isSelected
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-line text-muted-foreground'
                        )}
                      >
                        {isSelected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-[13px] font-medium truncate">
                            {t(info.labelKey, { defaultValue: info.labelDefault })}
                          </span>
                        </div>
                        <span className="text-[11.5px] text-fg-dim leading-snug">
                          {t(info.descKey, { defaultValue: info.descDefault })}
                        </span>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {t('reports.format', { defaultValue: 'Format' })}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(['pdf', 'excel'] as const).map((fmt) => {
                const isActive = config.format === fmt;
                const Icon = fmt === 'pdf' ? FileText : FileSpreadsheet;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, format: fmt }))}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                      isActive
                        ? 'border-foreground bg-bg-subtle'
                        : 'border-line bg-card hover:bg-bg-hover'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-9 w-9 rounded-md font-mono text-[10px] font-semibold tracking-wide',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'bg-bg-subtle text-muted-foreground'
                      )}
                    >
                      {fmt.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">
                        {fmt === 'pdf' ? 'PDF' : 'Excel'}
                      </div>
                      <div className="text-[11.5px] text-fg-dim">
                        {fmt === 'pdf'
                          ? t('reports.formatPdfDesc', {
                              defaultValue: 'Statement-style · vector charts · printable',
                            })
                          : t('reports.formatXlsDesc', {
                              defaultValue: 'Raw rows, one tab per section',
                            })}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-5 w-5 rounded-md border',
                        isActive
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-line text-transparent'
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right: live preview ─────────────────────── */}
        <div className="hidden md:flex flex-col gap-2 sticky top-0 self-start">
          <div className="text-[11px] text-fg-dim leading-relaxed">
            <b className="text-foreground font-medium">
              {t('reports.livePreview', { defaultValue: 'Live preview' })}
            </b>{' '}
            — {t('reports.livePreviewHint', {
              defaultValue: 'updates as you toggle sections.',
            })}
          </div>
          <div className="relative bg-card border border-line rounded-lg shadow-sm aspect-[1/1.4] p-3 overflow-hidden">
            <div className="text-[8px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80">
              Spending Tracker · Report
            </div>
            <div
              className="text-[14px] leading-tight font-medium mt-1"
              style={{ fontFamily: '"Fraunces", Georgia, serif' }}
            >
              Financial report
            </div>
            <div className="text-[8px] uppercase tracking-[0.08em] font-semibold text-foreground mt-0.5 font-mono">
              {format(actualDates.start, 'd MMM').toUpperCase()} —{' '}
              {format(actualDates.end, 'd MMM yyyy').toUpperCase()}
            </div>
            <div className="border-t border-line my-2" />
            <div className="space-y-1.5 overflow-hidden">
              {previewBlocks.map((b, i) => (
                <div key={i}>
                  <div className="text-[8px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80 mb-1">
                    {b.title}
                  </div>
                  {b.shape === 'row3' && (
                    <div className="grid grid-cols-3 gap-1">
                      <div className="h-4 rounded-sm bg-bg-subtle" />
                      <div className="h-4 rounded-sm bg-bg-subtle" />
                      <div className="h-4 rounded-sm bg-bg-subtle" />
                    </div>
                  )}
                  {b.shape === 'list' && (
                    <div className="space-y-0.5">
                      <div className="h-2 rounded-sm bg-bg-subtle" />
                      <div className="h-2 rounded-sm bg-bg-subtle w-4/5" />
                      <div className="h-2 rounded-sm bg-bg-subtle w-3/5" />
                    </div>
                  )}
                  {b.shape === 'chart' && (
                    <div className="h-8 rounded-sm bg-bg-subtle" />
                  )}
                  {b.shape === 'rows' && (
                    <div className="space-y-0.5">
                      <div className="h-1.5 rounded-sm bg-bg-subtle" />
                      <div className="h-1.5 rounded-sm bg-bg-subtle" />
                      <div className="h-1.5 rounded-sm bg-bg-subtle" />
                      <div className="h-1.5 rounded-sm bg-bg-subtle w-4/5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="absolute bottom-1.5 right-2 text-[7px] font-mono tracking-[0.08em] text-fg-dim">
              01 / {String(estimatedPages).padStart(2, '0')}
            </div>
          </div>
          <div className="text-[11px] text-fg-dim leading-relaxed">
            {t('reports.estimate', {
              pages: estimatedPages,
              size: estimatedKb,
              tx: txCount,
              defaultValue: `Estimated ${estimatedPages} page${estimatedPages !== 1 ? 's' : ''}, ~${estimatedKb} KB${
                includesTx ? ` · ${txCount} transactions` : ''
              }.`,
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-line">
        <div className="text-[12px] text-muted-foreground font-mono tabular-nums">
          {config.sections.length} sections · {format(actualDates.start, 'd MMM', { locale })} →{' '}
          {format(actualDates.end, 'd MMM yyyy', { locale })} · {config.format.toUpperCase()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
            className="h-9 text-sm"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || config.sections.length === 0}
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

  // Hidden chart container for PDF capture
  const chartsContainer = (
    <div
      style={{
        position: 'fixed',
        left: '-9999px',
        top: 0,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
      }}
      aria-hidden="true"
    >
      {config.includeCharts && config.format === 'pdf' && (
        <>
          <SummaryCards
            ref={summaryChartRef}
            totalIncome={stats.income}
            totalExpenses={stats.expenses}
            netBalance={stats.netPeriodBalance}
            initialBalance={stats.initialBalance}
            finalBalance={stats.finalBalance}
            transactionCount={filteredTransactions.length}
            formatCurrency={formatCurrency}
          />
          <CategoryPieChart
            ref={categoryPieRef}
            data={categoryPieData}
            totalExpenses={stats.expenses}
            formatCurrency={formatCurrency}
          />
          <BalanceEvolutionChart
            ref={evolutionChartRef}
            data={evolutionChartData}
            formatCurrency={formatCurrency}
          />
          <IncomeExpensesChart
            ref={incomeExpenseRef}
            totalIncome={stats.income}
            totalExpenses={stats.expenses}
            netBalance={stats.netPeriodBalance}
            formatCurrency={formatCurrency}
          />
          <BudgetProgressChart
            ref={budgetChartRef}
            data={budgetChartData}
            formatCurrency={formatCurrency}
          />
          <TopCategoriesChart
            ref={topCategoriesRef}
            data={categoryPieData}
            formatCurrency={formatCurrency}
          />
        </>
      )}
    </div>
  );

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
            <div className="p-4 pt-2 overflow-y-auto">
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
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-background border border-line shadow-xl rounded-xl">
          <DialogHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div
                className="text-2xl leading-none mt-0.5"
                style={{ fontFamily: '"Fraunces", Georgia, serif', fontWeight: 500 }}
              >
                {t('reports.generateReport', { defaultValue: 'Generate report' })}
              </div>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {t('reports.generateSubtitle', {
                defaultValue: "Pick what you want, see how it'll look, export.",
              })}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
};
