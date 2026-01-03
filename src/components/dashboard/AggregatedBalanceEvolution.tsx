import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";

export const AggregatedBalanceEvolution = () => {
  const { accounts, transactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  // Calculate total balance across all accounts
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  // Get all transactions sorted by date (most recent first for display)
  const allTransactionsSorted = useMemo(() => {
    return [...transactions].sort(
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );
  }, [transactions]);

  // Calculate balance evolution for last 10 transactions
  const transactionsWithBalance = useMemo(() => {
    if (allTransactionsSorted.length === 0) {
      return [];
    }

    // Take only last 10 transactions (already sorted most recent first)
    const last10 = allTransactionsSorted.slice(0, 10);
    
    let runningBalance = totalBalance;
    const result: Array<{
      transaction: typeof transactions[0];
      balanceAfter: number;
    }> = [];

    // For each transaction (most recent first), calculate balance after
    // The most recent transaction's balanceAfter is the current total balance
    last10.forEach((t, index) => {
      if (index === 0) {
        result.push({
          transaction: t,
          balanceAfter: runningBalance,
        });
      } else {
        // Subtract the previous transaction's effect to get balance after this one
        const prevT = last10[index - 1];
        if (prevT.type === 'income') {
          runningBalance -= prevT.amount;
        } else if (prevT.type === 'expense') {
          runningBalance += prevT.amount;
        }
        // Transfers don't affect total balance (internal movement)
        // but we need to account for transfer fees
        if (prevT.type === 'transfer' && prevT.transfer_fee) {
          runningBalance += prevT.transfer_fee;
        }
        
        result.push({
          transaction: t,
          balanceAfter: runningBalance,
        });
      }
    });

    return result;
  }, [allTransactionsSorted, totalBalance]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'income':
        return <ArrowDownCircle className="h-4 w-4 text-success" />;
      case 'expense':
        return <ArrowUpCircle className="h-4 w-4 text-destructive" />;
      case 'transfer':
        return <ArrowLeftRight className="h-4 w-4 text-primary" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income': return 'Revenu';
      case 'expense': return 'Dépense';
      case 'transfer': return 'Virement';
      default: return type;
    }
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account?.name || 'Compte inconnu';
  };

  if (transactionsWithBalance.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Évolution du solde global</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <p className="text-muted-foreground text-sm text-center py-4">
            Aucune transaction
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Évolution du solde global</CardTitle>
        </CardHeader>
        <CardContent className={`p-3 sm:p-6 pt-0 ${isPrivacyMode ? 'blur-md select-none' : ''}`}>
          <div className="space-y-2">
            {transactionsWithBalance.map(({ transaction: t, balanceAfter }) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-2 sm:p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border border-border/50"
                onClick={() => setSelectedTransaction(t)}
              >
                {/* Mobile: Compact view */}
                <div className="flex sm:hidden items-center gap-2 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(t.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(t.transaction_date), 'dd MMM', { locale: fr })} • {getAccountName(t.account_id)}
                    </p>
                  </div>
                </div>
                <div className="flex sm:hidden flex-col items-end">
                  <p className={`font-bold text-xs ${
                    t.type === 'income' ? 'text-success' :
                    t.type === 'expense' ? 'text-destructive' :
                    'text-primary'
                  }`}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
                  </p>
                  <p className={`font-medium text-xs ${
                    balanceAfter >= 0 ? 'text-success/70' : 'text-destructive/70'
                  }`}>
                    → {formatCurrency(balanceAfter)}
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
                      <span>•</span>
                      <span>{getAccountName(t.account_id)}</span>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4">
                  <p className={`font-bold text-base ${
                    t.type === 'income' ? 'text-success' :
                    t.type === 'expense' ? 'text-destructive' :
                    'text-primary'
                  }`}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
                  </p>
                  <div className="text-right min-w-[100px]">
                    <p className="text-xs text-muted-foreground">Solde après</p>
                    <p className={`font-semibold ${
                      balanceAfter >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(balanceAfter)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          open={!!selectedTransaction}
          onOpenChange={(open) => !open && setSelectedTransaction(null)}
        />
      )}
    </>
  );
};
