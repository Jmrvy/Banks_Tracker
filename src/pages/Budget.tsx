import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  CalendarIcon,
  ChevronDown,
  Download,
  Edit3,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BudgetRowSparkline } from "@/components/BudgetRowSparkline";
import { BudgetRowGauge } from "@/components/BudgetRowGauge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EditCategoryModal } from "@/components/EditCategoryModal";
import { MiniDonut } from "@/components/MiniDonut";
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
import { resolveDebtForRecurring } from "@/lib/recurringAmount";
import { cn } from "@/lib/utils";
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

// =============================================================================
// Types
// =============================================================================

type StatusFilter = "all" | "over" | "warn" | "noBudget";
type RowView = "trend" | "gauge";
type PeriodKey = "1m" | "3m" | "6m" | "ytd" | "1y" | "month" | "year" | "custom";
type Status = "noBudget" | "ok" | "warn" | "over";

interface Driver {
  id: string;
  description: string;
  amount: number;
  date: Date;
}

interface CategoryStats {
  category: Category;
  /** Actual spend within the selected period. */
  spent: number;
  /** Actual spend within the equivalent prior period (clamped to elapsed). */
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
  /** used / periodBudget (0 if no budget). */
  pct: number;
  /** Time-aware status flag. */
  status: Status;
  /** Bucketed actual spend over the period — drives the sparkline. */
  buckets: number[];
  /** Bucketed projected spend over the period (parallel to `buckets`). */
  projectedBuckets: number[];
  /** Top-5 actual transactions in the period (descending by amount). */
  topDrivers: Driver[];
}

interface PeriodBuckets {
  count: number;
  bucketOf: (d: Date) => number;
}

// =============================================================================
// Pure helpers
// =============================================================================

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

function niceRoundStep(n: number): number {
  if (n >= 2000) return 100;
  if (n >= 500) return 50;
  if (n >= 100) return 25;
  if (n >= 20) return 10;
  return 5;
}

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

/**
 * Time-aware status. The "warn" threshold is pace-aware so that 85% used
 * on day 3 of 31 still raises a flag, but we reserve "over" for rows that
 * have *actually* exceeded their budget — €600 spent against a €600 budget
 * is on-target, not a breach.
 *
 *   over: ratio > 1                    (strictly exceeded — no false alarms at 100%)
 *   warn: elapsed + 0.15 ≤ ratio < 1   (pacing too hot, not yet over)
 *   ok  : below pace, or exactly at budget
 *
 * The row's `pace X% · used Y%` micro-line carries the pacing story, so
 * exactly-at-budget reads cleanly as "On track" instead of triggering noise
 * on a fixed monthly like rent.
 */
function statusOf(used: number, periodBudget: number | null, elapsed: number): Status {
  if (periodBudget == null) return "noBudget";
  if (periodBudget <= 0) return "ok";
  const ratio = used / periodBudget;
  if (ratio > 1) return "over";
  if (ratio < 1 && ratio >= elapsed + 0.15) return "warn";
  return "ok";
}

// =============================================================================
// Page
// =============================================================================

