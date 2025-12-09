import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  bank: string;
  date: string;
  type: 'expense' | 'income' | 'transfer';
}

interface CategoryTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  transactions: Transaction[];
}

const bankColors: Record<string, string> = {
  societe_generale: 'bg-red-500',
  revolut: 'bg-blue-500', 
  boursorama: 'bg-orange-500',
  bnp_paribas: 'bg-green-600',
  credit_agricole: 'bg-green-700',
  lcl: 'bg-blue-700',
  caisse_epargne: 'bg-yellow-600',
  credit_mutuel: 'bg-blue-800',
  sg: 'bg-red-500', // Legacy support
  other: 'bg-gray-500'
};

const bankNames: Record<string, string> = {
  societe_generale: 'Société Générale',
  revolut: 'Revolut',
  boursorama: 'Boursorama',
  bnp_paribas: 'BNP Paribas',
  credit_agricole: 'Crédit Agricole',
  lcl: 'LCL',
  caisse_epargne: 'Caisse d\'Épargne',
  credit_mutuel: 'Crédit Mutuel',
  sg: 'Société Générale', // Legacy support
  other: 'Autre'
};

export const CategoryTransactionsModal = ({ 
  open, 
  onOpenChange, 
  categoryName, 
  transactions 
}: CategoryTransactionsModalProps) => {
  const { formatCurrency } = useUserPreferences();
  const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[80vh] sm:max-h-[85vh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader className="pb-2 sm:pb-4">
          <DialogTitle className="flex items-center justify-between text-sm sm:text-base">
            <span className="truncate">{categoryName}</span>
            <Badge variant="secondary" className="text-xs sm:text-sm ml-2 flex-shrink-0">
              {formatCurrency(totalAmount)}
            </Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {transactions.length} transaction{transactions.length > 1 ? 's' : ''}
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 pr-1 sm:pr-2">
          {transactions.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
              Aucune transaction trouvée
            </div>
          ) : (
            transactions.map((transaction) => (
              <div 
                key={transaction.id} 
                className="flex items-center justify-between p-2 sm:p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors gap-2"
              >
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <div className={`w-1.5 sm:w-2 h-5 sm:h-6 rounded-full ${
                      bankColors[transaction.bank] || 'bg-gray-500'
                    }`} />
                    <div className="flex items-center justify-center w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-muted">
                      {transaction.type === 'income' ? (
                        <ArrowDownRight className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-green-600" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-red-600" />
                      )}
                    </div>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs sm:text-sm truncate">{transaction.description}</p>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                      <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2 py-0 h-4 sm:h-5">
                        {bankNames[transaction.bank] || transaction.bank}
                      </Badge>
                      <span className="text-[10px] sm:text-sm text-muted-foreground">
                        {new Date(transaction.date).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex-shrink-0">
                  <span 
                    className={`font-semibold text-xs sm:text-sm ${
                      transaction.type === 'income' ? 'text-green-600' : 'text-foreground'
                    }`}
                  >
                    {formatCurrency(transaction.amount)}
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