import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
  category?: {
    name: string;
    color: string;
  };
  account?: {
    name: string;
  };
}

interface TransactionTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  type: 'income' | 'expense';
  period: string;
}

export const TransactionTypeModal = ({
  open,
  onOpenChange,
  transactions,
  type,
  period
}: TransactionTypeModalProps) => {
  const formatCurrency = (amount: number) =>
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const title = type === 'income' ? 'Revenus' : 'Dépenses';
  const Icon = type === 'income' ? TrendingUp : TrendingDown;
  const colorClass = type === 'income' ? 'text-success' : 'text-destructive';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${colorClass}`} />
            {title} - {period}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className={`text-2xl font-bold ${colorClass}`}>
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-sm text-muted-foreground">Nombre de transactions</p>
                <p className="text-lg font-semibold">{transactions.length}</p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {transactions.map((transaction) => (
              <Card key={transaction.id} className="hover-scale">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{transaction.description}</p>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{format(new Date(transaction.transaction_date), "d MMMM yyyy", { locale: fr })}</span>
                        {transaction.account && (
                          <>
                            <span>•</span>
                            <span>{transaction.account.name}</span>
                          </>
                        )}
                        {transaction.category && (
                          <>
                            <span>•</span>
                            <span 
                              className="px-2 py-0.5 rounded"
                              style={{ 
                                backgroundColor: `${transaction.category.color}20`,
                                color: transaction.category.color
                              }}
                            >
                              {transaction.category.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <p className={`text-lg font-bold whitespace-nowrap ${colorClass}`}>
                      {formatCurrency(transaction.amount)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {transactions.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Aucune transaction pour cette période
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
