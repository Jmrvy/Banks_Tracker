import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Link2Off, Tags } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { describeError } from "@/lib/errorMessage";
import { kindOf } from "@/lib/categoryKind";
import type { Category } from "@/hooks/useFinancialData";

interface Props {
  categories: Category[];
  refetch: () => void;
  formatCurrency: (amount: number) => string;
}

/**
 * Which spending categories carry an income twin.
 *
 * Every spending category gets one by default, because most money coming
 * back — a reimbursement, a share of a bill, a partial refund — belongs
 * against the budget it left. But not all of it does. "Investissement" is
 * the case that forced this switch: its income side is savings coming back
 * out of a Livret A, and netting that against a 600 € budget would read as
 * months of free spending.
 *
 * Turning a twin off never deletes income that is already filed against it.
 * transactions.category_id is ON DELETE SET NULL, so removing a category in
 * use would quietly scatter real rows into "uncategorised"; instead the
 * category survives and merely stops netting the budget.
 */
export const CategoriesSection = ({ categories, refetch, formatCurrency }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const expense = useMemo(
    () =>
      categories
        .filter((c) => kindOf(c) === "expense")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  /** Income categories that net a budget, keyed by the budget they net. */
  const twinByExpense = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      if (kindOf(c) === "income" && c.offsets_category_id) map.set(c.offsets_category_id, c);
    }
    return map;
  }, [categories]);

  const standalone = useMemo(
    () =>
      categories
        .filter((c) => kindOf(c) === "income" && !c.offsets_category_id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  // How much is filed against each income category. Read from the database
  // rather than the loaded transaction window, because the toggle's warning
  // has to be true for the whole history, not the period on screen.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const incomeIds = categories.filter((c) => kindOf(c) === "income").map((c) => c.id);
    if (incomeIds.length === 0) {
      setCounts({});
      return;
    }
    supabase
      .from("transactions")
      .select("category_id")
      .eq("user_id", user.id)
      .in("category_id", incomeIds)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const tally: Record<string, number> = {};
        for (const row of data ?? []) {
          const id = (row as { category_id: string | null }).category_id;
          if (id) tally[id] = (tally[id] ?? 0) + 1;
        }
        setCounts(tally);
      });
    return () => {
      cancelled = true;
    };
  }, [user, categories]);

  const toggle = async (category: Category, next: boolean) => {
    if (!user) return;
    const twin = twinByExpense.get(category.id);
    const filed = twin ? counts[twin.id] ?? 0 : 0;
    setSaving(category.id);

    const { error } = await supabase
      .from("categories")
      .update({ wants_income_twin: next })
      .eq("id", category.id)
      .eq("user_id", user.id);

    setSaving(null);
    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: describeError(error),
        variant: "destructive",
      });
      return;
    }

    refetch();
    toast({
      title: next
        ? t("categories.twinOn", { defaultValue: "Income twin enabled" })
        : filed > 0
          ? t("categories.twinKept", { defaultValue: "Income twin detached" })
          : t("categories.twinOff", { defaultValue: "Income twin removed" }),
      description: next
        ? t("categories.twinOnDesc", {
            name: category.name,
            defaultValue: `Income filed under ${category.name} now reduces its budget.`,
          })
        : filed > 0
          ? t("categories.twinKeptDesc", {
              count: filed,
              name: category.name,
              defaultValue: `${filed} transaction(s) stay filed under ${category.name}, but it now counts as plain income.`,
            })
          : t("categories.twinOffDesc", {
              name: category.name,
              defaultValue: `${category.name} no longer appears on the income side.`,
            }),
    });
  };

  return (
    <div className="ft-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-primary/12 text-primary grid place-items-center">
          <Tags className="h-3.5 w-3.5" />
        </div>
        <h3 className="ft-card-title text-base">
          {t("categories.twinsSection", { defaultValue: "Categories & income twins" })}
        </h3>
      </div>
      <p className="ft-card-sub mt-1">
        {t("categories.twinsSectionDesc", {
          defaultValue:
            "Every spending category can carry an income category of the same name. Income filed there is subtracted from that budget instead of counting as earnings — which is what you want for reimbursements, and not what you want when the money is genuinely coming in.",
        })}
      </p>

      <div className="mt-4 space-y-2">
        {expense.map((c) => {
          const twin = twinByExpense.get(c.id);
          const filed = twin ? counts[twin.id] ?? 0 : 0;
          const on = !!twin;
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30 dark:bg-muted/20"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  {c.budget != null && (
                    <Badge variant="secondary" className="text-[10px] h-4 shrink-0 font-normal">
                      {formatCurrency(Number(c.budget))}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  {on ? (
                    <>
                      <Link2 className="h-3 w-3 shrink-0" />
                      {filed > 0
                        ? t("categories.twinNetting", {
                            count: filed,
                            defaultValue: `${filed} income transaction(s) netted off this budget`,
                          })
                        : t("categories.twinReady", {
                            defaultValue: "Ready — no income filed here yet",
                          })}
                    </>
                  ) : (
                    <>
                      <Link2Off className="h-3 w-3 shrink-0" />
                      {t("categories.twinNone", {
                        defaultValue: "No income twin — income never reduces this budget",
                      })}
                    </>
                  )}
                </p>
              </div>
              <Switch
                checked={on}
                disabled={saving === c.id}
                onCheckedChange={(next) => toggle(c, next)}
                aria-label={c.name}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-medium text-foreground">
          {t("categories.standaloneSection", { defaultValue: "Income of its own" })}
        </h4>
        <p className="ft-card-sub mt-1">
          {t("categories.standaloneSectionDesc", {
            defaultValue:
              "Money that is genuinely coming in rather than coming back. These have no budget to reduce, so they are counted as income and nothing else.",
          })}
        </p>
        {standalone.length === 0 ? (
          <p className="text-[11px] text-muted-foreground mt-3">
            {t("categories.noIncomeCategories", {
              defaultValue: "None yet. Add one to group where your income comes from.",
            })}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {standalone.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                {c.name}
                <span className="text-muted-foreground">{counts[c.id] ?? 0}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
