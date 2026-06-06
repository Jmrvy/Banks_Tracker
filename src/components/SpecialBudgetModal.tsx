import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import {
  SpecialBudget,
  SpecialBudgetStatus,
  useSpecialBudgets,
} from '@/hooks/useSpecialBudgets';

const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
];

interface SpecialBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, the form opens in "edit" mode with these values prefilled. */
  budget?: SpecialBudget | null;
  /** Pre-link a savings goal (used when opening from a savings goal card). */
  defaultSavingsGoalId?: string | null;
}

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

  const [form, setForm] = useState({
    name: '',
    description: '',
    total_budget: '',
    start_date: '',
    end_date: '',
    status: 'active' as SpecialBudgetStatus,
    savings_goal_id: '' as string,
    color: PALETTE[0],
  });

  useEffect(() => {
    if (!isOpen) return;
    if (budget) {
      setForm({
        name: budget.name,
        description: budget.description ?? '',
        total_budget: String(budget.total_budget ?? ''),
        start_date: budget.start_date ?? '',
        end_date: budget.end_date ?? '',
        status: budget.status,
        savings_goal_id: budget.savings_goal_id ?? '',
        color: budget.color ?? PALETTE[0],
      });
    } else {
      setForm((f) => ({
        ...f,
        name: '',
        description: '',
        total_budget: '',
        start_date: '',
        end_date: '',
        status: 'active',
        savings_goal_id: defaultSavingsGoalId ?? '',
        color: PALETTE[0],
      }));
    }
  }, [isOpen, budget, defaultSavingsGoalId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(form.total_budget);
    if (!form.name.trim() || !Number.isFinite(total) || total < 0) {
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
      total_budget: total,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      savings_goal_id: form.savings_goal_id || null,
      color: form.color,
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">
            {isEdit
              ? t('specialBudgets.editTitle', { defaultValue: 'Edit special budget' })
              : t('specialBudgets.newTitle', { defaultValue: 'New special budget' })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sb-name">
                {t('specialBudgets.name', { defaultValue: 'Name' })} *
              </Label>
              <Input
                id="sb-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('specialBudgets.namePlaceholder', { defaultValue: 'NYC Trip' })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sb-desc">{t('specialBudgets.description', { defaultValue: 'Description' })}</Label>
              <Textarea
                id="sb-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>
                {t('specialBudgets.totalBudget', { defaultValue: 'Total budget' })} *
              </Label>
              <AmountInput
                value={form.total_budget}
                onChange={(v) => setForm({ ...form, total_budget: v })}
                placeholder="0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sb-start">{t('specialBudgets.startDate', { defaultValue: 'Start' })}</Label>
                <Input
                  id="sb-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sb-end">{t('specialBudgets.endDate', { defaultValue: 'End' })}</Label>
                <Input
                  id="sb-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('specialBudgets.status', { defaultValue: 'Status' })}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as SpecialBudgetStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">{t('specialBudgets.statusPlanned', { defaultValue: 'Planned' })}</SelectItem>
                  <SelectItem value="active">{t('specialBudgets.statusActive', { defaultValue: 'Active' })}</SelectItem>
                  <SelectItem value="closed">{t('specialBudgets.statusClosed', { defaultValue: 'Closed' })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('specialBudgets.savingsGoal', { defaultValue: 'Linked savings goal' })}</Label>
              <Select
                value={form.savings_goal_id || 'none'}
                onValueChange={(v) => setForm({ ...form, savings_goal_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('specialBudgets.noGoal', { defaultValue: 'No linked goal' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('specialBudgets.noGoal', { defaultValue: 'No linked goal' })}</SelectItem>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('specialBudgets.color', { defaultValue: 'Color' })}</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 sm:px-6 sm:py-4 border-t border-line flex-shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit">
              {isEdit
                ? t('common.save', { defaultValue: 'Save' })
                : t('common.create', { defaultValue: 'Create' })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