const Budget = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { categories, transactions, recurringTransactions, refetch } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments: scheduledDebtPayments } = useDebts();
  const { formatCurrency, preferences } = useUserPreferences();

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rowView, setRowView] = useState<RowView>("trend");

  const [periodKey, setPeriodKey] = useState<PeriodKey>("1m");
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  // Anchor date for the "specific month" / "specific year" pickers. The
  // picker pills only become active when the user explicitly chooses one;
  // the relative presets (1m / 3m / …) ignore this value.
  const [pickedMonth, setPickedMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [pickedYear, setPickedYear] = useState<Date>(() => startOfYear(new Date()));
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [includeProjected, setIncludeProjected] = useState(true);

  // -----------------------------------------------------------------------
  // Period — window, prior-window, bucketing
  // -----------------------------------------------------------------------
  const period = useMemo(() => {
    const now = new Date();
    let from: Date;
    let to: Date;
    let label: string;
    let prevFrom: Date;
    let prevTo: Date;
    switch (periodKey) {
      case "1m":
        from = startOfMonth(now);
        to = endOfMonth(now);
        label = format(now, "MMMM yyyy");
        prevFrom = startOfMonth(subMonths(now, 1));
        prevTo = endOfMonth(subMonths(now, 1));
        break;
      case "3m":
        from = startOfMonth(subMonths(now, 2));
        to = endOfMonth(now);
        label = t("budget.period3m", { defaultValue: "Last 3 months" });
        prevFrom = startOfMonth(subMonths(now, 5));
        prevTo = endOfMonth(subMonths(now, 3));
        break;
      case "6m":
        from = startOfMonth(subMonths(now, 5));
        to = endOfMonth(now);
        label = t("budget.period6m", { defaultValue: "Last 6 months" });
        prevFrom = startOfMonth(subMonths(now, 11));
        prevTo = endOfMonth(subMonths(now, 6));
        break;
      case "ytd":
        from = startOfYear(now);
        to = endOfMonth(now);
        label = t("budget.periodYtd", { defaultValue: "Year to date" });
        prevFrom = startOfYear(subYears(now, 1));
        prevTo = endOfMonth(subYears(now, 1));
        break;
      case "1y":
        from = startOfYear(now);
        to = endOfYear(now);
        label = t("budget.period1y", { defaultValue: "Full year" });
        prevFrom = startOfYear(subYears(now, 1));
        prevTo = endOfYear(subYears(now, 1));
        break;
      case "month":
        // Specific calendar month (any month, past or future) chosen via the
        // MonthPicker. Prior period = the month before.
        from = startOfMonth(pickedMonth);
        to = endOfMonth(pickedMonth);
        label = format(pickedMonth, "MMMM yyyy");
        prevFrom = startOfMonth(subMonths(pickedMonth, 1));
        prevTo = endOfMonth(subMonths(pickedMonth, 1));
        break;
      case "year":
        // Specific calendar year (any year). Prior period = the year before.
        from = startOfYear(pickedYear);
        to = endOfYear(pickedYear);
        label = format(pickedYear, "yyyy");
        prevFrom = startOfYear(subYears(pickedYear, 1));
        prevTo = endOfYear(subYears(pickedYear, 1));
        break;
      case "custom": {
        from = customRange.from;
        to = customRange.to;
        label = `${format(from, "dd MMM yy")} → ${format(to, "dd MMM yy")}`;
        const lengthDaysC = Math.max(1, differenceInCalendarDays(to, from) + 1);
        prevTo = addDays(from, -1);
        prevFrom = addDays(from, -lengthDaysC);
        break;
      }
    }

    const effectiveMonths = effectiveMonthsBetween(from, to);
    const totalDays = Math.max(1, differenceInCalendarDays(to, from) + 1);

    // Elapsed days (clamped) and the same-elapsed clamp on the prior window.
    let elapsedDays: number;
    if (today < from) elapsedDays = 0;
    else if (today >= to) elapsedDays = totalDays;
    else elapsedDays = differenceInCalendarDays(today, from) + 1;

    if (elapsedDays === 0) {
      prevTo = addDays(prevFrom, -1);
    } else if (elapsedDays < totalDays) {
      prevTo = addDays(prevFrom, elapsedDays - 1);
    }
    const elapsedFraction = elapsedDays / totalDays;

    // Bucket the period into ~12–30 buckets for sparkline rendering.
    let bucketCount: number;
    let bucketSizeDays: number;
    if (totalDays <= 35) {
      bucketCount = totalDays;
      bucketSizeDays = 1;
    } else if (totalDays <= 200) {
      bucketCount = Math.max(8, Math.ceil(totalDays / 7));
      bucketSizeDays = 7;
    } else {
      const months: number[] = [];
      let cursor = startOfMonth(from);
      while (cursor <= to) {
        months.push(cursor.getTime());
        cursor = addMonths(cursor, 1);
      }
      bucketCount = months.length;
      bucketSizeDays = 0;
    }

    const bucketOf = (d: Date): number => {
      if (d < from || d > to) return -1;
      if (bucketSizeDays === 0) {
        const monthsBetween =
          (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth());
        return Math.min(bucketCount - 1, Math.max(0, monthsBetween));
      }
      const dayDelta = differenceInCalendarDays(d, from);
      return Math.min(bucketCount - 1, Math.max(0, Math.floor(dayDelta / bucketSizeDays)));
    };

    const buckets: PeriodBuckets = { count: bucketCount, bucketOf };

    // Today's index inside the bucket array (for the sparkline tick).
    const elapsedBuckets = (() => {
      if (today < from) return 0;
      if (today >= to) return bucketCount;
      return Math.min(bucketCount, bucketOf(today) + 1);
    })();

    return {
      from,
      to,
      label,
      effectiveMonths,
      prevFrom,
      prevTo,
      buckets,
      totalDays,
      elapsedDays,
      elapsedFraction,
      elapsedBuckets,
    };
  }, [periodKey, customRange, pickedMonth, pickedYear, t, today]);

  const dateOf = useMemo(
    () => (tx: Transaction) =>
      preferences.dateType === "value"
        ? parseLocalDate(tx.value_date || tx.transaction_date)
        : parseLocalDate(tx.transaction_date),
    [preferences.dateType]
  );

  // -----------------------------------------------------------------------
  // Projection — mirrors the Analysis page (installment + debt caps,
  // scheduled debt amount resolution, next_due_date alignment).
  // -----------------------------------------------------------------------
  const projectedByCategory = useMemo(() => {
    type Entry = { total: number; series: number[] };
    const map = new Map<string, Entry>();
    if (!includeProjected || period.to < today) return map;

    const installmentMap = new Map(installmentPayments.map((ip) => [ip.id, ip]));
    // Debt resolution now goes through `resolveDebtForRecurring` which
    // accepts the description-fallback path Analysis uses.
    const sdpByDebtMonth = new Map<string, number>();
    for (const sp of scheduledDebtPayments) {
      sdpByDebtMonth.set(`${sp.debt_id}:${sp.scheduled_date.substring(0, 7)}`, sp.scheduled_amount);
    }

    const effectiveAmount = (rt: RecurringTransaction, dateStr: string): number => {
      // Use the same debt-resolution path the Analysis page uses, including
      // the description-match fallback. Without it, legacy recurrences (no
      // `debt_id` set, but described as `"... (Remboursement dette)"`) would
      // be projected at `rt.amount` instead of the debt's scheduled amount,
      // and they wouldn't be capped to the remaining payments.
      const debt = resolveDebtForRecurring(rt, debts);
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
      if (rt.installment_payment_id) {
        const ip = installmentMap.get(rt.installment_payment_id);
        if (ip && ip.installment_amount > 0) return ip.installment_amount;
      }
      return Number(rt.amount);
    };

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

      // Use the same debt resolver as `effectiveAmount` so the cap and the
      // amount agree on which debt this recurrence is linked to.
      {
        const debt = resolveDebtForRecurring(rt, debts);
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

      let cursor = new Date(nextDue);
      cursor.setHours(0, 0, 0, 0);
      const cap = 500;
      let n = 0;
      while (cursor <= period.to && n < cap) {
        if (effectiveEnd && cursor > effectiveEnd) break;
        if (cursor >= today && cursor >= period.from) {
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
    const out = new Map<string, number[]>();
    for (const cat of categories) {
      const inner = byCat.get(cat.id);
      const series = buckets.map((b) => inner?.get(b.key) ?? 0);
      out.set(cat.id, series);
    }
    return out;
  }, [transactions, categories, dateOf]);

  // -----------------------------------------------------------------------
  // Per-category stats — now also computes status (time-aware) and topDrivers.
  // -----------------------------------------------------------------------
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
      const driversInPeriod: Driver[] = [];
      for (const tx of transactions) {
        if (tx.category?.id !== category.id) continue;
        const net = netExpense(tx);
        if (net <= 0) continue;
        const d = dateOf(tx);
        if (d >= period.from && d <= period.to) {
          spent += net;
          const idx = period.buckets.bucketOf(d);
          if (idx >= 0) buckets[idx] += net;
          driversInPeriod.push({
            id: tx.id,
            description: tx.description,
            amount: net,
            date: d,
          });
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
      const status = statusOf(used, periodBudget, period.elapsedFraction);

      // ── Suggestion engine ──────────────────────────────────────────────
      // The suggested *monthly* budget is the max of three signals:
      //  1. p75 of the last 6 complete months — robust historical baseline.
      //  2. blended current-month projection — `currentSpent + (1-frac)·avg`,
      //     prevents day-1 spikes from dominating early in the month.
      //  3. **period-pace projection** — extrapolate the user's rate against
      //     the *selected* period and reduce to a monthly-equivalent.
      //
      //  Signal 3 is what makes the suggestion respond when a category is
      //  near its cap mid-period. Example: yearly view, mid-year, 90% of the
      //  yearly budget already spent → projected period total ≈ 1.8× budget,
      //  suggested monthly ≈ 1.8× current monthly.
      const history = historyByCategory.get(category.id) ?? [];
      const hasHistory = history.some((v) => v > 0);
      const monthlyAvg =
        history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
      const p75v = p75(history);
      const monthFraction =
        totalDaysInMonth > 0 ? Math.min(1, dayInMonth / totalDaysInMonth) : 1;
      const expectedMonthTotal = currentMonthSpent + (1 - monthFraction) * monthlyAvg;

      // Pace-projected monthly equivalent. Ignored until at least 5 % of the
      // period has elapsed to avoid extrapolating from one purchase on day 1,
      // and ignored when the period doesn't span any full month.
      let pacedMonthly = 0;
      if (period.elapsedFraction > 0.05 && period.effectiveMonths > 0 && spent > 0) {
        const projectedPeriodTotal = spent / period.elapsedFraction;
        pacedMonthly = projectedPeriodTotal / period.effectiveMonths;
      }

      const base = Math.max(p75v, expectedMonthTotal, pacedMonthly);
      const suggested =
        hasHistory || currentMonthSpent > 0 || pacedMonthly > 0 ? niceRound(base) : 0;

      // Top-5 drivers (descending amount) inside the period.
      const topDrivers = driversInPeriod
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

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
        topDrivers,
      };
    });
  }, [categories, transactions, dateOf, period, projectedByCategory, historyByCategory, today]);

  // -----------------------------------------------------------------------
  // Aggregate totals for KPIs.
  // -----------------------------------------------------------------------
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
    // Delta is computed against actual spend (totalSpent), not totalUsed —
    // including projected would produce an apples-to-oranges comparison.
    const prevDelta =
      totalPrevSpent > 0 && totalSpent > 0
        ? (totalSpent - totalPrevSpent) / totalPrevSpent
        : null;
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

  // -----------------------------------------------------------------------
  // List filtering + search.
  // -----------------------------------------------------------------------
  const filtered = useMemo(() => {
    let out = stats;
    if (statusFilter !== "all") {
      out = out.filter((s) => s.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((s) => s.category.name.toLowerCase().includes(q));
    // Sort: most-breached first.
    //  1. Group by status (over → warn → noBudget → ok) so the most actionable
    //     rows land at the top in a predictable order.
    //  2. Within each group, sort by overrun magnitude — for budgeted rows
    //     that's `pct` desc (highest utilisation first); for noBudget rows
    //     by current spend desc; for ok rows by remaining-budget asc (those
    //     closest to their limit appear first).
    return [...out].sort((a, b) => {
      const order: Record<Status, number> = { over: 0, warn: 1, noBudget: 2, ok: 3 };
      const so = order[a.status] - order[b.status];
      if (so !== 0) return so;
      if (a.status === "over" || a.status === "warn" || a.status === "ok") {
        const dpct = b.pct - a.pct;
        if (Math.abs(dpct) > 0.0001) return dpct;
      } else {
        // noBudget: sort by current period spend desc (heaviest unbudgeted spend first).
        const dspend = b.used - a.used;
        if (Math.abs(dspend) > 0.0001) return dspend;
      }
      return a.category.name.localeCompare(b.category.name);
    });
  }, [stats, statusFilter, search]);

  // -----------------------------------------------------------------------
  // Mutations.
  // -----------------------------------------------------------------------
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

  /**
   * Hide the suggestion when it differs from the current monthly budget by
   * less than one rounding step (pure rounding noise).
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
        s.periodBudget != null && s.periodBudget > 0 ? `${(s.pct * 100).toFixed(1)}%` : "",
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

  const navigateToTransactions = (categoryId: string) => {
    navigate("/transactions", {
      state: {
        categoryId,
        dateFrom: format(period.from, "yyyy-MM-dd"),
        dateTo: format(period.to, "yyyy-MM-dd"),
      },
    });
  };

  // -----------------------------------------------------------------------
  // Render.
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.tools")}</div>
            <h1 className="ft-page-title">{t("budget.pageTitle", { defaultValue: "Budget" })}</h1>
            <div className="ft-page-sub">
              {t("budget.pageSubV2", {
                defaultValue:
                  "Personalize categories, set budgets, and see what's drifting against actuals.",
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <div className="ft-eyebrow">
                {t("budget.analyzeOver", { defaultValue: "Analyze over" })}
              </div>
              <div className="text-sm font-semibold mt-0.5">
                {period.label}
                <span className="text-fg-dim font-normal ml-2">
                  ·{" "}
                  {t("budget.dayOf", {
                    elapsed: period.elapsedDays,
                    total: period.totalDays,
                    defaultValue: `day ${period.elapsedDays} of ${period.totalDays}`,
                  })}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick relative presets — anchored to today. */}
              <div className="ft-seg flex-wrap">
                {(
                  [
                    ["1m", t("budget.p1m", { defaultValue: "This month" })],
                    ["3m", t("budget.p3m", { defaultValue: "3M" })],
                    ["6m", t("budget.p6m", { defaultValue: "6M" })],
                    ["ytd", t("budget.pYtd", { defaultValue: "YTD" })],
                    ["1y", t("budget.p1y", { defaultValue: "1Y" })],
                    ["custom", t("budget.pCustom", { defaultValue: "Custom" })],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className={periodKey === k ? "active" : ""}
                    onClick={() => setPeriodKey(k as PeriodKey)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* Specific-month / specific-year pickers — same flexibility the
                  Analysis page offers. The picker labels show the active
                  selection; clicking opens a popover. */}
              <div
                className={cn(
                  "inline-flex h-9 rounded-md border transition-colors",
                  periodKey === "month"
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-card text-muted-foreground hover:bg-bg-hover hover:text-foreground"
                )}
              >
                <MonthPicker
                  value={pickedMonth}
                  onChange={(d) => {
                    if (d) {
                      setPickedMonth(startOfMonth(d));
                      setPeriodKey("month");
                    }
                  }}
                  placeholder={t("budget.pickMonth", { defaultValue: "Pick a month" })}
                  className="h-9 border-0 bg-transparent px-3 text-xs font-medium hover:bg-transparent"
                />
              </div>
              <div
                className={cn(
                  "inline-flex h-9 rounded-md border transition-colors",
                  periodKey === "year"
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-card text-muted-foreground hover:bg-bg-hover hover:text-foreground"
                )}
              >
                <YearPicker
                  value={pickedYear}
                  onChange={(d) => {
                    if (d) {
                      setPickedYear(startOfYear(d));
                      setPeriodKey("year");
                    }
                  }}
                  placeholder={t("budget.pickYear", { defaultValue: "Pick a year" })}
                  className="h-9 border-0 bg-transparent px-3 text-xs font-medium hover:bg-transparent"
                />
              </div>
              {period.to >= today && (
                <label
                  className={cn(
                    "inline-flex items-center gap-2 h-8 px-3 rounded-md border border-line text-xs font-medium cursor-pointer transition-colors",
                    "bg-bg-subtle text-muted-foreground hover:bg-bg-hover hover:text-foreground"
                  )}
                >
                  <Switch
                    checked={includeProjected}
                    onCheckedChange={setIncludeProjected}
                    className="scale-75 data-[state=checked]:bg-primary"
                  />
                  <span>
                    {t("budget.includeProjectedShort", { defaultValue: "Include projected" })}
                  </span>
                </label>
              )}
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
        </div>

        {/* KPI strip — 3 tiles */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1fr] gap-3">
          <KpiBudget
            totalBudget={totals.totalBudget}
            totalUsed={totals.totalUsed}
            utilization={totals.utilization}
            formatCurrency={formatCurrency}
            t={t}
          />
          <KpiUsed
            totalUsed={totals.totalUsed}
            totalSpent={totals.totalSpent}
            totalPrevSpent={totals.totalPrevSpent}
            prevDelta={totals.prevDelta}
            includeProjected={includeProjected}
            elapsedDays={period.elapsedDays}
            formatCurrency={formatCurrency}
            t={t}
          />
          <KpiAttention
            overCount={totals.overCount}
            warnCount={totals.warnCount}
            noBudgetCount={totals.noBudgetCount}
            suggestableCount={totals.suggestableCount}
            onAuto={autoBudgetMissing}
            busy={bulkBusy}
            t={t}
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
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
                label={t("budget.filterAll", { defaultValue: "All" })}
                count={stats.length}
              />
              <FilterPill
                active={statusFilter === "over"}
                onClick={() => setStatusFilter("over")}
                label={t("budget.filterOver", { defaultValue: "Over" })}
                count={totals.overCount}
                tone="neg"
              />
              <FilterPill
                active={statusFilter === "warn"}
                onClick={() => setStatusFilter("warn")}
                label={t("budget.filterWarn", { defaultValue: "Near limit" })}
                count={totals.warnCount}
                tone="warn"
              />
              <FilterPill
                active={statusFilter === "noBudget"}
                onClick={() => setStatusFilter("noBudget")}
                label={t("budget.filterNoBudget", { defaultValue: "No budget" })}
                count={totals.noBudgetCount}
              />
            </div>
          </div>
        </div>

        {/* Categories list */}
        <div className="ft-card-flush flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 md:py-5 border-b border-line flex-wrap">
            <div>
              <h3 className="ft-card-title">
                {t("budget.categoriesSection", { defaultValue: "Categories" })}
              </h3>
              <p className="ft-card-sub mt-0.5">
                {filtered.length} / {categories.length} ·{" "}
                {t("budget.scopedToPeriod", {
                  defaultValue: "Stats scoped to the selected period",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {rowView === "trend" && (
                <div className="hidden md:flex items-center gap-3 text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/80">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-px bg-foreground/70" />
                    {t("budget.legendCum", { defaultValue: "Cumulative" })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-px border-t border-dashed border-line-strong" />
                    {t("budget.legendBudget", { defaultValue: "Budget" })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-px h-3 border-l border-dashed border-fg-dim" />
                    {t("budget.legendToday", { defaultValue: "Today" })}
                  </span>
                </div>
              )}
              <div
                role="group"
                aria-label={t("budget.rowViewToggle", {
                  defaultValue: "Row visualisation",
                })}
                className="inline-flex rounded-lg border border-line bg-bg-subtle/50 p-0.5"
              >
                {(
                  [
                    ["trend", t("budget.viewTrend", { defaultValue: "Trend" })],
                    ["gauge", t("budget.viewGauge", { defaultValue: "Gauge" })],
                  ] as [RowView, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={rowView === key}
                    onClick={() => setRowView(key)}
                    className={cn(
                      "px-2.5 h-7 rounded-md text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
                      rowView === key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {t("budget.noResults", {
                defaultValue: "No categories match this filter.",
              })}
            </div>
          ) : (
            <div className="flex flex-col">
              {filtered.map((s) => (
                <CategoryRow
                  key={s.category.id}
                  s={s}
                  expanded={!!expanded[s.category.id]}
                  onToggle={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [s.category.id]: !prev[s.category.id],
                    }))
                  }
                  rowView={rowView}
                  includeProjected={includeProjected}
                  elapsedDays={period.elapsedBuckets}
                  totalDays={period.buckets.count}
                  elapsedFraction={period.elapsedFraction}
                  showSuggestion={showSuggestion(s)}
                  busy={busyId === s.category.id}
                  onApplySuggestion={() =>
                    applySuggestion(s.category.id, s.suggested)
                  }
                  onEdit={() => startEditing(s.category)}
                  onDelete={() => handleDelete(s.category.id)}
                  onViewTransactions={() => navigateToTransactions(s.category.id)}
                  formatCurrency={formatCurrency}
                  t={t}
                />
              ))}
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

// =============================================================================
// KPI tiles
// =============================================================================

interface KpiBudgetProps {
  totalBudget: number;
  totalUsed: number;
  utilization: number;
  formatCurrency: (n: number) => string;
  t: (k: string, o?: any) => string;
}
function KpiBudget({ totalBudget, totalUsed, utilization, formatCurrency, t }: KpiBudgetProps) {
  return (
    <div className="ft-kpi">
      <div className="flex items-center gap-2">
        <div className="ft-kpi-icon acc flex-shrink-0">
          <Target className="h-3.5 w-3.5" />
        </div>
        <span className="ft-kpi-label flex items-center gap-1 min-w-0 truncate">
          {t("budget.budgetForPeriod", { defaultValue: "Budget for period" })}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="ft-kpi-value truncate">{formatCurrency(totalBudget)}</div>
          <div className="text-[11px] text-fg-dim truncate">
            <span className="font-mono tabular-nums">{formatCurrency(totalUsed)}</span>{" "}
            <span className="opacity-80">
              {t("budget.usedX", {
                pct: `${(utilization * 100).toFixed(0)}%`,
                defaultValue: `used · ${(utilization * 100).toFixed(0)}%`,
              })}
            </span>
          </div>
        </div>
        <MiniDonut pct={utilization} size={42} />
      </div>
    </div>
  );
}

interface KpiUsedProps {
  totalUsed: number;
  totalSpent: number;
  totalPrevSpent: number;
  prevDelta: number | null;
  includeProjected: boolean;
  elapsedDays: number;
  formatCurrency: (n: number) => string;
  t: (k: string, o?: any) => string;
}
function KpiUsed({
  totalUsed,
  totalSpent,
  totalPrevSpent,
  prevDelta,
  includeProjected,
  elapsedDays,
  formatCurrency,
  t,
}: KpiUsedProps) {
  // Hide the delta chip when the headline includes projected — the chip
  // compares actuals only and would otherwise read as apples-to-oranges.
  const showDelta = !includeProjected && prevDelta != null;
  const isUp = (prevDelta ?? 0) > 0;
  const goodDown = !isUp;
  const chipClass = showDelta
    ? goodDown
      ? "text-pos bg-pos/12"
      : "text-destructive bg-destructive/12"
    : "";
  return (
    <div className="ft-kpi">
      <div className="flex items-center gap-2">
        <div className="ft-kpi-icon flex-shrink-0">
          <Bell className="h-3.5 w-3.5" />
        </div>
        <span className="ft-kpi-label flex items-center gap-1 min-w-0 truncate">
          {includeProjected
            ? t("budget.spentAndProjected", { defaultValue: "Spent + projected" })
            : t("budget.spentSoFar", { defaultValue: "Spent so far" })}
        </span>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <div className="ft-kpi-value truncate">{formatCurrency(totalUsed)}</div>
        {showDelta && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10.5px] font-semibold ${chipClass}`}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {`${isUp ? "+" : ""}${((prevDelta ?? 0) * 100).toFixed(0)}%`}
          </span>
        )}
      </div>
      <div className="text-[11px] text-fg-dim truncate">
        {totalPrevSpent > 0
          ? t("budget.vsSameElapsed", {
              days: elapsedDays,
              value: formatCurrency(totalPrevSpent),
              defaultValue: `vs ${formatCurrency(totalPrevSpent)} same ${elapsedDays}d last period`,
            })
          : t("budget.noPriorData", { defaultValue: "No prior-period data" })}
      </div>
    </div>
  );
}

interface KpiAttentionProps {
  overCount: number;
  warnCount: number;
  noBudgetCount: number;
  suggestableCount: number;
  onAuto: () => void;
  busy: boolean;
  t: (k: string, o?: any) => string;
}
function KpiAttention({
  overCount,
  warnCount,
  noBudgetCount,
  suggestableCount,
  onAuto,
  busy,
  t,
}: KpiAttentionProps) {
  const total = overCount + warnCount + noBudgetCount;
  const iconCls = overCount > 0 ? "neg" : warnCount > 0 ? "warn" : "";
  return (
    <div className="ft-kpi gap-2">
      <div className="flex items-center gap-2">
        <div className={`ft-kpi-icon ${iconCls} flex-shrink-0`}>
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
        <span className="ft-kpi-label flex items-center gap-1 min-w-0 truncate">
          {t("budget.attention", { defaultValue: "Attention" })}
        </span>
      </div>
      <div className="ft-kpi-value">{total}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-medium text-muted-foreground">
        <Pip toneClass="bg-destructive">
          {t("budget.attnOver", {
            count: overCount,
            defaultValue: `${overCount} over`,
          })}
        </Pip>
        <Pip toneClass="bg-warning">
          {t("budget.attnNear", {
            count: warnCount,
            defaultValue: `${warnCount} near`,
          })}
        </Pip>
        <Pip toneClass="bg-fg-dim">
          {t("budget.attnUnset", {
            count: noBudgetCount,
            defaultValue: `${noBudgetCount} unset`,
          })}
        </Pip>
      </div>
      {suggestableCount > 0 && (
        <Button
          size="sm"
          onClick={onAuto}
          disabled={busy}
          className="mt-1 h-8 text-xs gap-1.5 self-start"
        >
          <Wand2 className="h-3.5 w-3.5" />
          {busy
            ? t("common.saving", { defaultValue: "Saving..." })
            : t("budget.autoBudgetN", {
                count: suggestableCount,
                defaultValue: `Auto-budget ${suggestableCount}`,
              })}
        </Button>
      )}
    </div>
  );
}

function Pip({ toneClass, children }: { toneClass: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${toneClass}`} />
      {children}
    </span>
  );
}

// =============================================================================
// Category row — condensed by default, expands inline
// =============================================================================

interface CategoryRowProps {
  s: CategoryStats;
  expanded: boolean;
  onToggle: () => void;
  rowView: RowView;
  includeProjected: boolean;
  elapsedDays: number;
  totalDays: number;
  elapsedFraction: number;
  showSuggestion: boolean;
  busy: boolean;
  onApplySuggestion: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewTransactions: () => void;
  formatCurrency: (n: number) => string;
  t: (k: string, o?: any) => string;
}

function CategoryRow({
  s,
  expanded,
  onToggle,
  rowView,
  includeProjected,
  elapsedDays,
  totalDays,
  elapsedFraction,
  showSuggestion,
  busy,
  onApplySuggestion,
  onEdit,
  onDelete,
  onViewTransactions,
  formatCurrency,
  t,
}: CategoryRowProps) {
  const { category, used, periodBudget, remaining, status, pct, suggested } = s;
  const monthly = category.budget != null ? Number(category.budget) : null;
  const budgetForFigure = periodBudget;
  const suggestDelta = monthly != null ? suggested - monthly : null;

  const statusMeta: Record<Status, { label: string; cls: string }> = {
    over: {
      label: t("categories.overBudget", { defaultValue: "Over" }),
      cls: "bg-destructive/15 text-destructive",
    },
    warn: {
      label: t("categories.nearLimit", { defaultValue: "Near limit" }),
      cls: "bg-warning/15 text-warning",
    },
    noBudget: {
      label: t("categories.noBudgetTag", { defaultValue: "No budget" }),
      cls: "bg-bg-subtle text-fg-dim",
    },
    ok: {
      label: t("budget.onTrack", { defaultValue: "On track" }),
      cls: "bg-pos/12 text-pos",
    },
  };

  return (
    <div
      className={cn(
        "border-t border-line first:border-t-0 transition-colors",
        expanded && "bg-bg-subtle/50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full grid items-center gap-3 lg:gap-4 px-5 md:px-6 py-3.5 text-left transition-colors hover:bg-bg-subtle",
          // Mobile: icon | identity | figure | chevron
          // Desktop: icon | identity | figure | sparkline | chevron
          "grid-cols-[36px_1fr_auto_14px] lg:grid-cols-[36px_1.4fr_1.1fr_1.6fr_14px]"
        )}
      >
        <CategoryIcon icon={category.icon} color={category.color} size={36} />

        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold tracking-tight truncate">
            {category.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10.5px] font-semibold ${statusMeta[status].cls}`}
            >
              {status === "over" && <AlertTriangle className="h-3 w-3" />}
              {statusMeta[status].label}
            </span>
            {monthly != null && status !== "ok" && (
              <span className="text-[10.5px] font-mono tabular-nums text-fg-dim">
                {t("budget.paceUsed", {
                  pace: `${(elapsedFraction * 100).toFixed(0)}%`,
                  used: `${(pct * 100).toFixed(0)}%`,
                  defaultValue: `pace ${(elapsedFraction * 100).toFixed(0)}% · used ${(pct * 100).toFixed(0)}%`,
                })}
              </span>
            )}
          </div>
        </div>

        <div className="text-right min-w-0">
          <div className="text-[13.5px]">
            <span className="font-mono font-medium tabular-nums">
              {formatCurrency(used)}
            </span>
            <span className="text-fg-dim mx-1">/</span>
            <span className="font-mono tabular-nums text-fg-dim">
              {budgetForFigure != null ? formatCurrency(budgetForFigure) : "—"}
            </span>
          </div>
          <div className="text-[11.5px] text-fg-dim mt-0.5 truncate">
            {remaining != null ? (
              remaining >= 0 ? (
                <>
                  <span className="font-mono tabular-nums text-pos">
                    {formatCurrency(remaining)}
                  </span>{" "}
                  <span>{t("budget.left", { defaultValue: "left" })}</span>
                </>
              ) : (
                <>
                  <span className="font-mono tabular-nums text-destructive">
                    −{formatCurrency(Math.abs(remaining))}
                  </span>{" "}
                  <span>{t("budget.over", { defaultValue: "over" })}</span>
                </>
              )
            ) : (
              <>
                <span>{t("budget.avg", { defaultValue: "avg" })}</span>{" "}
                <span className="font-mono tabular-nums">
                  {formatCurrency(s.monthlyAvg)}
                </span>
                <span>/{t("budget.moShort", { defaultValue: "mo" })}</span>
              </>
            )}
          </div>
        </div>

        <div className="hidden lg:block h-9 min-w-0">
          {rowView === "gauge" ? (
            <div className="flex items-center h-full">
              <BudgetRowGauge
                used={used}
                budget={periodBudget}
                pct={pct}
                status={status}
                elapsedFraction={elapsedFraction}
                t={t}
              />
            </div>
          ) : (
            <BudgetRowSparkline
              buckets={s.buckets}
              projected={includeProjected ? s.projectedBuckets : null}
              color={category.color}
              budget={periodBudget}
              elapsedDays={elapsedDays}
              totalDays={totalDays}
              height={36}
            />
          )}
        </div>

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="px-5 md:px-6 lg:pl-[88px] pt-3 pb-5 border-t border-dashed border-line flex flex-col gap-4">
          {/* Mobile sparkline (hidden in the row when small) */}
          <div className="lg:hidden">
            {rowView === "gauge" ? (
              <BudgetRowGauge
                used={used}
                budget={periodBudget}
                pct={pct}
                status={status}
                elapsedFraction={elapsedFraction}
                t={t}
              />
            ) : (
              <BudgetRowSparkline
                buckets={s.buckets}
                projected={includeProjected ? s.projectedBuckets : null}
                color={category.color}
                budget={periodBudget}
                elapsedDays={elapsedDays}
                totalDays={totalDays}
                height={42}
              />
            )}
          </div>

          {/* 4-stat grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2">
            <DetailStat
              label={t("categories.spent", { defaultValue: "Spent" })}
              value={formatCurrency(s.spent)}
            />
            <DetailStat
              label={t("budget.projected", { defaultValue: "Projected" })}
              value={formatCurrency(s.projected)}
              muted={s.projected === 0}
            />
            <DetailStat
              label={t("budget.monthlyAvg", { defaultValue: "Avg / mo (6 mo)" })}
              value={s.monthlyAvg > 0 ? formatCurrency(s.monthlyAvg) : "—"}
              muted={s.monthlyAvg <= 0}
            />
            <DetailStat
              label={t("budget.lastSameDays", {
                defaultValue: "Last period, same days",
              })}
              value={formatCurrency(s.prevSpent)}
              muted={s.prevSpent === 0}
            />
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2">
            {showSuggestion && suggested > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplySuggestion();
                }}
                disabled={busy}
                className="h-8 text-xs gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {monthly == null
                  ? t("budget.setBudgetTo", {
                      value: formatCurrency(suggested),
                      defaultValue: `Set budget to ${formatCurrency(suggested)}`,
                    })
                  : t("budget.suggestValue", {
                      value: formatCurrency(suggested),
                      defaultValue: `Suggest ${formatCurrency(suggested)}`,
                    })}
                {suggestDelta != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1 h-4 rounded text-[10px] font-semibold",
                      suggestDelta > 0
                        ? "bg-warning/15 text-warning"
                        : "bg-pos/12 text-pos"
                    )}
                  >
                    {suggestDelta > 0 ? (
                      <ArrowUp className="h-2.5 w-2.5" />
                    ) : (
                      <ArrowDown className="h-2.5 w-2.5" />
                    )}
                    {formatCurrency(Math.abs(suggestDelta))}
                  </span>
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="h-8 text-xs gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5" />
              {t("budget.editCategory", { defaultValue: "Edit category" })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onViewTransactions();
              }}
              className="h-8 text-xs gap-1.5"
            >
              {t("budget.viewTransactions", { defaultValue: "View transactions" })}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="h-8 w-8 p-0 ml-auto text-muted-foreground hover:text-destructive"
              aria-label={t("common.delete", { defaultValue: "Delete" })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* What's driving it — only on over-budget rows */}
          {status === "over" && s.topDrivers.length > 0 && (
            <div className="rounded-lg border border-line bg-bg-elev p-3 sm:p-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  {t("budget.whatsDriving", { defaultValue: "What's driving it" })}
                </span>
                <span className="text-[11px] text-fg-dim">
                  {t("budget.topNTransactions", {
                    n: s.topDrivers.length,
                    defaultValue: `top ${s.topDrivers.length} transactions this period`,
                  })}
                </span>
              </div>
              <ul className="flex flex-col">
                {s.topDrivers.map((d) => (
                  <li
                    key={d.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 sm:gap-4 py-1.5 border-t border-line first:border-t-0 text-[12.5px]"
                  >
                    <span className="font-medium truncate">{d.description}</span>
                    <span className="text-fg-dim font-mono tabular-nums text-[11.5px]">
                      {format(d.date, "MMM d")}
                    </span>
                    <span className="font-mono tabular-nums text-destructive">
                      {formatCurrency(d.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80 truncate">
        {label}
      </div>
      <div
        className={cn(
          "font-mono tabular-nums text-[13.5px] font-medium mt-0.5 truncate",
          muted && "text-fg-dim"
        )}
      >
        {value}
      </div>
    </div>
  );
}

// =============================================================================
// Filter pill + date pill
// =============================================================================

function FilterPill({
  active,
  onClick,
  label,
  count,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "default" | "neg" | "warn";
}) {
  const activeCls =
    tone === "neg"
      ? "bg-destructive text-destructive-foreground border-destructive"
      : tone === "warn"
      ? "bg-warning text-warning-foreground border-warning"
      : "bg-foreground text-background border-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
        active
          ? activeCls
          : "border-line text-muted-foreground hover:text-foreground hover:bg-bg-hover bg-card"
      )}
    >
      {label}
      <span className={cn("font-mono tabular-nums", active ? "opacity-80" : "text-fg-dim")}>
        {count}
      </span>
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
