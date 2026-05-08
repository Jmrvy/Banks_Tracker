import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EditCategoryModal } from "@/components/EditCategoryModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFinancialData, type Category, type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { parseLocalDate } from "@/lib/dateUtils";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

type SortKey = "alpha" | "spend" | "budget" | "variance" | "noBudgetFirst";
type StatusFilter = "all" | "over" | "warn" | "noBudget";

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

const Budget = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { categories, transactions, refetch } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("alpha");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
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
        // Honor the date setting from preferences (accounting vs value).
        const d =
          preferences.dateType === "value"
            ? parseLocalDate(tx.value_date || tx.transaction_date)
            : parseLocalDate(tx.transaction_date);
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
  }, [categories, transactions, preferences.dateType]);

  const totals = useMemo(() => {
    const totalBudget = stats.reduce((s, x) => s + (x.category.budget ?? 0), 0);
    const totalSpent = stats.reduce((s, x) => s + x.spentThisMonth, 0);
    const overCount = stats.filter((x) => x.status === "over").length;
    const warnCount = stats.filter((x) => x.status === "warn").length;
    const noBudgetCount = stats.filter((x) => x.status === "noBudget").length;
    const suggestableCount = stats.filter((x) => x.status === "noBudget" && x.suggested > 0).length;
    const utilization = totalBudget > 0 ? totalSpent / totalBudget : 0;
    return {
      totalBudget,
      totalSpent,
      overCount,
      warnCount,
      noBudgetCount,
      suggestableCount,
      utilization,
    };
  }, [stats]);

  const filtered = useMemo(() => {
    let out = stats;
    if (statusFilter !== "all") {
      out = out.filter((s) => s.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((s) => s.category.name.toLowerCase().includes(q));
    const copy = [...out];
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
  }, [stats, statusFilter, search, sort]);

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
      <span
        className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10.5px] font-semibold ${cls}`}
      >
        {status === "over" && <AlertTriangle className="h-3 w-3" />}
        {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.tools")}</div>
            <h1 className="ft-page-title">{t("budget.pageTitle", { defaultValue: "Budget" })}</h1>
            <div className="ft-page-sub">
              {t("budget.pageSub", {
                defaultValue:
                  "Personalize categories and tune budgets against actual spend.",
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {totals.suggestableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={autoBudgetMissing}
                disabled={bulkBusy}
                className="h-9 text-xs gap-1.5"
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
            <Button size="sm" onClick={() => setNewOpen(true)} className="h-9 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("categories.newCategory", { defaultValue: "New category" })}
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            icon={<Target className="h-3.5 w-3.5" />}
            label={t("categories.totalBudget", { defaultValue: "Total budget" })}
            value={formatCurrency(totals.totalBudget)}
            footer={
              totals.totalBudget > 0
                ? t("budget.utilizationFooter", {
                    pct: `${(totals.utilization * 100).toFixed(0)}%`,
                    defaultValue: `${(totals.utilization * 100).toFixed(0)}% used`,
                  })
                : t("budget.noBudgetSetYet", { defaultValue: "Nothing set yet" })
            }
          />
          <KpiTile
            label={t("categories.spentThisMonth", { defaultValue: "Spent this month" })}
            value={formatCurrency(totals.totalSpent)}
            tone={
              totals.totalBudget > 0 && totals.totalSpent > totals.totalBudget ? "neg" : "default"
            }
          />
          <KpiTile
            label={t("categories.overBudgetCount", { defaultValue: "Over budget" })}
            value={`${totals.overCount}`}
            tone={totals.overCount > 0 ? "neg" : "default"}
            footer={
              totals.warnCount > 0
                ? t("budget.nearLimitFooter", {
                    count: totals.warnCount,
                    defaultValue: `${totals.warnCount} near limit`,
                  })
                : undefined
            }
          />
          <KpiTile
            label={t("categories.noBudgetCount", { defaultValue: "No budget" })}
            value={`${totals.noBudgetCount}`}
            tone={totals.noBudgetCount > 0 ? "warn" : "default"}
            footer={
              totals.suggestableCount > 0
                ? t("budget.canSuggestFooter", {
                    count: totals.suggestableCount,
                    defaultValue: `${totals.suggestableCount} can be suggested`,
                  })
                : undefined
            }
          />
        </div>

        {/* Filters */}
        <div className="ft-card p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("budget.searchPlaceholder", {
                  defaultValue: "Search a category...",
                })}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-full sm:w-[200px] text-xs">
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
          <div className="flex flex-wrap gap-1.5 mt-3">
            <FilterPill
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              label={`${t("budget.filterAll", { defaultValue: "All" })} · ${stats.length}`}
            />
            <FilterPill
              active={statusFilter === "over"}
              onClick={() => setStatusFilter("over")}
              label={`${t("budget.filterOver", { defaultValue: "Over" })} · ${totals.overCount}`}
              tone="neg"
            />
            <FilterPill
              active={statusFilter === "warn"}
              onClick={() => setStatusFilter("warn")}
              label={`${t("budget.filterWarn", { defaultValue: "Near limit" })} · ${totals.warnCount}`}
              tone="warn"
            />
            <FilterPill
              active={statusFilter === "noBudget"}
              onClick={() => setStatusFilter("noBudget")}
              label={`${t("budget.filterNoBudget", { defaultValue: "No budget" })} · ${
                totals.noBudgetCount
              }`}
            />
          </div>
        </div>

        {/* Categories list */}
        <div className="ft-card p-5 md:p-6">
          <div className="ft-card-head">
            <div>
              <h3 className="ft-card-title">
                {t("budget.categoriesSection", { defaultValue: "Categories" })}
              </h3>
              <p className="ft-card-sub mt-0.5">
                {filtered.length} / {categories.length}
                {" · "}
                {t("budget.thisMonthHint", {
                  defaultValue: "Spend & remaining are computed for the current month",
                })}
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {t("budget.noResults", {
                defaultValue: "No categories match this filter.",
              })}
            </div>
          ) : (
            <div className="space-y-2 mt-4">
              {filtered.map((s) => {
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
                        <div className="ft-progress-track mt-3">
                          <div
                            className="ft-progress-fill"
                            style={{ width: `${barPct}%`, background: barColor }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-shrink-0">
                        {suggested > 0 && suggested !== budget && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applySuggestion(category.id, suggested)}
                            disabled={busyId === category.id}
                            className="h-8 px-2 text-xs gap-1.5"
                            title={t("categories.suggestTooltip", {
                              value: formatCurrency(suggested),
                              defaultValue: `Set budget to ${formatCurrency(
                                suggested
                              )} (3-mo avg + 10%)`,
                            })}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span className="hidden sm:inline">
                              {t("categories.suggest", { defaultValue: "Suggest" })}
                            </span>
                            <span className="font-mono">{formatCurrency(suggested)}</span>
                            {budget != null &&
                              (suggested > budget ? (
                                <ArrowUp className="h-3 w-3 text-warning" />
                              ) : (
                                <ArrowDown className="h-3 w-3 text-pos" />
                              ))}
                          </Button>
                        )}
                        <div className="flex items-center gap-1.5">
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
          )}
        </div>
      </div>

      <EditCategoryModal
        open={editOpen}
        category={editingCategory}
        onOpenChange={setEditOpen}
        onSaved={refetch}
      />

      <NewCategoryModal open={newOpen} onOpenChange={setNewOpen} onCreated={refetch} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={confirmDelete}
        title={t("confirmations.deleteTitle")}
        description={t("categories.confirmDelete")}
      />
    </div>
  );
};

function KpiTile({
  label,
  value,
  tone = "default",
  icon,
  footer,
}: {
  label: string;
  value: string;
  tone?: "default" | "neg" | "warn";
  icon?: React.ReactNode;
  footer?: string;
}) {
  const valueClass =
    tone === "neg" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="ft-kpi">
      <div className="flex items-center gap-2">
        {icon && (
          <div className="ft-kpi-icon acc flex-shrink-0">{icon}</div>
        )}
        <span className="ft-kpi-label flex items-center gap-1 min-w-0 truncate">{label}</span>
      </div>
      <div className={`ft-kpi-value truncate ${valueClass}`}>{value}</div>
      {footer && (
        <div className="text-[11px] text-fg-dim truncate">{footer}</div>
      )}
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

function FilterPill({
  active,
  onClick,
  label,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "default" | "neg" | "warn";
}) {
  const activeCls =
    tone === "neg"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : tone === "warn"
      ? "bg-warning/15 text-warning border-warning/30"
      : "bg-foreground text-background border-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-2.5 rounded-md border text-[11.5px] font-medium transition-colors ${
        active ? activeCls : "border-line text-muted-foreground hover:text-foreground hover:bg-bg-hover"
      }`}
    >
      {label}
    </button>
  );
}

export default Budget;
