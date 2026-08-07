import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Trash2,
  Pencil,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useSpecialBudgets, type SpecialBudget } from '@/hooks/useSpecialBudgets';
import { useToast } from '@/hooks/use-toast';
import { SpecialBudgetModal } from '@/components/SpecialBudgetModal';
import { LinkTransactionsToSpecialBudget } from '@/components/LinkTransactionsToSpecialBudget';
import { parseLocalDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import {
  computeSpecialBudget,
  formatSpecialBudgetRange,
  getSpecialBudgetIcon,
  paletteForColor,
  SPECIAL_BUDGET_STATUS_META,
  specialBudgetTransactionAmount,
} from '@/lib/specialBudgetUtils';

interface SpecialBudgetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: SpecialBudget | null;
}

export const SpecialBudgetDetailModal = ({
  isOpen,
  onClose,
  budget,
}: SpecialBudgetDetailModalProps) => {
  const { t, i18n } = useTranslation();
  const locale: 'fr' | 'en' = i18n.language === 'fr' ? 'fr' : 'en';
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

  const c = useMemo(
    () => (budget ? computeSpecialBudget(budget, transactions) : null),
    [budget, transactions]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string; spent: number }>();
    for (const tx of linkedTxs) {
      if (tx.type !== 'expense') continue;
      const name =
        tx.category?.name ?? t('common.uncategorized', { defaultValue: 'Uncategorized' });
      const color = tx.category?.color ?? '#6b7280';
      const net = specialBudgetTransactionAmount(tx);
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

  if (!budget || !c) return null;

  const palette = paletteForColor(budget.color);
  const Icon = getSpecialBudgetIcon(budget.icon);
  const statusCls = SPECIAL_BUDGET_STATUS_META[budget.status].cls;
  const muted = budget.status !== 'active';
  const fillPct = Math.min(c.ratio, 1) * 100;
  // When over: split into a solid "within-budget" share + a hatched
  // overshoot share, both inside the track. Cleaner than a floating
  // segment past the right edge.
  const withinPct = c.over && c.ratio > 0 ? (1 / c.ratio) * 100 : 0;
  const showTick = c.elapsedFrac != null && !c.over;
  const totalGoal = linkedGoal ? linkedGoal.target_amount : 0;
  const goalPct = totalGoal > 0 ? (linkedGoal!.current_amount / totalGoal) * 100 : 0;

  const guidanceText = (() => {
    if (budget.status === 'closed') {
      return c.over
        ? t('specialBudgets.overBy', {
            defaultValue: '{{amt}} over',
            amt: formatCurrency(Math.abs(c.remaining)),
          })
        : t('specialBudgets.unspent', {
            defaultValue: '{{amt}} unspent',
            amt: formatCurrency(c.remaining),
          });
    }
    if (budget.status === 'planned') {
      return c.startsIn != null
        ? t('specialBudgets.startsInShort', {
            defaultValue: 'In {{n}}d',
            n: c.startsIn,
          })
        : t('specialBudgets.upcoming', { defaultValue: 'Upcoming' });
    }
    if (c.over) {
      return t('specialBudgets.overshoot', {
        defaultValue: '{{amt}} overshoot',
        amt: formatCurrency(Math.abs(c.remaining)),
      });
    }
    if (c.daysLeft != null) {
      if (c.daysLeft <= 0) return t('specialBudgets.lastDay', { defaultValue: 'Last day' });
      const perDay = Math.round(c.remaining / Math.max(1, c.daysLeft));
      return t('specialBudgets.burnRate', {
        defaultValue: '{{amt}}/d · {{n}}d left',
        amt: formatCurrency(perDay),
        n: c.daysLeft,
      });
    }
    return formatSpecialBudgetRange(budget.start_date, null, locale);
  })();

  const handleDelete = async () => {
    if (
      !confirm(
        t('specialBudgets.deleteConfirm', {
          defaultValue:
            'Delete this special budget? Linked transactions will revert to their regular category budget.',
        })
      )
    )
      return;
    const { error } = await deleteSpecialBudget(budget.id);
    if (error) {
      toast({
        title: t('common.error'),
        description: (error as Error).message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: t('specialBudgets.deleted', { defaultValue: 'Special budget deleted' }) });
    onClose();
  };

  const handleUnlink = async (txId: string) => {
    const { error } = await linkTransactions([txId], null);
    if (error) {
      toast({
        title: t('common.error'),
        description: (error as Error).message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: t('specialBudgets.unlinked', { defaultValue: 'Transaction unlinked' }) });
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[460px] p-0 flex flex-col gap-0 bg-card"
        >
          {/* Header — pr-12 reserves room for SheetContent's built-in close X. */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 pr-12 border-b border-line flex-shrink-0">
            <div
              className="h-[46px] w-[46px] rounded-[13px] flex-shrink-0 grid place-items-center"
              style={{ background: palette.tint, color: palette.ink }}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold tracking-tight truncate">{budget.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {formatSpecialBudgetRange(budget.start_date, budget.end_date, locale)}
                {budget.description && ` · ${budget.description}`}
              </div>
            </div>
            <span
              className={cn(
                'self-start text-[10.5px] uppercase tracking-[0.05em] font-semibold px-2 py-[3px] rounded-full whitespace-nowrap',
                statusCls === 'active' && 'bg-pos/12 text-pos',
                statusCls === 'planned' && 'bg-primary/12 text-primary',
                statusCls === 'closed' && 'bg-bg-subtle text-muted-foreground border border-line'
              )}
            >
              {t(`specialBudgets.status${budget.status[0].toUpperCase()}${budget.status.slice(1)}`, {
                defaultValue: budget.status,
              })}
            </span>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-bg-subtle border border-line rounded-xl px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                  {t('specialBudgets.committed', { defaultValue: 'Committed' })}
                </div>
                <div className="font-mono text-lg font-bold tracking-tight mt-1">
                  {formatCurrency(c.total)}
                </div>
              </div>
              <div className="bg-bg-subtle border border-line rounded-xl px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                  {t('specialBudgets.spent', { defaultValue: 'Spent' })}
                </div>
                <div
                  className={cn(
                    'font-mono text-lg font-bold tracking-tight mt-1',
                    c.over && 'text-neg'
                  )}
                >
                  {formatCurrency(c.spent)}
                </div>
              </div>
              <div className="bg-bg-subtle border border-line rounded-xl px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                  {t('specialBudgets.remaining', { defaultValue: 'Remaining' })}
                </div>
                <div
                  className={cn(
                    'font-mono text-lg font-bold tracking-tight mt-1',
                    c.remaining < 0 ? 'text-neg' : 'text-pos'
                  )}
                >
                  {c.remaining < 0
                    ? `−${formatCurrency(Math.abs(c.remaining))}`
                    : formatCurrency(c.remaining)}
                </div>
              </div>
            </div>

            {/* Pace bar */}
            <div className="space-y-2">
              <div className="relative h-[9px] rounded-full bg-bg-subtle overflow-hidden">
                {c.over ? (
                  <>
                    <div
                      className="absolute left-0 top-0 bottom-0"
                      style={{ width: `${withinPct}%`, background: 'hsl(var(--neg))' }}
                    />
                    <div
                      className="absolute top-0 bottom-0 right-0"
                      style={{
                        left: `${withinPct}%`,
                        background:
                          'repeating-linear-gradient(135deg, hsl(var(--neg)) 0 4px, hsl(var(--neg) / 0.32) 4px 8px)',
                      }}
                    />
                  </>
                ) : (
                  <div
                    className="absolute left-0 top-0 bottom-0"
                    style={{
                      width: `${fillPct}%`,
                      background: palette.color,
                      opacity: muted ? 0.55 : 1,
                    }}
                  />
                )}
                {showTick && (
                  <div
                    className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-foreground/85"
                    style={{ left: `${Math.min(c.elapsedFrac ?? 0, 1) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-muted-foreground font-mono">
                <span className="truncate">{guidanceText}</span>
                <span className="text-muted-foreground flex-shrink-0">
                  {(c.ratio * 100).toFixed(0)} %{' '}
                  {t('specialBudgets.usedShort', { defaultValue: 'used' })}
                </span>
              </div>
            </div>

            {/* Linked savings goal */}
            {linkedGoal && (
              <div className="bg-primary/8 border border-primary/24 rounded-xl px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.04em] font-semibold text-primary">
                    <LinkIcon className="h-3 w-3" />
                    {t('specialBudgets.linkedGoalShort', { defaultValue: 'Linked goal' })}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.round(goalPct)} %
                  </span>
                </div>
                <div className="text-sm font-semibold mt-2 mb-2">{linkedGoal.name}</div>
                <div className="h-1.5 rounded-full bg-card overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, goalPct)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono">
                  {formatCurrency(linkedGoal.current_amount)}{' '}
                  {t('specialBudgets.goalOf', { defaultValue: 'of' })}{' '}
                  {formatCurrency(linkedGoal.target_amount)}
                </div>
              </div>
            )}

            {/* By category */}
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground mb-3">
                {t('specialBudgets.byCategory', { defaultValue: 'By category' })}
              </div>
              {byCategory.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('specialBudgets.noSpendYet', { defaultValue: 'No spending yet.' })}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {byCategory.map((cat) => {
                    const pct = c.spent > 0 ? (cat.spent / c.spent) * 100 : 0;
                    return (
                      <div key={cat.name} className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ background: cat.color }}
                        />
                        <span className="text-[13px] font-medium w-24 truncate flex-shrink-0">
                          {cat.name}
                        </span>
                        <div className="flex-1 h-[7px] rounded-full bg-bg-subtle overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: cat.color, opacity: 0.85 }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold w-16 text-right flex-shrink-0">
                          {formatCurrency(cat.spent)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Linked transactions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                  {t('specialBudgets.linkedTx', { defaultValue: 'Linked transactions' })}
                  <span className="text-muted-foreground font-mono normal-case tracking-normal">
                    ({linkedTxs.length})
                  </span>
                </span>
                {budget.status !== 'closed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLinkOpen(true)}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <LinkIcon className="h-3 w-3" />
                    {t('specialBudgets.link', { defaultValue: 'Link' })}
                  </Button>
                )}
              </div>
              {linkedTxs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {t('specialBudgets.noTxYet', { defaultValue: 'No transactions linked yet.' })}
                </p>
              ) : (
                <div className="border border-line rounded-xl divide-y divide-line overflow-hidden">
                  {linkedTxs.map((tx) => (
                    <div key={tx.id} className="px-3 py-2.5 flex items-center gap-3">
                      <div
                        className="h-[30px] w-[30px] rounded-[9px] grid place-items-center flex-shrink-0"
                        style={{
                          background: tx.category
                            ? `${tx.category.color}1f`
                            : 'hsl(var(--bg-subtle))',
                          color: tx.category?.color ?? 'hsl(var(--muted-foreground))',
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: tx.category?.color ?? 'currentColor' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{tx.description}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {format(parseLocalDate(tx.transaction_date), 'd MMM', {
                            locale: dateLocale,
                          })}
                          {tx.category && ` · ${tx.category.name}`}
                        </div>
                      </div>
                      {(() => {
                        const refunded = Number(tx.refunded_amount || 0);
                        const net = specialBudgetTransactionAmount(tx);
                        const hasRefund = tx.type === 'expense' && refunded > 0;
                        return (
                          <span className="font-mono text-[13px] font-semibold flex-shrink-0 flex flex-col items-end leading-tight">
                            <span>{formatCurrency(net)}</span>
                            {hasRefund && (
                              <span className="text-[10px] text-muted-foreground line-through font-normal">
                                {formatCurrency(tx.amount)}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {budget.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={() => handleUnlink(tx.id)}
                          className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:bg-neg/10 hover:text-neg flex-shrink-0"
                          aria-label={t('specialBudgets.unlink', { defaultValue: 'Unlink' })}
                          title={t('specialBudgets.unlink', { defaultValue: 'Unlink' })}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 py-3 border-t border-line flex-shrink-0">
            <Button
              variant="ghost"
              onClick={handleDelete}
              className="text-neg gap-1.5 hover:text-neg hover:bg-neg/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              {t('common.edit', { defaultValue: 'Edit' })}
            </Button>
            <Button onClick={onClose}>{t('common.close', { defaultValue: 'Close' })}</Button>
          </div>
        </SheetContent>
      </Sheet>

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
