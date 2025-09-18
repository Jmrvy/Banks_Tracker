import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useNavigate } from 'react-router-dom';

const predefinedColors = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const NewCategory = () => {
  const { toast } = useToast();
  const { createCategory } = useFinancialData();
  const navigate = useNavigate();
  
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
        title: "Informations manquantes",
        description: "Veuillez saisir un nom de catégorie.",
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
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Catégorie créée",
        description: `La catégorie ${formData.name} a été créée avec succès.`,
      });
      
      // Reset form
      setFormData({
        name: '',
        color: predefinedColors[0],
        budget: ''
      });
      
      navigate('/');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/")}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nouvelle Catégorie</h1>
            <p className="text-sm text-muted-foreground">
              Ajouter une nouvelle catégorie pour organiser vos transactions
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
            <div className="flex gap-3 flex-wrap">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-10 h-10 rounded-full border-2 transition-all ${
                    formData.color === color ? 'border-foreground scale-110' : 'border-muted hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div 
                className="w-6 h-6 rounded-full border" 
                style={{ backgroundColor: formData.color }}
              />
              <span className="text-sm text-muted-foreground">Couleur sélectionnée</span>
            </div>
          </div>

          {/* Monthly Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget">Budget mensuel (optionnel)</Label>
            <Input
              id="budget"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Définir une limite de dépenses mensuelles pour cette catégorie
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/')}
              disabled={loading}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Création...' : 'Créer la catégorie'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewCategory;