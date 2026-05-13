import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, Loader2, Receipt, Wallet } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type RecurringTransaction } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';

interface DeleteRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurring: RecurringTransaction | null;
  onDeleted?: () => void;
}

interface LinkedTx {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
  account_id: string;
  type: string;
  transfer_to_account_id: string | null;
  transfer_fee: number | null;
}

// Compute the balance change each affected account will see if the
// listed transactions are deleted. Mirrors the update_account_balance
// trigger: deleting a transaction reverses its effect on the balance.
function computeBalanceDeltas(linked: LinkedTx[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const bump = (accountId: string, delta: number) => {
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);
  };
  for (const tx of linked) {
    const amt = Number(tx.amount) || 0;
    const fee = Number(tx.transfer_fee) || 0;
    if (tx.type === 'income') {
      // income added +amt to account; deleting reverses → -amt
      bump(tx.account_id, -amt);
    } else if (tx.type === 'expense') {
      // expense subtracted amt; deleting → +amt
      bump(tx.account_id, amt);
    } else if (tx.type === 'transfer') {
      // transfer subtracted (amt + fee) from source and added amt to dest;
      // deleting reverses both legs.
      bump(tx.account_id, amt + fee);
      if (tx.transfer_to_account_id) {
        bump(tx.transfer_to_account_id, -amt);
      }
    }
  }
  // Drop near-zero entries (floating-point dust)
  for (const [id, delta] of deltas) {
    if (Math.abs(delta) < 0.005) deltas.delete(id);
  }
  return deltas;
}

