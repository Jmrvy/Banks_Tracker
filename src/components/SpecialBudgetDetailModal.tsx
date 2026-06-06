import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trash2, Pencil, Link as LinkIcon, Unlink, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useSpecialBudgets, type SpecialBudget } from '@/hooks/useSpecialBudgets';
import { useToast } from '@/hooks/use-toast';
import { SpecialBudgetModal } from '@/components/SpecialBudgetModal';
import { LinkTransactionsToSpecialBudget } from '@/components/LinkTransactionsToSpecialBudget';
import { parseLocalDate } from '@/lib/dateUtils';

interface SpecialBudgetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: SpecialBudget | null;
}

export const SpecialBudgetDetailModal = ({ isOpen, onClose, budget }: SpecialBudgetDetailModalProps) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { formatCurrency } = useUserPreferences();
  const { transactions } = useFinancialData();
  const { goals } = useSavingsGoals();
  const { deleteSpecialBudget, linkTransactions } = useSpecialBudgets();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const linkedTxs = useMemo<Transaction[]>(() => {
    if (!budget) return [];
    return transactions
      .filter((t) => t.special_budget_id === budget.id)
      .slice()
      .sort(
        (a, b) =>
          parseLocalDate(b.transaction_date).getTime() -
          parseLocalDate(a.transaction_date).getTime()
      );
  }, [transactions, budget]);

  const spent = useMemo(() => {
    return linkedTxs
      .filter((t) => t.type === 'expense' && t.include_in_stats !== false)
      .reduce((s, t) => s + Math.max(0, t.amount - (t.refunded_amount || 0)), 0);
  }, [linkedTxs]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string; spent: number }>();
    for (const tx of linkedTxs) {
      if (tx.type !== 'expense' || tx.include_in_stats === false) continue;
      const name = tx.category?.name ?? t('common.uncategorized', { defaultValue: 'Uncategorized' });
      const color = tx.category?.color ?? '#6b7280';
      const net = Math.max(0, tx.amount - (tx.refunded_amount || 0));
      const cur = map.get(name) ?? { name, color, spent: 0 };
      cur.spent += net;
      map.set(name, cur);
    }
    return [...map.values()].sort((a, b) => b.spent - a.spent);
  }, [linkedTxs, t]);

  const linkedGoal = useMemo(
    () => (budget?.savings_goal_id ? goals.find((g) => g.id === budget.savings_goal_id) : null),
    [budget, goals]
  );

  if (!budget) return null;

  const total = budget.total_budget || 0;
  const remaining = total - spent;
  const progress = total > 0 ? Math.min(100, Math.round((spent / total) * 1000) / 10) : 0;
  const overBudget = total > 0 && spent > total;

  const handleDelete = async () => {
    if (!confirm(t('specialBudgets.deleteConfirm', { defaultValue: 'Delete this special budget? Linked transactions will revert to their regular category budget.' }))) return;
    const { error } = await deleteSpecialBudget(budget.id);
    if (error) {
      toast({ title: t('common.error'), description: (error as Error).message, variant: 'destructive' });
      return;
    }
    toast({ title: t('specialBudgets.deleted', { defaultValue: 'Special budget deleted' }) });
    onClose();
  };

  const handleUnlink = async (txId: string) => {
    const { error } = await linkTransactions([txId], null);
    if (error) {
      toast({ title: t('common.error'), description: (error as Error).message, variant: 'destructive' });
      return;
    }
    toast({ title: t('specialBudgets.unlinked', { defaultValue: 'Transaction unlinked' }) });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 flex-shrink-0 border-b border-line">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="h-10 w-10 rounded-xl flex-shrink-0"
                  style={{ background: budget.color ?? '#3B82F6' }}
                />
                <div className="min-w-0">
                  <DialogTitle className="text-base sm:text-lg">{budget.name}</DialogTitle>
                  {budget.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {budget.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={budget.status === 'closed' ? 'secondary' : 'outline'}
                  className="text-[10px]"
                >
                  {t(`specialBudgets.status${budget.status[0].toUpperCase() + budget.status.slice(1)}`, {
                    defaultValue: budget.status,
                  })}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  {t('specialBudgets.total', { defaultValue: 'Total' })}
                </div>
                <div className="font-mono text-xl font-medium tracking-tight mt-0.5">
                  {formatCurrency(total)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  {t('specialBudgets.spent', { defaultValue: 'Spent' })}
                </div>
                <div className={`font-mono text-xl font-medium tracking-tight mt-0.5 ${overBudget ? 'text-neg' : ''}`}>
                  {formatCurrency(spent)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  {t('specialBudgets.remaining', { defaultValue: 'Remaining' })}
                </div>
                <div className={`font-mono text-xl font-medium tracking-tight mt-0.5 ${remaining < 0 ? 'text-neg' : 'text-pos'}`}>
                  {formatCurrency(remaining)}
                </div>
              </div>
            </div>
            <Progress value={Math.min(100, progress)} className="h-2" />

            {/* Period + linked goal row */}
            {(budget.start_date || budget.end_date || linkedGoal) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {(budget.start_date || budget.end_date) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {budget.start_date && format(parseISO(budget.start_date), 'PP', { locale: dateLocale })}
                    {(budget.start_date || budget.end_date) && ' → '}
                    {budget.end_date
                      ? format(parseISO(budget.end_date), 'PP', { locale: dateLocale })
                      : t('specialBudgets.ongoing', { defaultValue: 'ongoing' })}
                  </span>
                )}
                {linkedGoal && (
                  <span className="inline-flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" />
                    {t('specialBudgets.savingsGoal', { defaultValue: 'Goal' })}: {linkedGoal.name}
                    <span className="font-mono">
                      ({formatCurrency(linkedGoal.current_amount)} / {formatCurrency(linkedGoal.target_amount)})
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* Category breakdown */}
            <div className="space-y-2.5">
              <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                {t('specialBudgets.byCategory', { defaultValue: 'By category' })}
              </div>
              {byCategory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('specialBudgets.noSpendYet', { defaultValue: 'No spending yet.' })}
                </p>
              ) : (
                <div className="space-y-2">
                  {byCategory.map((c) => {
                    const pct = spent > 0 ? (c.spent / spent) * 100 : 0;
                    return (
                      <div key={c.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: c.color }}
                            />
                            {c.name}
                          </span>
                          <span className="font-mono">
                            {formatCurrency(c.spent)} <span className="text-muted-foreground">· {pct.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-bg-subtle overflow-hidden">
                          <div className="h-full" style={{ width: `${pct}%`, background: c.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Linked transactions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  {t('specialBudgets.linkedTx', {
                    defaultValue: 'Linked transactions',
                  })}{' '}
                  <span className="text-muted-foreground">({linkedTxs.length})</span>
                </div>
                {budget.status !== 'closed' && (
                  <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)} className="h-7 gap-1.5">
                    <LinkIcon className="h-3 w-3" />
                    {t('specialBudgets.link', { defaultValue: 'Link transactions' })}
                  </Button>
                )}
              </div>
              {linkedTxs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('specialBudgets.noTxYet', { defaultValue: 'No transactions linked yet.' })}
                </p>
              ) : (
                <div className="border border-line rounded-lg divide-y divide-line">
                  {linkedTxs.map((tx) => (
                    <div key={tx.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{tx.description}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <span>{format(parseLocalDate(tx.transaction_date), 'PP', { locale: dateLocale })}</span>
                          {tx.category && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: tx.category.color }}
                                />
                                {tx.category.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-xs flex-shrink-0">
                        {formatCurrency(tx.amount)}
                      </div>
                      {budget.status !== 'closed' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0"
                          onClick={() => handleUnlink(tx.id)}
                          title={t('specialBudgets.unlink', { defaultValue: 'Unlink' })}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-t border-line flex-shrink-0">
            <Button variant="ghost" onClick={handleDelete} className="text-neg gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                {t('common.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button onClick={onClose}>{t('common.close', { defaultValue: 'Close' })}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SpecialBudgetModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        budget={budget}
      />
      <LinkTransactionsToSpecialBudget
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        budget={budget}
      />
    </>
  );
};
