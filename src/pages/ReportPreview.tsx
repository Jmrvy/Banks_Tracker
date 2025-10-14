import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useReportsData } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function ReportPreview() {
  const [reportData, setReportData] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions, loading } = useFinancialData();

  const reportDate = reportData ? new Date(reportData.reportDate) : new Date();
  const startDate = reportData?.periodType === 'custom' ? new Date(reportData.startDate) : new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
  const endDate = reportData?.periodType === 'custom' ? new Date(reportData.endDate) : reportDate;

  const { stats, categoryChartData, balanceEvolutionData } = useReportsData(
    reportData?.periodType === 'custom' ? 'custom' : 'month',
    reportDate,
    reportData?.periodType === 'custom' ? { from: startDate, to: endDate } : undefined,
    false
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'REPORT_DATA') {
        setReportData(event.data.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`rapport-financier-${format(reportDate, 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Filter transactions by date range
  const filteredTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.transaction_date);
    return transactionDate >= startDate && transactionDate <= endDate;
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
    .map(cat => ({
      name: cat.name,
      spent: cat.spent,
      remaining: Math.max(0, cat.budget - cat.spent),
      budget: cat.budget,
      color: cat.color
    }));

  if (loading || !reportData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Prévisualisation du Rapport</h1>
          <Button onClick={handleDownloadPDF} disabled={isDownloading}>
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Téléchargement...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Télécharger PDF
              </>
            )}
          </Button>
        </div>

        <div ref={reportRef} className="bg-white p-12 rounded-lg shadow-lg space-y-8">
          {/* Header */}
          <div className="border-b-4 border-primary pb-6">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Rapport Financier</h1>
            <div className="flex justify-between text-gray-600">
              <p className="text-lg">Date du rapport: {format(reportDate, 'dd MMMM yyyy', { locale: fr })}</p>
              <p className="text-lg">Période: {format(startDate, 'dd MMM', { locale: fr })} - {format(endDate, 'dd MMM yyyy', { locale: fr })}</p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-6">
            <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <p className="text-sm text-gray-600 mb-1">Revenus</p>
              <p className="text-3xl font-bold text-green-700">{formatCurrency(stats.income)}</p>
            </Card>
            <Card className="p-6 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <p className="text-sm text-gray-600 mb-1">Dépenses</p>
              <p className="text-3xl font-bold text-red-700">{formatCurrency(stats.expenses)}</p>
            </Card>
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <p className="text-sm text-gray-600 mb-1">Solde Net</p>
              <p className="text-3xl font-bold text-blue-700">{formatCurrency(stats.netPeriodBalance)}</p>
            </Card>
          </div>

          {/* Account Balances */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Soldes des Comptes</h2>
            <div className="grid grid-cols-2 gap-4">
              {accountBalances.map(account => (
                <Card key={account.id} className="p-5 bg-gradient-to-r from-gray-50 to-gray-100">
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
                </Card>
              ))}
            </div>
          </div>

          {/* Balance Evolution Chart */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Évolution du Solde</h2>
            <Card className="p-6">
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
            </Card>
          </div>

          {/* Category Spending Chart */}
          {stackedBarData.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900">Dépenses par Catégorie vs Budget</h2>
              <Card className="p-6">
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
              </Card>
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
                <Card key={account.id} className="p-6">
                  <h3 className="text-xl font-semibold mb-4 text-gray-900">{account.name}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="text-left p-2 text-gray-700">Date</th>
                          <th className="text-left p-2 text-gray-700">Description</th>
                          <th className="text-left p-2 text-gray-700">Type</th>
                          <th className="text-right p-2 text-gray-700">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountTrans.slice(0, 10).map((transaction) => (
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
                        {accountTrans.length > 10 && (
                          <tr>
                            <td colSpan={4} className="p-2 text-center text-gray-500 text-xs">
                              ... et {accountTrans.length - 10} autres transactions
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t-2 border-gray-200 pt-6 text-center text-gray-500 text-sm">
            <p>Rapport généré le {format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}