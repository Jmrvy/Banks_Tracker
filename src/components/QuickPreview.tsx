import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Eye, EyeOff, Wallet, Calendar, ArrowRight, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, addDays, isAfter, isBefore, startOfToday, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ValueDateDifferenceModal } from "@/components/ValueDateDifferenceModal";

interface QuickPreviewProps {
  onShowFullDashboard: () => void;
}

export const QuickPreview = ({ onShowFullDashboard }: QuickPreviewProps) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [showDateDifferenceModal, setShowDateDifferenceModal] = useState(false);
  const { accounts, recurringTransactions, transactions, loading } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const navigate = useNavigate();

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  // Calculer la période actuelle (mois en cours)
  const currentPeriod = useMemo(() => {
    const now = new Date();
    return {
      from: startOfMonth(now),
      to: endOfMonth(now)
    };
  }, []);

  // Vérifier s'il y a des différences entre date comptable et date valeur
  const hasDateDifference = useMemo(() => {
    if (preferences.dateType !== 'value') return false;
    
    return transactions.some(t => {
      const transactionDate = new Date(t.transaction_date);
      const valueDate = new Date(t.value_date);
      
      const inPeriodByTransactionDate = isWithinInterval(transactionDate, { start: currentPeriod.from, end: currentPeriod.to });
      const inPeriodByValueDate = isWithinInterval(valueDate, { start: currentPeriod.from, end: currentPeriod.to });
      
      return inPeriodByTransactionDate !== inPeriodByValueDate;
    });
  }, [transactions, currentPeriod, preferences.dateType]);

  const upcomingTransactions = useMemo(() => {
    const today = startOfToday();
    const nextWeek = addDays(today, 7);
    
    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        const dueDate = new Date(rt.next_due_date);
        return !isBefore(dueDate, today) && !isAfter(dueDate, nextWeek);
      })
      .sort((a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime())
      .slice(0, 5);
  }, [recurringTransactions]);

  const isPositive = totalBalance >= 0;
  const balancePercentage = Math.min(Math.abs(totalBalance) / (Math.abs(totalBalance) + 1000) * 100, 100);

  const gaugeData = [
    { name: 'Balance', value: balancePercentage },
    { name: 'Empty', value: 100 - balancePercentage }
  ];

  const gaugeColor = isPositive ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)';
  const emptyColor = 'hsl(var(--muted) / 0.2)';

  const BlurredAmount = ({ amount, className = "" }: { amount: string; className?: string }) => (
    <span className={`transition-all duration-300 ${!isRevealed ? 'blur-md select-none' : ''} ${className}`}>
      {amount}
    </span>
  );

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
        <div className="h-48 md:h-56 bg-muted/50 animate-pulse rounded-xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-32 bg-muted/50 animate-pulse rounded-xl" />
          <div className="h-32 bg-muted/50 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-3 sm:space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* Toggle Button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsRevealed(!isRevealed)}
          className="gap-1.5 sm:gap-2 text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
        >
          {isRevealed ? (
            <>
              <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm md:text-base">Masquer</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm md:text-base">Afficher</span>
            </>
          )}
        </Button>
      </div>

      {/* Balance Gauge Card */}
      <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-card via-card to-accent/10">
        <CardContent className="p-3 sm:p-4 md:p-6 lg:p-8">
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[260px] sm:max-w-[300px] md:max-w-[340px] lg:max-w-[380px]">
              <ResponsiveContainer
                width="100%"
                height={150}
                className="!h-[150px] sm:!h-[170px] md:!h-[210px] lg:!h-[230px]"
              >
                <PieChart>
                  <Pie
                    data={gaugeData}
                    cx="50%"
                    cy="96%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius="62%"
                    outerRadius="100%"
                    paddingAngle={0}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill={gaugeColor} className="drop-shadow-lg" />
                    <Cell fill={emptyColor} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center w-full px-2">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-red-500" />
                  )}
                  <span className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground">
                    Solde total
                  </span>
                </div>

                <button
                  onClick={() => hasDateDifference && setShowDateDifferenceModal(true)}
                  className={`inline-flex items-center gap-1 ${hasDateDifference ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                >
                  <BlurredAmount
                    amount={formatCurrency(totalBalance)}
                    className={`text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  />
                  {hasDateDifference && isRevealed && (
                    <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-primary/70" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Value Date Difference Modal */}
      <ValueDateDifferenceModal
        open={showDateDifferenceModal}
        onOpenChange={setShowDateDifferenceModal}
        transactions={transactions}
        period={currentPeriod}
      />

      {/* Accounts and Transactions Grid */}
      <div className="grid md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Accounts Card */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary" />
                <span className="font-semibold text-xs sm:text-sm md:text-base">Mes comptes</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] sm:text-xs md:text-sm h-6 sm:h-7 md:h-8 px-1.5 sm:px-2 md:px-3"
                onClick={() => navigate('/accounts')}
              >
                Voir tout
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 ml-0.5 sm:ml-1" />
              </Button>
            </div>
            
            <div className="space-y-1.5 sm:space-y-2 md:space-y-3">
              {accounts.slice(0, 4).map((account) => (
                <div 
                  key={account.id} 
                  className="flex items-center justify-between py-1.5 sm:py-2 md:py-3 px-2 sm:px-3 md:px-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xs sm:text-sm md:text-base font-medium truncate max-w-[55%]">
                    {account.name}
                  </span>
                  <BlurredAmount 
                    amount={formatCurrency(account.balance)}
                    className={`text-xs sm:text-sm md:text-base font-semibold ${account.balance >= 0 ? 'text-foreground' : 'text-red-500'}`}
                  />
                </div>
              ))}
              {accounts.length === 0 && (
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground text-center py-3 sm:py-4 md:py-6">
                  Aucun compte configuré
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Transactions Card */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary" />
                <span className="font-semibold text-xs sm:text-sm md:text-base">À venir</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-[10px] sm:text-xs md:text-sm h-6 sm:h-7 md:h-8 px-1.5 sm:px-2 md:px-3"
                onClick={() => navigate('/recurring-transactions')}
              >
                Voir tout
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 ml-0.5 sm:ml-1" />
              </Button>
            </div>
            
            <div className="space-y-1.5 sm:space-y-2 md:space-y-3">
              {upcomingTransactions.map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="flex items-center justify-between py-1.5 sm:py-2 md:py-3 px-2 sm:px-3 md:px-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="text-xs sm:text-sm md:text-base font-medium truncate">
                      {transaction.description}
                    </span>
                    <span className="text-[10px] sm:text-xs md:text-sm text-muted-foreground">
                      {format(new Date(transaction.next_due_date), 'EEE d MMM', { locale: fr })}
                    </span>
                  </div>
                  <BlurredAmount 
                    amount={`${transaction.type === 'expense' ? '-' : '+'}${formatCurrency(transaction.amount)}`}
                    className={`text-xs sm:text-sm md:text-base font-semibold whitespace-nowrap ${
                      transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                    }`}
                  />
                </div>
              ))}
              {upcomingTransactions.length === 0 && (
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground text-center py-3 sm:py-4 md:py-6">
                  Aucune transaction prévue
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Continue to Dashboard Button */}
      <div className="flex justify-center pt-1 sm:pt-2">
        <Button 
          onClick={onShowFullDashboard}
          className="w-full md:w-auto md:min-w-[280px] h-9 sm:h-10 md:h-11"
          size="lg"
        >
          <span className="text-xs sm:text-sm md:text-base">Tableau de bord complet</span>
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 ml-1.5 sm:ml-2" />
        </Button>
      </div>
    </div>
  );
};
