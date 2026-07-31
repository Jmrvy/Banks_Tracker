import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Label } from "@/components/ui/label";
import { CategoryIcon } from "@/components/CategoryIcon";
import { CategoryIconPicker } from "@/components/CategoryIconPicker";
import type { Category } from "@/hooks/useFinancialData";
import { kindOf, type CategoryKind } from "@/lib/categoryKind";

interface EditCategoryModalProps {
  open: boolean;
  category: Category | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditCategoryModal({ open, category, onOpenChange, onSaved }: EditCategoryModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [budget, setBudget] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color || "#3B82F6");
      setBudget(category.budget != null ? String(category.budget) : "");
      setKind(kindOf(category));
      setIcon(category.icon ?? null);
    }
  }, [category]);

  if (!category) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("categories")
        .update({
          name: name.trim(),
          color,
          // Switching a category to income drops its budget: the two cannot
          // coexist, and the DB check would reject the row rather than the
          // form telling the user why.
          budget: kind === "expense" && budget ? Number(budget) : null,
          icon: icon ?? null,
          kind,
        })
        .eq("id", category.id);
      if (error) throw error;
      toast({
        title: t("categories.categoryUpdated", { defaultValue: "Category updated" }),
        description: t("settings.preferencesSavedDesc", { defaultValue: "Your changes have been saved." }),
      });
      onSaved();
      onOpenChange(false);
    } catch {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("errors.updateError", { defaultValue: "Unable to update." }),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-line">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={icon} color={color} size={32} />
            <div>
              <DialogTitle className="text-base">
                {t("categories.editCategory", { defaultValue: "Edit category" })}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("categories.editCategoryDesc", { defaultValue: "Customize name, color, icon and budget." })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("categories.categoryName", { defaultValue: "Category name" })}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("categories.categoryName", { defaultValue: "Category name" })}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("categories.color", { defaultValue: "Color" })}</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 p-1"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("categories.kind", { defaultValue: "Applies to" })}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={kind === k ? "default" : "outline"}
                  className="h-9 text-sm"
                  onClick={() => setKind(k)}
                >
                  {k === "expense"
                    ? t("categories.kindExpense", { defaultValue: "Spending" })
                    : t("categories.kindIncome", { defaultValue: "Income" })}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {kind === "expense"
                ? t("categories.kindExpenseHint", {
                    defaultValue: "Offered on expenses and transfers, and can carry a monthly budget.",
                  })
                : t("categories.kindIncomeHint", {
                    defaultValue: "Offered on income only. Budgets cap what you spend, so income categories have none.",
                  })}
            </p>
          </div>

          {kind === "expense" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("categories.budget", { defaultValue: "Budget" })}</Label>
              <AmountInput
                value={budget}
                onChange={setBudget}
                placeholder="0.00"
                className="h-9 text-sm"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-xs">{t("categoryIcons.pickIcon", { defaultValue: "Icon" })}</Label>
            <CategoryIconPicker value={icon} color={color} onChange={setIcon} />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-line bg-bg-subtle/40">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t("common.saving", { defaultValue: "Saving..." }) : t("common.save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
