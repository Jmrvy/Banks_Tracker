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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6">
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
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {sortedTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune transaction trouvée pour ce compte
            </div>
          ) : (
            sortedTransactions.map((transaction) => (
              <div 
                key={transaction.id} 
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                    {transaction.type === 'income' ? (
                      <ArrowDownRight className="w-5 h-5 text-green-600" />
                    ) : transaction.type === 'transfer' ? (
                      <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  
                  <div>
                    <span className="text-sm">{transaction.description}</span>
                    <div className="flex items-center gap-2 mt-1">
                      {transaction.category && (
                        <Badge 
                          variant="outline" 
                          className="text-xs px-2 py-0.5"
                          style={{ 
                            backgroundColor: transaction.category.color, 
                            color: 'white',
                            borderColor: transaction.category.color
                          }}
                        >
                          {transaction.category.name}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(transaction.transaction_date).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <span 
                    className={`font-medium ${
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
                      currency: 'EUR' 
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};