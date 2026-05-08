import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarIcon,
  Download,
  Edit3,
  Minus,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { CategorySparkline } from "@/components/CategorySparkline";
import { EditCategoryModal } from "@/components/EditCategoryModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useFinancialData,
  type Category,
  type RecurringTransaction,
  type Transaction,
} from "@/hooks/useFinancialData";
import { useDebts } from "@/hooks/useDebts";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { parseLocalDate } from "@/lib/dateUtils";
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  getDaysInMonth,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from "date-fns";

type SortKey = "alpha" | "spend" | "budget" | "variance" | "noBudgetFirst";
type StatusFilter = "all" | "over" | "warn" | "noBudget";
type PeriodKey = "1m" | "3m" | "6m" | "ytd" | "1y" | "custom";

interface CategoryStats {
  category: Category;
  /** Actual spend within the selected period. */
  spent: number;
  /** Actual spend within the equivalent prior period (for comparison). */
  prevSpent: number;
  /** Future projected spend (recurring) inside the period — 0 if toggle off. */
  projected: number;
  /** Total used = spent + projected. */
  used: number;
  /** Period budget = monthlyBudget × effectiveMonthsInPeriod (null if no monthly budget set). */
  periodBudget: number | null;
  /** periodBudget − used (null when no budget set). */
  remaining: number | null;
  /** Average actual spend per month over the last 6 *complete* months. */
  monthlyAvg: number;
  /** Suggested *monthly* budget. Returns 0 when no useful history. */
  suggested: number;
  pct: number; // 0..1, can exceed 1 when over budget
  status: "noBudget" | "ok" | "warn" | "over";
  /** Bucketed actual spend over the period — drives the sparkline. */
  buckets: number[];
  /** Bucketed projected spend over the period (parallel to `buckets`). */
  projectedBuckets: number[];
}

interface PeriodBuckets {
  count: number;
  /** Function that maps a date to a bucket index in [0, count). Returns -1 outside. */
  bucketOf: (d: Date) => number;
}

function netExpense(tx: Transaction): number {
  if (tx.type !== "expense") return 0;
  if (tx.include_in_stats === false) return 0;
  const refunded = tx.refunded_amount || 0;
  return Math.max(0, tx.amount - refunded);
}

function p75(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(s.length * 0.75));
  return s[idx] ?? 0;
}

/**
 * Step used by `niceRound` for a given magnitude. Reused by the dead-zone
 * check so we hide suggestions that differ from the current budget by less
 * than one rounding step (pure rounding noise).
 */
function niceRoundStep(n: number): number {
  if (n >= 2000) return 100;
  if (n >= 500) return 50;
  if (n >= 100) return 25;
  if (n >= 20) return 10;
  return 5;
}

/**
 * Round to a "nice" number that doesn't look algorithmic.
 * 0–20 → step 5, 20–100 → step 10, 100–500 → step 25,
 * 500–2 000 → step 50, ≥ 2 000 → step 100.
 */
function niceRound(n: number): number {
  if (n <= 0) return 0;
  return Math.round(n / niceRoundStep(n)) * niceRoundStep(n);
}

function advanceDate(date: Date, recurrenceType: RecurringTransaction["recurrence_type"]): Date {
  switch (recurrenceType) {
    case "weekly":
      return addWeeks(date, 1);
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addQuarters(date, 1);
    case "yearly":
      return addYears(date, 1);
    default:
      return addMonths(date, 1);
  }
}

/**
 * Sum of (overlap_days / month_days) across every month touched by the window.
 * Result reads as the "fair" number of months that fit inside the window.
 */
function effectiveMonthsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  let cursor = startOfMonth(from);
  while (cursor <= to) {
    const monthStart = cursor;
    const monthEnd = endOfMonth(cursor);
    const overlapStart = monthStart < from ? from : monthStart;
    const overlapEnd = monthEnd > to ? to : monthEnd;
    const overlapDays = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart) + 1);
    const monthDays = getDaysInMonth(cursor);
    total += overlapDays / monthDays;
    cursor = addMonths(cursor, 1);
  }
  return total;
}

