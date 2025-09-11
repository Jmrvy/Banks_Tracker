import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  bank: 'sg' | 'revolut' | 'boursorama';
  date: string;
  type: 'expense' | 'income';
}

interface CategoryTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  transactions: Transaction[];
}

const bankColors = {
  sg: 'bg-bank-sg',
  revolut: 'bg-bank-revolut', 
  boursorama: 'bg-bank-boursorama'
};

const bankNames = {
  sg: 'Société Générale',
  revolut: 'Revolut',
  boursorama: 'Boursorama'
};

export const CategoryTransactionsModal = ({ 
  open, 
  onOpenChange, 
  categoryName, 
  transactions 
}: CategoryTransactionsModalProps) => {
  const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Transactions - {categoryName}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune transaction trouvée pour cette catégorie
            </div>
          ) : (
            transactions.map((transaction) => (
              <div 
                key={transaction.id} 
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-6 rounded-full ${bankColors[transaction.bank]}`} />
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                      {transaction.type === 'income' ? (
                        <ArrowDownRight className="w-5 h-5 text-success" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5 text-destructive" />
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-medium">{transaction.description}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {bankNames[transaction.bank]}
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