export function DeleteRecurringDialog({
  open,
  onOpenChange,
  recurring,
  onDeleted,
}: DeleteRecurringDialogProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { accounts, getRecurringDeletionImpact, deleteRecurringTransaction } = useFinancialData();

  const [linked, setLinked] = useState<LinkedTx[]>([]);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deleteLinked, setDeleteLinked] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Pre-cascade balance snapshot: for every account touched by the linked
  // transactions, project the new balance after delete.
  const balanceImpact = useMemo(() => {
    if (!linked.length) return [];
    const deltas = computeBalanceDeltas(linked);
    const rows: Array<{ id: string; name: string; current: number; next: number; delta: number }> = [];
    for (const [accountId, delta] of deltas) {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc) continue;
      rows.push({
        id: accountId,
        name: acc.name,
        current: Number(acc.balance) || 0,
        next: (Number(acc.balance) || 0) + delta,
        delta,
      });
    }
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows;
  }, [linked, accounts]);

  useEffect(() => {
    if (!open || !recurring) {
      setLinked([]);
      setDeleteLinked(true);
      return;
    }
    let cancelled = false;
    setLoadingImpact(true);
    getRecurringDeletionImpact(recurring.id).then(({ error, transactions }) => {
      if (cancelled) return;
      if (error) {
        toast({
          title: t('common.error'),
          description: error.message,
          variant: 'destructive',
        });
        setLinked([]);
      } else {
        setLinked(transactions);
      }
      setLoadingImpact(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, recurring?.id]);

  if (!recurring) return null;

  const hasLinked = linked.length > 0;

  const handleConfirm = async () => {
    setSubmitting(true);
    const result = await deleteRecurringTransaction(recurring.id, {
      deleteLinkedTransactions: hasLinked && deleteLinked,
    });
    setSubmitting(false);

    if (result?.error) {
      const msg = (result.error as { message?: string })?.message;
      // Plan-linked guards are surfaced by the page-level handler in
      // production, but in case something slips through, show a clear msg.
      toast({
        title: t('recurring.deleteFailed', { defaultValue: 'Could not delete schedule' }),
        description: msg || t('recurring.cannotDelete'),
        variant: 'destructive',
      });
      return;
    }

    const deletedTxnCount = result?.deletedTransactionsCount ?? 0;
    toast({
      title: t('recurring.transactionDeleted'),
      description: deletedTxnCount > 0
        ? t('recurring.deletedWithTxnsDesc', {
            defaultValue: 'Schedule and {{n}} linked transaction(s) deleted.',
            n: deletedTxnCount,
          })
        : t('recurring.deletedKeptTxnsDesc', {
            defaultValue: hasLinked
              ? 'Schedule deleted. Past transactions were kept.'
              : 'Schedule deleted.',
          }),
    });

    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t('recurring.deleteTitle', { defaultValue: 'Delete recurring transaction?' })}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                {t('recurring.deleteIntro', {
                  defaultValue:
                    '“{{name}}” will be deleted. This stops future occurrences. The action is irreversible.',
                  name: recurring.description,
                })}
              </p>

              {loadingImpact ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : hasLinked ? (
                <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
                  <div className="flex items-start gap-2">
                    <Receipt className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-[12px] leading-relaxed font-medium text-foreground">
                      {t('recurring.deleteHasLinked', {
                        defaultValue:
                          '{{n}} transaction(s) were generated by this schedule:',
                        n: linked.length,
                      })}
                    </p>
                  </div>
                  <div className="max-h-[180px] overflow-y-auto rounded bg-background/60 divide-y divide-border">
                    {linked.slice(0, 50).map((tx) => {
                      const accountName = accounts.find((a) => a.id === tx.account_id)?.name;
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{tx.description}</p>
                            <p className="text-muted-foreground">
                              {format(parseISO(tx.transaction_date), 'PP', { locale: dateLocale })}
                              {accountName && ` · ${accountName}`}
                            </p>
                          </div>
                          <span
                            className={`font-mono font-semibold whitespace-nowrap ${
                              tx.type === 'income' ? 'text-emerald-600' : 'text-destructive'
                            }`}
                          >
                            {tx.type === 'income' ? '+' : '−'}
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      );
                    })}
                    {linked.length > 50 && (
                      <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        {t('recurring.deleteTruncatedHint', {
                          defaultValue: '+{{n}} more',
                          n: linked.length - 50,
                        })}
                      </p>
                    )}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer pt-1">
                    <Checkbox
                      checked={deleteLinked}
                      onCheckedChange={(v) => setDeleteLinked(v === true)}
                      className="mt-0.5"
                    />
                    <span className="text-[12px] leading-relaxed">
                      {t('recurring.deleteAlsoLinked', {
                        defaultValue:
                          'Also delete these {{n}} transaction(s). Account balances will be recomputed.',
                        n: linked.length,
                      })}
                    </span>
                  </label>
                  {deleteLinked && balanceImpact.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium">
                        <Wallet className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        {t('recurring.deleteBalancePreview', {
                          defaultValue: 'Account balances after delete:',
                        })}
                      </div>
                      <div className="divide-y divide-amber-500/20 rounded bg-background/40">
                        {balanceImpact.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1 text-[11px]"
                          >
                            <span className="truncate font-medium">{row.name}</span>
                            <div className="flex items-center gap-1.5 font-mono tabular-nums whitespace-nowrap">
                              <span className="text-muted-foreground line-through opacity-80">
                                {formatCurrency(row.current)}
                              </span>
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                              <span className="font-semibold">{formatCurrency(row.next)}</span>
                              <span
                                className={`ml-0.5 text-[10px] px-1 py-px rounded ${
                                  row.delta >= 0
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-destructive/15 text-destructive'
                                }`}
                              >
                                {row.delta >= 0 ? '+' : '−'}
                                {formatCurrency(Math.abs(row.delta))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!deleteLinked && (
                    <p className="text-[10.5px] text-muted-foreground leading-relaxed">
                      {t('recurring.deleteKeepNote', {
                        defaultValue:
                          'Past transactions will be kept and unlinked from this schedule.',
                      })}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  {t('recurring.deleteNoLinked', {
                    defaultValue: 'No transactions have been generated yet by this schedule.',
                  })}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || loadingImpact}
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {hasLinked && deleteLinked
              ? t('recurring.deleteConfirmWithTxns', {
                  defaultValue: 'Delete schedule + {{n}} txns',
                  n: linked.length,
                })
              : t('recurring.deleteConfirm', { defaultValue: 'Delete schedule' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
