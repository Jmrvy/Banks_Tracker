import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useToast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { describeError, isDuplicateError } from "@/lib/errorMessage";

const PRESET_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
];

interface NewCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional callback after a successful create. */
  onCreated?: () => void;
}

export function NewCategoryModal({ open, onOpenChange, onCreated }: NewCategoryModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { createCategory } = useFinancialData();

  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [budget, setBudget] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset whenever the modal closes so the next open is clean.
  useEffect(() => {
    if (!open) {
      setName("");
      setColor(PRESET_COLORS[0]);
      setBudget("");
      setIcon(null);
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: t("common.missingInfo", { defaultValue: "Missing info" }),
        description: t("categories.enterName", { defaultValue: "Please enter a category name." }),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await createCategory({
      name: name.trim(),
      color,
      budget: budget ? Number(budget) : null,
      icon,
    });
    if (error) {
      toast({
        title: t("transactions.createError", { defaultValue: "Could not create" }),
        description: isDuplicateError(error)
          ? t("categories.duplicateName", {
              defaultValue: "You already have a category with that name.",
            })
          : describeError(error),
        variant: "destructive",
      });
      setSaving(false);
      return;
    }
    toast({
      title: t("categories.newCategoryCreated", {
        name: name.trim(),
        defaultValue: `Category "${name.trim()}" created`,
      }),
    });
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-line">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={icon} color={color} size={32} />
            <div>
              <DialogTitle className="text-base">
                {t("categories.newCategory", { defaultValue: "New category" })}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("categories.newCategoryDesc", {
                  defaultValue: "Pick a name, color, icon and an optional monthly budget.",
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                {t("categories.categoryName", { defaultValue: "Category name" })}
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("categories.namePlaceholder", {
                  defaultValue: "e.g. Groceries, Rent, Travel",
                })}
                className="h-9 text-sm"
                autoFocus
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

          {/* Quick palette */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border transition-transform ${
                  color === c ? "border-foreground scale-110" : "border-line hover:scale-105"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              {t("categories.budget", { defaultValue: "Budget" })}{" "}
              <span className="text-fg-dim font-normal">
                ({t("common.optional", { defaultValue: "optional" })})
              </span>
            </Label>
            <AmountInput value={budget} onChange={setBudget} placeholder="0.00" className="h-9 text-sm" />
            <p className="text-[11px] text-muted-foreground">
              {t("categories.budgetHint", {
                defaultValue:
                  "A ceiling on what leaves. Income filed here counts as earnings and never reduces it — link money coming back as a refund instead.",
              })}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">
              {t("categoryIcons.pickIcon", { defaultValue: "Icon" })}
            </Label>
            <CategoryIconPicker value={icon} color={color} onChange={setIcon} />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-line bg-bg-subtle/40">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving
              ? t("common.saving", { defaultValue: "Saving..." })
              : t("categories.createCategory", { defaultValue: "Create category" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
