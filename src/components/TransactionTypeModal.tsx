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
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className={`p-2 rounded-lg ${type === 'income' ? 'bg-success/10' : 'bg-destructive/10'}`}>
              <Icon className={`h-5 w-5 ${colorClass}`} />
            </div>
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-sm font-normal text-muted-foreground">{period}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Summary Card */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Total</p>
                <p className={`text-2xl font-bold ${colorClass}`}>
                  {formatCurrency(totalAmount)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Transactions</p>
                <p className="text-2xl font-bold">{transactions.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Icon className={`h-12 w-12 mx-auto mb-3 ${colorClass} opacity-20`} />
                <p className="text-muted-foreground">Aucune transaction pour cette période</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="font-medium text-base">{transaction.description}</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="px-2 py-1 bg-muted rounded text-muted-foreground">
                            {format(new Date(transaction.transaction_date), "d MMM yyyy", { locale: fr })}
                          </span>
                          {transaction.account && (
                            <span className="px-2 py-1 bg-muted rounded text-muted-foreground">
                              {transaction.account.name}
                            </span>
                          )}
                          {transaction.category && (
                            <span 
                              className="px-2 py-1 rounded font-medium"
                              style={{ 
                                backgroundColor: `${transaction.category.color}15`,
                                color: transaction.category.color
                              }}
                            >
                              {transaction.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <p className={`text-xl font-bold ${colorClass}`}>
                          {formatCurrency(transaction.amount)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
