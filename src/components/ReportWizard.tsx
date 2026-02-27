import { useState, useMemo, useRef } from "react";
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
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfQuarter, endOfQuarter, subMonths } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useReportsData } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      return date >= actualDates.start && date <= actualDates.end;
    }).sort((a, b) => {
      const dateA = config.dateType === 'value'
        ? new Date(a.value_date || a.transaction_date)
        : new Date(a.transaction_date);
      const dateB = config.dateType === 'value'
        ? new Date(b.value_date || b.transaction_date)
        : new Date(b.transaction_date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [transactions, actualDates, config.dateType]);

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

  // PDF Generation
  const generatePDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = 20;

    // Helper functions
    const addPageIfNeeded = (requiredSpace: number) => {
      if (yPos + requiredSpace > pdf.internal.pageSize.getHeight() - 20) {
        pdf.addPage();
        yPos = 20;
      }
    };

    const formatAmount = (value: number) => {
      return new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value) + ' EUR';
    };

    // Header
    pdf.setFillColor(59, 130, 246);
    pdf.rect(0, 0, pageWidth, 35, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Rapport Financier', margin, 18);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `${format(actualDates.start, 'dd MMMM yyyy', { locale })} - ${format(actualDates.end, 'dd MMMM yyyy', { locale })}`,
      margin, 28
    );
    pdf.setTextColor(200, 220, 255);
    pdf.setFontSize(9);
    pdf.text(`Genere le ${format(new Date(), 'dd/MM/yyyy a HH:mm', { locale })}`, pageWidth - margin - 60, 28);

    yPos = 45;
    pdf.setTextColor(0, 0, 0);

    // Summary Section
    if (config.sections.includes('summary')) {
      addPageIfNeeded(50);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Synthese de la periode', margin, yPos);
      yPos += 8;

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
        headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
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

    // Accounts Section
    if (config.sections.includes('accounts')) {
      addPageIfNeeded(40);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Soldes des comptes', margin, yPos);
      yPos += 8;

      const accountData = accounts.map(acc => [
        acc.name,
        acc.bank,
        acc.account_type === 'checking' ? 'Courant' :
          acc.account_type === 'savings' ? 'Epargne' :
          acc.account_type === 'credit' ? 'Credit' : 'Titre',
        formatAmount(Number(acc.balance))
      ]);

      autoTable(pdf, {
        startY: yPos,
        head: [['Compte', 'Banque', 'Type', 'Solde']],
        body: accountData,
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
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

    // Categories Section
    if (config.sections.includes('categories')) {
      addPageIfNeeded(60);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Depenses par categorie', margin, yPos);
      yPos += 8;

      const catData = categoryChartData
        .filter(c => c.spent > 0)
        .sort((a, b) => b.spent - a.spent)
        .map(cat => {
          const pct = stats.expenses > 0 ? ((cat.spent / stats.expenses) * 100).toFixed(1) : '0.0';
          return [cat.name, formatAmount(cat.spent), pct + '%'];
        });

      if (catData.length > 0) {
        autoTable(pdf, {
          startY: yPos,
          head: [['Categorie', 'Montant', 'Part']],
          body: catData,
          theme: 'striped',
          headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
          styles: { fontSize: 9, cellPadding: 3 },
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

    // Income Section
    if (config.sections.includes('income') && incomeAnalysis.length > 0) {
      addPageIfNeeded(60);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Revenus par categorie', margin, yPos);
      yPos += 8;

      const incData = incomeAnalysis.map(inc => {
        const pct = stats.income > 0 ? ((inc.totalAmount / stats.income) * 100).toFixed(1) : '0.0';
        return [inc.category, formatAmount(inc.totalAmount), pct + '%', String(inc.count)];
      });

      autoTable(pdf, {
        startY: yPos,
        head: [['Source', 'Montant', 'Part', 'Nb']],
        body: incData,
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { halign: 'right', cellWidth: 45 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'center', cellWidth: 20 }
        },
        margin: { left: margin, right: margin },
      });
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    }

    // Budgets Section
    if (config.sections.includes('budgets')) {
      const budgetCategories = categoryChartData.filter(c => c.budget > 0);
      if (budgetCategories.length > 0) {
        addPageIfNeeded(60);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(59, 130, 246);
        pdf.text('Suivi des budgets', margin, yPos);
        yPos += 8;

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
          headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold', fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
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

    // Transactions Section
    if (config.sections.includes('transactions')) {
      pdf.addPage();
      yPos = 20;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(59, 130, 246);
      pdf.text('Detail des transactions', margin, yPos);
      yPos += 8;

      // Calculate running balance
      let runningBalance = stats.initialBalance;
      const txData = filteredTransactions.map(t => {
        const amount = Number(t.amount);
        if (t.type === 'income') runningBalance += amount;
        else if (t.type === 'expense') runningBalance -= amount;

        const displayDate = config.dateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);

        return [
          format(displayDate, 'dd/MM/yy'),
          accounts.find(a => a.id === t.account_id)?.name?.substring(0, 15) || '-',
          t.description.substring(0, 30) + (t.description.length > 30 ? '...' : ''),
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
        headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold', fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 2, overflow: 'ellipsize' },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 28 },
          2: { cellWidth: 55 },
          3: { cellWidth: 25 },
          4: { halign: 'right', cellWidth: 25 },
          5: { halign: 'right', cellWidth: 25, fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin },
        showHead: 'everyPage',
        didDrawPage: (data: any) => {
          // Footer on each page
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          pdf.text(
            `Page ${pdf.getCurrentPageInfo().pageNumber}`,
            pageWidth / 2,
            pdf.internal.pageSize.getHeight() - 10,
            { align: 'center' }
          );
        }
      });
    }

    pdf.save(`rapport-${format(actualDates.start, 'yyyy-MM')}.pdf`);
  };

  // Excel Generation
  const generateExcel = async () => {
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
      const txRows = filteredTransactions.map(t => {
        const amount = Number(t.amount);
        if (t.type === 'income') runningBalance += amount;
        else if (t.type === 'expense') runningBalance -= amount;

        const displayDate = config.dateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);

        return [
          format(displayDate, 'dd/MM/yyyy'),
          accounts.find(a => a.id === t.account_id)?.name || '',
          t.description,
          t.category?.name || '',
          t.type === 'income' ? 'Revenu' : t.type === 'expense' ? 'Depense' : 'Virement',
          t.type === 'expense' ? -amount : amount,
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
    <div className="space-y-4">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Format du rapport</Label>
        <div className="grid grid-cols-2 gap-3">
          <Card
            className={cn(
              "cursor-pointer transition-all",
              config.format === 'pdf' && "ring-2 ring-primary"
            )}
            onClick={() => setConfig(prev => ({ ...prev, format: 'pdf' }))}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <FileText className={cn("h-8 w-8", config.format === 'pdf' ? "text-primary" : "text-muted-foreground")} />
              <span className="font-medium">PDF</span>
              <span className="text-xs text-muted-foreground text-center">Rapport visuel avec graphiques</span>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "cursor-pointer transition-all",
              config.format === 'excel' && "ring-2 ring-primary"
            )}
            onClick={() => setConfig(prev => ({ ...prev, format: 'excel' }))}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <FileSpreadsheet className={cn("h-8 w-8", config.format === 'excel' ? "text-primary" : "text-muted-foreground")} />
              <span className="font-medium">Excel</span>
              <span className="text-xs text-muted-foreground text-center">Donnees exploitables</span>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm font-medium">Periode</Label>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={config.periodType === 'month' && config.startDate.getMonth() === new Date().getMonth() ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => handlePeriodPreset('thisMonth')}
          >
            Ce mois
          </Badge>
          <Badge
            variant="outline"
            className="cursor-pointer"
            onClick={() => handlePeriodPreset('lastMonth')}
          >
            Mois dernier
          </Badge>
          <Badge
            variant={config.periodType === 'quarter' ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => handlePeriodPreset('thisQuarter')}
          >
            Ce trimestre
          </Badge>
          <Badge
            variant={config.periodType === 'year' ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => handlePeriodPreset('thisYear')}
          >
            Cette annee
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type de periode</Label>
            <Select
              value={config.periodType}
              onValueChange={(v: any) => setConfig(prev => ({ ...prev, periodType: v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Annee</SelectItem>
                <SelectItem value="custom">Personnalise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type de date</Label>
            <Select
              value={config.dateType}
              onValueChange={(v: any) => setConfig(prev => ({ ...prev, dateType: v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accounting">Date comptable</SelectItem>
                <SelectItem value="value">Date valeur</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.periodType === 'month' && (
          <MonthPicker
            value={config.startDate}
            onChange={(d) => setConfig(prev => ({ ...prev, startDate: d || new Date() }))}
          />
        )}
        {config.periodType === 'year' && (
          <YearPicker
            value={config.startDate}
            onChange={(d) => setConfig(prev => ({ ...prev, startDate: d || new Date() }))}
          />
        )}
      </div>

      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          Periode selectionnee : <span className="font-medium text-foreground">
            {format(actualDates.start, 'dd MMM yyyy', { locale })} - {format(actualDates.end, 'dd MMM yyyy', { locale })}
          </span>
        </p>
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
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Etape {step} sur {totalSteps}</span>
          <span>{step === 1 ? 'Format & Periode' : step === 2 ? 'Contenu' : 'Confirmation'}</span>
        </div>
        <Progress value={(step / totalSteps) * 100} className="h-2" />
      </div>

      {/* Step Content */}
      <div className="min-h-[300px]">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => step > 1 ? setStep(s => s - 1) : onOpenChange(false)}
          disabled={isGenerating}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {step > 1 ? 'Precedent' : 'Annuler'}
        </Button>

        {step < totalSteps ? (
          <Button onClick={() => setStep(s => s + 1)}>
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={isGenerating || config.sections.length === 0}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generation...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Telecharger
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );

  // Use Drawer on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="pb-0">
            <DrawerTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exporter un rapport
            </DrawerTitle>
            <DrawerDescription>
              Generez un rapport PDF ou Excel personnalise
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 overflow-y-auto">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exporter un rapport
          </DialogTitle>
          <DialogDescription>
            Generez un rapport PDF ou Excel personnalise
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
