import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRightLeft,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useFinancialData, type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { CreateRefundModal } from "@/components/CreateRefundModal";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { useToast } from "@/hooks/use-toast";
import { TransactionFilters } from "./TransactionSearch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseLocalDate } from "@/lib/dateUtils";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { BANK_COLORS } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/categoryIcons";

interface TransactionRowProps {
  transaction: Transaction;
  dateType: string;
  formatCurrency: (amount: number) => string;
  onView: (t: Transaction) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  onRefund: (t: Transaction) => void;
}

const TransactionRow = React.memo(
  ({ transaction, dateType, formatCurrency, onView, onEdit, onDelete, onRefund }: TransactionRowProps) => {
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language === 'fr' ? fr : enUS;
    const displayDate =
      dateType === 'value'
        ? parseLocalDate(transaction.value_date || transaction.transaction_date)
        : parseLocalDate(transaction.transaction_date);

    const refundedAmount = transaction.refunded_amount || 0;
    const isFullyRefunded = transaction.type === 'expense' && refundedAmount >= transaction.amount;
    const isPartiallyRefunded =
      transaction.type === 'expense' && refundedAmount > 0 && refundedAmount < transaction.amount;

    // The income mirror: an advance shows what it is once repaid.
    const repaidAmount = transaction.repaid_amount || 0;
    const isFullyRepaid = transaction.type === 'income' && repaidAmount >= transaction.amount;
    const isPartiallyRepaid =
      transaction.type === 'income' && repaidAmount > 0 && repaidAmount < transaction.amount;

    // Not floored: a refund beyond the expense makes the row negative, which
    // is the point of allowing it.
    const netExpenseAmount =
      transaction.type === 'expense'
        ? transaction.amount - refundedAmount
        : transaction.type === 'income'
        ? transaction.amount - repaidAmount
        : transaction.amount;
    const transferFee =
      transaction.type === 'transfer' && transaction.transfer_fee ? transaction.transfer_fee : 0;
    const displayAmount = transaction.type === 'transfer' ? transaction.amount : netExpenseAmount;

    const userIcon = getCategoryIcon(transaction.category?.icon ?? null);
    const FallbackIcon =
      transaction.type === 'income' ? ArrowDownRight : transaction.type === 'transfer' ? ArrowRightLeft : ArrowUpRight;
    const Icon = userIcon ?? FallbackIcon;
    const tintColor = userIcon && transaction.category ? transaction.category.color : null;
    const iconBgClass =
      transaction.type === 'income'
        ? 'bg-pos/12 text-pos'
        : transaction.type === 'transfer'
        ? 'bg-primary/12 text-primary'
        : 'bg-bg-subtle text-muted-foreground border border-line';

    const bankColor = BANK_COLORS[transaction.account?.bank || 'other'] || '#6B7280';

    return (
      <div
        onClick={() => onView(transaction)}
        className="grid items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 py-3 border-b border-line last:border-b-0 hover:bg-bg-subtle/60 transition-colors cursor-pointer group"
        style={{ gridTemplateColumns: '4px 32px minmax(0, 1fr) auto auto' }}
      >
        {/* Bank stripe */}
        <div className="h-7 w-1 rounded-full" style={{ background: bankColor }} />

        {/* Type/category icon */}
        <div
          className={`h-8 w-8 rounded-lg grid place-items-center flex-shrink-0 ${
            tintColor ? '' : iconBgClass
          }`}
          style={tintColor ? { background: `${tintColor}1F`, color: tintColor } : undefined}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>

        {/* Merchant + meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-[13px] truncate">{transaction.description}</p>
            {transaction.refund_of_transaction_id && (
              <Tooltip>
                <TooltipTrigger>
                  <span className="ft-tag pos">
                    <RotateCcw className="h-2.5 w-2.5" />
                    {t('transactions.refund', { defaultValue: 'Refund' })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('transactions.refundTooltip', { defaultValue: 'This income is a refund' })}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {transaction.repayment_of_transaction_id && (
              <Tooltip>
                <TooltipTrigger>
                  <span className="ft-tag">
                    <RotateCcw className="h-2.5 w-2.5" />
                    {t('transactions.repayment', { defaultValue: 'Repayment' })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('transactions.repaymentTooltip', { defaultValue: 'This expense repays an advance' })}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {transaction.type === 'income' && repaidAmount > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <span className={`ft-tag ${repaidAmount >= transaction.amount ? '' : 'warn'}`}>
                    <RotateCcw className="h-2.5 w-2.5" />
                    {repaidAmount >= transaction.amount
                      ? t('transactions.repaid', { defaultValue: 'Repaid' })
                      : t('transactions.partialRepayment', { defaultValue: 'Partial' })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {repaidAmount >= transaction.amount
                      ? t('transactions.fullyRepaid', { defaultValue: 'Advance fully repaid' })
                      : `${formatCurrency(repaidAmount)} / ${formatCurrency(transaction.amount)}`}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {transaction.type === 'expense' && refundedAmount > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <span className={`ft-tag ${refundedAmount === transaction.amount ? 'pos' : 'warn'}`}>
                    <RotateCcw className="h-2.5 w-2.5" />
                    {refundedAmount === transaction.amount
                      ? t('transactions.refunded')
                      : t('transactions.partialRefund')}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {refundedAmount === transaction.amount
                      ? t('transactions.fullyRefunded', { defaultValue: 'Fully refunded' })
                      : `${formatCurrency(refundedAmount)} / ${formatCurrency(transaction.amount)}`}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap min-w-0">
            {transaction.category && (
              <span
                className="ft-tag truncate max-w-[140px]"
                style={{
                  background: `${transaction.category.color}1f`,
                  color: transaction.category.color,
                  borderColor: 'transparent',
                }}
              >
                <span className="dot flex-shrink-0" style={{ background: transaction.category.color }} />
                <span className="truncate">{transaction.category.name}</span>
              </span>
            )}
            {transaction.special_budget_id && (
              <Tooltip>
                <TooltipTrigger>
                  <span className="ft-tag acc text-[10px]">
                    {t('specialBudgets.tagShort', { defaultValue: 'Special' })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {t('specialBudgets.tagTooltip', {
                      defaultValue:
                        "Linked to a special budget — counted there instead of the category budget.",
                    })}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <span className="text-[11.5px] text-fg-dim truncate min-w-0 flex-1">
              {transaction.account?.name}
              {transaction.type === 'transfer' && transaction.transfer_to_account && (
                <> → {transaction.transfer_to_account.name}</>
              )}
              {' · '}
              {format(displayDate, 'd MMM', { locale: dateLocale })}
            </span>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right whitespace-nowrap">
          <span
            className={`font-mono text-sm font-semibold ${
              isFullyRefunded || isFullyRepaid
                ? 'text-muted-foreground line-through'
                : transaction.type === 'income'
                ? 'text-pos'
                : transaction.type === 'transfer'
                ? 'text-primary'
                : ''
            }`}
          >
            {transaction.type === 'income' ? '+' : transaction.type === 'transfer' ? '↔' : '−'}
            {formatCurrency(Math.abs(displayAmount))}
          </span>
          {isPartiallyRefunded && (
            <div className="font-mono text-[10px] text-muted-foreground line-through">
              −{formatCurrency(transaction.amount)}
            </div>
          )}
          {isPartiallyRepaid && (
            <div className="font-mono text-[10px] text-muted-foreground line-through">
              +{formatCurrency(transaction.amount)}
            </div>
          )}
          {transferFee > 0 && (
            <div className="font-mono text-[10px] text-warning">
              +{formatCurrency(transferFee)} {t('transactions.fee', { defaultValue: 'fee' })}
            </div>
          )}
        </div>

        {/* Action buttons (desktop hover) */}
        <div className="hidden md:flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {transaction.type === 'expense' && refundedAmount < transaction.amount && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefund(transaction);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5 text-muted-foreground hover:text-pos" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('transactions.addRefund')}</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(transaction);
            }}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(transaction);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>
    );
  }
);
TransactionRow.displayName = 'TransactionRow';

