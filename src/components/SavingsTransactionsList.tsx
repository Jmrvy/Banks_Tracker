import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { format, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";

interface SavingsTransactionsListProps {
  transactions: Transaction[];
  startDate?: Date;
  endDate?: Date;
}

export function SavingsTransactionsList({ transactions, startDate, endDate }: SavingsTransactionsListProps) {
  const { formatCurrency } = useUserPreferences();

  const transactionsWithBalance = useMemo(() => {
    // Sort transactions chronologically (oldest first)
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    // Filter transactions within the period
    const periodTransactions = startDate && endDate
      ? sortedTransactions.filter(t => {
          const transactionDate = new Date(t.transaction_date);
          return isWithinInterval(transactionDate, { start: startDate, end: endDate });
        })
      : sortedTransactions;

    // Calculate balance BEFORE the period starts
    let runningBalance = 0;
    if (startDate) {
      sortedTransactions.forEach(t => {
        const transactionDate = new Date(t.transaction_date);
        if (transactionDate < startDate) {
          // For savings: expense = money in, income = money out
          if (t.type === 'expense') {
            runningBalance += t.amount;
          } else if (t.type === 'income') {
            runningBalance -= t.amount;
          }
        }
      });
    }

    const result = [];

    // Calculate balance after each transaction in the period
    periodTransactions.forEach((t) => {
      const balanceBefore = runningBalance;
      
      // For savings: expense = money in (positive), income = money out (negative)
      if (t.type === 'expense') {
        runningBalance += t.amount;
      } else if (t.type === 'income') {
        runningBalance -= t.amount;
      }

      result.push({
        ...t,
        balanceBefore,
        balanceAfter: runningBalance,
      });
    });

    // Return in reverse order (most recent first) for display
    return result.reverse();
  }, [transactions, startDate, endDate]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'expense':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'income':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <PiggyBank className="h-4 w-4 text-primary" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'expense':
        return 'Versement';
      case 'income':
        return 'Retrait';
      default:
        return type;
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2 sm:pb-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <PiggyBank className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Historique des transactions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactionsWithBalance.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PiggyBank className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Aucune transaction d'épargne sur cette période</p>
          </div>
        ) : (
          <div className="space-y-1 sm:space-y-2 max-h-[500px] overflow-y-auto">
            {transactionsWithBalance.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-2 sm:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors gap-2 sm:gap-3"
              >
                {/* Mobile: Single line compact view */}
                <div className="flex items-center gap-2 flex-1 min-w-0 sm:hidden">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(t.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-xs">{t.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(t.transaction_date), 'dd/MM', { locale: fr })}
                      <span className="ml-1">• {getTypeLabel(t.type)}</span>
                    </p>
                  </div>
                </div>
                
                {/* Mobile: Amount and balance */}
                <div className="flex items-center gap-3 flex-shrink-0 sm:hidden">
                  <p className={`font-bold text-xs ${
                    t.type === 'expense' ? 'text-success' : 'text-destructive'
                  }`}>
                    {t.type === 'expense' ? '+' : '-'}{formatCurrency(t.amount)}
                  </p>
                  <p className={`font-medium text-xs ${
                    t.balanceAfter >= 0 ? 'text-primary/70' : 'text-destructive/70'
                  }`}>
                    → {formatCurrency(t.balanceAfter)}
                  </p>
                </div>

                {/* Desktop: Full view */}
                <div className="hidden sm:flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(t.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-base">{t.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(new Date(t.transaction_date), 'dd MMM yyyy', { locale: fr })}</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(t.type)}
                      </Badge>
                      {t.account && (
                        <>
                          <span>•</span>
                          <span>{t.account.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className={`font-bold text-base ${
                      t.type === 'expense' ? 'text-success' : 'text-destructive'
                    }`}>
                      {t.type === 'expense' ? '+' : '-'}{formatCurrency(t.amount)}
                    </p>
                  </div>
                  <div className="text-right w-32">
                    <p className="text-xs text-muted-foreground">Solde épargne</p>
                    <p className={`font-bold text-sm ${
                      t.balanceAfter >= 0 ? 'text-primary' : 'text-destructive'
                    }`}>
                      {formatCurrency(t.balanceAfter)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
