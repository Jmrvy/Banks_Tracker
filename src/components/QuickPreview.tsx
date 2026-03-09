import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Wallet, Calendar, ArrowRight, TrendingUp, TrendingDown, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, addDays, isAfter, isBefore, startOfToday, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface QuickPreviewProps {
  onShowFullDashboard: () => void;
}

export const QuickPreview = ({ onShowFullDashboard }: QuickPreviewProps) => {
  const [isRevealed, setIsRevealed] = useState(true);
  const { accounts, recurringTransactions, transactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const navigate = useNavigate();

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  const isPositive = totalBalance >= 0;

  // Monthly income and expenses
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd && t.include_in_stats !== false;
    });

    const income = monthTransactions
      .filter(t => t.type === 'income' && !t.refund_of_transaction_id)
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const refundedAmount = t.refunded_amount || 0;
        return sum + Math.max(0, t.amount - refundedAmount);
      }, 0);

    return { income, expenses, net: income - expenses };
  }, [transactions]);

  // Parse "YYYY-MM-DD" as local date to avoid UTC shift bugs
  const parseLocalDate = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const upcomingTransactions = useMemo(() => {
    const today = startOfToday();
    const nextWeek = addDays(today, 7);

    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        const dueDate = parseLocalDate(rt.next_due_date);
        return !isBefore(dueDate, today) && !isAfter(dueDate, nextWeek);
      })
      .sort((a, b) => parseLocalDate(a.next_due_date).getTime() - parseLocalDate(b.next_due_date).getTime())
      .slice(0, 5);
  }, [recurringTransactions]);

  const BlurredAmount = ({ amount, className = "" }: { amount: string; className?: string }) => (
    <span className={`transition-all duration-300 ${!isRevealed ? 'blur-md select-none' : ''} ${className}`}>
      {amount}
    </span>
  );

  const currentMonth = format(new Date(), 'MMMM yyyy', { locale: fr });

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-3 sm:space-y-4 md:space-y-5 max-w-5xl mx-auto">
      {/* Toggle Button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsRevealed(!isRevealed)}
          className="gap-1.5 text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
        >
          {isRevealed ? (
            <><EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="text-xs sm:text-sm">Masquer</span></>
          ) : (
            <><Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="text-xs sm:text-sm">Afficher</span></>
          )}
        </Button>
      </div>

      {/* Total Balance - Hero card */}
      <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-card via-card to-primary/5">
        <CardContent className="p-4 sm:p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Solde total</p>
              <BlurredAmount
                amount={formatCurrency(totalBalance)}
                className={`text-2xl sm:text-3xl md:text-4xl font-bold ${isPositive ? "text-success" : "text-destructive"}`}
              />
            </div>
            <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center ${isPositive ? 'bg-success/10' : 'bg-destructive/10'}`}>
              {isPositive ? (
                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-success" />
              ) : (
                <TrendingDown className="w-6 h-6 sm:w-7 sm:h-7 text-destructive" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly summary - 3 mini cards */}
      <div>
        <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 capitalize">{currentMonth}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg bg-success/10 flex items-center justify-center">
                  <ArrowDownRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus</span>
              </div>
              <BlurredAmount
                amount={formatCurrency(monthlyStats.income)}
                className="text-sm sm:text-base md:text-lg font-bold text-success"
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Depenses</span>
              </div>
              <BlurredAmount
                amount={formatCurrency(monthlyStats.expenses)}
                className="text-sm sm:text-base md:text-lg font-bold text-destructive"
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-2.5 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Net</span>
              </div>
              <BlurredAmount
                amount={formatCurrency(monthlyStats.net)}
                className={`text-sm sm:text-base md:text-lg font-bold ${monthlyStats.net >= 0 ? 'text-success' : 'text-destructive'}`}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Accounts and Upcoming grid */}
      <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
        {/* Accounts Card */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                <span className="font-semibold text-xs sm:text-sm">Mes comptes</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] sm:text-xs h-6 sm:h-7 px-1.5 sm:px-2"
                onClick={() => navigate('/accounts')}
              >
                Voir tout
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />
              </Button>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              {accounts.slice(0, 4).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${account.balance >= 0 ? 'bg-success' : 'bg-destructive'}`} />
                    <span className="text-xs sm:text-sm font-medium truncate">
                      {account.name}
                    </span>
                  </div>
                  <BlurredAmount
                    amount={formatCurrency(account.balance)}
                    className={`text-xs sm:text-sm font-semibold ${account.balance >= 0 ? 'text-foreground' : 'text-destructive'}`}
                  />
                </div>
              ))}
              {accounts.length > 4 && (
                <p className="text-[10px] sm:text-xs text-muted-foreground text-center pt-1">
                  +{accounts.length - 4} autre{accounts.length - 4 > 1 ? 's' : ''} compte{accounts.length - 4 > 1 ? 's' : ''}
                </p>
              )}
              {accounts.length === 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                  Aucun compte configure
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Transactions Card */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                <span className="font-semibold text-xs sm:text-sm">A venir (7j)</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] sm:text-xs h-6 sm:h-7 px-1.5 sm:px-2"
                onClick={() => navigate('/recurring-transactions')}
              >
                Voir tout
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />
              </Button>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              {upcomingTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="text-xs sm:text-sm font-medium truncate">
                      {transaction.description}
                    </span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      {format(parseLocalDate(transaction.next_due_date), 'EEE d MMM', { locale: fr })}
                    </span>
                  </div>
                  <BlurredAmount
                    amount={`${transaction.type === 'expense' ? '-' : '+'}${formatCurrency(transaction.amount)}`}
                    className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${
                      transaction.type === 'income' ? 'text-success' : 'text-destructive'
                    }`}
                  />
                </div>
              ))}
              {upcomingTransactions.length === 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                  Aucune transaction prevue
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
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5 sm:ml-2" />
        </Button>
      </div>
    </div>
  );
};
