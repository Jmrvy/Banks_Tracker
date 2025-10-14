import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
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
  const [periodType, setPeriodType] = useState<'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();

  const actualStartDate = periodType === 'custom' ? startDate : new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
  const actualEndDate = periodType === 'custom' ? endDate : reportDate;

  const { stats, categoryChartData, balanceEvolutionData } = useReportsData(
    periodType === 'custom' ? 'custom' : 'month',
    reportDate,
    periodType === 'custom' ? { from: actualStartDate, to: actualEndDate } : undefined,
    false
  );

  const handleGenerate = async () => {
    if (!reportRef.current) return;
    
    setIsGenerating(true);
    try {
      // Wait for charts to render
      await new Promise(resolve => setTimeout(resolve, 1000));

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight) * 72;

      let heightLeft = imgHeight * ratio;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth * ratio, imgHeight * ratio);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight * ratio;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth * ratio, imgHeight * ratio);
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

  // Calculate account balances at report date
  const accountBalances = accounts.map(account => {
    const accountTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.transaction_date);
      return (t.account_id === account.id || t.transfer_to_account_id === account.id) && 
             transactionDate <= reportDate;
    });

    let balance = 0;
    accountTransactions.forEach(t => {
      if (t.account_id === account.id) {
        if (t.type === 'income') balance += Number(t.amount);
        if (t.type === 'expense') balance -= Number(t.amount);
        if (t.type === 'transfer') balance -= Number(t.amount) + Number(t.transfer_fee || 0);
      }
      if (t.transfer_to_account_id === account.id && t.type === 'transfer') {
        balance += Number(t.amount);
      }
    });

    return { ...account, currentBalance: balance };
  });

  // Prepare category chart data for stacked bars
  const stackedBarData = categoryChartData
    .filter(cat => cat.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8)
    .map(cat => ({
      name: cat.name.length > 12 ? cat.name.substring(0, 12) + '...' : cat.name,
      spent: cat.spent,
      remaining: Math.max(0, cat.budget - cat.spent),
      budget: cat.budget,
      color: cat.color
    }));

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
            <Select value={periodType} onValueChange={(value: 'month' | 'custom') => setPeriodType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois en cours</SelectItem>
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
            className="absolute left-[-9999px] w-[1200px] bg-white p-12 space-y-8"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {/* Header */}
            <div className="border-b-4 border-blue-600 pb-6">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Rapport Financier</h1>
              <div className="flex justify-between text-gray-600">
                <p className="text-lg">Date du rapport: {format(reportDate, 'dd MMMM yyyy', { locale: fr })}</p>
                <p className="text-lg">Période: {format(actualStartDate, 'dd MMM', { locale: fr })} - {format(actualEndDate, 'dd MMM yyyy', { locale: fr })}</p>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-6">
              <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Revenus</p>
                <p className="text-3xl font-bold text-green-700">{formatCurrency(stats.income)}</p>
              </div>
              <div className="p-6 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Dépenses</p>
                <p className="text-3xl font-bold text-red-700">{formatCurrency(stats.expenses)}</p>
              </div>
              <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Solde Net</p>
                <p className="text-3xl font-bold text-blue-700">{formatCurrency(stats.netPeriodBalance)}</p>
              </div>
            </div>

            {/* Account Balances */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900">Soldes des Comptes</h2>
              <div className="grid grid-cols-2 gap-4">
                {accountBalances.map(account => (
                  <div key={account.id} className="p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-600">{account.name}</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(account.currentBalance)}</p>
                      </div>
                      <div className="text-xs text-gray-500 text-right">
                        <p>{account.bank}</p>
                        <p>{account.account_type}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Balance Evolution Chart */}
            {balanceEvolutionData.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900">Évolution du Solde</h2>
                <div className="p-6 border border-gray-200 rounded-lg bg-white">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={balanceEvolutionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: '#666', fontSize: 12 }}
                        stroke="#999"
                      />
                      <YAxis 
                        tick={{ fill: '#666', fontSize: 12 }}
                        stroke="#999"
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        dot={{ fill: '#3b82f6', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Category Spending Chart */}
            {stackedBarData.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900">Dépenses par Catégorie vs Budget</h2>
                <div className="p-6 border border-gray-200 rounded-lg bg-white">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={stackedBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fill: '#666', fontSize: 11 }}
                        stroke="#999"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis 
                        tick={{ fill: '#666', fontSize: 12 }}
                        stroke="#999"
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar 
                        dataKey="spent" 
                        stackId="a"
                        fill="currentColor"
                        radius={[0, 0, 0, 0]}
                      >
                        {stackedBarData.map((entry, index) => (
                          <Cell key={`spent-${index}`} fill={entry.color} opacity={0.9} />
                        ))}
                      </Bar>
                      <Bar 
                        dataKey="remaining" 
                        stackId="a"
                        fill="#e0e0e0"
                        radius={[4, 4, 0, 0]}
                        opacity={0.4}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex justify-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-600 rounded"></div>
                      <span className="text-gray-700">Dépensé</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-300 rounded"></div>
                      <span className="text-gray-700">Budget restant</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transactions by Account */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900">Transactions par Compte</h2>
              {accountBalances.map(account => {
                const accountTrans = filteredTransactions.filter(t => 
                  t.account_id === account.id || t.transfer_to_account_id === account.id
                );

                if (accountTrans.length === 0) return null;

                return (
                  <div key={account.id} className="p-6 border border-gray-200 rounded-lg bg-white">
                    <h3 className="text-xl font-semibold mb-4 text-gray-900">{account.name}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-left p-2 text-gray-700 border-b border-gray-300">Date</th>
                            <th className="text-left p-2 text-gray-700 border-b border-gray-300">Description</th>
                            <th className="text-left p-2 text-gray-700 border-b border-gray-300">Type</th>
                            <th className="text-right p-2 text-gray-700 border-b border-gray-300">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountTrans.slice(0, 15).map((transaction) => (
                            <tr key={transaction.id} className="border-b border-gray-200">
                              <td className="p-2 text-gray-600">
                                {format(new Date(transaction.transaction_date), 'dd/MM/yyyy')}
                              </td>
                              <td className="p-2 text-gray-900">{transaction.description}</td>
                              <td className="p-2">
                                <span className={`px-2 py-1 rounded text-xs ${
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
                          {accountTrans.length > 15 && (
                            <tr>
                              <td colSpan={4} className="p-2 text-center text-gray-500 text-xs">
                                ... et {accountTrans.length - 15} autres transactions
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
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