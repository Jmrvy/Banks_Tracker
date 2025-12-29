import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Eye, EyeOff, Wallet, Calendar, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, addDays, isAfter, isBefore, startOfToday } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export const MobileQuickPreview = () => {
  const [isRevealed, setIsRevealed] = useState(false);
  const { accounts, recurringTransactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const navigate = useNavigate();

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

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
      <div className="p-4 space-y-4">
        <div className="h-48 bg-muted/50 animate-pulse rounded-xl" />
        <div className="h-24 bg-muted/50 animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Toggle Button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsRevealed(!isRevealed)}
          className="gap-2 text-muted-foreground"
        >
          {isRevealed ? (
            <>
              <EyeOff className="w-4 h-4" />
              Masquer
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              Afficher
            </>
          )}
        </Button>
      </div>

      {/* Balance Gauge Card */}
      <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-card via-card to-accent/10">
        <CardContent className="p-6">
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[220px]">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={gaugeData}
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius="60%"
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
              
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                <div className="flex items-center gap-1.5 mb-1">
                  {isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    Solde total
                  </span>
                </div>
                <BlurredAmount 
                  amount={formatCurrency(totalBalance)}
                  className={`text-2xl font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Card */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Mes comptes</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-7 px-2"
              onClick={() => navigate('/accounts')}
            >
              Voir tout
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {accounts.slice(0, 4).map((account) => (
              <div 
                key={account.id} 
                className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg"
              >
                <span className="text-sm font-medium truncate max-w-[60%]">
                  {account.name}
                </span>
                <BlurredAmount 
                  amount={formatCurrency(account.balance)}
                  className={`text-sm font-semibold ${account.balance >= 0 ? 'text-foreground' : 'text-red-500'}`}
                />
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun compte configuré
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Transactions Card */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Transactions à venir</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-7 px-2"
              onClick={() => navigate('/recurring')}
            >
              Voir tout
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {upcomingTransactions.map((transaction) => (
              <div 
                key={transaction.id} 
                className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-lg"
              >
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                  <span className="text-sm font-medium truncate">
                    {transaction.description}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(transaction.next_due_date), 'EEEE d MMM', { locale: fr })}
                  </span>
                </div>
                <BlurredAmount 
                  amount={`${transaction.type === 'expense' ? '-' : '+'}${formatCurrency(transaction.amount)}`}
                  className={`text-sm font-semibold whitespace-nowrap ${
                    transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                  }`}
                />
              </div>
            ))}
            {upcomingTransactions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune transaction prévue cette semaine
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Continue to Dashboard Button */}
      <Button 
        onClick={() => setIsRevealed(true)}
        className="w-full"
        size="lg"
      >
        Accéder au tableau de bord
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
};
