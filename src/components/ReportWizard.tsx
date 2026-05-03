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

const SECTION_INFO: Record<ReportSection, { icon: React.ElementType; label: string; description: string }> = {
  summary: { icon: BarChart3, label: "Synthese", description: "Revenus, depenses, solde net" },
  accounts: { icon: Wallet, label: "Soldes comptes", description: "Solde actuel de chaque compte" },
  transactions: { icon: Receipt, label: "Transactions", description: "Liste detaillee des operations" },
  categories: { icon: PieChart, label: "Depenses/categorie", description: "Repartition des depenses" },
  income: { icon: TrendingUp, label: "Revenus/categorie", description: "Analyse des revenus" },
  budgets: { icon: Target, label: "Suivi budgets", description: "Budget vs depenses reelles" },
  evolution: { icon: ArrowLeftRight, label: "Evolution solde", description: "Courbe d'evolution" },
  recurring: { icon: Receipt, label: "Recurrents", description: "Transactions recurrentes" },
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
    const margin = 15;
    let yPos = 20;

    // Helper functions
    const addPageIfNeeded = (requiredSpace: number) => {
      if (yPos + requiredSpace > pageHeight - 25) {
        pdf.addPage();
        yPos = 20;
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

    const addFooter = () => {
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        `Page ${pdf.getCurrentPageInfo().pageNumber}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    };

    // ======= COVER PAGE =======
    // Gradient header
    pdf.setFillColor(59, 130, 246);
    pdf.rect(0, 0, pageWidth, 70, 'F');
    pdf.setFillColor(37, 99, 235);
    pdf.rect(0, 50, pageWidth, 20, 'F');

    // Title
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(28);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Rapport Financier', pageWidth / 2, 35, { align: 'center' });

    // Subtitle with period
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `${format(actualDates.start, 'dd MMMM yyyy', { locale })} - ${format(actualDates.end, 'dd MMMM yyyy', { locale })}`,
      pageWidth / 2,
      55,
      { align: 'center' }
    );

    // Generation date
    pdf.setFontSize(10);
    pdf.setTextColor(200, 220, 255);
    pdf.text(`Genere le ${format(new Date(), 'dd/MM/yyyy a HH:mm', { locale })}`, pageWidth / 2, 65, { align: 'center' });

    yPos = 85;
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
      // Text-only summary
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Synthese de la periode', margin, yPos);
      yPos += 10;

      const summaryData = [
        ['Revenus', formatAmount(stats.income), 'green'],
        ['Depenses', formatAmount(stats.expenses), 'red'],
        ['Solde net', formatAmount(stats.netPeriodBalance), stats.netPeriodBalance >= 0 ? 'green' : 'red'],
        ['Solde initial', formatAmount(stats.initialBalance), 'gray'],
        ['Solde final', formatAmount(stats.finalBalance), 'gray'],
      ];

      autoTable(pdf, {
        startY: yPos,
        head: [['Indicateur', 'Montant']],
        body: summaryData.map(([label, value]) => [label, value]),
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 11, cellPadding: 5 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { halign: 'right', cellWidth: 60, fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 1) {
            const colorType = summaryData[data.row.index]?.[2];
            if (colorType === 'green') data.cell.styles.textColor = [22, 163, 74];
            else if (colorType === 'red') data.cell.styles.textColor = [220, 38, 38];
          }
        }
      });
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    }

    // ======= ACCOUNTS SECTION =======
    if (config.sections.includes('accounts')) {
      addPageIfNeeded(50);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Soldes des comptes', margin, yPos);
      yPos += 10;

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
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 45 },
          2: { cellWidth: 30 },
          3: { halign: 'right', cellWidth: 45, fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin },
      });
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    }

    // ======= CATEGORIES SECTION WITH PIE CHART =======
    if (config.sections.includes('categories')) {
      pdf.addPage();
      yPos = 20;
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Depenses par categorie', margin, yPos);
      yPos += 10;

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
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 10, cellPadding: 4 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { halign: 'right', cellWidth: 50 },
            2: { halign: 'center', cellWidth: 30 }
          },
          margin: { left: margin, right: margin },
        });
        yPos = (pdf as any).lastAutoTable.finalY + 15;
      }
    }

    // ======= EVOLUTION SECTION WITH CHART =======
    if (config.sections.includes('evolution')) {
      pdf.addPage();
      yPos = 20;
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Evolution du solde', margin, yPos);
      yPos += 10;

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
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Revenus par categorie', margin, yPos);
      yPos += 10;

      const incData = incomeAnalysis.map(inc => {
        const pct = stats.income > 0 ? ((inc.totalAmount / stats.income) * 100).toFixed(1) : '0.0';
        return [inc.category, formatAmount(inc.totalAmount), pct + '%', String(inc.count)];
      });

      autoTable(pdf, {
        startY: yPos,
        head: [['Source', 'Montant', 'Part', 'Nb']],
        body: incData,
        foot: [['TOTAL', formatAmount(stats.income), '100%', '']],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { halign: 'right', cellWidth: 50 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'center', cellWidth: 20 }
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
        yPos = 20;
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(59, 130, 246);
        pdf.text('Suivi des budgets', margin, yPos);
        yPos += 10;

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
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: {
            0: { cellWidth: 40 },
            1: { halign: 'right', cellWidth: 28 },
            2: { halign: 'right', cellWidth: 28 },
            3: { halign: 'right', cellWidth: 28 },
            4: { halign: 'center', cellWidth: 18 },
            5: { halign: 'center', cellWidth: 22 }
          },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 5) {
              const status = data.cell.raw;
              if (status === 'Depasse') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              } else if (status === 'Attention') {
                data.cell.styles.textColor = [234, 88, 12];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [22, 163, 74];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });
        yPos = (pdf as any).lastAutoTable.finalY + 15;
      }
    }

    // ======= TRANSACTIONS SECTION =======
    if (config.sections.includes('transactions')) {
      pdf.addPage();
      yPos = 20;
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Detail des transactions', margin, yPos);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(107, 114, 128);
      pdf.text(`${filteredTransactions.length} operations`, margin + 120, yPos);
      yPos += 10;

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
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'ellipsize' },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 26 },
          2: { cellWidth: 58 },
          3: { cellWidth: 24 },
          4: { halign: 'right', cellWidth: 26 },
          5: { halign: 'right', cellWidth: 26, fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin },
        showHead: 'everyPage',
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 4) {
            const value = String(data.cell.raw);
            if (value.startsWith('+')) {
              data.cell.styles.textColor = [22, 163, 74];
            } else if (value.startsWith('-')) {
              data.cell.styles.textColor = [220, 38, 38];
            }
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
        description: "Selectionnez au moins une section a inclure",
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
        description: "Impossible de generer le rapport",
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
        <Label className="text-sm font-medium">Format du rapport</Label>
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
                  <p className={cn("font-medium text-sm", isSelected && "text-primary")}>{info.label}</p>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
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
        <h3 className="font-medium">Recapitulatif du rapport</h3>
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
        <Label className="text-sm font-medium">Sections incluses</Label>
        <div className="flex flex-wrap gap-2">
          {config.sections.map(s => (
            <Badge key={s} variant="secondary" className="gap-1">
              {SECTION_INFO[s].label}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-sm font-medium">Donnees du rapport</Label>
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

  const content = (
    <div className="space-y-5">
      {/* Progress - Apple style dots */}
      <div className="flex items-center justify-center gap-3 py-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={cn(
              "transition-all duration-300 rounded-full",
              s === step
                ? "w-8 h-2 bg-primary shadow-lg shadow-primary/30"
                : s < step
                  ? "w-2 h-2 bg-primary/60"
                  : "w-2 h-2 bg-muted-foreground/20"
            )}
          />
        ))}
      </div>

      {/* Step indicator */}
      <div className="text-center">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {step === 1 ? t('reports.period') + ' & Format' : step === 2 ? 'Contenu' : 'Confirmation'}
        </span>
      </div>

      {/* Step Content */}
      <div className="min-h-[300px]">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      {/* Navigation - Apple style buttons */}
      <div className="flex justify-between pt-4 border-t border-border/50">
        <Button
          variant="ghost"
          onClick={() => step > 1 ? setStep(s => s - 1) : onOpenChange(false)}
          disabled={isGenerating}
          className="rounded-xl px-5 hover:bg-muted/50"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {step > 1 ? t('common.back') : t('common.cancel')}
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            className="rounded-xl px-6 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            {t('common.next')}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || config.sections.length === 0}
            className="rounded-xl px-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {t('common.export')}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );

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
          <DrawerContent className="max-h-[92vh] bg-background/80 backdrop-blur-2xl border-t border-white/20 shadow-2xl">
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-2xl">
          <DialogHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/12">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  {t('reports.export')}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {t('reports.generate')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
};
