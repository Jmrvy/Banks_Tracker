import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  type: 'expense' | 'income';
}

interface AccountTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  bankName: string;
  transactions: Transaction[];
  balance: number;
}

const categoryColors: Record<string, string> = {
  'Revenus': 'text-success',
  'Alimentation': 'text-primary',
  'Transport': 'text-accent',
  'Loisirs': 'text-warning',
  'Santé': 'text-success',
  'Logement': 'text-destructive',
  'Divers': 'text-muted-foreground'
};

export const AccountTransactionsModal = ({ 
  open, 
  onOpenChange, 
  accountName,
  bankName,
  transactions,
  balance
}: AccountTransactionsModalProps) => {
  // Sort transactions by date (most recent first)
  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span>{accountName}</span>
              <p className="text-sm font-normal text-muted-foreground mt-1">{bankName}</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-foreground">
                {balance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
              <p className="text-sm text-muted-foreground">Solde actuel</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {transactions.length === 0 ? (
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
                      <ArrowDownRight className="w-5 h-5 text-success" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                  
                  <div>
                    <p className="font-medium">{transaction.description}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${categoryColors[transaction.category]}`}
                      >
                        {transaction.category}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(transaction.date).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <span 
                    className={`font-semibold ${
                      transaction.type === 'income' ? 'text-success' : 'text-foreground'
                    }`}
                  >
                    {transaction.amount.toLocaleString('fr-FR', { 
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