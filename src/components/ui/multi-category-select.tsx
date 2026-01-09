import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  color: string;
}

interface MultiCategorySelectProps {
  categories: Category[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiCategorySelect({
  categories,
  selectedIds,
  onSelectionChange,
  placeholder = "Sélectionner des catégories",
  className
}: MultiCategorySelectProps) {
  const [open, setOpen] = useState(false);

  const selectedCategories = categories.filter(c => selectedIds.includes(c.id));

  const toggleCategory = (categoryId: string) => {
    if (selectedIds.includes(categoryId)) {
      onSelectionChange(selectedIds.filter(id => id !== categoryId));
    } else {
      onSelectionChange([...selectedIds, categoryId]);
    }
  };

  const removeCategory = (categoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(selectedIds.filter(id => id !== categoryId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-10 py-2",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 text-left">
            {selectedCategories.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedCategories.map(category => (
                <Badge
                  key={category.id}
                  variant="secondary"
                  className="flex items-center gap-1 px-2 py-0.5"
                  style={{ 
                    backgroundColor: `${category.color}20`,
                    borderColor: category.color 
                  }}
                >
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-xs">{category.name}</span>
                  <X 
                    className="h-3 w-3 cursor-pointer hover:opacity-70" 
                    onClick={(e) => removeCategory(category.id, e)}
                  />
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[200px] p-2" align="start">
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              Aucune catégorie disponible
            </p>
          ) : (
            categories.map(category => (
              <div
                key={category.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                onClick={() => toggleCategory(category.id)}
              >
                <Checkbox
                  checked={selectedIds.includes(category.id)}
                  onCheckedChange={() => toggleCategory(category.id)}
                />
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-sm">{category.name}</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
