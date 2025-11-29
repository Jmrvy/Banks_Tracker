import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface AccountTransactionsListProps {
  accountId: string;
  transactions: Transaction[];
  initialBalance: number;
}

export function AccountTransactionsList({ accountId, transactions, initialBalance }: AccountTransactionsListProps) {
  const { formatCurrency } = useUserPreferences();

  const transactionsWithBalance = useMemo(() => {
    const accountTransactions = transactions
      .filter(t => t.account_id === accountId || t.transfer_to_account_id === accountId)
      .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

    let runningBalance = initialBalance;
    
    // Calculate initial balance by reversing all transactions
    accountTransactions.forEach(t => {
      if (t.account_id === accountId) {
        if (t.type === 'income') {
          runningBalance -= t.amount;
        } else if (t.type === 'expense') {
          runningBalance += t.amount;
        } else if (t.type === 'transfer') {
          runningBalance += t.amount + (t.transfer_fee || 0);
        }
      } else if (t.transfer_to_account_id === accountId) {
        runningBalance -= t.amount;
      }
    });

    const startBalance = runningBalance;

    // Build transactions with running balance
    return accountTransactions.reverse().map((t) => {
      let balanceBefore = runningBalance;
      
      if (t.account_id === accountId) {
        if (t.type === 'income') {
          runningBalance -= t.amount;
        } else if (t.type === 'expense') {
          runningBalance += t.amount;
        } else if (t.type === 'transfer') {
          runningBalance += t.amount + (t.transfer_fee || 0);
        }
      } else if (t.transfer_to_account_id === accountId) {
        runningBalance -= t.amount;
      }

      return {
        ...t,
        balanceBefore,
        balanceAfter: runningBalance,
      };
    }).reverse();
  }, [transactions, accountId, initialBalance]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'income':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'expense':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'transfer':
        return <ArrowRightLeft className="h-4 w-4 text-primary" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income':
        return 'Revenu';
      case 'expense':
        return 'Dépense';
      case 'transfer':
        return 'Virement';
      default:
        return type;
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>Transactions du compte</CardTitle>
      </CardHeader>
      <CardContent>
        {transactionsWithBalance.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucune transaction pour ce compte
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {transactionsWithBalance.map((t) => (
              <div 
                key={t.id} 
                className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(t.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(new Date(t.transaction_date), 'dd MMM yyyy', { locale: fr })}</span>
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
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <p className={`font-bold ${
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
                    <p className="text-xs text-muted-foreground">Solde après</p>
                    <p className={`font-bold text-sm ${
                      t.balanceBefore >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(t.balanceBefore)}
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
