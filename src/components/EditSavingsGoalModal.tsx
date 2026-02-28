import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSavingsGoals, type SavingsGoal } from '@/hooks/useSavingsGoals';
import { Trash2, Plus, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

interface EditSavingsGoalModalProps {
  goal: SavingsGoal;
  isOpen: boolean;
  onClose: () => void;
}

const GOAL_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
];

const GOAL_CATEGORY_KEYS = [
  'vacation', 'emergency', 'bigPurchase', 'retirement',
  'education', 'investment', 'other'
] as const;

export const EditSavingsGoalModal = ({ goal, isOpen, onClose }: EditSavingsGoalModalProps) => {
  const { updateGoal, deleteGoal } = useSavingsGoals();
  const { t } = useTranslation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [quickAddAmount, setQuickAddAmount] = useState('');
  const [formData, setFormData] = useState({
    name: goal.name,
    description: goal.description || '',
    target_amount: goal.target_amount.toString(),
    current_amount: goal.current_amount.toString(),
    target_date: goal.target_date || '',
    category: goal.category || '',
    color: goal.color,
  });

  useEffect(() => {
    setFormData({
      name: goal.name,
      description: goal.description || '',
      target_amount: goal.target_amount.toString(),
      current_amount: goal.current_amount.toString(),
      target_date: goal.target_date || '',
      category: goal.category || '',
      color: goal.color,
    });
    setQuickAddAmount('');
  }, [goal]);

  const handleQuickAdd = (sign: 1 | -1) => {
    const amount = parseFloat(quickAddAmount);
    if (!amount || amount <= 0) return;

    const current = parseFloat(formData.current_amount) || 0;
    const newAmount = Math.max(0, current + (amount * sign));
    setFormData({ ...formData, current_amount: newAmount.toFixed(2) });
    setQuickAddAmount('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateGoal.mutateAsync({
      id: goal.id,
      name: formData.name,
      description: formData.description || null,
      target_amount: parseFloat(formData.target_amount),
      current_amount: parseFloat(formData.current_amount),
      target_date: formData.target_date || null,
      category: formData.category || null,
      color: formData.color,
    });

    onClose();
  };

  const handleDelete = async () => {
    await deleteGoal.mutateAsync(goal.id);
    setShowDeleteDialog(false);
    onClose();
  };

  const progress = (parseFloat(formData.current_amount) / parseFloat(formData.target_amount)) * 100;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('savings.editGoalTitle')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick add/withdraw section */}
            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">{t('savings.quickAdd')}</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={() => handleQuickAdd(-1)}
                  disabled={!quickAddAmount || parseFloat(quickAddAmount) <= 0}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <AmountInput
                  value={quickAddAmount}
                  onChange={setQuickAddAmount}
                  placeholder="100.00"
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={() => handleQuickAdd(1)}
                  disabled={!quickAddAmount || parseFloat(quickAddAmount) <= 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!isNaN(progress) && progress >= 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.min(progress, 100).toFixed(0)}%</span>
                  <span>{formData.current_amount} / {formData.target_amount}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t('savings.goalName')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('savings.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t('savings.category')}</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="">{t('savings.selectCategory')}</option>
                {GOAL_CATEGORY_KEYS.map((key) => (
                  <option key={key} value={t(`savings.goalCategories.${key}`)}>
                    {t(`savings.goalCategories.${key}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current_amount">{t('savings.currentAmount')}</Label>
                <AmountInput
                  id="current_amount"
                  value={formData.current_amount}
                  onChange={(value) => setFormData({ ...formData, current_amount: value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_amount">{t('savings.targetAmount')} *</Label>
                <AmountInput
                  id="target_amount"
                  value={formData.target_amount}
                  onChange={(value) => setFormData({ ...formData, target_amount: value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_date">{t('savings.targetDate')}</Label>
              <Input
                id="target_date"
                type="date"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('savings.color')}</Label>
              <div className="flex gap-2">
                {GOAL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      formData.color === color ? 'scale-110 ring-2 ring-offset-2 ring-primary' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                {t('savings.cancel')}
              </Button>
              <Button type="submit" className="flex-1" disabled={updateGoal.isPending}>
                {updateGoal.isPending ? t('savings.saving') : t('savings.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('savings.deleteGoalTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('savings.deleteGoalDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('savings.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('savings.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
