import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { EditCategoryModal } from "@/components/EditCategoryModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import {
  useFinancialData,
  type Category,
  type RecurringTransaction,
  type Transaction,
} from "@/hooks/useFinancialData";
import { useDebts } from "@/hooks/useDebts";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useSpecialBudgets, type SpecialBudget } from "@/hooks/useSpecialBudgets";
import { useSavingsGoals } from "@/hooks/useSavingsGoals";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { SpecialBudgetModal } from "@/components/SpecialBudgetModal";
import { SpecialBudgetDetailModal } from "@/components/SpecialBudgetDetailModal";
import {
  computeSpecialBudget,
  formatSpecialBudgetRange,
  getSpecialBudgetIcon,
  paletteForColor,
  SPECIAL_BUDGET_STATUS_META,
} from "@/lib/specialBudgetUtils";
import { Plane as PlaneEmptyIcon, Wallet as WalletIcon } from "lucide-react";
import { parseLocalDate } from "@/lib/dateUtils";
import { resolveDebtForRecurring } from "@/lib/recurringAmount";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errorMessage";
import { computeCategoryNets } from "@/lib/reportsEngine";
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
  spent: number;
  /** The parts behind `spent`, so the card can show what was netted out. */
  gross: number;
  refunded: number;
  offsetIncome: number;
  prevSpent: number;
  projected: number;
  used: number;
  periodBudget: number | null;
  remaining: number | null;
  monthlyAvg: number;
  suggested: number;
  pct: number;
  status: Status;
  buckets: number[];
  projectedBuckets: number[];
  topDrivers: Driver[];
}

interface PeriodBuckets {
  count: number;
  bucketOf: (d: Date) => number;
}

// =============================================================================
// Pure helpers — preserved verbatim from v1
// =============================================================================

/**
 * Signed contribution of one transaction to its category's spend.
 *
 * Deliberately the same arithmetic as `computeCategoryNets`, because this
 * page needs a per-transaction figure the engine does not expose — the
 * bucket series, the trailing history and the top drivers are built row by
 * row. Anywhere a *total* is wanted the engine's own result is used
 * instead; this only fills in the shapes it cannot.
 *
 * May go negative twice over: an over-refunded expense is genuinely money
 * back, and income marked as having come back on the category subtracts
 * outright. Flooring either at zero is what had this page reading 104 % of
 * budget beside "40,00 € left" on the same card.
 */
