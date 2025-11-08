import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { FileText, Loader2 } from "lucide-react";
import { format, startOfQuarter, endOfQuarter, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import html2canvas from "html2canvas";
import { toast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useReportsData } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from "recharts";

interface ReportGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReportGeneratorModal = ({ open, onOpenChange }: ReportGeneratorModalProps) => {
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [dateType, setDateType] = useState<'accounting' | 'value'>('accounting');
  const [isGenerating, setIsGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const transactionsSectionRef = useRef<HTMLDivElement>(null);

  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();

  // PDF-only currency formatting to avoid non-breaking spaces turning into slashes
  const pdfFormatAbs = (value: number) => {
    const n = Math.abs(Number(value) || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
  };
  const pdfFormatWithSign = (value: number) => {
    const sign = (Number(value) || 0) < 0 ? '-' : '';
    const n = Math.abs(Number(value) || 0);
    return sign + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
  };

  const actualStartDate = periodType === 'custom' ? startDate : 
                          periodType === 'quarter' ? startOfQuarter(reportDate) :
                          periodType === 'year' ? startOfYear(reportDate) :
                          startOfMonth(reportDate);
  const actualEndDate = periodType === 'custom' ? endDate :
                        periodType === 'quarter' ? endOfQuarter(reportDate) :
                        periodType === 'year' ? endOfYear(reportDate) :
                        endOfMonth(reportDate);

  const { stats, categoryChartData, balanceEvolutionData, incomeAnalysis } = useReportsData(
    periodType === 'custom' || periodType === 'quarter' ? 'custom' : periodType === 'year' ? 'year' : 'month',
    reportDate,
    periodType === 'custom' || periodType === 'quarter' ? { from: actualStartDate, to: actualEndDate } : undefined,
    false,
    dateType
  );

  const handleGenerate = async () => {
    if (!reportRef.current) return;
    
    setIsGenerating(true);
    try {
      // Create PDF with proper sectioning
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Temporarily make visible for rendering
      reportRef.current.style.left = '0';
      reportRef.current.style.position = 'fixed';
      reportRef.current.style.top = '0';
      reportRef.current.style.zIndex = '-1';

      // Hide transactions section during capture to avoid double rendering across pages
      if (transactionsSectionRef.current) {
        transactionsSectionRef.current.style.display = 'none';
      }

      // Wait for charts and content to render
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate charts and summary sections first
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
        width: 1200,
      });

      // Hide again
      reportRef.current.style.left = '-9999px';
      reportRef.current.style.position = 'absolute';

      // Restore transactions section visibility for the rest of the app
      if (transactionsSectionRef.current) {
        transactionsSectionRef.current.style.display = 'block';
      }

      const imgData = canvas.toDataURL('image/png');
      
      // Convert canvas dimensions to PDF dimensions
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page with charts
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add additional pages if charts content is longer than one page
      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      // Add transactions table with autotable for proper pagination
      const tableData = transactionsWithBalance.map(t => {
        const amountNum = Number(t.amount);
        const amountStr = (t.type === 'income' ? '+' : '-') + pdfFormatAbs(amountNum);
        const balanceStr = pdfFormatWithSign(t.runningBalance);
        return [
          format(new Date(t.transaction_date), 'dd/MM/yyyy'),
          accounts.find(a => a.id === t.account_id)?.name || '-',
          t.description,
          t.category?.name || '-',
          t.type === 'income' ? 'Revenu' : t.type === 'expense' ? 'Dépense' : 'Virement',
          amountStr,
          balanceStr,
        ];
      });

      // Build table body with summary rows in correct order
      const tableBody = [
        ['__SUM__START', 'Solde début', '', '', '', '', pdfFormatWithSign(startingBalance)],
        ...tableData,
        ['__SUM__END', 'Solde fin', '', '', '', '', pdfFormatWithSign(totalBalance)],
        ['__SUM__TOTAL', 'Total transactions', '', '', '', '', String(transactionsWithBalance.length)],
      ];

      pdf.addPage();
      
      let txFirstPage = true;
      
      // Add transactions table with autoTable
      autoTable(pdf, {
        head: [['Date', 'Compte', 'Description', 'Catégorie', 'Type', 'Montant', 'Solde']],
        body: tableBody,
        startY: 25,
        theme: 'grid',
        tableWidth: 'auto',
        headStyles: { 
          fillColor: [243, 244, 246],
          textColor: [55, 65, 81],
          fontStyle: 'bold',
          lineWidth: 0.5,
          lineColor: [209, 213, 219],
          halign: 'left',
          fontSize: 7
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
          lineColor: [229, 231, 235],
          lineWidth: 0.1,
          halign: 'left',
          overflow: 'linebreak'
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 20 }, // Date
          1: { cellWidth: 'wrap' }, // Compte
          2: { cellWidth: 'wrap' }, // Description
          3: { cellWidth: 'wrap' }, // Catégorie
          4: { cellWidth: 18 }, // Type
          5: { halign: 'right', cellWidth: 22 }, // Montant
          6: { halign: 'right', fontStyle: 'bold', cellWidth: 22 } // Solde
        },
        didDrawPage: (data: any) => {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0);
          pdf.setFontSize(txFirstPage ? 16 : 14);
          pdf.text(txFirstPage ? 'Détail des Transactions' : 'Détail des Transactions (suite)', 14, 15);
          txFirstPage = false;
        },
        didParseCell: (data: any) => {
          const raw = data.row?.raw;
          if (raw && typeof raw[0] === 'string' && raw[0].startsWith('__SUM__')) {
            // Style for summary rows
            data.cell.styles.fillColor = [249, 250, 251];
            data.cell.styles.fontStyle = 'bold';

            // Merge first 5 columns into one label cell
            if (data.column.index === 0) {
              data.cell.text = [String(raw[1])];
              data.cell.colSpan = 5; // spans columns 0..4
              data.cell.styles.halign = 'left';
            } else if (data.column.index > 0 && data.column.index < 5) {
              data.cell.text = ['']; // hidden by colSpan
            } else if (data.column.index === 5) {
              data.cell.text = ['']; // empty amount column for summary
            } else if (data.column.index === 6) {
              data.cell.styles.halign = 'right';
              data.cell.text = [String(raw[6])];
            }
          }
        },
        showHead: 'everyPage',
        showFoot: 'never',
        margin: { top: 25, bottom: 15, left: 14, right: 14 }
      });

      pdf.save(`rapport-financier-${format(actualStartDate, 'yyyy-MM-dd')}.pdf`);

      toast({
        title: "Rapport généré",
        description: "Le PDF a été téléchargé avec succès",
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Erreur",
        description: "Impossible de générer le rapport",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Calculate total balance at end of period - needed first for other calculations
  const totalBalance = stats.finalBalance;

  // Filter transactions by date range and sort chronologically
  const filteredTransactions = transactions
    .filter(t => {
      const transactionDate = new Date(t.transaction_date);
      return transactionDate >= actualStartDate && transactionDate <= actualEndDate;
    })
    .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

  // Calculate starting balance (beginning of period)
  // Starting balance = final balance - net period balance
  const startingBalance = totalBalance - stats.netPeriodBalance;
  
  // Add running balance to transactions
  let runningBalance = startingBalance;
  const transactionsWithBalance = filteredTransactions.map(transaction => {
    const amount = Number(transaction.amount);
    if (transaction.type === 'income') {
      runningBalance += amount;
    } else if (transaction.type === 'expense') {
      runningBalance -= amount;
    }
    // For transfers, the amount was already subtracted from source account
    // We don't modify running balance for transfers as it's internal movement
    
    return {
      ...transaction,
      runningBalance: runningBalance
    };
  });

  // Calculate account balances at end of selected period
  // Start from current balance and subtract transactions after the end date
  const accountBalances = accounts.map(account => {
    // Get transactions that happened AFTER the end date
    const transactionsAfterEndDate = transactions.filter(t => {
      const transactionDate = new Date(t.transaction_date);
      return (t.account_id === account.id || t.transfer_to_account_id === account.id) && 
             transactionDate > actualEndDate;
    });

    // Start with current balance and reverse transactions after end date
    let balanceAtEndDate = Number(account.balance);
    transactionsAfterEndDate.forEach(t => {
      if (t.account_id === account.id) {
        if (t.type === 'income') balanceAtEndDate -= Number(t.amount);
        if (t.type === 'expense') balanceAtEndDate += Number(t.amount);
        if (t.type === 'transfer') balanceAtEndDate += Number(t.amount) + Number(t.transfer_fee || 0);
      }
      if (t.transfer_to_account_id === account.id && t.type === 'transfer') {
        balanceAtEndDate -= Number(t.amount);
      }
    });

    return { ...account, currentBalance: balanceAtEndDate };
  });

  // Prepare category chart data - top 10 categories by spending
  const topCategories = categoryChartData
    .filter(cat => cat.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 10)
    .map(cat => ({
      name: cat.name.length > 15 ? cat.name.substring(0, 15) + '...' : cat.name,
      spent: cat.spent,
      remaining: Math.max(0, cat.budget - cat.spent),
      budget: cat.budget,
      color: cat.color
    }));

  // Couleurs pour les catégories de revenus
  const INCOME_COLORS = [
    '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899',
    '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16'
  ];

const incomeChartData = incomeAnalysis.slice(0, 10).map((cat, index) => ({
  name: cat.category.length > 20 ? cat.category.substring(0, 20) + '...' : cat.category,
  fullName: cat.category,
  amount: cat.totalAmount,
  count: cat.count,
  color: INCOME_COLORS[index % INCOME_COLORS.length]
}));

const incomeChartHeight = Math.max(280, Math.min(640, incomeChartData.length * 40));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Générer un Rapport PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Type de période */}
          <div className="space-y-2">
            <Label>Type de période</Label>
            <Select value={periodType} onValueChange={(value: 'month' | 'quarter' | 'year' | 'custom') => setPeriodType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Année</SelectItem>
                <SelectItem value="custom">Période personnalisée</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type de date */}
          <div className="space-y-2">
            <Label>Type de date pour les calculs</Label>
            <Select value={dateType} onValueChange={(value: 'accounting' | 'value') => setDateType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accounting">Date Comptable</SelectItem>
                <SelectItem value="value">Date Valeur</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Indépendant du paramètre global dans les préférences
            </p>
          </div>

          {/* Sélecteur de mois */}
          {periodType === 'month' && (
            <div className="space-y-2">
              <Label>Sélectionner le mois</Label>
              <MonthPicker
                selected={reportDate}
                onSelect={(date) => date && setReportDate(date)}
                placeholder="Choisir un mois"
              />
            </div>
          )}

          {/* Sélecteur de trimestre */}
          {periodType === 'quarter' && (
            <div className="space-y-2">
              <Label>Sélectionner le trimestre</Label>
              <div className="grid grid-cols-2 gap-4">
                <Select 
                  value={Math.floor(reportDate.getMonth() / 3).toString()} 
                  onValueChange={(value) => {
                    const quarter = parseInt(value);
                    const newDate = new Date(reportDate.getFullYear(), quarter * 3, 1);
                    setReportDate(newDate);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Q1 (Jan-Mar)</SelectItem>
                    <SelectItem value="1">Q2 (Avr-Juin)</SelectItem>
                    <SelectItem value="2">Q3 (Juil-Sep)</SelectItem>
                    <SelectItem value="3">Q4 (Oct-Déc)</SelectItem>
                  </SelectContent>
                </Select>
                <YearPicker
                  selected={reportDate}
                  onSelect={(date) => date && setReportDate(date)}
                  placeholder="Année"
                />
              </div>
            </div>
          )}

          {/* Sélecteur d'année */}
          {periodType === 'year' && (
            <div className="space-y-2">
              <Label>Sélectionner l'année</Label>
              <YearPicker
                selected={reportDate}
                onSelect={(date) => date && setReportDate(date)}
                placeholder="Choisir une année"
              />
            </div>
          )}

          {/* Période personnalisée */}
          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date de début</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    locale={fr}
                    className="rounded-md border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    locale={fr}
                    className="rounded-md border"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Résumé de la période sélectionnée */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-1">Période du rapport</p>
            <p className="text-sm text-muted-foreground">
              Du {format(actualStartDate, 'dd MMMM yyyy', { locale: fr })} au {format(actualEndDate, 'dd MMMM yyyy', { locale: fr })}
            </p>
          </div>

          {/* Hidden report content for PDF generation */}
          <div 
            ref={reportRef} 
            className="absolute left-[-9999px] w-[1200px] bg-white p-10 space-y-6"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {/* Header */}
            <div className="border-b-2 border-blue-600 pb-4">
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Rapport Financier</h1>
              <div className="flex justify-between text-gray-600 text-sm">
                <p>Période: {format(actualStartDate, 'dd MMM', { locale: fr })} - {format(actualEndDate, 'dd MMM yyyy', { locale: fr })}</p>
                <p>Généré le: {format(new Date(), 'dd MMMM yyyy', { locale: fr })}</p>
              </div>
            </div>

            {/* Summary Stats - Compact */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 border border-green-300 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Revenus</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(stats.income)}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 border border-red-300 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Dépenses</p>
                <p className="text-2xl font-bold text-red-700">{formatCurrency(stats.expenses)}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-300 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Net Période</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrency(stats.netPeriodBalance)}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-300 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Solde Final</p>
                <p className="text-2xl font-bold text-purple-700">{formatCurrency(totalBalance)}</p>
              </div>
            </div>

            {/* Two Column Layout for Charts */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left Column: Balance Evolution */}
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 pb-2">Évolution du Solde</h2>
                <div className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={balanceEvolutionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: '#666', fontSize: 10 }}
                        stroke="#999"
                      />
                      <YAxis 
                        tick={{ fill: '#666', fontSize: 10 }}
                        stroke="#999"
                        width={60}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', fontSize: 12 }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="solde" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Account Balances under chart */}
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-2">Soldes des Comptes</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {accountBalances.map(account => (
                      <div key={account.id} className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded border border-gray-200 flex justify-between items-center">
                        <div>
                          <p className="text-xs text-gray-600">{account.name}</p>
                          <p className="text-sm font-semibold text-gray-900">{account.bank} - {account.account_type}</p>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(account.currentBalance)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Category Spending */}
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 pb-2">Dépenses par Catégorie</h2>
                <div className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                  <ResponsiveContainer width="100%" height={280 + 70 + (accountBalances.length * 60)}>
                    <BarChart data={topCategories} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        type="number"
                        tick={{ fill: '#666', fontSize: 10 }}
                        stroke="#999"
                      />
                      <YAxis 
                        type="category"
                        dataKey="name" 
                        tick={{ fill: '#666', fontSize: 10 }}
                        stroke="#999"
                        width={120}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', fontSize: 12 }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar 
                        dataKey="spent" 
                        fill="currentColor"
                        radius={[0, 4, 4, 0]}
                      >
                        {topCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} opacity={0.9} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Income Analysis Section */}
            {incomeAnalysis.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 pb-2">Analyse des Revenus</h2>
                <div className="grid grid-cols-2 gap-4">
                  {/* Income Chart */}
                  <div className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Revenus par Catégorie</h3>
                    <ResponsiveContainer width="100%" height={incomeChartHeight}>
                      <BarChart data={incomeChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                        <XAxis 
                          type="number"
                          tick={{ fill: '#666', fontSize: 10 }}
                          stroke="#999"
                        />
                        <YAxis 
                          type="category"
                          dataKey="name" 
                          tick={{ fill: '#666', fontSize: 9 }}
                          stroke="#999"
                          width={140}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', fontSize: 12 }}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                          {incomeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                   <div className="border border-gray-200 rounded-lg bg-white p-4">
                     <h3 className="text-sm font-semibold text-gray-900 mb-3">Détail des Catégories</h3>
                     <div className="space-y-2 overflow-y-auto" style={{ maxHeight: `${incomeChartHeight}px` }}>
                       {incomeAnalysis.map((category, index) => {
                         const percentage = ((category.totalAmount / stats.income) * 100).toFixed(1);
                         const color = INCOME_COLORS[index % INCOME_COLORS.length];
                         
                         return (
                           <div key={category.category} className="border-b border-gray-100 pb-2 last:border-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                  <div 
                                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1" 
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="text-xs font-medium text-gray-900 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                    {category.category}
                                  </span>
                                </div>
                                <div className="text-right flex-shrink-0 ml-2 whitespace-nowrap">
                                  <div className="text-xs font-bold text-green-600">
                                    {formatCurrency(category.totalAmount)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {percentage}%
                                  </div>
                                </div>
                              </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>
                </div>
              </div>
            )}

            {/* Budget Analysis Section */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 pb-2">Analyse Budget vs Dépenses</h2>
              {categoryChartData.filter(cat => cat.budget > 0).length === 0 ? (
              <div className="p-6 border border-gray-200 rounded-lg bg-white" ref={transactionsSectionRef}>
                  <div className="text-center py-6 text-gray-500">
                    Aucun budget défini pour cette période
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg bg-white p-4">
                  <div className="space-y-3">
                    {categoryChartData
                      .filter(cat => cat.budget > 0)
                      .sort((a, b) => b.spent - a.spent)
                      .map((category) => {
                        const percentUsed = category.budget > 0 ? (category.spent / category.budget) * 100 : 0;
                        const isOverBudget = category.spent > category.budget;
                        const remaining = category.budget - category.spent;
                        
                        return (
                          <div key={category.name} className="border border-gray-200 rounded-lg p-3 bg-gradient-to-r from-gray-50 to-white">
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex-1 min-w-0 pr-4">
                                <h3 className="text-sm font-semibold text-gray-900">{category.name}</h3>
                                <p className="text-xs text-gray-500">
                                  Budget: {formatCurrency(category.budget)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className={`text-base font-bold ${isOverBudget ? 'text-red-600' : 'text-gray-900'}`}>
                                  {formatCurrency(category.spent)}
                                </p>
                                <p className={`text-xs font-medium ${
                                  percentUsed >= 100 ? 'text-red-600' : 
                                  percentUsed >= 80 ? 'text-orange-600' : 
                                  'text-green-600'
                                }`}>
                                  {percentUsed.toFixed(0)}%
                                </p>
                              </div>
                            </div>
                            
                            {/* Progress bar */}
                            <div className="relative w-full bg-gray-200 rounded-full h-2.5 overflow-hidden mb-2">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  percentUsed >= 100 ? 'bg-red-500' : 
                                  percentUsed >= 80 ? 'bg-orange-500' : 
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(percentUsed, 100)}%` }}
                              />
                            </div>
                            
                            <div className="flex justify-between items-center">
                              <span className={`text-xs font-medium ${isOverBudget ? 'text-red-600' : 'text-gray-600'}`}>
                                {isOverBudget 
                                  ? `Dépassement: ${formatCurrency(Math.abs(remaining))}`
                                  : `Restant: ${formatCurrency(remaining)}`
                                }
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                percentUsed >= 100 ? 'bg-red-100 text-red-700' : 
                                percentUsed >= 80 ? 'bg-orange-100 text-orange-700' : 
                                'bg-green-100 text-green-700'
                              }`}>
                                {percentUsed >= 100 ? 'Dépassé' : 
                                 percentUsed >= 80 ? 'Attention' : 
                                 'OK'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* All Transactions Table */}
            <div className="space-y-4" ref={transactionsSectionRef}>
              <h2 className="text-2xl font-bold text-gray-900">Détail des Transactions</h2>
              <div className="p-6 border border-gray-200 rounded-lg bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-2 text-gray-700 border-b-2 border-gray-300">Date</th>
                        <th className="text-left p-2 text-gray-700 border-b-2 border-gray-300">Compte</th>
                        <th className="text-left p-2 text-gray-700 border-b-2 border-gray-300">Description</th>
                        <th className="text-left p-2 text-gray-700 border-b-2 border-gray-300">Catégorie</th>
                        <th className="text-left p-2 text-gray-700 border-b-2 border-gray-300">Type</th>
                        <th className="text-right p-2 text-gray-700 border-b-2 border-gray-300">Montant</th>
                        <th className="text-right p-2 text-gray-700 border-b-2 border-gray-300">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionsWithBalance.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-gray-200">
                          <td className="p-2 text-gray-600">
                            {format(new Date(transaction.transaction_date), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-2 text-gray-700">
                            {accounts.find(a => a.id === transaction.account_id)?.name || '-'}
                          </td>
                          <td className="p-2 text-gray-900">{transaction.description}</td>
                          <td className="p-2 text-gray-600 text-xs">
                            {transaction.category?.name || '-'}
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              transaction.type === 'income' ? 'bg-green-100 text-green-700' :
                              transaction.type === 'expense' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {transaction.type === 'income' ? 'Revenu' : 
                               transaction.type === 'expense' ? 'Dépense' : 'Virement'}
                            </span>
                          </td>
                          <td className={`p-2 text-right font-semibold ${
                            transaction.type === 'income' ? 'text-green-700' :
                            transaction.type === 'expense' ? 'text-red-700' :
                            'text-blue-700'
                          }`}>
                            {transaction.type === 'income' ? '+' : '-'}
                            {formatCurrency(Number(transaction.amount))}
                          </td>
                          <td className="p-2 text-right font-bold text-gray-900">
                            {formatCurrency(transaction.runningBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={5} className="p-3 text-right font-bold text-gray-900">Total des transactions:</td>
                        <td className="p-3 text-right font-bold text-gray-900" colSpan={2}>{transactionsWithBalance.length}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-3 text-right font-bold text-gray-900">Solde début de période:</td>
                        <td className="p-3 text-right font-bold text-blue-700" colSpan={2}>{formatCurrency(startingBalance)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-3 text-right font-bold text-gray-900">Solde fin de période:</td>
                        <td className="p-3 text-right font-bold text-purple-700" colSpan={2}>{formatCurrency(totalBalance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t-2 border-gray-200 pt-6 text-center text-gray-500 text-sm">
              <p>Rapport généré le {format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Générer et Télécharger le PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};