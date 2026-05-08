import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Edit3, Trash2, Sparkles, Wand2, ArrowDown, ArrowUp, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EditCategoryModal } from "@/components/EditCategoryModal";
import { useFinancialData, type Category, type Transaction } from "@/hooks/useFinancialData";
import { parseLocalDate } from "@/lib/dateUtils";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

interface CategoriesSectionProps {
  categories: Category[];
  refetch: () => void;
  formatCurrency: (amount: number) => string;
}

type SortKey = "alpha" | "spend" | "budget" | "variance" | "noBudgetFirst";

interface CategoryStats {
  category: Category;
  spentThisMonth: number;
  avg3Months: number;
  /** Suggested budget = round(avg3Months × 1.1) when there's history; 0 otherwise. */
  suggested: number;
  remaining: number | null;
  pct: number; // 0..1, can exceed 1 when over budget
  status: "noBudget" | "ok" | "warn" | "over";
}

function netExpense(tx: Transaction): number {
  if (tx.type !== "expense") return 0;
  if (tx.include_in_stats === false) return 0;
  const refunded = tx.refunded_amount || 0;
  return Math.max(0, tx.amount - refunded);
}

export const CategoriesSection = ({ categories, refetch, formatCurrency }: CategoriesSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { transactions } = useFinancialData();

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("alpha");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const stats = useMemo<CategoryStats[]>(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    // Last 3 *complete* months, excluding the current.
    const window3Start = startOfMonth(subMonths(today, 3));
    const window3End = endOfMonth(subMonths(today, 1));

    return categories.map((category) => {
      let spentThisMonth = 0;
      let total3Months = 0;
      for (const tx of transactions) {
        if (tx.category?.id !== category.id) continue;
        const net = netExpense(tx);
        if (net <= 0) continue;
        // Budgets are commitments — always reason at the accounting date.
        const d = parseLocalDate(tx.transaction_date);
        if (d >= monthStart && d <= monthEnd) spentThisMonth += net;
        if (d >= window3Start && d <= window3End) total3Months += net;
      }
      const avg3Months = total3Months / 3;
      const suggested = avg3Months > 0 ? Math.round(avg3Months * 1.1) : 0;
      const budget = category.budget != null ? Number(category.budget) : null;
      const remaining = budget != null ? budget - spentThisMonth : null;
      const pct = budget != null && budget > 0 ? spentThisMonth / budget : 0;
      let status: CategoryStats["status"] = "ok";
      if (budget == null) status = "noBudget";
      else if (pct >= 1) status = "over";
      else if (pct >= 0.85) status = "warn";

      return { category, spentThisMonth, avg3Months, suggested, remaining, pct, status };
    });
  }, [categories, transactions]);

  const sorted = useMemo(() => {
    const copy = [...stats];
    switch (sort) {
      case "alpha":
        return copy.sort((a, b) => a.category.name.localeCompare(b.category.name));
      case "spend":
        return copy.sort((a, b) => b.spentThisMonth - a.spentThisMonth);
      case "budget":
        return copy.sort((a, b) => (b.category.budget ?? 0) - (a.category.budget ?? 0));
      case "variance":
        return copy.sort((a, b) => b.pct - a.pct);
      case "noBudgetFirst":
        return copy.sort((a, b) => {
          if (a.status === "noBudget" && b.status !== "noBudget") return -1;
          if (b.status === "noBudget" && a.status !== "noBudget") return 1;
          return b.spentThisMonth - a.spentThisMonth;
        });
    }
  }, [stats, sort]);

  const totals = useMemo(() => {
    const totalBudget = stats.reduce((s, x) => s + (x.category.budget ?? 0), 0);
    const totalSpent = stats.reduce((s, x) => s + x.spentThisMonth, 0);
    const overCount = stats.filter((x) => x.status === "over").length;
    const noBudgetCount = stats.filter((x) => x.status === "noBudget").length;
    const suggestableCount = stats.filter((x) => x.status === "noBudget" && x.suggested > 0).length;
    return { totalBudget, totalSpent, overCount, noBudgetCount, suggestableCount };
  }, [stats]);

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

  const applySuggestion = async (categoryId: string, suggested: number) => {
    if (suggested <= 0) return;
    setBusyId(categoryId);
    try {
      const { error } = await supabase
        .from("categories")
        .update({ budget: suggested })
        .eq("id", categoryId);
      if (error) throw error;
      refetch();
      toast({
        title: t("categories.budgetUpdated", { defaultValue: "Budget updated" }),
        description: t("settings.preferencesSavedDesc"),
      });
    } catch {
      toast({
        title: t("common.error"),
        description: t("errors.updateError"),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const autoBudgetMissing = async () => {
    const targets = stats.filter((s) => s.status === "noBudget" && s.suggested > 0);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const updates = await Promise.all(
        targets.map((s) =>
          supabase.from("categories").update({ budget: s.suggested }).eq("id", s.category.id)
        )
      );
      const failed = updates.filter((u) => u.error).length;
      refetch();
      if (failed > 0) {
        toast({
          title: t("common.error"),
          description: t("categories.bulkPartial", {
            defaultValue: "Some categories could not be updated.",
          }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("categories.bulkApplied", {
            count: targets.length,
            defaultValue: `Applied suggested budget to ${targets.length} categor${
              targets.length === 1 ? "y" : "ies"
            }.`,
          }),
        });
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const StatusPill = ({ status }: { status: CategoryStats["status"] }) => {
    if (status === "ok") return null;
    const map = {
      noBudget: {
        label: t("categories.noBudgetTag", { defaultValue: "No budget" }),
        cls: "bg-bg-subtle text-fg-dim",
      },
      warn: {
        label: t("categories.nearLimit", { defaultValue: "Near limit" }),
        cls: "bg-warning/15 text-warning",
      },
      over: {
        label: t("categories.overBudget", { defaultValue: "Over" }),
        cls: "bg-destructive/15 text-destructive",
      },
    } as const;
    const { label, cls } = map[status as keyof typeof map];
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10.5px] font-semibold ${cls}`}>
        {status === "over" && <AlertTriangle className="h-3 w-3" />}
        {label}
      </span>
    );
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
            <p className="ft-card-sub mt-1">
              {t("categories.budgetingSubtitle", {
                defaultValue: "Personalize categories and tune budgets against actual spend.",
              })}
            </p>
          </div>
          {totals.suggestableCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={autoBudgetMissing}
              disabled={bulkBusy}
              className="h-8 text-xs gap-1.5"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {bulkBusy
                ? t("common.saving", { defaultValue: "Saving..." })
                : t("categories.autoBudgetMissing", {
                    count: totals.suggestableCount,
                    defaultValue: `Auto-budget ${totals.suggestableCount} missing`,
                  })}
            </Button>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
          <KpiTile
            label={t("categories.totalBudget", { defaultValue: "Total budget" })}
            value={formatCurrency(totals.totalBudget)}
          />
          <KpiTile
            label={t("categories.spentThisMonth", { defaultValue: "Spent this month" })}
            value={formatCurrency(totals.totalSpent)}
            tone={totals.totalBudget > 0 && totals.totalSpent > totals.totalBudget ? "neg" : "default"}
          />
          <KpiTile
            label={t("categories.overBudgetCount", { defaultValue: "Over budget" })}
            value={`${totals.overCount}`}
            tone={totals.overCount > 0 ? "neg" : "default"}
          />
          <KpiTile
            label={t("categories.noBudgetCount", { defaultValue: "No budget" })}
            value={`${totals.noBudgetCount}`}
            tone={totals.noBudgetCount > 0 ? "warn" : "default"}
          />
        </div>

        {/* Sort */}
        <div className="flex items-center justify-between gap-3 mt-5 mb-2">
          <span className="ft-eyebrow">
            {t("categories.allCategories", { defaultValue: "All categories" })} · {categories.length}
          </span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alpha">
                {t("categories.sortAlpha", { defaultValue: "A → Z" })}
              </SelectItem>
              <SelectItem value="spend">
                {t("categories.sortSpend", { defaultValue: "Spend (high → low)" })}
              </SelectItem>
              <SelectItem value="budget">
                {t("categories.sortBudget", { defaultValue: "Budget (high → low)" })}
              </SelectItem>
              <SelectItem value="variance">
                {t("categories.sortVariance", { defaultValue: "Variance (over budget first)" })}
              </SelectItem>
              <SelectItem value="noBudgetFirst">
                {t("categories.sortNoBudget", { defaultValue: "No-budget first" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {sorted.map((s) => {
            const { category, spentThisMonth, avg3Months, suggested, remaining, pct, status } = s;
            const budget = category.budget != null ? Number(category.budget) : null;
            const barPct = Math.min(100, Math.max(0, pct * 100));
            const barColor =
              status === "over"
                ? "hsl(var(--destructive))"
                : status === "warn"
                ? "hsl(var(--warning))"
                : status === "noBudget"
                ? "hsl(var(--muted-foreground) / 0.4)"
                : category.color;

            return (
              <div
                key={category.id}
                className="rounded-lg border border-line bg-bg-subtle/40 p-3 sm:p-4"
              >
                <div className="flex items-start gap-3">
                  <CategoryIcon icon={category.icon} color={category.color} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{category.name}</p>
                      <StatusPill status={status} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-1.5">
                      <Stat
                        label={t("categories.spent", { defaultValue: "Spent" })}
                        value={formatCurrency(spentThisMonth)}
                      />
                      <Stat
                        label={t("categories.budget", { defaultValue: "Budget" })}
                        value={budget != null ? formatCurrency(budget) : "—"}
                        muted={budget == null}
                      />
                      <Stat
                        label={t("categories.remaining", { defaultValue: "Remaining" })}
                        value={
                          remaining == null
                            ? "—"
                            : remaining >= 0
                            ? formatCurrency(remaining)
                            : `−${formatCurrency(Math.abs(remaining))}`
                        }
                        tone={remaining == null ? "muted" : remaining >= 0 ? "pos" : "neg"}
                      />
                      <Stat
                        label={t("categories.avg3m", { defaultValue: "3-mo avg" })}
                        value={avg3Months > 0 ? formatCurrency(avg3Months) : "—"}
                        muted={avg3Months <= 0}
                      />
                    </div>
                    {/* Progress bar */}
                    <div className="ft-progress-track mt-3">
                      <div
                        className="ft-progress-fill"
                        style={{ width: `${barPct}%`, background: barColor }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      {suggested > 0 && suggested !== budget && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applySuggestion(category.id, suggested)}
                          disabled={busyId === category.id}
                          className="h-8 px-2 text-xs gap-1.5"
                          title={t("categories.suggestTooltip", {
                            value: formatCurrency(suggested),
                            defaultValue: `Set budget to ${formatCurrency(suggested)} (3-mo avg + 10%)`,
                          })}
                        >
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="hidden sm:inline">
                            {t("categories.suggest", { defaultValue: "Suggest" })}
                          </span>
                          <span className="font-mono">{formatCurrency(suggested)}</span>
                          {budget != null && (
                            suggested > budget ? (
                              <ArrowUp className="h-3 w-3 text-warning" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-pos" />
                            )
                          )}
                        </Button>
                      )}
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
                </div>
              </div>
            );
          })}
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

function KpiTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "neg" | "warn";
}) {
  const valueClass =
    tone === "neg" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border border-line bg-bg-subtle/40 px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        {label}
      </div>
      <div className={`font-mono text-base font-semibold mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  muted = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "pos" | "neg" | "muted";
  muted?: boolean;
}) {
  const valueClass =
    muted || tone === "muted"
      ? "text-fg-dim"
      : tone === "pos"
      ? "text-pos"
      : tone === "neg"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/80 truncate">
        {label}
      </div>
      <div className={`font-mono text-[12.5px] font-medium truncate ${valueClass}`}>{value}</div>
    </div>
  );
}
