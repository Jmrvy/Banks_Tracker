import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { format, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface SavingsTransactionsListProps {
  transactions: Transaction[];
  startDate?: Date;
  endDate?: Date;
}

export function SavingsTransactionsList({ transactions, startDate, endDate }: SavingsTransactionsListProps) {
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();

  const transactionsWithBalance = useMemo(() => {
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    const periodTransactions = startDate && endDate
      ? sortedTransactions.filter(tx => {
          const transactionDate = new Date(tx.transaction_date);
          return isWithinInterval(transactionDate, { start: startDate, end: endDate });
        })
      : sortedTransactions;

    // In savings context:
    // - Investment expenses (deposit) = +balance
    // - Investment income (withdrawal) = -balance
    // - Reimbursement (income with installment_payment_id) = +balance
    const getSavingsEffect = (tx: Transaction) => {
      if (tx.installment_payment_id) return tx.amount; // reimbursement = positive
      if (tx.type === 'expense') return tx.amount;      // investment deposit = positive
      if (tx.type === 'income') return -tx.amount;      // investment withdrawal = negative
      return 0;
    };

    let runningBalance = 0;
    if (startDate) {
      sortedTransactions.forEach(tx => {
        const transactionDate = new Date(tx.transaction_date);
        if (transactionDate < startDate) {
          runningBalance += getSavingsEffect(tx);
        }
      });
    }

    const result: Array<Transaction & { balanceBefore: number; balanceAfter: number }> = [];

    periodTransactions.forEach((tx) => {
      const balanceBefore = runningBalance;
      runningBalance += getSavingsEffect(tx);

      result.push({
        ...tx,
        balanceBefore,
        balanceAfter: runningBalance,
      });
    });

    return result.reverse();
  }, [transactions, startDate, endDate]);

  // In savings context: expense = deposit (money going into savings), income = withdrawal (money coming out)
  // But reimbursement transactions (linked to installment payments) are income type and should show as positive savings
  const isReimbursement = (tx: Transaction) => !!tx.installment_payment_id;

  const getTransactionIcon = (type: string, tx: Transaction) => {
    if (isReimbursement(tx)) {
      return <TrendingUp className="h-4 w-4 text-success" />;
    }
    switch (type) {
      case 'expense':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'income':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <PiggyBank className="h-4 w-4 text-primary" />;
    }
  };

  const getTypeLabel = (type: string, tx: Transaction) => {
    if (isReimbursement(tx)) {
      return t('savings.reimbursement', 'Remboursement');
    }
    switch (type) {
      case 'expense':
        return t('savings.deposit');
      case 'income':
        return t('savings.withdrawal');
      default:
        return type;
    }
  };

  const getAmountColor = (tx: Transaction) => {
    if (isReimbursement(tx)) return 'text-success';
    return tx.type === 'expense' ? 'text-success' : 'text-destructive';
  };

  const getAmountPrefix = (tx: Transaction) => {
    if (isReimbursement(tx)) return '+';
    return tx.type === 'expense' ? '+' : '-';
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2 sm:pb-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <PiggyBank className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          {t('savings.transactionHistory')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactionsWithBalance.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <PiggyBank className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('savings.noTransactions')}</p>
          </div>
        ) : (
          <div className="space-y-1 sm:space-y-2 max-h-[500px] overflow-y-auto">
            {transactionsWithBalance.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-2 sm:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors gap-2 sm:gap-3"
              >
                {/* Mobile: Single line compact view */}
                <div className="flex items-center gap-2 flex-1 min-w-0 sm:hidden">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(tx.type, tx)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-xs">{tx.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(tx.transaction_date), 'dd/MM', { locale: fr })}
                      <span className="ml-1">&bull; {getTypeLabel(tx.type, tx)}</span>
                    </p>
                  </div>
                </div>

                {/* Mobile: Amount and balance */}
                <div className="flex items-center gap-3 flex-shrink-0 sm:hidden">
                  <p className={`font-bold text-xs ${getAmountColor(tx)}`}>
                    {getAmountPrefix(tx)}{formatCurrency(tx.amount)}
                  </p>
                  <p className={`font-medium text-xs ${
                    tx.balanceAfter >= 0 ? 'text-primary/70' : 'text-destructive/70'
                  }`}>
                    &rarr; {formatCurrency(tx.balanceAfter)}
                  </p>
                </div>

                {/* Desktop: Full view */}
                <div className="hidden sm:flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(tx.type, tx)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-base">{tx.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(new Date(tx.transaction_date), 'dd MMM yyyy', { locale: fr })}</span>
                      <span>&bull;</span>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(tx.type, tx)}
                      </Badge>
                      {tx.account && (
                        <>
                          <span>&bull;</span>
                          <span>{tx.account.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className={`font-bold text-base ${getAmountColor(tx)}`}>
                      {getAmountPrefix(tx)}{formatCurrency(tx.amount)}
                    </p>
                  </div>
                  <div className="text-right w-32">
                    <p className="text-xs text-muted-foreground">{t('savings.savingsBalance')}</p>
                    <p className={`font-bold text-sm ${
                      tx.balanceAfter >= 0 ? 'text-primary' : 'text-destructive'
                    }`}>
                      {formatCurrency(tx.balanceAfter)}
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
