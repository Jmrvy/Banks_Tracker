import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';

const predefinedColors = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

interface NewCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewCategoryModal({ open, onOpenChange }: NewCategoryModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { createCategory } = useFinancialData();
  
  const [formData, setFormData] = useState({
    name: '',
    color: predefinedColors[0],
    budget: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast({
        title: t('common.missingInfo'),
        description: t("categories.enterName", { defaultValue: "Please enter a category name." }),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const { error } = await createCategory({
      name: formData.name,
      color: formData.color,
      budget: formData.budget ? parseFloat(formData.budget) : null,
    });

    if (error) {
      toast({
        title: t('transactions.createError'),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('categories.newCategory'),
        description: `La catégorie ${formData.name} a été créée avec succès.`,
      });
      
      // Reset form
      setFormData({
        name: '',
        color: predefinedColors[0],
        budget: ''
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[425px] max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <Tag className="h-5 w-5" />
            Nouvelle Catégorie
          </DialogTitle>
          <DialogDescription>
            Ajouter une nouvelle catégorie pour organiser vos transactions.
          </DialogDescription>
        </DialogHeader>

        <form id="new-category-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          {/* Category Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nom de la catégorie *</Label>
            <Input
              id="name"
              placeholder="ex: Courses, Essence, Loisirs"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Color Selection */}
          <div className="space-y-3">
            <Label>Couleur</Label>
            <div className="flex gap-2 flex-wrap">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    formData.color === color ? 'border-foreground scale-110' : 'border-muted hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-full border" 
                style={{ backgroundColor: formData.color }}
              />
              <span className="text-sm text-muted-foreground">Couleur sélectionnée</span>
            </div>
          </div>

          {/* Monthly Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget">Budget mensuel (optionnel)</Label>
            <AmountInput
              id="budget"
              placeholder="0.00"
              value={formData.budget}
              onChange={(value) => setFormData({ ...formData, budget: value })}
            />
            <p className="text-xs text-muted-foreground">
              Définir une limite de dépenses mensuelles pour cette catégorie
            </p>
          </div>

        </form>

        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 h-9 text-xs sm:text-sm"
          >
            Annuler
          </Button>
          <Button type="submit" form="new-category-form" disabled={loading} className="flex-1 h-9 text-xs sm:text-sm">
            {loading ? 'Création...' : 'Créer la catégorie'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}