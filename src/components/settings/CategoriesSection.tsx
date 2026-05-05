import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Database, Edit3, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EditCategoryModal } from "@/components/EditCategoryModal";
import type { Category } from "@/hooks/useFinancialData";

interface CategoriesSectionProps {
  categories: Category[];
  refetch: () => void;
  formatCurrency: (amount: number) => string;
}

export const CategoriesSection = ({ categories, refetch, formatCurrency }: CategoriesSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const startEditing = (category: Category) => {
    setEditingCategory(category);
    setEditOpen(true);
  };

  const handleDelete = (categoryId: string) => {
    setDeleteId(categoryId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("categories").delete().eq("id", deleteId);
      if (error) throw error;
      refetch();
      toast({
        title: t("categories.categoryDeleted"),
        description: t("settings.preferencesSavedDesc"),
      });
    } catch {
      toast({
        title: t("common.error"),
        description: t("errors.deleteError"),
        variant: "destructive",
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
              <h3 className="ft-card-title text-base">{t("settings.myCategories")}</h3>
            </div>
            <p className="ft-card-sub mt-1">{t("settings.manageCategories")}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2 sm:space-y-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className="p-3 border border-line rounded-lg bg-muted/30 dark:bg-muted/20 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <CategoryIcon icon={category.icon} color={category.color} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{category.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {category.budget
                      ? `${t("categories.budget")}: ${formatCurrency(Number(category.budget))}`
                      : t("categories.noBudget")}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEditing(category)}
                  className="h-8 w-8 p-0"
                  aria-label={t("common.edit", { defaultValue: "Edit" })}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(category.id)}
                  className="h-8 w-8 p-0"
                  aria-label={t("common.delete", { defaultValue: "Delete" })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <EditCategoryModal
        open={editOpen}
        category={editingCategory}
        onOpenChange={setEditOpen}
        onSaved={refetch}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmDelete}
        title={t("confirmations.deleteTitle")}
        description={t("categories.confirmDelete")}
      />
    </>
  );
};
