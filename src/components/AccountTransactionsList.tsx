import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { format, isWithinInterval } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { useTranslation } from "react-i18next";
import { getCategoryIcon } from "@/lib/categoryIcons";

interface AccountTransactionsListProps {
  accountId: string;
  transactions: Transaction[];
  initialBalance: number;
  startDate?: Date;
  endDate?: Date;
}

export function AccountTransactionsList({ accountId, transactions, initialBalance, startDate, endDate }: AccountTransactionsListProps) {
  const { formatCurrency } = useUserPreferences();
  const { t: tr, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const transactionsWithBalance = useMemo(() => {
    // Get ALL account transactions sorted chronologically
    const allAccountTransactions = transactions
      .filter(t => t.account_id === accountId || t.transfer_to_account_id === accountId)
      .sort((a, b) => parseLocalDate(a.transaction_date).getTime() - parseLocalDate(b.transaction_date).getTime());

    // Calculate balance at the BEGINNING of the period by reversing ALL transactions from current balance
    let balanceAtPeriodStart = initialBalance;
    [...allAccountTransactions].reverse().forEach(t => {
      if (t.account_id === accountId) {
        if (t.type === 'income') {
          balanceAtPeriodStart -= t.amount;
        } else if (t.type === 'expense') {
          balanceAtPeriodStart += t.amount;
        } else if (t.type === 'transfer') {
          balanceAtPeriodStart += t.amount + (t.transfer_fee || 0);
        }
      } else if (t.transfer_to_account_id === accountId) {
        balanceAtPeriodStart -= t.amount;
      }
    });

    // Now replay transactions up to the start of the period to get the correct starting balance
    let runningBalance = balanceAtPeriodStart;
    allAccountTransactions.forEach(t => {
      const transactionDate = parseLocalDate(t.transaction_date);
      // Only process transactions BEFORE the period starts
      if (startDate && transactionDate < startDate) {
        if (t.account_id === accountId) {
          if (t.type === 'income') {
            runningBalance += t.amount;
          } else if (t.type === 'expense') {
            runningBalance -= t.amount;
          } else if (t.type === 'transfer') {
            runningBalance -= t.amount + (t.transfer_fee || 0);
          }
        } else if (t.transfer_to_account_id === accountId) {
          runningBalance += t.amount;
        }
      }
    });

    // Filter transactions within the period
    const periodTransactions = startDate && endDate
      ? allAccountTransactions.filter(t => {
          const transactionDate = parseLocalDate(t.transaction_date);
          return isWithinInterval(transactionDate, { start: startDate, end: endDate });
        })
      : allAccountTransactions;

    const result = [];

    // Now FORWARD through period transactions to calculate balance after each
    periodTransactions.forEach((t) => {
      const balanceBefore = runningBalance;
      
      if (t.account_id === accountId) {
        if (t.type === 'income') {
          runningBalance += t.amount;
        } else if (t.type === 'expense') {
          runningBalance -= t.amount;
        } else if (t.type === 'transfer') {
          runningBalance -= t.amount + (t.transfer_fee || 0);
        }
      } else if (t.transfer_to_account_id === accountId) {
        runningBalance += t.amount;
      }

      result.push({
        ...t,
        balanceBefore,
        balanceAfter: runningBalance,
      });
    });

    // Return in reverse order (most recent first) for display
    return result.reverse();
  }, [transactions, accountId, initialBalance, startDate, endDate]);

  const renderTransactionIcon = (txn: Transaction) => {
    const userIcon = getCategoryIcon(txn.category?.icon ?? null);
    if (userIcon && txn.category) {
      const Icon = userIcon;
      return (
        <div
          className="h-8 w-8 rounded-lg grid place-items-center"
          style={{ background: `${txn.category.color}1F`, color: txn.category.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      );
    }
    const Fallback =
      txn.type === 'income' ? TrendingUp : txn.type === 'transfer' ? ArrowRightLeft : TrendingDown;
    const tone =
      txn.type === 'income' ? 'text-success' : txn.type === 'transfer' ? 'text-primary' : 'text-destructive';
    return (
      <div className="h-8 w-8 rounded-lg grid place-items-center bg-bg-subtle border border-line">
        <Fallback className={`h-3.5 w-3.5 ${tone}`} />
      </div>
    );
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income':
        return tr('transactions.income');
      case 'expense':
        return tr('transactions.expense');
      case 'transfer':
        return tr('transactions.transfer');
      default:
        return type;
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>{tr('accounts.accountTransactions', { defaultValue: 'Account transactions' })}</CardTitle>
      </CardHeader>
      <CardContent>
        {transactionsWithBalance.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucune transaction pour ce compte
          </div>
        ) : (
          <div className="space-y-1 sm:space-y-2 max-h-[600px] overflow-y-auto">
            {transactionsWithBalance.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTransaction(t)}
                className="flex items-center justify-between p-2 sm:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors gap-2 sm:gap-3 cursor-pointer"
              >
                {/* Mobile: Single line compact view */}
                <div className="flex items-center gap-2 flex-1 min-w-0 sm:hidden">
                  <div className="flex-shrink-0">
                    {renderTransactionIcon(t)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-xs">{t.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(parseLocalDate(t.transaction_date), 'dd/MM', { locale: dateLocale })}
                      {t.category && (
                        <span className="ml-1">• {t.category.name}</span>
                      )}
                    </p>
                  </div>
                </div>
                
                {/* Mobile: Amount and balance */}
                <div className="flex items-center gap-3 flex-shrink-0 sm:hidden">
                  <p className={`font-bold text-xs ${
                    t.type === 'income' ? 'text-success' :
                    t.type === 'expense' ? 'text-destructive' :
                    'text-primary'
                  }`}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
                  </p>
                  <p className={`font-medium text-xs ${
                    t.balanceAfter >= 0 ? 'text-success/70' : 'text-destructive/70'
                  }`}>
                    → {formatCurrency(t.balanceAfter)}
                  </p>
                </div>

                {/* Desktop: Full view */}
                <div className="hidden sm:flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {renderTransactionIcon(t)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-base">{t.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(parseLocalDate(t.transaction_date), 'dd MMM yyyy', { locale: dateLocale })}</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(t.type)}
                      </Badge>
                      {t.category && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="gap-1 text-xs">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: t.category.color }}
                            />
                            {t.category.name}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className={`font-bold text-base ${
                      t.type === 'income' ? 'text-success' :
                      t.type === 'expense' ? 'text-destructive' :
                      'text-primary'
                    }`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
                    </p>
                    {t.type === 'transfer' && t.transfer_fee && t.transfer_fee > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Frais: {formatCurrency(t.transfer_fee)}
                      </p>
                    )}
                  </div>
                  <div className="text-right w-32">
                    <p className="text-xs text-muted-foreground">{tr('dashboard.balanceAfter')}</p>
                    <p className={`font-bold text-sm ${
                      t.balanceAfter >= 0 ? 'text-success' : 'text-destructive'
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

      <TransactionDetailModal
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
      />
    </Card>
  );
}
