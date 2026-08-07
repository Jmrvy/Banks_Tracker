import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, Minus, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import {
  SpecialBudget,
  SpecialBudgetStatus,
  useSpecialBudgets,
} from '@/hooks/useSpecialBudgets';
import {
  getSpecialBudgetIcon,
  paletteForColor,
  SPECIAL_BUDGET_ICON_KEYS,
  SPECIAL_BUDGET_ICONS,
  SPECIAL_BUDGET_PALETTE,
} from '@/lib/specialBudgetUtils';
import { cn } from '@/lib/utils';

interface SpecialBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, the form opens in "edit" mode with these values prefilled. */
  budget?: SpecialBudget | null;
  /** Pre-link a savings goal (used when opening from a savings goal card). */
  defaultSavingsGoalId?: string | null;
}

const STATUSES: { value: SpecialBudgetStatus; key: string }[] = [
  { value: 'planned', key: 'statusPlanned' },
  { value: 'active', key: 'statusActive' },
  { value: 'closed', key: 'statusClosed' },
];

/** Pick a sensible step size for the budget stepper based on magnitude.
 *  Mirrors the design's nice-round behaviour: €10 below 100, €25 to 500,
 *  €50 to 2000, then €100. */
const stepForAmount = (n: number) =>
  n >= 2000 ? 100 : n >= 500 ? 50 : n >= 100 ? 25 : 10;

