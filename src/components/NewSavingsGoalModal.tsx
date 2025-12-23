import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useToast } from '@/hooks/use-toast';
import { savingsGoalSchema, validateForm } from '@/lib/validations';

interface NewSavingsGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOAL_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'
];

const GOAL_CATEGORIES = [
  'Vacances',
  'Fonds d\'urgence',
  'Achat important',
  'Retraite',
  'Éducation',
  'Investissement',
  'Autre'
];

export const NewSavingsGoalModal = ({ isOpen, onClose }: NewSavingsGoalModalProps) => {
  const { createGoal } = useSavingsGoals();
  const { toast } = useToast();
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
    
    // Validate form data with zod schema
    const validation = validateForm(savingsGoalSchema, formData);
    
    if (!validation.success) {
      toast({
        title: "Erreur de validation",
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
          <DialogTitle>Nouvel objectif d'épargne</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom de l'objectif *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Vacances d'été"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description de votre objectif"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Catégorie</Label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">Sélectionner une catégorie</option>
              {GOAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="current_amount">Montant actuel</Label>
              <Input
                id="current_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={formData.current_amount}
                onChange={(e) => setFormData({ ...formData, current_amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_amount">Objectif *</Label>
              <Input
                id="target_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={formData.target_amount}
                onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                placeholder="1000.00"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_date">Date cible</Label>
            <Input
              id="target_date"
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Couleur</Label>
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
              Annuler
            </Button>
            <Button type="submit" className="flex-1" disabled={createGoal.isPending}>
              {createGoal.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};