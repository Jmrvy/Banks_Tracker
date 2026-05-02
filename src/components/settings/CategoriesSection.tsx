import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Database, Edit3, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Category } from "@/hooks/useFinancialData";

interface CategoriesSectionProps {
  categories: Category[];
  refetch: () => void;
  formatCurrency: (amount: number) => string;
}

interface EditingValues {
  name: string;
  color: string;
  budget: string;
}

export const CategoriesSection = ({ categories, refetch, formatCurrency }: CategoriesSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<EditingValues>({ name: "", color: "#3B82F6", budget: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const startEditing = (category: Category) => {
    setEditingCategory(category.id);
    setEditingValues({
      name: category.name,
      color: category.color,
      budget: category.budget ? String(category.budget) : ""
    });
  };

  const saveCategory = async (categoryId: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name: editingValues.name,
          color: editingValues.color,
          budget: editingValues.budget ? Number(editingValues.budget) : null
        })
        .eq('id', categoryId);

      if (error) throw error;

      setEditingCategory(null);
      refetch();

      toast({
        title: t('categories.categoryUpdated'),
        description: t('settings.preferencesSavedDesc'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.updateError'),
        variant: "destructive"
      });
    }
  };

  const handleDelete = (categoryId: string) => {
    setDeleteId(categoryId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      refetch();
      toast({
        title: t('categories.categoryDeleted'),
        description: t('settings.preferencesSavedDesc'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.deleteError'),
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <div className="ft-card p-5 sm:p-6">
        <div className="ft-card-head">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/12 text-primary grid place-items-center">
                <Database className="h-3.5 w-3.5" />
              </div>
              <h3 className="ft-card-title text-base">{t('settings.myCategories')}</h3>
            </div>
            <p className="ft-card-sub mt-1">{t('settings.manageCategories')}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="space-y-2 sm:space-y-3">
            {categories.map((category) => (
              <div key={category.id} className="p-3 border rounded-lg bg-muted/30 dark:bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editingCategory === category.id ? (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input
                          value={editingValues.name}
                          onChange={(e) => setEditingValues(prev => ({ ...prev, name: e.target.value }))}
                          placeholder={t('categories.categoryName')}
                          className="h-8 sm:h-10 text-xs sm:text-sm"
                        />
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={editingValues.color}
                            onChange={(e) => setEditingValues(prev => ({ ...prev, color: e.target.value }))}
                            className="w-12 sm:w-16 h-8 sm:h-10 p-1"
                          />
                          <AmountInput
                            value={editingValues.budget}
                            onChange={(value) => setEditingValues(prev => ({ ...prev, budget: value }))}
                            placeholder={`${t('categories.budget')} €`}
                            className="h-8 sm:h-10 text-xs sm:text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div
                          className="w-3 h-3 sm:w-4 sm:h-4 rounded-full mt-0.5 flex-shrink-0"
                          style={{ backgroundColor: category.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{category.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {category.budget
                              ? `${t('categories.budget')}: ${formatCurrency(Number(category.budget))}`
                              : t('categories.noBudget')
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {editingCategory === category.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => saveCategory(category.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingCategory(null)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEditing(category)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(category.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmDelete}
        title={t('confirmations.deleteTitle')}
        description={t('categories.confirmDelete')}
      />
    </>
  );
};