function categorySpend(tx: Transaction): number {
  if (tx.include_in_stats === false) return 0;
  if (tx.type === "expense") {
    // Repaying an advance is settling a debt, not spending. The income it
    // repays already counts net of it; charging it to a budget as well would
    // take the same money out twice.
    if (tx.repayment_of_transaction_id) return 0;
    // Tagged to a special event/trip budget — counted there, not under
    // the regular category budget bracket.
    if (tx.special_budget_id) return 0;
    return tx.amount - (tx.refunded_amount || 0);
  }
  if (tx.type === "income") {
    // Only income that says it came back on this category. A linked refund
    // already nets through its expense's refunded_amount.
    if (!tx.offsets_category) return 0;
    if (tx.refund_of_transaction_id) return 0;
    // Floored, matching netIncomeAmount: an advance repaid past its value
    // is not a credit to the budget it was never charged to.
    return -Math.max(0, tx.amount - (tx.repaid_amount || 0));
  }
  return 0;
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

function statusOf(used: number, periodBudget: number | null, elapsed: number): Status {
  if (periodBudget == null) return "noBudget";
  if (periodBudget <= 0) return "ok";
  const ratio = used / periodBudget;
  if (ratio > 1) return "over";
  if (ratio < 1 && ratio >= elapsed + 0.15) return "warn";
  return "ok";
}

// =============================================================================
// Visual primitives — built fresh for the v2 design
// =============================================================================

/**
 * Pace bar. Track + fill clamped to 100 %; when the row is over-budget the
 * fill paints the entire track and a hatched "overrun" strip sticks out to
 * the right. A small tick marks today's elapsed share of the period.
 *
 * Status colour drives the fill tone; 'ok' rows are muted on purpose so the
 * dashboard reads quiet when everything is on track and loud only when not.
 */
function PaceBar({
  used,
  budget,
  status,
  elapsedFraction,
  height = 8,
  showTick = true,
}: {
  used: number;
  budget: number;
  status: Status;
  elapsedFraction: number;
  height?: number;
  showTick?: boolean;
}) {
  const { t } = useTranslation();
  const ratio = budget > 0 ? used / budget : 0;
  const fillPct = Math.min(ratio, 1) * 100;
  const over = ratio > 1;
  // Overrun "spike" — purely a visual signal that the row is past
  // budget. We size it in pixels (not % of bar width) and cap it at
  // 16px so it never overflows the card's right padding. Larger
  // overshoots are already conveyed by the status pill / colour /
  // remaining figure; the spike just adds a quick at-a-glance cue.
  const overWidthPx = over ? Math.min(Math.ceil((ratio - 1) * 24), 16) : 0;
  const calm = status === "ok" || status === "noBudget";
  const colorClass =
    status === "over"
      ? "bg-neg"
      : status === "warn"
      ? "bg-warning"
      : status === "ok"
      ? "bg-pos"
      : "bg-muted-foreground/40";
  const elapsedPctLabel = Math.round(Math.min(elapsedFraction, 1) * 100);
  return (
    <div
      className="relative w-full rounded-full bg-bg-subtle overflow-visible"
      style={{ height }}
    >
      <div
        className={cn("absolute left-0 top-0 bottom-0 rounded-full transition-all", colorClass)}
        style={{ width: `${fillPct}%`, opacity: calm ? 0.6 : 1 }}
      />
      {over && overWidthPx > 0 && (
        <div
          // Overrun "spike" — rendered INSIDE the bar's right end so it
          // can never overflow the card padding regardless of the
          // overshoot magnitude. The hatched pattern overlays the solid
          // fill, signalling the row is past budget without competing
          // with the status pill or remaining figure.
          className="absolute right-0 top-0 bottom-0 rounded-r-full ring-1 ring-card/50"
          style={{
            width: `${overWidthPx}px`,
            background:
              status === "over"
                ? "repeating-linear-gradient(135deg, #ffffff 0 2px, transparent 2px 5px)"
                : "repeating-linear-gradient(135deg, #ffffff 0 2px, transparent 2px 5px)",
          }}
        />
      )}
      {showTick && budget > 0 && (
        <div
          // Today marker. The position reflects the elapsed share of
          // the period; comparing the fill's right edge to this tick
          // tells the user whether they're ahead of or behind pace.
          className="absolute -top-1 -bottom-1 w-0.5 -ml-px rounded-sm bg-card ring-[1.5px] ring-foreground/30 cursor-help"
          style={{ left: `${Math.min(elapsedFraction, 1) * 100}%` }}
          title={t("budget.todayTickTooltip", {
            pct: elapsedPctLabel,
            defaultValue: `Today · {{pct}}% of the period elapsed`,
          })}
          aria-label={t("budget.todayTickAria", {
            defaultValue: "Today marker",
          })}
        />
      )}
    </div>
  );
}

/**
 * Ring gauge — the centerpiece of the Overview card. SVG-only.
 *
 * The ring stroke colour signals breach: green when below budget, red when
 * actual + projected exceeds it. The "today" mark on the rim is a small
 * white dot outlined in foreground so the user can tell at a glance whether
 * they're ahead of or behind pace, without reading any text.
 */
function RingGauge({
  ratio,
  elapsedFraction,
  size = 124,
  stroke = 12,
}: {
  ratio: number;
  elapsedFraction: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(ratio, 1);
  const over = ratio > 1;
  const tickAngle = -90 + Math.min(elapsedFraction, 1) * 360;
  const tx = c + r * Math.cos((tickAngle * Math.PI) / 180);
  const ty = c + r * Math.sin((tickAngle * Math.PI) / 180);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="hsl(var(--bg-subtle))"
          strokeWidth={stroke}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={over ? "hsl(var(--neg))" : "hsl(var(--pos))"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * clamped} ${circ}`}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dasharray .5s ease" }}
        />
        <circle
          cx={tx}
          cy={ty}
          r={3.6}
          fill="hsl(var(--card))"
          stroke="hsl(var(--foreground))"
          strokeWidth={1.6}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <div
          className={cn(
            "text-2xl font-bold tabular-nums tracking-tight leading-none",
            over ? "text-neg" : "text-foreground"
          )}
        >
          {Math.round(ratio * 100)}%
        </div>
      </div>
    </div>
  );
}

/**
 * Cumulative spend-vs-budget trend chart.
 *
 * Aggregates the per-category bucket series into a single cumulative spend
 * curve. Renders:
 *  - a soft area fill under the actual curve
 *  - the actual cumulative line (solid foreground)
 *  - the projection segment as a softer dashed line continuing from today
 *  - a dashed horizontal "budget" reference line
 *  - a vertical tick at the elapsed bucket with a dot at today's cumulative
 */
function TrendChart({
  stats,
  includeProjected,
  period,
  formatCurrency,
}: {
  stats: CategoryStats[];
  includeProjected: boolean;
  period: PeriodSpec;
  formatCurrency: (n: number) => string;
}) {
  const W = 520;
  const H = 168;
  const padL = 6;
  const padR = 6;
  const padT = 12;
  const padB = 22;
  const n = period.buckets.count;
  const elapsedIdx = Math.max(0, Math.min(n - 1, period.elapsedBuckets - 1));

  // Daily/bucket totals across all categories.
  const dailyActual = new Array(n).fill(0);
  const dailyProj = new Array(n).fill(0);
  let totalBudget = 0;
  for (const s of stats) {
    if (s.periodBudget != null) totalBudget += s.periodBudget;
    for (let i = 0; i < n; i++) {
      dailyActual[i] += s.buckets[i] ?? 0;
      if (includeProjected) dailyProj[i] += s.projectedBuckets[i] ?? 0;
    }
  }

  // Cumulative actual (up to today) and cumulative actual + projected (full).
  const cumA: (number | null)[] = [];
  const cumAP: number[] = [];
  let sa = 0;
  let sap = 0;
  for (let i = 0; i < n; i++) {
    sa += dailyActual[i];
    sap += dailyActual[i] + dailyProj[i];
    cumA.push(i <= elapsedIdx ? sa : null);
    cumAP.push(sap);
  }
  const maxV = Math.max(totalBudget, sap, ...cumAP, 1) * 1.06;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);

  const actualPath = cumA
    .map((v, i) => (v == null ? null : `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  const projPts: string[] = [];
  for (let i = elapsedIdx; i < n; i++) {
    projPts.push(`${i === elapsedIdx ? "M" : "L"} ${x(i).toFixed(1)} ${y(cumAP[i]).toFixed(1)}`);
  }
  const projPath = projPts.join(" ");
  const lastA = (cumA[elapsedIdx] as number) ?? 0;
  const areaPath = actualPath
    ? `${actualPath} L ${x(elapsedIdx).toFixed(1)} ${(H - padB).toFixed(1)} L ${x(0).toFixed(1)} ${(
        H - padB
      ).toFixed(1)} Z`
    : "";
  const budgetY = y(totalBudget);
  const paceX = x(elapsedIdx);

  return (
    <svg
      className="block w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height: 168 }}
    >
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.10" />
          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {totalBudget > 0 && (
        <>
          <line
            x1={padL}
            x2={W - padR}
            y1={budgetY}
            y2={budgetY}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.55}
          />
          <text
            x={W - padR}
            y={Math.max(padT + 8, budgetY - 6)}
            textAnchor="end"
            fontSize={10}
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fill="hsl(var(--muted-foreground))"
          >
            {formatCurrency(totalBudget)}
          </text>
        </>
      )}
      {areaPath && <path d={areaPath} fill="url(#trendFill)" />}
      {projPath && (
        <path
          d={projPath}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.8}
          strokeDasharray="2 3"
          opacity={0.55}
          strokeLinejoin="round"
        />
      )}
      {actualPath && (
        <path
          d={actualPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <line
        x1={paceX}
        x2={paceX}
        y1={padT}
        y2={H - padB}
        stroke="hsl(var(--muted-foreground))"
        strokeWidth={0.8}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      <circle cx={paceX} cy={y(lastA)} r={3.6} fill="hsl(var(--foreground))" />
    </svg>
  );
}

// =============================================================================
// Budget card — replaces the v1 CategoryRow
// =============================================================================

interface BudgetCardProps {
  stat: CategoryStats;
  period: PeriodSpec;
  includeProjected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEditBudget: (s: CategoryStats) => void;
  onEditCategory: (cat: Category) => void;
  onDelete: (id: string) => void;
  onNavigateToTransactions: (categoryId: string) => void;
  applySuggestion: (id: string, suggested: number) => void;
  showSuggestion: (s: CategoryStats) => boolean;
  busyId: string | null;
  formatCurrency: (n: number) => string;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

function BudgetCard({
  stat,
  period,
  includeProjected,
  expanded,
  onToggleExpand,
  onEditBudget,
  onEditCategory,
  onDelete,
  onNavigateToTransactions,
  applySuggestion,
  showSuggestion,
  busyId,
  formatCurrency,
  t,
}: BudgetCardProps) {
  const used = stat.spent + (includeProjected ? stat.projected : 0);
  const budget = stat.periodBudget;
  const remaining =
    budget != null ? budget - used : null;

  const statusMeta: Record<Status, { label: string; tone: string; dotClass: string }> = {
    over: {
      label: t("budget.statusOver", { defaultValue: "Over budget" }),
      tone: "text-neg",
      dotClass: "bg-neg",
    },
    warn: {
      label: t("budget.statusWarn", { defaultValue: "Approaching limit" }),
      tone: "text-warning",
      dotClass: "bg-warning",
    },
    ok: {
      label: t("budget.statusOk", { defaultValue: "On track" }),
      tone: "text-pos",
      dotClass: "bg-pos",
    },
    noBudget: {
      label: t("budget.statusNoBudget", { defaultValue: "No budget" }),
      tone: "text-muted-foreground",
      dotClass: "bg-muted-foreground/40",
    },
  };
  const meta = statusMeta[stat.status];
  const canApplySuggestion = showSuggestion(stat);

  return (
    <div
      className={cn(
        "ft-card p-4 sm:p-5 flex flex-col gap-3 transition-shadow",
        stat.status === "over" && "border-neg/30"
      )}
    >
      {/* Header: icon + name + status + edit */}
      <div className="flex items-center gap-3">
        <CategoryIcon
          color={stat.category.color}
          icon={stat.category.icon}
          size={42}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-tight truncate leading-snug">
            {stat.category.name}
          </div>
          <div
            className={cn("text-xs font-semibold inline-flex items-center gap-1.5 mt-0.5", meta.tone)}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dotClass)} />
            {meta.label}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEditBudget(stat)}
          aria-label={t("budget.editBudget", { defaultValue: "Edit budget" })}
          title={t("budget.editBudget", { defaultValue: "Edit budget" })}
          className="h-8 w-8 rounded-lg border border-transparent text-muted-foreground hover:bg-bg-subtle hover:text-foreground hover:border-line grid place-items-center transition-colors"
        >
          <Edit3 className="h-4 w-4" />
        </button>
      </div>

      {/* Used / Budget figure + remaining */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xl font-bold tabular-nums tracking-tight leading-none">
            {formatCurrency(used)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums ml-1">
            {budget != null
              ? `/ ${formatCurrency(budget)}`
              : `· ${t("budget.noBudgetShort", { defaultValue: "no budget" })}`}
          </span>
        </div>
        {remaining != null ? (
          <div
            className={cn(
              "text-xs font-semibold tabular-nums text-right whitespace-nowrap",
              remaining < 0 ? "text-neg" : "text-muted-foreground"
            )}
          >
            {remaining >= 0 ? (
              <>
                {formatCurrency(remaining)}{" "}
                <span className="font-medium text-muted-foreground">
                  {t("budget.remaining", { defaultValue: "left" })}
                </span>
              </>
            ) : (
              <>
                −{formatCurrency(Math.abs(remaining))}{" "}
                <span className="font-medium text-muted-foreground">
                  {t("budget.over", { defaultValue: "over" })}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground tabular-nums text-right whitespace-nowrap">
            <span className="font-medium">
              {t("budget.avgShort", { defaultValue: "avg." })}
            </span>{" "}
            {formatCurrency(stat.monthlyAvg)}/
            {t("budget.month", { defaultValue: "mo" })}
          </div>
        )}
      </div>

      {budget != null && (
        <PaceBar
          used={used}
          budget={budget}
          status={stat.status}
          elapsedFraction={period.elapsedFraction}
        />
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>
          {budget != null
            ? `${Math.round((stat.pct ?? 0) * 100)} % ${t("budget.ofBudget", {
                defaultValue: "of budget",
              })}`
            : `${formatCurrency(stat.spent)} ${t("budget.thisPeriod", {
                defaultValue: "this period",
              })}`}
        </span>
        <span>
          {t("budget.dayN", {
            n: period.elapsedDays,
            total: period.totalDays,
            defaultValue: `day ${period.elapsedDays} / ${period.totalDays}`,
          })}
        </span>
      </div>

      {/* Apply suggested (inline) */}
      {stat.status === "noBudget" && canApplySuggestion && (
        <button
          type="button"
          onClick={() => applySuggestion(stat.category.id, stat.suggested)}
          disabled={busyId === stat.category.id}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg-subtle border border-line text-sm font-medium hover:bg-bg-hover transition-colors disabled:opacity-50"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className="text-muted-foreground truncate">
              {t("budget.applySuggestion", { defaultValue: "Apply suggested" })}
            </span>
          </span>
          <span className="tabular-nums font-semibold text-foreground whitespace-nowrap">
            {formatCurrency(stat.suggested)}
          </span>
        </button>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-line/60 pt-3 flex flex-col gap-3">
          {/* What was taken off, when anything was. Otherwise `spent` is a
              lone figure and there is no way to tell a category that cost
              540 from one that cost 700 and got 160 back. */}
          {(stat.refunded > 0 || stat.offsetIncome > 0) && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {t("budget.breakdownGross", { defaultValue: "Charged" })}
                </span>
                <span className="font-mono">{formatCurrency(stat.gross)}</span>
              </div>
              {stat.refunded > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {t("budget.breakdownRefunded", { defaultValue: "Refunded" })}
                  </span>
                  <span className="font-mono text-pos">−{formatCurrency(stat.refunded)}</span>
                </div>
              )}
              {/* Income filed here that says it came back on this category
                  rather than being earnings — a gambling payout against its
                  stakes, a reimbursement with no single expense to point at. */}
              {stat.offsetIncome > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {t("budget.breakdownOffset", { defaultValue: "Came back on this category" })}
                  </span>
                  <span className="font-mono text-pos">−{formatCurrency(stat.offsetIncome)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] font-medium border-t border-line/60 pt-1 mt-0.5">
                <span>{t("budget.breakdownNet", { defaultValue: "Counted against budget" })}</span>
                <span className="font-mono">{formatCurrency(stat.spent)}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <DetailStat
              label={t("budget.statSpent", { defaultValue: "Spent" })}
              value={formatCurrency(stat.spent)}
            />
            <DetailStat
              label={t("budget.statProjected", { defaultValue: "Projected" })}
              value={formatCurrency(stat.projected)}
              muted={stat.projected === 0}
            />
            <DetailStat
              label={t("budget.statAvg", { defaultValue: "Avg / mo (6mo)" })}
              value={formatCurrency(stat.monthlyAvg)}
              muted={stat.monthlyAvg === 0}
            />
            <DetailStat
              label={t("budget.statPrev", { defaultValue: "Prev period" })}
              value={formatCurrency(stat.prevSpent)}
              muted={stat.prevSpent === 0}
            />
          </div>

          {stat.status === "over" && stat.topDrivers.length > 0 && (
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-2">
                {t("budget.topDrivers", { defaultValue: "Top drivers · 5 biggest" })}
              </div>
              <div>
                {stat.topDrivers.map((d, i) => (
                  <div
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 py-1.5",
                      i > 0 && "border-t border-line/40"
                    )}
                  >
                    <span className="text-sm font-medium flex-1 truncate">{d.description}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                      {format(d.date, "d MMM")}
                    </span>
                    <span className="text-sm tabular-nums font-semibold text-neg whitespace-nowrap">
                      {formatCurrency(d.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onEditBudget(stat)}
            >
              <Edit3 className="h-3 w-3 mr-1.5" />
              {t("budget.editBudget", { defaultValue: "Edit budget" })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onNavigateToTransactions(stat.category.id)}
            >
              {t("budget.viewTransactions", { defaultValue: "View transactions" })}
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => onEditCategory(stat.category)}
            >
              {t("budget.editCategory", { defaultValue: "Edit category" })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-neg/70 hover:text-neg hover:bg-neg/10"
              onClick={() => onDelete(stat.category.id)}
            >
              <Trash2 className="h-3 w-3 mr-1.5" />
              {t("common.delete", { defaultValue: "Delete" })}
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleExpand}
        className={cn(
          "flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md text-xs font-semibold text-muted-foreground border border-dashed border-line hover:bg-bg-subtle hover:text-foreground transition-colors",
          expanded && "border-transparent"
        )}
      >
        {expanded
          ? t("budget.collapse", { defaultValue: "Hide details" })
          : t("budget.expand", { defaultValue: "Details & transactions" })}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
        />
      </button>
    </div>
  );
}

function DetailStat({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums mt-0.5",
          muted && "text-muted-foreground/70 font-medium"
        )}
      >
        {value}
      </div>
    </div>
  );
}

// =============================================================================
// Budget edit sheet — slide-over on desktop, bottom sheet on mobile
// =============================================================================

function BudgetEditSheet({
  stat,
  open,
  onOpenChange,
  onSave,
  formatCurrency,
}: {
  stat: CategoryStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (categoryId: string, monthlyBudget: number) => Promise<void>;
  formatCurrency: (n: number) => string;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [val, setVal] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!stat) return;
    const current =
      stat.category.budget != null ? Number(stat.category.budget) : stat.suggested || 0;
    setVal(current);
  }, [stat]);

  if (!stat) return null;

  const step = niceRoundStep(Math.max(val, 1));
  const suggestedMonthly = stat.suggested || 0;
  const currentMonthly = stat.category.budget != null ? Number(stat.category.budget) : null;
  const showSuggest = suggestedMonthly > 0 && Math.abs(suggestedMonthly - val) >= step;
  const delta = currentMonthly != null ? val - currentMonthly : null;

  const dec = () => setVal((v) => Math.max(0, Math.round((v - step) / step) * step));
  const inc = () => setVal((v) => Math.round(v / step) * step + step);

  const onSubmit = async () => {
    setSaving(true);
    try {
      await onSave(stat.category.id, val);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "p-0 flex flex-col gap-0",
          isMobile
            ? "max-h-[90vh] rounded-t-2xl border-t border-line"
            : "w-[420px] sm:max-w-[420px]"
        )}
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <CategoryIcon color={stat.category.color} icon={stat.category.icon} size={40} />
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base sm:text-lg font-semibold tracking-tight truncate">
                {stat.category.name}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {t("budget.monthlyBudget", { defaultValue: "Monthly budget" })}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Stepper */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground mb-2.5">
              {t("budget.monthlyBudget", { defaultValue: "Monthly budget" })}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={dec}
                aria-label={t("common.decrease", { defaultValue: "Decrease" })}
                className="h-12 w-11 rounded-xl border border-line bg-bg-subtle grid place-items-center hover:bg-bg-hover transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex-1 h-12 rounded-xl border border-line bg-card flex items-center px-4 gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={val}
                  onChange={(e) =>
                    setVal(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="border-0 bg-transparent text-right text-xl font-bold tabular-nums tracking-tight h-auto p-0 focus-visible:ring-0"
                />
                <span className="text-base text-muted-foreground tabular-nums">€</span>
              </div>
              <button
                type="button"
                onClick={inc}
                aria-label={t("common.increase", { defaultValue: "Increase" })}
                className="h-12 w-11 rounded-xl border border-line bg-bg-subtle grid place-items-center hover:bg-bg-hover transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {delta != null && delta !== 0 && (
              <div className="mt-2 text-xs tabular-nums text-muted-foreground">
                {delta > 0 ? "▲" : "▼"} {formatCurrency(Math.abs(delta))}{" "}
                {t("budget.vsCurrent", { defaultValue: "vs current budget" })}
              </div>
            )}
          </div>

          {/* Suggestion */}
          {showSuggest && (
            <button
              type="button"
              onClick={() => setVal(suggestedMonthly)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/8 border border-primary/30 hover:bg-primary/12 transition-colors"
            >
              <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center flex-shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  {t("budget.suggestion", {
                    defaultValue: "Suggestion: {{amt}} / month",
                    amt: formatCurrency(suggestedMonthly),
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("budget.suggestionBasis", {
                    defaultValue: "Based on your last 6 months + current pace",
                  })}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {/* Context */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground mb-2.5">
              {t("budget.context", { defaultValue: "Context" })}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <ContextCell
                label={t("budget.statSpent", { defaultValue: "Spent" })}
                value={formatCurrency(stat.spent)}
              />
              <ContextCell
                label={t("budget.statProjected", { defaultValue: "Projected" })}
                value={formatCurrency(stat.projected)}
              />
              <ContextCell
                label={t("budget.statAvg", { defaultValue: "Avg / mo" })}
                value={formatCurrency(stat.monthlyAvg)}
              />
              <ContextCell
                label={t("budget.statPrev", { defaultValue: "Prev period" })}
                value={formatCurrency(stat.prevSpent)}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line flex gap-2">
          <SheetClose asChild>
            <Button variant="outline" className="flex-1 h-10">
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
          </SheetClose>
          <Button
            onClick={onSubmit}
            disabled={saving}
            className="flex-1 h-10"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {saving ? t("common.saving", { defaultValue: "Saving…" }) : t("common.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContextCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-subtle border border-line rounded-lg px-3.5 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </div>
      <div className="text-base font-bold tabular-nums tracking-tight mt-1">{value}</div>
    </div>
  );
}

// =============================================================================
// Attention pip + date pill
// =============================================================================

function AttentionPip({
  toneClass,
  count,
  label,
  onClick,
  active,
}: {
  toneClass: string;
  count: number;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-semibold transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-bg-subtle border-line text-foreground hover:bg-bg-hover"
      )}
    >
      <span className={cn("w-2 h-2 rounded-full", toneClass)} />
      <span className="tabular-nums">{count}</span>
      <span className="font-medium">{label}</span>
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
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-card text-xs font-medium hover:bg-bg-subtle transition-colors"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">{format(value, "d MMM yyyy")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => d && onChange(d)}
          captionLayout="dropdown"
        />
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-line">
          {t("budget.dateHint", { defaultValue: "Pick a date" })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// Period type
// =============================================================================

interface PeriodSpec {
  from: Date;
  to: Date;
  label: string;
  effectiveMonths: number;
  prevFrom: Date;
  prevTo: Date;
  buckets: PeriodBuckets;
  totalDays: number;
  elapsedDays: number;
  elapsedFraction: number;
  elapsedBuckets: number;
}

// =============================================================================
// Page
// =============================================================================

const Budget = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { categories: allCategories, transactions, recurringTransactions, refetch } = useFinancialData();

  // Which categories have ever held spending this page would count, over all
  // time rather than the period on screen — otherwise a category would drop
  // off the page in any month it happened not to be used, taking its budget
  // with it. Deliberately the engine that fills the cards rather than a
  // predicate of its own: a category can then never appear with nothing to
  // show, nor vanish while still holding a figure. Repayments and
  // stats-excluded rows are not spending, which is why Salaire — whose only
  // expense is a €1,200 advance being settled — counts as never having spent.
  const everSpent = useMemo(() => computeCategoryNets(transactions as any), [transactions]);

  // A category earns a budget card by capping something or spending
  // something. One that only ever receives money has nothing to cap, so a
  // card for it is a permanent 0,00 € row; it moves to the list below and
  // returns here the moment a real expense lands on it.
  const categories = useMemo(
    () => allCategories.filter((c) => c.budget != null || everSpent.has(c.id)),
    [allCategories, everSpent],
  );
  const otherCategories = useMemo(
    () => allCategories.filter((c) => c.budget == null && !everSpent.has(c.id)),
    [allCategories, everSpent],
  );
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments: scheduledDebtPayments } = useDebts();
  const { specialBudgets } = useSpecialBudgets();
  const { goals: savingsGoals } = useSavingsGoals();
  const { formatCurrency, preferences } = useUserPreferences();
  const isMobile = useIsMobile();

  // --- editing + selection state ----------------------------------------
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editingBudgetStat, setEditingBudgetStat] = useState<CategoryStats | null>(null);
  const [editBudgetOpen, setEditBudgetOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newSpecialOpen, setNewSpecialOpen] = useState(false);
  const [openSpecialBudget, setOpenSpecialBudget] = useState<SpecialBudget | null>(null);
  const [showClosedSpecial, setShowClosedSpecial] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // --- period state -----------------------------------------------------
  const [periodKey, setPeriodKey] = useState<PeriodKey>("1m");
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [pickedMonth, setPickedMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [pickedYear, setPickedYear] = useState<Date>(() => startOfYear(new Date()));
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [includeProjected, setIncludeProjected] = useState(true);

  // --- period derivation (preserved verbatim from v1) -------------------
  const period = useMemo<PeriodSpec>(() => {
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
        from = startOfMonth(pickedMonth);
        to = endOfMonth(pickedMonth);
        label = format(pickedMonth, "MMMM yyyy");
        prevFrom = startOfMonth(subMonths(pickedMonth, 1));
        prevTo = endOfMonth(subMonths(pickedMonth, 1));
        break;
      case "year":
        from = startOfYear(pickedYear);
        to = endOfYear(pickedYear);
        label = format(pickedYear, "yyyy");
        prevFrom = startOfYear(subYears(pickedYear, 1));
        prevTo = endOfYear(subYears(pickedYear, 1));
        break;
      case "custom": {
        from = customRange.from;
        to = customRange.to;
        label = `${format(from, "d MMM yy")} → ${format(to, "d MMM yy")}`;
        const lengthDaysC = Math.max(1, differenceInCalendarDays(to, from) + 1);
        prevTo = addDays(from, -1);
        prevFrom = addDays(from, -lengthDaysC);
        break;
      }
    }

    const effectiveMonths = effectiveMonthsBetween(from, to);
    const totalDays = Math.max(1, differenceInCalendarDays(to, from) + 1);
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

  // --- projection (preserved verbatim) -----------------------------------
  const projectedByCategory = useMemo(() => {
    type Entry = { total: number; series: number[] };
    const map = new Map<string, Entry>();
    if (!includeProjected || period.to < today) return map;

    const installmentMap = new Map(installmentPayments.map((ip) => [ip.id, ip]));
    const sdpByDebtMonth = new Map<string, number>();
    for (const sp of scheduledDebtPayments) {
      sdpByDebtMonth.set(`${sp.debt_id}:${sp.scheduled_date.substring(0, 7)}`, sp.scheduled_amount);
    }

    const effectiveAmount = (rt: RecurringTransaction, dateStr: string): number => {
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

  // --- history (preserved) ----------------------------------------------
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
      const net = categorySpend(tx);
      if (net === 0) continue;
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

  // Refunds and paired income come from the engine so this page cannot
  // drift from the reports, the emails or Trace — they had each grown their
  // own version and disagreed about the same category.
  const periodNets = useMemo(() => {
    const inPeriod = transactions.filter((tx) => {
      const d = dateOf(tx);
      return d >= period.from && d <= period.to;
    });
    return computeCategoryNets(inPeriod as any);
  }, [transactions, categories, period, dateOf]);

  // --- stats (preserved) ------------------------------------------------
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
        const net = categorySpend(tx);
        if (net === 0) continue;
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

      // The engine's figure wins: it is the one the rest of the app quotes.
      // Everything below derives from `net`, so the headline, the pace bar,
      // the status pill and the over-budget count can no longer disagree —
      // they used to, because `used` was built from a separately clamped
      // local while the headline came from here.
      const parts = periodNets.get(category.id) ?? {
        gross: spent,
        refunded: 0,
        offsetIncome: 0,
        net: spent,
      };
      const net = parts.net;

      const projection = projectedByCategory.get(category.id);
      const projected = projection?.total ?? 0;
      const projectedBuckets = projection?.series ?? new Array(period.buckets.count).fill(0);
      const used = net + projected;

      const monthly = category.budget != null ? Number(category.budget) : null;
      const periodBudget = monthly != null ? monthly * period.effectiveMonths : null;
      const remaining = periodBudget != null ? periodBudget - used : null;
      const pct = periodBudget != null && periodBudget > 0 ? used / periodBudget : 0;
      const status = statusOf(used, periodBudget, period.elapsedFraction);

      const history = historyByCategory.get(category.id) ?? [];
      const hasHistory = history.some((v) => v !== 0);
      const monthlyAvg =
        history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
      const p75v = p75(history);
      const monthFraction =
        totalDaysInMonth > 0 ? Math.min(1, dayInMonth / totalDaysInMonth) : 1;
      const expectedMonthTotal = currentMonthSpent + (1 - monthFraction) * monthlyAvg;

      let pacedMonthly = 0;
      if (period.elapsedFraction > 0.05 && period.effectiveMonths > 0 && net > 0) {
        const projectedPeriodTotal = net / period.elapsedFraction;
        pacedMonthly = projectedPeriodTotal / period.effectiveMonths;
      }

      // Floored at 0: a suggestion is a budget to write into the database,
      // and a category that netted negative over the window must not persist
      // a negative cap through "Apply suggested".
      const base = Math.max(0, p75v, expectedMonthTotal, pacedMonthly);
      const suggested =
        hasHistory || currentMonthSpent !== 0 || pacedMonthly > 0 ? niceRound(base) : 0;

      const topDrivers = driversInPeriod.sort((a, b) => b.amount - a.amount).slice(0, 5);

      return {
        category,
        spent: net,
        gross: parts.gross,
        refunded: parts.refunded,
        offsetIncome: parts.offsetIncome,
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
  }, [categories, transactions, dateOf, period, periodNets, projectedByCategory, historyByCategory, today]);

  // --- totals (preserved) -----------------------------------------------
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

  // --- filtering (preserved) --------------------------------------------
  const filtered = useMemo(() => {
    let out = stats;
    if (statusFilter !== "all") {
      out = out.filter((s) => s.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((s) => s.category.name.toLowerCase().includes(q));
    return [...out].sort((a, b) => {
      const order: Record<Status, number> = { over: 0, warn: 1, noBudget: 2, ok: 3 };
      const so = order[a.status] - order[b.status];
      if (so !== 0) return so;
      if (a.status === "over" || a.status === "warn" || a.status === "ok") {
        const dpct = b.pct - a.pct;
        if (Math.abs(dpct) > 0.0001) return dpct;
      } else {
        const dspend = b.used - a.used;
        if (Math.abs(dspend) > 0.0001) return dspend;
      }
      return a.category.name.localeCompare(b.category.name);
    });
  }, [stats, statusFilter, search]);

  // --- mutations --------------------------------------------------------
  const startEditingCategory = (category: Category) => {
    setEditingCategory(category);
    setEditCategoryOpen(true);
  };

  const startEditingBudget = (s: CategoryStats) => {
    setEditingBudgetStat(s);
    setEditBudgetOpen(true);
  };

  const saveBudget = async (categoryId: string, monthlyBudget: number) => {
    try {
      const { error } = await supabase
        .from("categories")
        .update({ budget: monthlyBudget > 0 ? monthlyBudget : null })
        .eq("id", categoryId);
      if (error) throw error;
      refetch();
      setEditBudgetOpen(false);
      toast({
        title: t("categories.budgetUpdated", { defaultValue: "Budget updated" }),
      });
    } catch (err) {
      const detail = describeError(err);
      toast({
        title: t("common.error"),
        description: detail || t("errors.updateError"),
        variant: "destructive",
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
        // Pin the date type the budget was using so the filtered list
        // matches exactly what the card was counting, even if the user
        // changes their global preference later.
        dateType: preferences.dateType,
      },
    });
  };

  // --- derived: overview verdict + showProjectedToggle ------------------
  const expectedNow = totals.totalBudget * period.elapsedFraction;
  const paceDelta = totals.totalSpent - expectedNow;
  const aheadOfPace = paceDelta > 0;
  const showProjectedToggle = period.to >= today;

  const filterChips: { id: StatusFilter; label: string; n: number }[] = (
    [
      { id: "all" as StatusFilter, label: t("budget.filterAll", { defaultValue: "All" }), n: stats.length },
      { id: "over" as StatusFilter, label: t("budget.filterOver", { defaultValue: "Over" }), n: totals.overCount },
      { id: "warn" as StatusFilter, label: t("budget.filterWarn", { defaultValue: "Close" }), n: totals.warnCount },
      {
        id: "noBudget" as StatusFilter,
        label: t("budget.filterNoBudget", { defaultValue: "No budget" }),
        n: totals.noBudgetCount,
      },
    ]
  ).filter((c) => c.id === "all" || c.n > 0);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.tools")}</div>
            <h1 className="ft-page-title">
              {t("budget.pageTitle", { defaultValue: "Budget" })}
            </h1>
            <div className="ft-page-sub">
              {t("budget.pageSub", {
                defaultValue:
                  "Track each category against the selected period, spot what's drifting, and adjust your budgets.",
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              {t("budget.exportCsv", { defaultValue: "Export CSV" })}
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("budget.newCategory", { defaultValue: "New category" })}
            </Button>
          </div>
        </div>

        {/* Period bar */}
        <div className="ft-card p-3 sm:p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-bg-subtle border border-line grid place-items-center text-muted-foreground flex-shrink-0">
                <CalendarIcon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold tracking-tight truncate">
                  {period.label}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {t("budget.dayN", {
                    n: period.elapsedDays,
                    total: period.totalDays,
                    defaultValue: `day ${period.elapsedDays} / ${period.totalDays}`,
                  })}{" "}
                  · {Math.round(period.elapsedFraction * 100)}%{" "}
                  {t("budget.elapsed", { defaultValue: "elapsed" })}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Preset segmented control */}
              <div className="inline-flex p-0.5 gap-0.5 bg-bg-subtle border border-line rounded-md">
                {(
                  [
                    ["1m", t("budget.p1m", { defaultValue: "1M" })],
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
                    onClick={() => setPeriodKey(k as PeriodKey)}
                    className={cn(
                      "h-7 px-2.5 rounded text-[12px] font-semibold transition-colors",
                      periodKey === k
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* Month / Year specific pickers */}
              <div
                className={cn(
                  "inline-flex h-8 rounded-md border transition-colors",
                  periodKey === "month"
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-card text-muted-foreground hover:bg-bg-subtle hover:text-foreground"
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
                  className="h-8 border-0 bg-transparent px-3 text-xs font-medium hover:bg-transparent"
                />
              </div>
              <div
                className={cn(
                  "inline-flex h-8 rounded-md border transition-colors",
                  periodKey === "year"
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-card text-muted-foreground hover:bg-bg-subtle hover:text-foreground"
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
                  className="h-8 border-0 bg-transparent px-3 text-xs font-medium hover:bg-transparent"
                />
              </div>
              {/* Projected toggle (only when period is in the future) */}
              {showProjectedToggle && (
                <label className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-line bg-bg-subtle text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
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
            <div className="flex flex-wrap items-end gap-2">
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

        {/* Overview and pace are one card split by a rule, not two cards with
            a gap: they are the same reading of the period — how much is gone,
            and whether that is ahead of the clock. */}
        <div className="ft-card !p-0 overflow-hidden grid grid-cols-1 md:grid-cols-[1.1fr_1.5fr] [&>*+*]:border-t md:[&>*+*]:border-t-0 md:[&>*+*]:border-l [&>*+*]:border-line">
          {/* Summary card */}
          <div className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {t("budget.overview", { defaultValue: "Overview" })} · {period.label}
              </div>
              <div className="text-[11px] text-muted-foreground/80 tabular-nums">
                {t("budget.expected", { defaultValue: "expected" })}{" "}
                {Math.round(period.elapsedFraction * 100)}%
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-5">
              <RingGauge
                ratio={totals.utilization}
                elapsedFraction={period.elapsedFraction}
              />
              <div className="flex-1 min-w-0">
                <div className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight leading-none">
                  {formatCurrency(totals.totalUsed)}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums mt-1">
                  / {formatCurrency(totals.totalBudget)}{" "}
                  {t("budget.budget", { defaultValue: "budget" })}
                </div>
                {totals.totalBudget > 0 && (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-xs font-semibold",
                      aheadOfPace
                        ? "bg-neg/10 text-neg"
                        : "bg-pos/10 text-pos"
                    )}
                  >
                    {aheadOfPace ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {aheadOfPace
                      ? t("budget.overPace", {
                          amt: formatCurrency(paceDelta),
                          defaultValue: `${formatCurrency(paceDelta)} over pace`,
                        })
                      : t("budget.underPace", {
                          amt: formatCurrency(Math.abs(paceDelta)),
                          defaultValue: `${formatCurrency(Math.abs(paceDelta))} under pace`,
                        })}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                  {includeProjected && totals.totalProjected > 0 ? (
                    <>
                      {t("budget.includingProjected", {
                        amt: formatCurrency(totals.totalProjected),
                        defaultValue: `Including {{amt}} of projected upcoming spend.`,
                      })}
                    </>
                  ) : (
                    t("budget.actualOnly", {
                      defaultValue: "Based on actual spend so far.",
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Attention pips → quick filters */}
            <div className="flex flex-wrap gap-2 mt-4">
              <AttentionPip
                toneClass="bg-neg"
                count={totals.overCount}
                label={t("budget.pipOver", { defaultValue: "over" })}
                onClick={() => setStatusFilter("over")}
                active={statusFilter === "over"}
              />
              <AttentionPip
                toneClass="bg-warning"
                count={totals.warnCount}
                label={t("budget.pipWarn", { defaultValue: "close" })}
                onClick={() => setStatusFilter("warn")}
                active={statusFilter === "warn"}
              />
              <AttentionPip
                toneClass="bg-muted-foreground/40"
                count={totals.noBudgetCount}
                label={t("budget.pipNoBudget", { defaultValue: "no budget" })}
                onClick={() => setStatusFilter("noBudget")}
                active={statusFilter === "noBudget"}
              />
            </div>

            {/* Auto-budget banner */}
          </div>

          {/* Trend card */}
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {t("budget.spendPace", { defaultValue: "Spending pace" })}
              </div>
              <div className="flex gap-3 text-[10.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-[2.5px] rounded bg-foreground" />
                  {t("budget.legendActual", { defaultValue: "actual" })}
                </span>
                {includeProjected && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-3.5 h-0 border-t-[1.5px] border-dashed border-muted-foreground"
                      style={{ opacity: 0.55 }}
                    />
                    {t("budget.legendProjected", { defaultValue: "projected" })}
                  </span>
                )}
                {totals.totalBudget > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-3.5 h-0 border-t-[1.5px] border-dashed border-muted-foreground"
                      style={{ opacity: 0.55 }}
                    />
                    {t("budget.legendBudget", { defaultValue: "budget" })}
                  </span>
                )}
              </div>
            </div>
            <TrendChart
              stats={stats}
              includeProjected={includeProjected}
              period={period}
              formatCurrency={formatCurrency}
            />
            <div className="flex justify-between mt-2 text-[10.5px] text-muted-foreground tabular-nums">
              <span>
                {t("budget.cumulativeSpend", {
                  defaultValue: "cumulative spend over the period",
                })}
              </span>
              <span>
                {Math.round(totals.utilization * 100)}%{" "}
                {t("budget.ofBudgetCompact", { defaultValue: "of budget" })}
              </span>
            </div>
          </div>
        </div>

        {/* Auto-budget — the pack gives this its own full-width band rather
            than tucking it inside the overview, because it is an action on
            the whole page, not a footnote to the summary. */}
        {totals.suggestableCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-primary/[0.07] border border-transparent">
            <div className="ft-kpi-icon acc !h-9 !w-9">
              <Wand2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {t("budget.autoBudgetTitle", {
                  n: totals.suggestableCount,
                  defaultValue: `${totals.suggestableCount} categories without a budget`,
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("budget.autoBudgetSub", {
                  defaultValue: "Apply suggested budgets based on history.",
                })}
              </div>
            </div>
            <Button
              size="sm"
              onClick={autoBudgetMissing}
              disabled={bulkBusy}
              className="gap-1.5 bg-bg-ink text-fg-onink hover:bg-bg-ink hover:brightness-110 flex-shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {bulkBusy
                ? t("common.working", { defaultValue: "Working…" })
                : t("budget.autoBudgetAction", { defaultValue: "Auto-budget" })}
            </Button>
          </div>
        )}

        {/* Filter chips + search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
          {/* The pack switches budget status with a segmented control, not
              loose chips — these are mutually exclusive views of one list. */}
          <Segmented<StatusFilter>
            label={t("budget.filterAria", { defaultValue: "Filter by status" })}
            value={statusFilter}
            onChange={setStatusFilter}
            options={filterChips.map((c) => ({ value: c.id, label: c.label, count: c.n }))}
          />
          <div className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-card min-w-0 sm:min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("budget.searchPlaceholder", {
                defaultValue: "Search a category…",
              })}
              className="border-0 bg-transparent h-full text-sm p-0 focus-visible:ring-0"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("common.clear", { defaultValue: "Clear" })}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
              {t("budget.emptyFiltered", {
                defaultValue: "No categories match the current filter.",
              })}
            </div>
          ) : (
            filtered.map((s) => (
              <BudgetCard
                key={s.category.id}
                stat={s}
                period={period}
                includeProjected={includeProjected}
                expanded={!!expanded[s.category.id]}
                onToggleExpand={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [s.category.id]: !prev[s.category.id],
                  }))
                }
                onEditBudget={startEditingBudget}
                onEditCategory={startEditingCategory}
                onDelete={handleDelete}
                onNavigateToTransactions={navigateToTransactions}
                applySuggestion={applySuggestion}
                showSuggestion={showSuggestion}
                busyId={busyId}
                formatCurrency={formatCurrency}
                t={t}
              />
            ))
          )}
        </div>

        {/* Special budgets — discrete event/trip envelopes (NYC Trip etc).
            Their transactions are excluded from the category budget grid
            above and counted here instead. */}
        <SpecialBudgetsSection
          period={period}
          specialBudgets={specialBudgets}
          transactions={transactions}
          savingsGoals={savingsGoals}
          showClosed={showClosedSpecial}
          onToggleShowClosed={() => setShowClosedSpecial((v) => !v)}
          onNew={() => setNewSpecialOpen(true)}
          onOpen={(b) => setOpenSpecialBudget(b)}
          formatCurrency={formatCurrency}
          t={t}
        />

        {/* Categories with nothing to cap — no budget, and no spending on
            record. A budget card for one would be a permanent empty row, but
            they still have to be reachable: this page is where categories are
            renamed and deleted, so filtering them off it entirely would
            strand them. */}
        {otherCategories.length > 0 && (
          <div className="ft-card p-4 flex flex-col gap-3">
            <div>
              <div className="text-sm font-semibold">
                {t("categories.otherSection", { defaultValue: "Not budgeted" })}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("categories.otherSectionDesc", {
                  defaultValue:
                    "Nothing has been spent on these, so there is no budget to track. Give one a budget, or spend on it, and it joins the cards above.",
                })}
              </p>
            </div>
            <div className="flex flex-col divide-y">
              {otherCategories.map((category) => (
                <div key={category.id} className="flex items-center gap-2.5 py-2">
                  <CategoryIcon icon={category.icon} color={category.color} size={20} />
                  <span className="text-sm truncate flex-1 min-w-0">{category.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => startEditingCategory(category)}
                  >
                    {t("common.edit", { defaultValue: "Edit" })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive"
                    onClick={() => handleDelete(category.id)}
                  >
                    {t("common.delete", { defaultValue: "Delete" })}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals + sheets */}
      <SpecialBudgetModal
        isOpen={newSpecialOpen}
        onClose={() => setNewSpecialOpen(false)}
      />
      <SpecialBudgetDetailModal
        isOpen={!!openSpecialBudget}
        onClose={() => setOpenSpecialBudget(null)}
        budget={openSpecialBudget}
      />
      <BudgetEditSheet
        stat={editingBudgetStat}
        open={editBudgetOpen}
        onOpenChange={setEditBudgetOpen}
        onSave={saveBudget}
        formatCurrency={formatCurrency}
      />
      <EditCategoryModal
        open={editCategoryOpen}
        onOpenChange={setEditCategoryOpen}
        category={editingCategory}
        onSaved={() => {
          refetch();
          setEditCategoryOpen(false);
        }}
      />
      <NewCategoryModal
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o);
        }}
        onCreated={() => {
          refetch();
          setNewOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("categories.confirmDelete", {
          defaultValue: "Delete this category?",
        })}
        description={t("categories.confirmDeleteDesc", {
          defaultValue:
            "All transactions in this category will become uncategorised. This cannot be undone.",
        })}
        confirmText={t("common.delete", { defaultValue: "Delete" })}
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  );
};

export default Budget;

// =============================================================================
// Special budgets section — discrete event/trip envelopes on the Budget page
// =============================================================================

interface SpecialBudgetsSectionProps {
  period: PeriodSpec;
  specialBudgets: SpecialBudget[];
  transactions: Transaction[];
  savingsGoals: { id: string; name: string }[];
  showClosed: boolean;
  onToggleShowClosed: () => void;
  onNew: () => void;
  onOpen: (b: SpecialBudget) => void;
  formatCurrency: (n: number) => string;
  t: ReturnType<typeof useTranslation>["t"];
}

function SpecialBudgetsSection({
  period,
  specialBudgets,
  transactions,
  savingsGoals,
  showClosed,
  onToggleShowClosed,
  onNew,
  onOpen,
  formatCurrency,
  t,
}: SpecialBudgetsSectionProps) {
  // Per-budget data carries lifetime spend (the section's metric of
  // record: a trip's burn-rate is meaningless if clipped to the period).
  // The selected period only filters which closed envelopes show by
  // default — active/planned always render.
  const today = useMemo(() => new Date(), [period.to]); // refresh today reference when period changes

  const visible = useMemo(() => {
    const active = specialBudgets.filter((b) => b.status !== "closed");
    const closed = specialBudgets.filter((b) => b.status === "closed");
    return showClosed ? [...active, ...closed] : active;
  }, [specialBudgets, showClosed]);

  const closedCount = useMemo(
    () => specialBudgets.filter((b) => b.status === "closed").length,
    [specialBudgets]
  );

  const goalNameById = useMemo(() => {
    const m = new Map<string, string>();
    savingsGoals.forEach((g) => m.set(g.id, g.name));
    return m;
  }, [savingsGoals]);

  // Aggregate strip: "N en cours · X engagés · sur Y provisionnés".
  const active = useMemo(
    () => specialBudgets.filter((b) => b.status !== "closed"),
    [specialBudgets]
  );
  const aggregate = useMemo(() => {
    let committed = 0;
    let engaged = 0;
    for (const b of active) {
      committed += b.total_budget || 0;
      const c = computeSpecialBudget(b, transactions, today);
      engaged += c.spent;
    }
    const pct = committed > 0 ? Math.min(100, (engaged / committed) * 100) : 0;
    return { committed, engaged, pct };
  }, [active, transactions, today]);

  return (
    <section className="mt-8 pt-6 border-t border-line">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
            <WalletIcon className="h-3 w-3" />
            {t("specialBudgets.eyebrow", { defaultValue: "Envelopes" })}
          </div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight mt-1">
            {t("specialBudgets.sectionTitle", { defaultValue: "Special budgets" })}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-[56ch]">
            {t("specialBudgets.sectionSubtitle", {
              defaultValue:
                "Trips & events — linked transactions stay out of category budgets and are tracked here.",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {closedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={onToggleShowClosed}
            >
              {showClosed
                ? t("specialBudgets.hideClosed", { defaultValue: "Hide closed" })
                : t("specialBudgets.showClosed", {
                    defaultValue: "Closed ({{n}})",
                    n: closedCount,
                  })}
            </Button>
          )}
          <Button size="sm" className="h-8 px-3 text-xs gap-1.5" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" />
            {t("specialBudgets.add", { defaultValue: "New" })}
          </Button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-muted-foreground bg-bg-subtle/60 border border-line rounded-lg px-3 py-2 mb-3">
          <span className="whitespace-nowrap">
            <span className="font-mono font-semibold text-foreground">{active.length}</span>{" "}
            {t("specialBudgets.aggOngoing", { defaultValue: "ongoing" })}
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="whitespace-nowrap">
            <span className="font-mono font-semibold text-foreground">{formatCurrency(aggregate.engaged)}</span>{" "}
            {t("specialBudgets.aggEngaged", { defaultValue: "engaged" })}
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="whitespace-nowrap">
            {t("specialBudgets.aggOf", { defaultValue: "of" })}{" "}
            <span className="font-mono">{formatCurrency(aggregate.committed)}</span>{" "}
            {t("specialBudgets.aggCommitted", { defaultValue: "committed" })}
          </span>
          <div className="flex-1 min-w-[80px] h-1.5 rounded-full bg-bg-subtle overflow-hidden">
            <div
              className="h-full bg-foreground/80"
              style={{ width: `${aggregate.pct}%` }}
            />
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="ft-card p-8 flex flex-col items-center justify-center gap-2 text-center">
          <div className="h-12 w-12 rounded-2xl bg-bg-subtle text-muted-foreground grid place-items-center">
            <PlaneEmptyIcon className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold">
            {t("specialBudgets.emptyTitle", { defaultValue: "No active special budgets" })}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("specialBudgets.empty", {
              defaultValue: "Create an envelope for an upcoming trip or event.",
            })}
          </div>
          <Button size="sm" className="h-8 px-3 text-xs gap-1.5 mt-1" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" />
            {t("specialBudgets.add", { defaultValue: "New" })}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {visible.map((b) => (
            <SpecialBudgetCard
              key={b.id}
              budget={b}
              transactions={transactions}
              today={today}
              goalName={b.savings_goal_id ? goalNameById.get(b.savings_goal_id) ?? null : null}
              formatCurrency={formatCurrency}
              onOpen={onOpen}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Trip-aware envelope card. Shows: status pill, name + range, money row,
// pace bar with today-tick scaled to the trip's own timeline + over-budget
// hatch, burn-rate guidance line ("X €/day · Y days left"), remaining,
// "hot pace" indicator, and an optional linked-goal footer.
// =============================================================================

interface SpecialBudgetCardProps {
  budget: SpecialBudget;
  transactions: Transaction[];
  today: Date;
  goalName: string | null;
  formatCurrency: (n: number) => string;
  onOpen: (b: SpecialBudget) => void;
  t: ReturnType<typeof useTranslation>["t"];
}

function SpecialBudgetCard({
  budget,
  transactions,
  today,
  goalName,
  formatCurrency,
  onOpen,
  t,
}: SpecialBudgetCardProps) {
  const { i18n } = useTranslation();
  const locale: "fr" | "en" = i18n.language === "fr" ? "fr" : "en";

  const c = useMemo(
    () => computeSpecialBudget(budget, transactions, today),
    [budget, transactions, today]
  );
  const palette = paletteForColor(budget.color);
  const Icon = getSpecialBudgetIcon(budget.icon);
  const muted = budget.status === "closed" || budget.status === "planned";
  const fillPct = Math.min(c.ratio, 1) * 100;
  // When over, split the bar in two: solid portion = share of spend that
  // stayed within budget; hatched portion = the overshoot share. Both sit
  // inside the track so the visual reads cleanly (no floating stub past
  // the right edge).
  const withinPct = c.over && c.ratio > 0 ? (1 / c.ratio) * 100 : 0;
  const showTick = c.elapsedFrac != null && !c.over;
  const statusCls = SPECIAL_BUDGET_STATUS_META[budget.status].cls;

  const guidance = useMemo(() => {
    if (budget.status === "closed") {
      return c.over
        ? t("specialBudgets.overBy", {
            defaultValue: "{{amt}} over",
            amt: formatCurrency(Math.abs(c.remaining)),
          })
        : t("specialBudgets.unspent", {
            defaultValue: "{{amt}} unspent",
            amt: formatCurrency(c.remaining),
          });
    }
    if (budget.status === "planned") {
      if (c.startsIn != null && budget.start_date) {
        const startDay = formatSpecialBudgetRange(budget.start_date, null, locale)
          .replace(/^(depuis le |since )/i, "")
          .trim();
        return t("specialBudgets.startsIn", {
          defaultValue: "In {{n}}d · {{date}}",
          n: c.startsIn,
          date: startDay,
        });
      }
      return t("specialBudgets.upcoming", { defaultValue: "Upcoming" });
    }
    if (c.over) {
      return t("specialBudgets.overshoot", {
        defaultValue: "{{amt}} overshoot",
        amt: formatCurrency(Math.abs(c.remaining)),
      });
    }
    if (c.daysLeft != null && budget.end_date) {
      if (c.daysLeft <= 0) {
        return t("specialBudgets.lastDay", { defaultValue: "Last day" });
      }
      const perDay = Math.round(c.remaining / Math.max(1, c.daysLeft));
      return t("specialBudgets.burnRate", {
        defaultValue: "{{amt}}/d · {{n}}d left",
        amt: formatCurrency(perDay),
        n: c.daysLeft,
      });
    }
    if (budget.start_date) {
      return formatSpecialBudgetRange(budget.start_date, null, locale);
    }
    return null;
  }, [budget, c, formatCurrency, locale, t]);

  return (
    <button
      type="button"
      onClick={() => onOpen(budget)}
      className={cn(
        "relative overflow-hidden bg-card border border-line rounded-2xl text-left p-4 sm:p-[18px] flex flex-col gap-3 transition-all",
        "hover:border-line-strong hover:shadow-sm",
        c.over && "border-neg/40",
        budget.status === "closed" && "opacity-80"
      )}
    >
      {/* Colored edge */}
      <span
        className="absolute top-0 left-0 bottom-0 w-[3px]"
        style={{ background: palette.color }}
        aria-hidden
      />

      {/* Top row: icon + identity + status pill */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex-shrink-0 grid place-items-center"
          style={{ background: palette.tint, color: palette.ink }}
        >
          <Icon className="h-[21px] w-[21px]" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-tight truncate">{budget.name}</div>
          <div className="inline-flex items-center gap-1.5 mt-0.5 text-[11.5px] text-muted-foreground font-mono">
            <CalendarIcon className="h-3 w-3 opacity-80" />
            {formatSpecialBudgetRange(budget.start_date, budget.end_date, locale)}
          </div>
        </div>
        <span
          className={cn(
            "text-[10.5px] uppercase tracking-[0.05em] font-semibold px-2 py-[3px] rounded-full whitespace-nowrap",
            statusCls === "active" && "bg-pos/12 text-pos",
            statusCls === "planned" && "bg-primary/12 text-primary",
            statusCls === "closed" && "bg-bg-subtle text-muted-foreground border border-line"
          )}
        >
          {t(`specialBudgets.status${budget.status[0].toUpperCase()}${budget.status.slice(1)}`, {
            defaultValue: budget.status,
          })}
        </span>
      </div>

      {/* Money row */}
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-[20px] font-bold tracking-tight",
            c.over && "text-neg"
          )}
        >
          {formatCurrency(c.spent)}
        </span>
        <span className="text-[12.5px] text-muted-foreground font-mono">
          / {formatCurrency(c.total)}
        </span>
      </div>

      {/* Pace bar with today tick + over hatch */}
      <div className="relative h-[9px] rounded-full bg-bg-subtle overflow-hidden">
        {c.over ? (
          <>
            <div
              className="absolute left-0 top-0 bottom-0"
              style={{ width: `${withinPct}%`, background: "hsl(var(--neg))" }}
            />
            <div
              className="absolute top-0 bottom-0 right-0"
              style={{
                left: `${withinPct}%`,
                background:
                  "repeating-linear-gradient(135deg, hsl(var(--neg)) 0 4px, hsl(var(--neg) / 0.32) 4px 8px)",
              }}
              aria-hidden
            />
          </>
        ) : (
          <div
            className="absolute left-0 top-0 bottom-0 transition-all"
            style={{
              width: `${fillPct}%`,
              background: palette.color,
              opacity: muted ? 0.55 : 1,
            }}
          />
        )}
        {showTick && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-foreground/85"
            style={{ left: `${Math.min(c.elapsedFrac ?? 0, 1) * 100}%` }}
            title={t("budget.today", { defaultValue: "Today" })}
            aria-hidden
          />
        )}
      </div>

      {/* Meta row: guidance + remaining */}
      <div className="flex items-center justify-between gap-3 text-[11.5px] text-muted-foreground">
        <span className="font-mono truncate flex-1 min-w-0">
          {guidance}
          {c.hot && (
            <span className="text-warning font-semibold ml-1.5">
              · {t("specialBudgets.hotPace", { defaultValue: "high pace" })}
            </span>
          )}
        </span>
        <span
          className={cn(
            "font-mono font-semibold whitespace-nowrap flex-shrink-0",
            c.remaining < 0 && "text-neg"
          )}
        >
          {c.remaining >= 0 ? (
            <>
              {formatCurrency(c.remaining)}{" "}
              <span className="text-muted-foreground font-medium">
                {t("specialBudgets.remainingShort", { defaultValue: "left" })}
              </span>
            </>
          ) : (
            <>
              −{formatCurrency(Math.abs(c.remaining))}{" "}
              <span className="text-muted-foreground font-medium">
                {t("specialBudgets.overShort", { defaultValue: "over" })}
              </span>
            </>
          )}
        </span>
      </div>

      {/* Optional savings-goal footer */}
      {goalName && (
        <div className="flex items-center gap-2 text-[11.5px] pt-2 border-t border-line">
          <span
            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: palette.color }}
            aria-hidden
          />
          <span className="font-medium truncate flex-1 min-w-0">
            {t("specialBudgets.linkedToGoal", { defaultValue: "Goal: {{n}}", n: goalName })}
          </span>
        </div>
      )}
    </button>
  );
}
