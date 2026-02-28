import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useToast } from '@/hooks/use-toast';
import { savingsGoalSchema, validateForm } from '@/lib/validations';
import { useTranslation } from 'react-i18next';

interface NewSavingsGoalModalProps {
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

export const NewSavingsGoalModal = ({ isOpen, onClose }: NewSavingsGoalModalProps) => {
  const { createGoal } = useSavingsGoals();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_amount: '',
    current_amount: '',
    target_date: '',
    category: '',
    color: GOAL_COLORS[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateForm(savingsGoalSchema, formData);

    if (!validation.success) {
      toast({
        title: t('savings.validationError'),
        description: (validation as { success: false; error: string }).error,
        variant: "destructive",
      });
      return;
    }

    await createGoal.mutateAsync({
      name: formData.name,
      description: formData.description || null,
      target_amount: parseFloat(formData.target_amount),
      current_amount: parseFloat(formData.current_amount) || 0,
      target_date: formData.target_date || null,
      category: formData.category || null,
      color: formData.color,
    });

    setFormData({
      name: '',
      description: '',
      target_amount: '',
      current_amount: '',
      target_date: '',
      category: '',
      color: GOAL_COLORS[0],
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('savings.newGoalTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('savings.goalName')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('savings.goalNamePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('savings.description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('savings.descriptionPlaceholder')}
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
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_amount">{t('savings.targetAmount')} *</Label>
              <AmountInput
                id="target_amount"
                value={formData.target_amount}
                onChange={(value) => setFormData({ ...formData, target_amount: value })}
                placeholder="1000.00"
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
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {t('savings.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={createGoal.isPending}>
              {createGoal.isPending ? t('savings.creating') : t('savings.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
