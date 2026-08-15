import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TrendingUp, TrendingDown, CalendarClock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { cn } from "@/lib/utils";
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
  const { isPrivacyMode } = usePrivacy();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0 border-b text-left">
          <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
            <div className={`ft-kpi-icon ${type === 'income' ? 'pos' : 'neg'}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div>{title}</div>
              <div className="text-xs font-normal text-fg-mute mt-0.5">{period}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="ft-kpi">
              <span className="ft-kpi-label truncate">{t('common.total')}</span>
              <div className={cn('ft-kpi-value truncate', colorClass, isPrivacyMode && 'ft-priv')}>
                {formatCurrency(totalAmount)}
              </div>
            </div>
            <div className="ft-kpi">
              <span className="ft-kpi-label truncate">{t('common.transactions', { defaultValue: 'Transactions' })}</span>
              <div className="ft-kpi-value">{transactions.length}</div>
            </div>
          </div>

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <div className="ft-card flush">
              <div className="ft-empty">
                <Icon className="h-[26px] w-[26px]" />
                <p className="ft-empty-title">{t('transactions.noTransactions')}</p>
              </div>
            </div>
          ) : (
            <div className="ft-card flush">
              <TooltipProvider>
                {transactions.map((transaction) => {
                  const hasDiff = hasDateDifference(transaction);
                  const refundInfo = type === 'expense' ? getRefundInfo(transaction) : null;

                  return (
                    /* Read-only rows: keep the divided-list shape but no hover
                       affordance — these rows do not open anything. */
                    <div key={transaction.id} className="ft-list-row plain hover:bg-transparent">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="ft-row-title truncate">{transaction.description}</p>
                          {transaction.isProjection && (
                            <span className="ft-tag acc flex-shrink-0">
                              {t('reports.forecastSuffix', { defaultValue: 'forecast' })}
                            </span>
                          )}
                          {type === 'expense' && refundInfo?.hasRefund && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`ft-tag flex-shrink-0 ${refundInfo.isFullyRefunded ? 'pos' : 'warn'}`}>
                                  {refundInfo.isFullyRefunded ? t('transactions.refunded') : t('transactions.partialRefund')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="space-y-1">
                                  <p>
                                    Brut :{' '}
                                    <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                                      {formatCurrency(refundInfo.gross)}
                                    </span>
                                  </p>
                                  <p>
                                    Remboursé :{' '}
                                    <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                                      {formatCurrency(refundInfo.refunded)}
                                    </span>
                                  </p>
                                  <p className="font-medium">
                                    Net (stats) :{' '}
                                    <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                                      {formatCurrency(refundInfo.net)}
                                    </span>
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="ft-row-sub flex flex-wrap items-center gap-1.5 min-w-0">
                          {hasDiff ? (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="ft-tag warn flex-shrink-0">
                                    <CalendarClock className="h-2.5 w-2.5" />
                                    {getDisplayDate(transaction)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p>{activeDateType === 'value' ? t('transactions.valueDate') : t('transactions.accountingDate')}</p>
                                </TooltipContent>
                              </Tooltip>
                              <span className="flex-shrink-0">
                                <span className="hidden sm:inline">
                                  {activeDateType === 'value' ? t('transactions.accountingDate') : t('transactions.valueDate')}:{' '}
                                </span>
                                <span className="sm:hidden">{activeDateType === 'value' ? 'C: ' : 'V: '}</span>
                                {format(parseLocalDate(activeDateType === 'value' ? transaction.transaction_date : (transaction.value_date || transaction.transaction_date)), "d MMM", { locale: fr })}
                              </span>
                            </>
                          ) : (
                            <span className="flex-shrink-0">{getDisplayDate(transaction)}</span>
                          )}
                          {transaction.account && (
                            <>
                              <span aria-hidden="true" className="flex-shrink-0">·</span>
                              <span className="truncate max-w-[120px]">{transaction.account.name}</span>
                            </>
                          )}
                          {transaction.category && (
                            <>
                              <span aria-hidden="true" className="flex-shrink-0">·</span>
                              <i
                                className="h-[7px] w-[7px] rounded-full flex-shrink-0"
                                style={{ background: transaction.category.color }}
                              />
                              <span className="truncate max-w-[120px]">{transaction.category.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        {type === 'expense' && refundInfo?.hasRefund ? (
                          <>
                            <span className={cn('ft-row-amt sub line-through block', isPrivacyMode && 'ft-priv')}>
                              {formatCurrency(refundInfo.gross)}
                            </span>
                            <span
                              className={cn(
                                'ft-row-amt block',
                                refundInfo.isFullyRefunded ? 'text-muted-foreground' : colorClass,
                                isPrivacyMode && 'ft-priv',
                              )}
                            >
                              {formatCurrency(refundInfo.net)}
                            </span>
                          </>
                        ) : (
                          <span className={cn('ft-row-amt block', colorClass, isPrivacyMode && 'ft-priv')}>
                            {formatCurrency(Number(transaction.amount))}
                          </span>
                        )}
                      </div>
                    </div>
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