interface TransactionHistoryProps {
  filters?: TransactionFilters;
}

export const TransactionHistory = ({ filters }: TransactionHistoryProps) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { transactions, loading, deleteTransaction, refetch } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { toast } = useToast();
  const [displayCount, setDisplayCount] = useState<number>(50);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [refundingTransaction, setRefundingTransaction] = useState<Transaction | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // `filters.dateType` pins which column the date range applies to —
  // used when navigation upstream (e.g. Budget → "view transactions")
  // wants the displayed set to mirror its own counting. Falls back to
  // the user's global preference.
  const activeDateType = filters?.dateType ?? preferences.dateType;
  const dateOf = (txn: Transaction) =>
    activeDateType === 'value'
      ? parseLocalDate(txn.value_date || txn.transaction_date)
      : parseLocalDate(txn.transaction_date);

  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (filters) {
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.description.toLowerCase().includes(searchLower) ||
            t.category?.name.toLowerCase().includes(searchLower) ||
            t.account?.name.toLowerCase().includes(searchLower)
        );
      }
      if (filters.type !== 'all') {
        filtered = filtered.filter((t) => t.type === filters.type);
      }
      if (filters.categoryId !== 'all') {
        filtered = filtered.filter((t) => t.category?.id === filters.categoryId);
      }
      if (filters.accountId !== 'all') {
        filtered = filtered.filter(
          (t) => t.account_id === filters.accountId || t.transfer_to_account_id === filters.accountId
        );
      }
      if (filters.dateFrom) {
        const fromDate = parseLocalDate(filters.dateFrom);
        filtered = filtered.filter((t) => dateOf(t) >= fromDate);
      }
      if (filters.dateTo) {
        const toDate = parseLocalDate(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter((t) => dateOf(t) <= toDate);
      }
      if (filters.amountMin) {
        const min = parseFloat(filters.amountMin);
        filtered = filtered.filter((t) => Math.abs(t.amount) >= min);
      }
      if (filters.amountMax) {
        const max = parseFloat(filters.amountMax);
        filtered = filtered.filter((t) => Math.abs(t.amount) <= max);
      }
      if (filters.refund === 'refunded') {
        filtered = filtered.filter((t) => (t.refunded_amount || 0) > 0);
      } else if (filters.refund === 'is_refund') {
        filtered = filtered.filter((t) => !!t.refund_of_transaction_id);
      }
    }

    return filtered.sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime());
  }, [transactions, activeDateType, filters]);

  const displayedTransactions = filteredAndSortedTransactions.slice(0, displayCount);

  // Group by DAY, the way the pack does: a ledger is read a day at a time,
  // and a month strip put a hundred rows under one heading. Today and
  // yesterday get named rather than dated.
  const groupedByMonth = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: Transaction[]; total: number }> = [];
    const map = new Map<string, { label: string; items: Transaction[] }>();
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const todayKey = dayKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = dayKey(yesterday);
    for (const txn of displayedTransactions) {
      const d = dateOf(txn);
      const key = dayKey(d);
      if (!map.has(key)) {
        map.set(key, {
          label:
            key === todayKey
              ? t('common.today', { defaultValue: 'Today' })
              : key === yesterdayKey
              ? t('common.yesterday', { defaultValue: 'Yesterday' })
              : format(d, 'EEEE d MMMM', { locale: dateLocale }),
          items: [],
        });
      }
      map.get(key)!.items.push(txn);
    }
    for (const [key, value] of map.entries()) {
      const total = value.items.reduce((acc, t) => {
        // Rows you excluded from statistics are invisible in Reports; they
        // must not silently move the strip total either.
        if (t.include_in_stats === false) return acc;
        if (t.type === 'income' && !t.refund_of_transaction_id) {
          const net = Math.max(0, t.amount - (t.repaid_amount || 0));
          // Income that came back on its category reduces spend rather than
          // adding to earnings, so it lands on the same side either way.
          return acc + net;
        }
        // A repayment is settled by the income it repays, and an over-refund
        // is negative rather than floored — both as the rows now show them.
        if (t.type === 'expense' && !t.repayment_of_transaction_id)
          return acc - (t.amount - (t.refunded_amount || 0));
        // A transfer moves money between your own accounts; only the fee
        // leaves, and the row above renders it.
        if (t.type === 'transfer') return acc - Number(t.transfer_fee || 0);
        return acc;
      }, 0);
      groups.push({ key, label: value.label, items: value.items, total });
    }
    return groups;
  }, [displayedTransactions, activeDateType, dateLocale]);

  const handleDelete = async () => {
    if (!deletingTransaction) return;
    setIsDeleting(true);
    const { error } = await deleteTransaction(deletingTransaction.id);
    if (error) {
      toast({
        title: t('common.error'),
        description: error.message || t('transactions.deleteError'),
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('common.success', { defaultValue: 'Success' }),
        description: t('transactions.deleteSuccess'),
      });
    }
    setIsDeleting(false);
    setDeletingTransaction(null);
  };

  if (loading) {
    return (
      <div className="ft-card-flush">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="grid items-center gap-3 px-5 py-3 border-b border-line last:border-b-0"
            style={{ gridTemplateColumns: '4px 32px 1fr auto' }}
          >
            <div className="animate-pulse w-1 h-7 rounded-full bg-bg-subtle" />
            <div className="animate-pulse w-8 h-8 rounded-lg bg-bg-subtle" />
            <div className="space-y-2">
              <div className="animate-pulse h-3.5 bg-bg-subtle rounded w-32" />
              <div className="animate-pulse h-3 bg-bg-subtle rounded w-20" />
            </div>
            <div className="animate-pulse h-3.5 bg-bg-subtle rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (filteredAndSortedTransactions.length === 0) {
    return (
      <div className="ft-card p-10 sm:p-14 text-center">
        <p className="text-sm text-foreground font-medium">
          {transactions.length === 0
            ? t('transactions.empty', { defaultValue: 'No transactions yet' })
            : t('transactions.noResults', { defaultValue: 'No results for these filters' })}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {transactions.length === 0
            ? t('transactions.emptyHint', { defaultValue: 'Create your first transaction to get started' })
            : t('transactions.tryAdjust', { defaultValue: 'Try adjusting your search criteria' })}
        </p>
      </div>
    );
  }

  return (
    <div className="ft-card-flush">
      {groupedByMonth.map((group) => (
        <div key={group.key}>
          {/* Month header strip — sticks to the top of the scroll so you
              always know which month the rows under your cursor belong to. */}
          <div className="ft-daylab">
            <span>
              {group.label} · {group.items.length}{' '}
              {group.items.length > 1
                ? t('transactions.transactions', { defaultValue: 'transactions' })
                : t('transactions.transaction', { defaultValue: 'transaction' })}
            </span>
            <span
              className={`font-mono text-[13px] font-semibold normal-case tracking-normal ${
                group.total >= 0 ? 'text-pos' : 'text-foreground'
              }`}
            >
              {group.total >= 0 ? '+' : '−'}
              {formatCurrency(Math.abs(group.total))}
            </span>
          </div>

          {/* Rows */}
          {group.items.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              dateType={activeDateType}
              formatCurrency={formatCurrency}
              onView={setViewingTransaction}
              onEdit={setEditingTransaction}
              onDelete={setDeletingTransaction}
              onRefund={setRefundingTransaction}
            />
          ))}
        </div>
      ))}

      {/* Load more footer */}
      {displayedTransactions.length < filteredAndSortedTransactions.length && (
        <button
          type="button"
          onClick={() => setDisplayCount((prev) => prev + 50)}
          className="ft-row-foot"
        >
          {t('transactions.showMore')}
          <span className="text-fg-dim font-normal ml-1.5">
            {t('transactions.showingNOfM', {
              defaultValue: 'Showing {{n}} of {{m}} transactions',
              n: displayedTransactions.length,
              m: filteredAndSortedTransactions.length,
            })}
          </span>
        </button>
      )}

      <EditTransactionModal
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
        transaction={editingTransaction}
      />

      <AlertDialog open={!!deletingTransaction} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.confirmDelete', { defaultValue: 'Confirm deletion' })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm space-y-3">
                <p>{t('transactions.deleteWarning', { defaultValue: 'This action is irreversible.' })}</p>
                {deletingTransaction && (
                  <div className="p-3 bg-bg-subtle border border-line rounded-lg">
                    <p className="font-medium">{deletingTransaction.description}</p>
                    <p className="text-sm font-mono mt-1">{formatCurrency(deletingTransaction.amount)}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting
                ? t('common.deleting', { defaultValue: 'Deleting…' })
                : t('common.delete', { defaultValue: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateRefundModal
        open={!!refundingTransaction}
        onOpenChange={(open) => !open && setRefundingTransaction(null)}
        transaction={refundingTransaction}
      />

      <TransactionDetailModal
        open={!!viewingTransaction}
        onOpenChange={(open) => !open && setViewingTransaction(null)}
        transaction={viewingTransaction}
        onEdit={(t) => {
          setViewingTransaction(null);
          setEditingTransaction(t);
        }}
        onDelete={(t) => {
          setViewingTransaction(null);
          setDeletingTransaction(t);
        }}
        onRefund={(t) => {
          setViewingTransaction(null);
          setRefundingTransaction(t);
        }}
      />

    </div>
  );
};
