import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, CalendarClock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
  value_date?: string;
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
  const { preferences, formatCurrency } = useUserPreferences();
  const activeDateType = preferences.dateType;

  const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const title = type === 'income' ? 'Revenus' : 'Dépenses';
  const Icon = type === 'income' ? TrendingUp : TrendingDown;
  const colorClass = type === 'income' ? 'text-success' : 'text-destructive';

  // Check if transaction has different dates
  const hasDateDifference = (t: Transaction) => {
    if (!t.value_date) return false;
    const transactionDate = new Date(t.transaction_date).toDateString();
    const valueDate = new Date(t.value_date).toDateString();
    return transactionDate !== valueDate;
  };

  // Get the display date based on preference
  const getDisplayDate = (t: Transaction) => {
    const dateToUse = activeDateType === 'value' && t.value_date 
      ? new Date(t.value_date) 
      : new Date(t.transaction_date);
    return format(dateToUse, "d MMM yyyy", { locale: fr });
  };

  // Get the other date for tooltip
  const getOtherDate = (t: Transaction) => {
    const otherDate = activeDateType === 'value' 
      ? new Date(t.transaction_date)
      : new Date(t.value_date || t.transaction_date);
    return format(otherDate, "d MMM yyyy", { locale: fr });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-3 sm:pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-xl">
            <div className={`p-1.5 sm:p-2 rounded-lg ${type === 'income' ? 'bg-success/10' : 'bg-destructive/10'}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${colorClass}`} />
            </div>
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-xs sm:text-sm font-normal text-muted-foreground">{period}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 py-3 sm:py-4">
          {/* Summary Card */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <Card className="bg-muted/30">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Total</p>
                <p className={`text-lg sm:text-2xl font-bold ${colorClass}`}>
                  {formatCurrency(totalAmount)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Transactions</p>
                <p className="text-lg sm:text-2xl font-bold">{transactions.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 sm:p-12 text-center">
                <Icon className={`h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 ${colorClass} opacity-20`} />
                <p className="text-sm sm:text-base text-muted-foreground">Aucune transaction pour cette période</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <TooltipProvider>
                {transactions.map((transaction) => {
                  const hasDiff = hasDateDifference(transaction);
                  
                  return (
                    <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex justify-between items-start gap-2 sm:gap-4">
                          <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                            <p className="font-medium text-sm sm:text-base truncate">{transaction.description}</p>
                            <div className="flex flex-wrap gap-1 sm:gap-2 text-[10px] sm:text-xs">
                              {hasDiff ? (
                                <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-amber-100 dark:bg-amber-900/30 rounded text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                        <CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                        <span className="font-medium">{getDisplayDate(transaction)}</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <p>{activeDateType === 'value' ? 'Date valeur' : 'Date affichée'}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted rounded text-muted-foreground text-[9px] sm:text-xs">
                                    <span className="hidden sm:inline">Comptable:</span>
                                    <span className="sm:hidden">C:</span>
                                    {format(new Date(transaction.transaction_date), "d MMM", { locale: fr })}
                                  </span>
                                </div>
                              ) : (
                                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted rounded text-muted-foreground">
                                  {getDisplayDate(transaction)}
                                </span>
                              )}
                              {transaction.account && (
                                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted rounded text-muted-foreground truncate max-w-[100px] sm:max-w-none">
                                  {transaction.account.name}
                                </span>
                              )}
                              {transaction.category && (
                                <span 
                                  className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-medium truncate max-w-[80px] sm:max-w-none"
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
                            <p className={`text-base sm:text-xl font-bold ${colorClass}`}>
                              {formatCurrency(transaction.amount)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TooltipProvider>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};