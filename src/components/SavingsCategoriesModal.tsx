import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryIcon } from "@/components/CategoryIcon";
import type { Category } from "@/hooks/useFinancialData";
import { describeError } from "@/lib/errorMessage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSaved: () => void;
}

/**
 * Chooses which categories feed the savings page.
 *
 * Both directions matter and for different reasons: what you put away is
 * an expense, what you take back out or earn on it is income, and the page
 * nets the two. One tick now covers both — when a category was split into
 * an expense row and an income twin, ticking only one of the pair reported
 * contributions as savings while withdrawals left the figure untouched.
 */
export function SavingsCategoriesModal({ open, onOpenChange, categories, onSaved }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(categories.filter((c) => c.counts_as_savings).map((c) => c.id)));
    }
  }, [open, categories]);

  const rows = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    // Only the rows whose flag actually moved, so an unchanged list is a
    // no-op rather than a write across every category the user owns.
    const changed = categories.filter((c) => c.counts_as_savings !== selected.has(c.id));
    const results = await Promise.all(
      changed.map((c) =>
        supabase.from("categories").update({ counts_as_savings: selected.has(c.id) }).eq("id", c.id),
      ),
    );
    setSaving(false);

    const failed = results.find((r) => r.error);
    if (failed) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          describeError(failed.error) ||
          t("savings.categoriesSaveFailed", { defaultValue: "Could not update the categories." }),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t("savings.categoriesSaved", { defaultValue: "Savings categories updated" }),
      description: t("savings.categoriesSavedDesc", {
        count: selected.size,
        defaultValue: `${selected.size} categories now feed this page.`,
      }),
    });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">
            {t("savings.categoriesTitle", { defaultValue: "Categories counted here" })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("savings.categoriesDesc", {
              defaultValue:
                "Money set aside is an expense and money taken back out is income. Tick a category and this page nets both directions of it.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col">
          {rows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-2">
              {t("savings.noCategoriesOfKind", { defaultValue: "None yet." })}
            </p>
          ) : (
            rows.map((category) => (
              <label
                key={category.id}
                className="flex items-center gap-2.5 py-2 cursor-pointer rounded-md px-1 hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.has(category.id)}
                  onCheckedChange={() => toggle(category.id)}
                />
                <CategoryIcon icon={category.icon} color={category.color} size={20} />
                <span className="text-sm">{category.name}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {t("common.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
