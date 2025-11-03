import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { format, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
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
  const [isGenerating, setIsGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();

  const actualStartDate = periodType === 'custom' ? startDate : 
                          periodType === 'quarter' ? startOfQuarter(reportDate) :
                          periodType === 'year' ? startOfYear(reportDate) :
                          new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
  const actualEndDate = periodType === 'custom' ? endDate :
                        periodType === 'quarter' ? endOfQuarter(reportDate) :
                        periodType === 'year' ? endOfYear(reportDate) :
                        reportDate;

  const { stats, categoryChartData, balanceEvolutionData, incomeAnalysis } = useReportsData(
    periodType === 'custom' || periodType === 'quarter' ? 'custom' : periodType === 'year' ? 'year' : 'month',
    reportDate,
    periodType === 'custom' || periodType === 'quarter' ? { from: actualStartDate, to: actualEndDate } : undefined,
    false
  );

  const handleGenerate = async () => {
    if (!reportRef.current) return;
    
    setIsGenerating(true);
    try {
      // Temporarily make visible for rendering
      reportRef.current.style.left = '0';
      reportRef.current.style.position = 'fixed';
      reportRef.current.style.top = '0';
      reportRef.current.style.zIndex = '-1';
      
      // Wait for charts and content to render
      await new Promise(resolve => setTimeout(resolve, 2000));

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

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Convert canvas dimensions to PDF dimensions
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`rapport-financier-${format(reportDate, 'yyyy-MM-dd')}.pdf`);

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

  // Filter transactions by date range
  const filteredTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.transaction_date);
    return transactionDate >= actualStartDate && transactionDate <= actualEndDate;
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

  // Calculate total balance at end of period - this uses stats.finalBalance which is correct
  const totalBalance = stats.finalBalance;

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
  name: cat.category.length > 15 ? cat.category.substring(0, 15) + '...' : cat.category,
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
          {/* Date du rapport */}
          <div className="space-y-2">
            <Label>Date du rapport</Label>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={reportDate}
                onSelect={(date) => date && setReportDate(date)}
                locale={fr}
                className="rounded-md border"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Les soldes seront calculés à la date: {format(reportDate, 'dd MMMM yyyy', { locale: fr })}
            </p>
          </div>

          {/* Type de période */}
          <div className="space-y-2">
            <Label>Période des transactions</Label>
            <Select value={periodType} onValueChange={(value: 'month' | 'quarter' | 'year' | 'custom') => setPeriodType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois en cours</SelectItem>
                <SelectItem value="quarter">Trimestre en cours</SelectItem>
                <SelectItem value="year">Année en cours</SelectItem>
                <SelectItem value="custom">Période personnalisée</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

            {/* Budget Analysis Section */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 pb-2">Analyse Budget vs Dépenses</h2>
              {categoryChartData.filter(cat => cat.budget > 0).length === 0 ? (
                <div className="p-6 border border-gray-200 rounded-lg bg-white">
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
                          tick={{ fill: '#666', fontSize: 10 }}
                          stroke="#999"
                          width={100}
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
                    <div className="space-y-2 max-h-[var(--income-height)] overflow-y-auto" style={{ ['--income-height' as any]: `${incomeChartHeight}px` }}>
                      {incomeAnalysis.map((category, index) => {
                        const percentage = ((category.totalAmount / stats.income) * 100).toFixed(1);
                        const color = INCOME_COLORS[index % INCOME_COLORS.length];
                        
                        return (
                          <div key={category.category} className="border-b border-gray-100 pb-2 last:border-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div 
                                  className="w-2 h-2 rounded-full flex-shrink-0" 
                                  style={{ backgroundColor: color }}
                                />
                                <span className="text-xs font-medium text-gray-900 truncate">
                                  {category.category}
                                </span>
                              </div>
                              <span className="text-xs font-bold text-green-600 ml-2">
                                {formatCurrency(category.totalAmount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 ml-4">
                              <span>{category.count} transaction{category.count > 1 ? 's' : ''}</span>
                              <span>{percentage}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All Transactions Table */}
            <div className="space-y-4">
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
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions
                        .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
                        .map((transaction) => (
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
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={5} className="p-3 text-right font-bold text-gray-900">Total des transactions:</td>
                        <td className="p-3 text-right font-bold text-gray-900">{filteredTransactions.length}</td>
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