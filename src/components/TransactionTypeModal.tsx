import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, CalendarClock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { parseLocalDate } from "@/lib/dateUtils";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  refunded_amount?: number | null;
  refund_of_transaction_id?: string | null;
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
  isProjection?: boolean;
  projectedSource?: 'recurring' | 'debt' | 'installment';
}

interface TransactionTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  type: 'income' | 'expense';
  period: string;
  dateType?: 'accounting' | 'value';
}

export const TransactionTypeModal = ({
  open,
  onOpenChange,
  transactions,
  type,
  period,
  dateType
}: TransactionTypeModalProps) => {
  const { t } = useTranslation();
  const { preferences, formatCurrency } = useUserPreferences();
  const activeDateType = dateType ?? preferences.dateType;

  const getRefundInfo = (t: Transaction) => {
    const gross = Number(t.amount);
    const refunded = Number(t.refunded_amount ?? 0);
    const net = Math.max(0, gross - refunded);
    const hasRefund = refunded > 0;
    const isFullyRefunded = hasRefund && net === 0;
    return { gross, refunded, net, hasRefund, isFullyRefunded };
  };

  const getDisplayAmount = (t: Transaction) => {
    if (type !== "expense") return Number(t.amount);
    const { net } = getRefundInfo(t);
    return net;
  };

  const totalAmount = transactions.reduce((sum, t) => sum + getDisplayAmount(t), 0);
  const title = type === 'income' ? t('common.income') : t('common.expenses');
  const Icon = type === 'income' ? TrendingUp : TrendingDown;
  const colorClass = type === 'income' ? 'text-success' : 'text-destructive';

  // Check if transaction has different dates
  const hasDateDifference = (t: Transaction) => {
    if (!t.value_date) return false;
    const transactionDate = parseLocalDate(t.transaction_date).toDateString();
    const valueDate = parseLocalDate(t.value_date).toDateString();
    return transactionDate !== valueDate;
  };

  // Get the display date based on preference
  const getDisplayDate = (t: Transaction) => {
    const dateToUse = activeDateType === 'value' && t.value_date
      ? parseLocalDate(t.value_date)
      : parseLocalDate(t.transaction_date);
    return format(dateToUse, "d MMM yyyy", { locale: fr });
  };

  // Get the other date for tooltip
  const getOtherDate = (t: Transaction) => {
    const otherDate = activeDateType === 'value'
      ? parseLocalDate(t.transaction_date)
      : parseLocalDate(t.value_date || t.transaction_date);
    return format(otherDate, "d MMM yyyy", { locale: fr });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 sm:gap-3 text-sm sm:text-lg">
            <div className={`p-1.5 sm:p-2 rounded-lg ${type === 'income' ? 'bg-success/10' : 'bg-destructive/10'}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${colorClass}`} />
            </div>
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-xs sm:text-sm font-normal text-muted-foreground">{period}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
          {/* Summary Card */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <Card className="bg-muted/30">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">{t('common.total')}</p>
                <p className={`text-lg sm:text-2xl font-bold ${colorClass}`}>
                  {formatCurrency(totalAmount)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">{t('common.transactions', { defaultValue: 'Transactions' })}</p>
                <p className="text-lg sm:text-2xl font-bold">{transactions.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 sm:p-12 text-center">
                <Icon className={`h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 ${colorClass} opacity-20`} />
                <p className="text-sm sm:text-base text-muted-foreground">{t('transactions.noTransactions')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <TooltipProvider>
                {transactions.map((transaction) => {
                  const hasDiff = hasDateDifference(transaction);
                  const refundInfo = type === 'expense' ? getRefundInfo(transaction) : null;
                  
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
                                      <p>{activeDateType === 'value' ? t('transactions.valueDate') : t('transactions.accountingDate')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted rounded text-muted-foreground text-[9px] sm:text-xs">
                                    <span className="hidden sm:inline">{activeDateType === 'value' ? t('transactions.accountingDate') : t('transactions.valueDate')}:</span>
                                    <span className="sm:hidden">{activeDateType === 'value' ? 'C:' : 'V:'}</span>
                                    {format(parseLocalDate(activeDateType === 'value' ? transaction.transaction_date : (transaction.value_date || transaction.transaction_date)), "d MMM", { locale: fr })}
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

                              {transaction.isProjection && (
                                <Badge variant="outline" className="text-[9px] sm:text-xs px-2 py-0.5">
                                  {t('reports.forecastSuffix', { defaultValue: 'forecast' })}
                                </Badge>
                              )}

                              {type === 'expense' && refundInfo?.hasRefund && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant={refundInfo.isFullyRefunded ? "secondary" : "outline"}
                                      className="text-[9px] sm:text-xs px-2 py-0.5"
                                    >
                                      {refundInfo.isFullyRefunded ? t('transactions.refunded') : t('transactions.partialRefund')}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <div className="space-y-1">
                                      <p>Brut : {formatCurrency(refundInfo.gross)}</p>
                                      <p>Remboursé : {formatCurrency(refundInfo.refunded)}</p>
                                      <p className="font-medium">Net (stats) : {formatCurrency(refundInfo.net)}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {type === 'expense' && refundInfo?.hasRefund ? (
                              <div className="flex flex-col items-end">
                                <p className="text-xs sm:text-sm text-muted-foreground line-through">
                                  {formatCurrency(refundInfo.gross)}
                                </p>
                                <p className={`text-base sm:text-xl font-bold ${refundInfo.isFullyRefunded ? 'text-muted-foreground' : colorClass}`}>
                                  {formatCurrency(refundInfo.net)}
                                </p>
                              </div>
                            ) : (
                              <p className={`text-base sm:text-xl font-bold ${colorClass}`}>
                                {formatCurrency(Number(transaction.amount))}
                              </p>
                            )}
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