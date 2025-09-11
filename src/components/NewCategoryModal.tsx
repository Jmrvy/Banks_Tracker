import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';

interface NewCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const predefinedColors = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export function NewCategoryModal({ open, onOpenChange }: NewCategoryModalProps) {
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
        title: "Missing information",
        description: "Please enter a category name.",
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
        title: "Error creating category",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Category created",
        description: `${formData.name} category created successfully.`,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            New Category
          </DialogTitle>
          <DialogDescription>
            Add a new category to organize your transactions
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 ${
                    formData.color === color ? 'border-foreground' : 'border-muted'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div 
                className="w-6 h-6 rounded-full border" 
                style={{ backgroundColor: formData.color }}
              />
              <span className="text-sm text-muted-foreground">Selected color</span>
            </div>
          </div>

          {/* Monthly Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget">Monthly Budget (Optional)</Label>
            <Input
              id="budget"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Set a monthly spending limit for this category
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Category'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}