import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft } from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: { name: string; color: string } | null;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
}

interface AccountTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  bankName: string;
  transactions: Transaction[];
  balance: number;
}

export const AccountTransactionsModal = ({
  open,
  onOpenChange,
  accountName,
  bankName,
  transactions,
  balance
}: AccountTransactionsModalProps) => {
  const sortedTransactions = transactions.sort((a, b) =>
    new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
  );

  // Calculate running balance for each transaction
  // Start with current balance and work backwards through transactions
  const transactionsWithBalance = sortedTransactions.map((transaction, index) => {
    // For the first (newest) transaction, the balance after is the current balance
    // For subsequent transactions, subtract the previous transaction's impact
    let balanceAfter = balance;

    // Work backwards: subtract all transactions that came after this one
    for (let i = 0; i < index; i++) {
      const prevTransaction = sortedTransactions[i];
      if (prevTransaction.type === 'income') {
        balanceAfter -= prevTransaction.amount;
      } else if (prevTransaction.type === 'expense') {
        balanceAfter += Math.abs(prevTransaction.amount);
      }
      // For transfers, the amount is already reflected in the balance
    }

    return {
      ...transaction,
      balanceAfter
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span>{accountName}</span>
            <div className="flex items-center justify-between text-sm font-normal">
              <span className="text-muted-foreground">{bankName}</span>
              <span className="text-lg font-semibold">
                {balance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </DialogTitle>
          <DialogDescription>
            Historique des transactions pour ce compte
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {transactionsWithBalance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune transaction trouvée pour ce compte
            </div>
          ) : (
            transactionsWithBalance.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-3 sm:p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-muted flex-shrink-0">
                    {transaction.type === 'income' ? (
                      <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    ) : transaction.type === 'transfer' ? (
                      <ArrowRightLeft className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-xs sm:text-sm block truncate">{transaction.description}</span>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {transaction.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
                          style={{
                            backgroundColor: transaction.category.color,
                            color: 'white',
                            borderColor: transaction.category.color
                          }}
                        >
                          {transaction.category.name}
                        </Badge>
                      )}
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        {new Date(transaction.transaction_date).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right ml-2 flex-shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`font-medium text-xs sm:text-sm ${
                        transaction.type === 'income'
                          ? 'text-green-600'
                          : transaction.type === 'transfer'
                          ? 'text-blue-600'
                          : 'text-foreground'
                      }`}
                    >
                      {transaction.type === 'income'
                        ? '+'
                        : transaction.type === 'transfer'
                        ? '→'
                        : '-'
                      }{Math.abs(transaction.amount).toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}
                    </span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
                      Solde: {transaction.balanceAfter.toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: 'EUR',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};