export const SpecialBudgetModal = ({
  isOpen,
  onClose,
  budget = null,
  defaultSavingsGoalId = null,
}: SpecialBudgetModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { createSpecialBudget, updateSpecialBudget } = useSpecialBudgets();
  const { goals } = useSavingsGoals();
  const isEdit = !!budget;

  const initialPaletteIdx = budget
    ? Math.max(
        0,
        SPECIAL_BUDGET_PALETTE.findIndex((p) => p.color === budget.color)
      )
    : 0;

  const [form, setForm] = useState({
    name: '',
    description: '',
    total_budget: 500,
    start_date: '',
    end_date: '',
    status: 'active' as SpecialBudgetStatus,
    savings_goal_id: '' as string,
    paletteIdx: 0,
    icon: 'plane',
  });

  useEffect(() => {
    if (!isOpen) return;
    if (budget) {
      setForm({
        name: budget.name,
        description: budget.description ?? '',
        total_budget: budget.total_budget || 0,
        start_date: budget.start_date ?? '',
        end_date: budget.end_date ?? '',
        status: budget.status,
        savings_goal_id: budget.savings_goal_id ?? '',
        paletteIdx: initialPaletteIdx >= 0 ? initialPaletteIdx : 0,
        icon: budget.icon ?? 'plane',
      });
    } else {
      const todayISO = new Date().toISOString().split('T')[0];
      setForm({
        name: '',
        description: '',
        total_budget: 500,
        start_date: todayISO,
        end_date: '',
        status: 'active',
        savings_goal_id: defaultSavingsGoalId ?? '',
        paletteIdx: 0,
        icon: 'plane',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, budget, defaultSavingsGoalId]);

  const palette = SPECIAL_BUDGET_PALETTE[form.paletteIdx] ?? paletteForColor(null);
  const Icon = getSpecialBudgetIcon(form.icon);
  const canSave = form.name.trim().length > 0 && form.total_budget > 0;

  const adjustTotal = (delta: 1 | -1) => {
    const step = stepForAmount(form.total_budget);
    const next =
      delta > 0
        ? Math.round(form.total_budget / step) * step + step
        : Math.max(0, Math.round((form.total_budget - step) / step) * step);
    setForm((f) => ({ ...f, total_budget: next }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      toast({
        title: t('common.error'),
        description: t('specialBudgets.validationError', {
          defaultValue: 'Name and a valid amount are required.',
        }),
        variant: 'destructive',
      });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      total_budget: form.total_budget,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      savings_goal_id: form.savings_goal_id || null,
      color: palette.color,
      icon: form.icon,
    };
    const result = isEdit
      ? await updateSpecialBudget(budget!.id, payload)
      : await createSpecialBudget(payload);
    if (result.error) {
      toast({
        title: t('common.error'),
        description: (result.error as Error).message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: t('common.success', { defaultValue: 'Saved' }),
      description: isEdit
        ? t('specialBudgets.updated', { defaultValue: 'Special budget updated' })
        : t('specialBudgets.created', { defaultValue: 'Special budget created' }),
    });
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[460px] p-0 flex flex-col gap-0 bg-card"
      >
        <form onSubmit={submit} className="flex flex-col h-full">
          {/* Header — pr-12 reserves room for SheetContent's built-in close X. */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 pr-12 border-b border-line flex-shrink-0">
            <div
              className="h-[46px] w-[46px] rounded-[13px] flex-shrink-0 grid place-items-center transition-colors"
              style={{ background: palette.tint, color: palette.ink }}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold tracking-tight">
                {isEdit
                  ? t('specialBudgets.editTitle', { defaultValue: 'Edit envelope' })
                  : t('specialBudgets.newTitle', { defaultValue: 'New special budget' })}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t('specialBudgets.editSub', {
                  defaultValue: 'Trip, event, project…',
                })}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.name', { defaultValue: 'Name' })}
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('specialBudgets.namePlaceholder', {
                  defaultValue: 'Weekend in Lisbon',
                })}
                autoFocus
              />
            </div>

            {/* Description (optional) */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.description', { defaultValue: 'Description' })}
              </Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Total budget — stepper */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.totalBudget', { defaultValue: 'Total budget' })}
              </Label>
              <div className="flex items-stretch border border-line rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => adjustTotal(-1)}
                  className="px-3 grid place-items-center text-muted-foreground hover:bg-bg-subtle border-r border-line"
                  aria-label={t('common.decrease', { defaultValue: 'Decrease' })}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex-1 flex items-center gap-1 px-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form.total_budget}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        total_budget: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="flex-1 bg-transparent font-mono text-lg font-bold tracking-tight outline-none text-right"
                  />
                  <span className="text-base text-muted-foreground font-mono">€</span>
                </div>
                <button
                  type="button"
                  onClick={() => adjustTotal(1)}
                  className="px-3 grid place-items-center text-muted-foreground hover:bg-bg-subtle border-l border-line"
                  aria-label={t('common.increase', { defaultValue: 'Increase' })}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Status — segmented */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.status', { defaultValue: 'Status' })}
              </Label>
              <div className="flex gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, status: s.value }))}
                    className={cn(
                      'flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors',
                      form.status === s.value
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-card text-muted-foreground border-line hover:text-foreground'
                    )}
                  >
                    {t(`specialBudgets.${s.key}`, { defaultValue: s.value })}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                  {t('specialBudgets.startDate', { defaultValue: 'Start' })}
                </Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                  {t('specialBudgets.endDate', { defaultValue: 'End' })}{' '}
                  <span className="text-muted-foreground normal-case tracking-normal font-normal">
                    · {t('common.optional', { defaultValue: 'optional' })}
                  </span>
                </Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Savings goal */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.savingsGoal', { defaultValue: 'Linked savings goal' })}
              </Label>
              <Select
                value={form.savings_goal_id || 'none'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, savings_goal_id: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('specialBudgets.noGoal', { defaultValue: 'No linked goal' })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('specialBudgets.noGoal', { defaultValue: 'No linked goal' })}
                  </SelectItem>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color swatches */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.color', { defaultValue: 'Color' })}
              </Label>
              <div className="flex gap-2.5 flex-wrap">
                {SPECIAL_BUDGET_PALETTE.map((p, i) => (
                  <button
                    key={p.color}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, paletteIdx: i }))}
                    className={cn(
                      'h-9 w-9 rounded-full grid place-items-center text-white border-2 border-transparent transition-transform hover:scale-105',
                      form.paletteIdx === i &&
                        'ring-2 ring-offset-2 ring-offset-card ring-current scale-105'
                    )}
                    style={{ background: p.color, color: p.color }}
                    aria-label={`Color ${i + 1}`}
                  >
                    {form.paletteIdx === i && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon picker */}
            <div className="space-y-2">
              <Label className="text-[10.5px] uppercase tracking-[0.04em] font-semibold text-muted-foreground">
                {t('specialBudgets.icon', { defaultValue: 'Icon' })}
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {SPECIAL_BUDGET_ICON_KEYS.map((key) => {
                  const IconOpt = SPECIAL_BUDGET_ICONS[key];
                  const active = form.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, icon: key }))}
                      className={cn(
                        'h-[42px] rounded-lg border bg-bg-subtle grid place-items-center transition-colors',
                        active
                          ? 'border-transparent'
                          : 'border-line text-muted-foreground hover:text-foreground hover:bg-card'
                      )}
                      style={
                        active
                          ? {
                              background: palette.tint,
                              color: palette.ink,
                              borderColor: palette.color,
                            }
                          : undefined
                      }
                      aria-label={key}
                    >
                      <IconOpt className="h-[18px] w-[18px]" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line flex-shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!canSave} className="gap-1.5">
              <Check className="h-4 w-4" />
              {isEdit
                ? t('common.save', { defaultValue: 'Save' })
                : t('common.create', { defaultValue: 'Create' })}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