const Budget = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { categories, transactions, recurringTransactions, refetch } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments: scheduledDebtPayments } = useDebts();
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

  const [periodKey, setPeriodKey] = useState<PeriodKey>("1m");
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [includeProjected, setIncludeProjected] = useState(false);

  const period = useMemo(() => {
    const now = new Date();
    let from: Date;
    let to: Date = endOfMonth(now);
    let label: string;
    switch (periodKey) {
      case "1m":
        from = startOfMonth(now);
        to = endOfMonth(now);
        label = format(now, "MMMM yyyy");
        break;
      case "3m":
        from = startOfMonth(subMonths(now, 2));
        to = endOfMonth(now);
        label = t("budget.period3m", { defaultValue: "Last 3 months" });
        break;
      case "6m":
        from = startOfMonth(subMonths(now, 5));
        to = endOfMonth(now);
        label = t("budget.period6m", { defaultValue: "Last 6 months" });
        break;
      case "ytd":
        from = startOfYear(now);
        to = endOfMonth(now);
        label = t("budget.periodYtd", { defaultValue: "Year to date" });
        break;
      case "1y":
        from = startOfMonth(subYears(now, 1));
        to = endOfYear(now);
        label = t("budget.period1y", { defaultValue: "Full year" });
        break;
      case "custom":
        from = customRange.from;
        to = customRange.to;
        label = `${format(from, "dd MMM yy")} → ${format(to, "dd MMM yy")}`;
        break;
    }
    const effectiveMonths = effectiveMonthsBetween(from, to);

    // Equivalent prior period (same length, immediately preceding).
    const lengthDays = Math.max(1, differenceInCalendarDays(to, from) + 1);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(from, -lengthDays);
    const prevEffectiveMonths = effectiveMonthsBetween(prevFrom, prevTo);

    // Bucket the period into ~12–30 buckets for sparkline rendering.
    let bucketCount: number;
    let bucketSizeDays: number;
    if (lengthDays <= 35) {
      bucketCount = lengthDays; // daily
      bucketSizeDays = 1;
    } else if (lengthDays <= 200) {
      bucketCount = Math.max(8, Math.ceil(lengthDays / 7)); // weekly
      bucketSizeDays = 7;
    } else {
      // Monthly bucketing — count distinct months touched.
      const months: number[] = [];
      let cursor = startOfMonth(from);
      while (cursor <= to) {
        months.push(cursor.getTime());
        cursor = addMonths(cursor, 1);
      }
      bucketCount = months.length;
      bucketSizeDays = 0; // signal "monthly"
    }

    const bucketOf = (d: Date): number => {
      if (d < from || d > to) return -1;
      if (bucketSizeDays === 0) {
        // monthly
        const monthsBetween = (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth());
        return Math.min(bucketCount - 1, Math.max(0, monthsBetween));
      }
      const dayDelta = differenceInCalendarDays(d, from);
      return Math.min(bucketCount - 1, Math.max(0, Math.floor(dayDelta / bucketSizeDays)));
    };

    const buckets: PeriodBuckets = { count: bucketCount, bucketOf };

    return {
      from,
      to,
      label,
      effectiveMonths,
      prevFrom,
      prevTo,
      prevEffectiveMonths,
      buckets,
    };
  }, [periodKey, customRange, t]);

  const dateOf = useMemo(
    () => (tx: Transaction) =>
      preferences.dateType === "value"
        ? parseLocalDate(tx.value_date || tx.transaction_date)
        : parseLocalDate(tx.transaction_date),
    [preferences.dateType]
  );

  /**
   * Per-category projection of *future* recurring expense occurrences inside
   * the selected period — mirrors the Analysis page: skips occurrences before
   * `next_due_date`, caps each recurrence by its installment / debt remaining
   * payments, and resolves the per-occurrence amount through scheduled debt
   * payments / installment_amount when applicable.
   */
  const projectedByCategory = useMemo(() => {
    type Entry = { total: number; series: number[] };
    const map = new Map<string, Entry>();
    if (!includeProjected || period.to < today) return map;

    // Lookups
    const installmentMap = new Map(installmentPayments.map((ip) => [ip.id, ip]));
    const debtMap = new Map(debts.map((d) => [d.id, d]));
    const sdpByDebtMonth = new Map<string, number>();
    for (const sp of scheduledDebtPayments) {
      sdpByDebtMonth.set(`${sp.debt_id}:${sp.scheduled_date.substring(0, 7)}`, sp.scheduled_amount);
    }

    /**
     * Resolve the effective amount for a recurring occurrence on a given date.
     * Mirrors `getEffectiveAmount` / `getDebtAmount` in useReportsData.
     */
    const effectiveAmount = (rt: RecurringTransaction, dateStr: string): number => {
      // Debt-linked: prefer the scheduled amount for that month, else next
      // unpaid scheduled, else the debt's flat payment_amount, else the rt.
      if (rt.debt_id) {
        const debt = debtMap.get(rt.debt_id);
        if (debt) {
          const monthKey = dateStr.substring(0, 7);
          const scheduled = sdpByDebtMonth.get(`${debt.id}:${monthKey}`);
          if (scheduled !== undefined) return scheduled;
          const nextUnpaid = scheduledDebtPayments.find(
            (sp) => sp.debt_id === debt.id && !sp.is_paid
          );
          if (nextUnpaid) return nextUnpaid.scheduled_amount;
          return debt.payment_amount > 0 ? debt.payment_amount : Number(rt.amount);
        }
      }
      if (rt.installment_payment_id) {
        const ip = installmentMap.get(rt.installment_payment_id);
        if (ip && ip.installment_amount > 0) return ip.installment_amount;
      }
      return Number(rt.amount);
    };

    /**
     * Reimbursement installment-linked recurring transactions are stored as
     * `income` but should count as expenses for budget purposes — same rule
     * the Analysis page uses to build category period-totals.
     */
    const isExpenseForBudget = (rt: RecurringTransaction): boolean => {
      if (rt.type === "expense") return true;
      if (rt.installment_payment_id && rt.type === "income") return true;
      return false;
    };

    for (const rt of recurringTransactions) {
      if (!rt.is_active) continue;
      if (!isExpenseForBudget(rt)) continue;
      if (!rt.category?.id) continue;
      if (!rt.start_date || !rt.next_due_date) continue;

      // Compute the effective end date based on installment/debt caps, mirroring
      // the calendar logic the Analysis page reuses.
      const endDate = rt.end_date ? parseLocalDate(rt.end_date) : null;
      let effectiveEnd: Date | null = endDate;
      const nextDue = parseLocalDate(rt.next_due_date);

      if (rt.installment_payment_id) {
        const ip = installmentMap.get(rt.installment_payment_id);
        if (ip) {
          if (!ip.is_active || ip.installment_amount <= 0) {
            const stop = new Date(nextDue.getTime() - 86400000);
            if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
          } else {
            const maxFuture = Math.max(
              0,
              Math.ceil(ip.remaining_amount / ip.installment_amount)
            );
            if (maxFuture <= 0) {
              const stop = new Date(nextDue.getTime() - 86400000);
              if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
            } else {
              let last = new Date(nextDue);
              for (let i = 1; i < maxFuture; i++) {
                last = advanceDate(last, rt.recurrence_type);
              }
              if (!effectiveEnd || last < effectiveEnd) effectiveEnd = last;
            }
          }
        }
      }

      if (rt.debt_id) {
        const debt = debtMap.get(rt.debt_id);
        if (debt) {
          if (debt.status === "completed") {
            const stop = new Date(nextDue.getTime() - 86400000);
            if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
          } else {
            const unpaidCount = scheduledDebtPayments.filter(
              (sp) => sp.debt_id === debt.id && !sp.is_paid
            ).length;
            const maxFuture =
              unpaidCount > 0
                ? unpaidCount
                : debt.payment_amount > 0
                ? Math.max(0, Math.ceil(debt.remaining_amount / debt.payment_amount))
                : 0;
            if (maxFuture <= 0) {
              const stop = new Date(nextDue.getTime() - 86400000);
              if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
            } else {
              let last = new Date(nextDue);
              for (let i = 1; i < maxFuture; i++) {
                last = advanceDate(last, rt.recurrence_type);
              }
              if (!effectiveEnd || last < effectiveEnd) effectiveEnd = last;
            }
          }
        }
      }

      // Walk occurrences from start_date forward — same as the Analysis
      // page: skip future occurrences before next_due_date.
      let cursor = parseLocalDate(rt.start_date);
      cursor.setHours(0, 0, 0, 0);
      const cap = 500;
      let n = 0;
      while (cursor <= period.to && n < cap) {
        if (effectiveEnd && cursor > effectiveEnd) break;
        const inWindow = cursor >= period.from && cursor <= period.to;
        if (inWindow) {
          const isFuture = cursor >= today;
          if (isFuture) {
            // Skip future occurrences before next_due_date (calendar parity).
            if (cursor < nextDue) {
              cursor = advanceDate(cursor, rt.recurrence_type);
              n++;
              continue;
            }
            const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
            const amt = effectiveAmount(rt, dateStr);
            const idx = period.buckets.bucketOf(cursor);
            let entry = map.get(rt.category.id);
            if (!entry) {
              entry = { total: 0, series: new Array(period.buckets.count).fill(0) };
              map.set(rt.category.id, entry);
            }
            entry.total += amt;
            if (idx >= 0) entry.series[idx] += amt;
          }
        }
        cursor = advanceDate(cursor, rt.recurrence_type);
        n++;
      }
    }
    return map;
  }, [
    recurringTransactions,
    installmentPayments,
    debts,
    scheduledDebtPayments,
    includeProjected,
    period.from,
    period.to,
    period.buckets,
    today,
  ]);

  /**
   * Per-category monthly totals for the last 6 *complete* months — the basis
   * for both the "monthlyAvg" stat and the suggestion engine.
   */
  const historyByCategory = useMemo(() => {
    const todayDate = new Date();
    const monthsBack = 6;
    const buckets: { from: Date; to: Date; key: string }[] = [];
    for (let i = 1; i <= monthsBack; i++) {
      const ref = subMonths(todayDate, i);
      buckets.push({
        from: startOfMonth(ref),
        to: endOfMonth(ref),
        key: format(ref, "yyyy-MM"),
      });
    }
    // Map<categoryId, Map<monthKey, amount>>
    const byCat = new Map<string, Map<string, number>>();
    for (const tx of transactions) {
      if (!tx.category?.id) continue;
      const net = netExpense(tx);
      if (net <= 0) continue;
      const d = dateOf(tx);
      const bucket = buckets.find((b) => d >= b.from && d <= b.to);
      if (!bucket) continue;
      let inner = byCat.get(tx.category.id);
      if (!inner) {
        inner = new Map();
        byCat.set(tx.category.id, inner);
      }
      inner.set(bucket.key, (inner.get(bucket.key) ?? 0) + net);
    }
    // Materialize 6 monthly totals per category (zero-filled).
    const out = new Map<string, number[]>();
    for (const cat of categories) {
      const inner = byCat.get(cat.id);
      const series = buckets.map((b) => inner?.get(b.key) ?? 0);
      out.set(cat.id, series);
    }
    return out;
  }, [transactions, categories, dateOf]);

  const stats = useMemo<CategoryStats[]>(() => {
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const dayInMonth = today.getDate();
    const totalDaysInMonth = getDaysInMonth(today);

    return categories.map((category) => {
      let spent = 0;
      let prevSpent = 0;
      let currentMonthSpent = 0;
      const buckets = new Array(period.buckets.count).fill(0);
      for (const tx of transactions) {
        if (tx.category?.id !== category.id) continue;
        const net = netExpense(tx);
        if (net <= 0) continue;
        const d = dateOf(tx);
        if (d >= period.from && d <= period.to) {
          spent += net;
          const idx = period.buckets.bucketOf(d);
          if (idx >= 0) buckets[idx] += net;
        }
        if (d >= period.prevFrom && d <= period.prevTo) prevSpent += net;
        if (d >= monthStart && d <= monthEnd) currentMonthSpent += net;
      }

      const projection = projectedByCategory.get(category.id);
      const projected = projection?.total ?? 0;
      const projectedBuckets = projection?.series ?? new Array(period.buckets.count).fill(0);
      const used = spent + projected;

      const monthly = category.budget != null ? Number(category.budget) : null;
      const periodBudget = monthly != null ? monthly * period.effectiveMonths : null;
      const remaining = periodBudget != null ? periodBudget - used : null;
      const pct = periodBudget != null && periodBudget > 0 ? used / periodBudget : 0;

      let status: CategoryStats["status"] = "ok";
      if (monthly == null) status = "noBudget";
      else if (pct >= 1) status = "over";
      else if (pct >= 0.85) status = "warn";

      // ── Suggestion engine ──────────────────────────────────
      // Inputs: last 6 *complete* months + a stabilised projection of the
      // current month. Output: a *monthly* budget suggestion (the column the
      // user edits).
      const history = historyByCategory.get(category.id) ?? [];
      const hasHistory = history.some((v) => v > 0);
      const monthlyAvg = history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
      const p75v = p75(history);
      // Blended projection of the current month: spent so far + the historic
      // average for the days *remaining*. Day 1 → ~ monthlyAvg, last day →
      // exactly currentMonthSpent. Avoids the "spike on day 1 → €1 000
      // run-rate" volatility of a pure linear extrapolation.
      const monthFraction =
        totalDaysInMonth > 0 ? Math.min(1, dayInMonth / totalDaysInMonth) : 1;
      const expectedMonthTotal = currentMonthSpent + (1 - monthFraction) * monthlyAvg;
      const base = Math.max(p75v, expectedMonthTotal);
      const suggested = hasHistory || currentMonthSpent > 0 ? niceRound(base) : 0;

      return {
        category,
        spent,
        prevSpent,
        projected,
        used,
        periodBudget,
        remaining,
        monthlyAvg,
        suggested,
        pct,
        status,
        buckets,
        projectedBuckets,
      };
    });
  }, [categories, transactions, dateOf, period, projectedByCategory, historyByCategory, today]);

  const totals = useMemo(() => {
    const totalBudget = stats.reduce((s, x) => s + (x.periodBudget ?? 0), 0);
    const totalSpent = stats.reduce((s, x) => s + x.spent, 0);
    const totalPrevSpent = stats.reduce((s, x) => s + x.prevSpent, 0);
    const totalProjected = stats.reduce((s, x) => s + x.projected, 0);
    const totalUsed = totalSpent + totalProjected;
    const overCount = stats.filter((x) => x.status === "over").length;
    const warnCount = stats.filter((x) => x.status === "warn").length;
    const noBudgetCount = stats.filter((x) => x.status === "noBudget").length;
    const suggestableCount = stats.filter(
      (x) => x.status === "noBudget" && x.suggested > 0
    ).length;
    const utilization = totalBudget > 0 ? totalUsed / totalBudget : 0;
    const prevDelta = totalPrevSpent > 0 ? (totalSpent - totalPrevSpent) / totalPrevSpent : null;
    return {
      totalBudget,
      totalSpent,
      totalPrevSpent,
      totalProjected,
      totalUsed,
      overCount,
      warnCount,
      noBudgetCount,
      suggestableCount,
      utilization,
      prevDelta,
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
        return copy.sort((a, b) => b.used - a.used);
      case "budget":
        return copy.sort((a, b) => (b.periodBudget ?? 0) - (a.periodBudget ?? 0));
      case "variance":
        return copy.sort((a, b) => b.pct - a.pct);
      case "noBudgetFirst":
        return copy.sort((a, b) => {
          if (a.status === "noBudget" && b.status !== "noBudget") return -1;
          if (b.status === "noBudget" && a.status !== "noBudget") return 1;
          return b.used - a.used;
        });
    }
  }, [stats, statusFilter, search, sort]);

  const startEditing = (category: Category) => {
    setEditingCategory(category);
    setEditOpen(true);
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast({
        title: t("transactions.noData", { defaultValue: "No data to export" }),
        description: t("budget.exportEmpty", {
          defaultValue: "No categories match the current filters.",
        }),
      });
      return;
    }
    const escape = (v: string | number | null | undefined) => {
      const s = (v ?? "").toString();
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "Category",
      "Color",
      "Icon",
      "Monthly budget",
      "Period budget",
      "Spent",
      "Projected",
      "Used",
      "Remaining",
      "Pct used",
      "Status",
      "Avg / month (6mo)",
      "Suggested monthly",
      "Prev period spent",
      "Period from",
      "Period to",
    ];
    const rows = filtered.map((s) => {
      const monthly = s.category.budget != null ? Number(s.category.budget) : "";
      return [
        s.category.name,
        s.category.color,
        s.category.icon ?? "",
        monthly,
        s.periodBudget != null ? Number(s.periodBudget.toFixed(2)) : "",
        Number(s.spent.toFixed(2)),
        Number(s.projected.toFixed(2)),
        Number(s.used.toFixed(2)),
        s.remaining != null ? Number(s.remaining.toFixed(2)) : "",
        s.periodBudget != null && s.periodBudget > 0
          ? `${(s.pct * 100).toFixed(1)}%`
          : "",
        s.status,
        Number(s.monthlyAvg.toFixed(2)),
        s.suggested > 0 ? s.suggested : "",
        Number(s.prevSpent.toFixed(2)),
        format(period.from, "yyyy-MM-dd"),
        format(period.to, "yyyy-MM-dd"),
      ]
        .map(escape)
        .join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-${format(period.from, "yyyyMMdd")}-${format(period.to, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: t("transactions.exported", { defaultValue: "Exported" }),
      description: t("budget.exportedHint", {
        n: filtered.length,
        defaultValue: `${filtered.length} categories exported to CSV`,
      }),
    });
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

  /**
   * Should we show the Suggest button on this row? Hide the suggestion when
   * it differs from the current monthly budget by less than one *rounding
   * step* — that's pure noise from `niceRound`, not a real recommendation.
   * No budget set → always show (the user hasn't expressed intent yet).
   */
  const showSuggestion = (s: CategoryStats): boolean => {
    if (s.suggested <= 0) return false;
    const currentMonthly = s.category.budget != null ? Number(s.category.budget) : null;
    if (currentMonthly == null) return true;
    const absDelta = Math.abs(s.suggested - currentMonthly);
    const step = niceRoundStep(Math.max(s.suggested, currentMonthly));
    return absDelta > step;
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

  const periodMonthsLabel =
    period.effectiveMonths >= 0.99
      ? `${period.effectiveMonths.toFixed(period.effectiveMonths < 9.95 ? 1 : 0)} ${t(
          "budget.monthsLabel",
          { defaultValue: "months" }
        )}`
      : t("budget.monthsLabelPartial", { defaultValue: "partial month" });

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
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-9 text-xs gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {t("transactions.exportCSV", { defaultValue: "Export CSV" })}
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)} className="h-9 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("categories.newCategory", { defaultValue: "New category" })}
            </Button>
          </div>
        </div>

        {/* Period selector */}
        <div className="ft-card p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="ft-eyebrow">{t("budget.analyzeOver", { defaultValue: "Analyze over" })}</div>
              <div className="text-sm font-semibold mt-0.5">
                {period.label}
                <span className="text-fg-dim font-normal ml-2">· {periodMonthsLabel}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodPill active={periodKey === "1m"} onClick={() => setPeriodKey("1m")} label={t("budget.p1m", { defaultValue: "This month" })} />
              <PeriodPill active={periodKey === "3m"} onClick={() => setPeriodKey("3m")} label={t("budget.p3m", { defaultValue: "3M" })} />
              <PeriodPill active={periodKey === "6m"} onClick={() => setPeriodKey("6m")} label={t("budget.p6m", { defaultValue: "6M" })} />
              <PeriodPill active={periodKey === "ytd"} onClick={() => setPeriodKey("ytd")} label={t("budget.pYtd", { defaultValue: "YTD" })} />
              <PeriodPill active={periodKey === "1y"} onClick={() => setPeriodKey("1y")} label={t("budget.p1y", { defaultValue: "1Y" })} />
              <PeriodPill active={periodKey === "custom"} onClick={() => setPeriodKey("custom")} label={t("budget.pCustom", { defaultValue: "Custom" })} />
            </div>
          </div>

          {periodKey === "custom" && (
            <div className="flex flex-wrap items-end gap-2 mt-3">
              <DatePill
                value={customRange.from}
                onChange={(d) => setCustomRange((r) => ({ ...r, from: d }))}
                label={t("budget.from", { defaultValue: "From" })}
              />
              <DatePill
                value={customRange.to}
                onChange={(d) => setCustomRange((r) => ({ ...r, to: d }))}
                label={t("budget.to", { defaultValue: "To" })}
              />
            </div>
          )}

          {period.to >= today && (
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-line">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {t("budget.includeProjected", { defaultValue: "Include projected transactions" })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("budget.includeProjectedHelp", {
                    defaultValue:
                      "Adds future recurring expenses inside the period to spend totals.",
                  })}
                </div>
              </div>
              <Switch checked={includeProjected} onCheckedChange={setIncludeProjected} />
            </div>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            icon={<Target className="h-3.5 w-3.5" />}
            label={t("budget.budgetForPeriod", { defaultValue: "Budget for period" })}
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
            label={
              includeProjected
                ? t("budget.spentAndProjected", { defaultValue: "Spent + projected" })
                : t("budget.spentInPeriod", { defaultValue: "Spent in period" })
            }
            value={formatCurrency(totals.totalUsed)}
            tone={
              totals.totalBudget > 0 && totals.totalUsed > totals.totalBudget ? "neg" : "default"
            }
            delta={
              totals.prevDelta != null
                ? {
                    pct: totals.prevDelta,
                    /** Positive delta = spending up = bad. */
                    sentiment: "spend",
                  }
                : undefined
            }
            footer={
              includeProjected && totals.totalProjected > 0
                ? t("budget.projectedFooter", {
                    value: formatCurrency(totals.totalProjected),
                    defaultValue: `+ ${formatCurrency(totals.totalProjected)} projected`,
                  })
                : totals.totalPrevSpent > 0
                ? t("budget.prevPeriodFooter", {
                    value: formatCurrency(totals.totalPrevSpent),
                    defaultValue: `vs ${formatCurrency(totals.totalPrevSpent)} prior`,
                  })
                : undefined
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
                {t("budget.scopedToPeriod", {
                  defaultValue: "Stats scoped to the selected period",
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
                const {
                  category,
                  spent,
                  projected,
                  used,
                  periodBudget,
                  remaining,
                  monthlyAvg,
                  suggested,
                  pct,
                  status,
                } = s;
                const monthly = category.budget != null ? Number(category.budget) : null;
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
                            value={formatCurrency(used)}
                            sub={
                              includeProjected && projected > 0
                                ? t("budget.spentSplit", {
                                    actual: formatCurrency(spent),
                                    projected: formatCurrency(projected),
                                    defaultValue: `${formatCurrency(spent)} actual + ${formatCurrency(
                                      projected
                                    )} projected`,
                                  })
                                : undefined
                            }
                          />
                          <Stat
                            label={t("budget.periodBudget", { defaultValue: "Period budget" })}
                            value={periodBudget != null ? formatCurrency(periodBudget) : "—"}
                            sub={
                              monthly != null
                                ? t("budget.monthlyEqv", {
                                    value: formatCurrency(monthly),
                                    defaultValue: `${formatCurrency(monthly)} / month`,
                                  })
                                : undefined
                            }
                            muted={periodBudget == null}
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
                            label={t("budget.monthlyAvg", { defaultValue: "Avg / month (6 mo)" })}
                            value={monthlyAvg > 0 ? formatCurrency(monthlyAvg) : "—"}
                            muted={monthlyAvg <= 0}
                          />
                        </div>
                        {/* Sparkline of bucketed spend over the period */}
                        <div className="mt-3">
                          <CategorySparkline
                            buckets={s.buckets}
                            projected={includeProjected ? s.projectedBuckets : undefined}
                            color={category.color}
                            reference={
                              periodBudget != null && period.buckets.count > 0
                                ? periodBudget / period.buckets.count
                                : undefined
                            }
                            height={32}
                          />
                        </div>
                        <div className="ft-progress-track mt-2">
                          <div
                            className="ft-progress-fill"
                            style={{ width: `${barPct}%`, background: barColor }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-shrink-0">
                        {showSuggestion(s) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applySuggestion(category.id, suggested)}
                            disabled={busyId === category.id}
                            className="h-8 px-2 text-xs gap-1.5"
                            title={t("categories.suggestTooltip", {
                              value: formatCurrency(suggested),
                              defaultValue: `Set monthly budget to ${formatCurrency(
                                suggested
                              )} (6-mo p75 / current run rate)`,
                            })}
                          >
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span className="hidden sm:inline">
                              {t("categories.suggest", { defaultValue: "Suggest" })}
                            </span>
                            <span className="font-mono">{formatCurrency(suggested)}</span>
                            {monthly != null &&
                              (suggested > monthly ? (
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
  delta,
}: {
  label: string;
  value: string;
  tone?: "default" | "neg" | "warn";
  icon?: React.ReactNode;
  footer?: string;
  /** Comparison vs prior period. `sentiment: "spend"` flips green/red so that
   *  a *decrease* in spending reads positive. */
  delta?: { pct: number; sentiment: "spend" | "neutral" };
}) {
  const valueClass =
    tone === "neg" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";

  let deltaChip: React.ReactNode = null;
  if (delta && Math.abs(delta.pct) >= 0.001) {
    const up = delta.pct > 0;
    const isGood = delta.sentiment === "spend" ? !up : up;
    const cls = isGood ? "text-pos bg-pos/12" : "text-destructive bg-destructive/12";
    const Arrow = up ? TrendingUp : TrendingDown;
    deltaChip = (
      <span className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10.5px] font-semibold ${cls}`}>
        <Arrow className="h-3 w-3" />
        {`${up ? "+" : ""}${(delta.pct * 100).toFixed(0)}%`}
      </span>
    );
  } else if (delta) {
    deltaChip = (
      <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10.5px] font-semibold text-fg-dim bg-bg-subtle">
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }

  return (
    <div className="ft-kpi">
      <div className="flex items-center gap-2">
        {icon && <div className="ft-kpi-icon acc flex-shrink-0">{icon}</div>}
        <span className="ft-kpi-label flex items-center gap-1 min-w-0 truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <div className={`ft-kpi-value truncate ${valueClass}`}>{value}</div>
        {deltaChip}
      </div>
      {footer && <div className="text-[11px] text-fg-dim truncate">{footer}</div>}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  muted = false,
  sub,
}: {
  label: string;
  value: string;
  tone?: "default" | "pos" | "neg" | "muted";
  muted?: boolean;
  sub?: string;
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
      {sub && <div className="text-[10px] text-fg-dim truncate">{sub}</div>}
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

function PeriodPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-3 rounded-md border text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-line text-muted-foreground hover:text-foreground hover:bg-bg-hover"
      }`}
    >
      {label}
    </button>
  );
}

function DatePill({
  value,
  onChange,
  label,
}: {
  value: Date;
  onChange: (d: Date) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/80">
        {label}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-2 text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(value, "dd MMM yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => {
              if (d) {
                const safe = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
                onChange(safe);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default Budget;
