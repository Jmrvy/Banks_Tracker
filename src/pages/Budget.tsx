import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Minus,
  Plus,
  Search,
  Sparkles,
  Target,
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
import {
  CategoryMonthsChart,
  type CategoryMonth,
} from "@/components/budget/CategoryMonthsChart";
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
import { usePrivacy } from "@/contexts/PrivacyContext";
import { SpecialBudgetModal } from "@/components/SpecialBudgetModal";
import { SpecialBudgetDetailModal } from "@/components/SpecialBudgetDetailModal";
import {
  computeSpecialBudget,
  formatSpecialBudgetRange,
  getSpecialBudgetIcon,
  paletteForColor,
  SPECIAL_BUDGET_STATUS_META,
} from "@/lib/specialBudgetUtils";
import { Plane as PlaneEmptyIcon } from "lucide-react";
import { parseLocalDate } from "@/lib/dateUtils";
import {
  advanceDate,
  forEachFutureCharge,
  type ScheduleContext,
} from "@/lib/scheduledCharges";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errorMessage";
import { computeCategoryNets } from "@/lib/reportsEngine";
import { fr as frLocale, enUS as enLocale } from "date-fns/locale";
import {
  addDays,
  addMonths,
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
  /** How many transactions landed on the category in the period. */
  txCount: number;
  /**
   * Trailing six calendar months of net spend, newest first — the same
   * series `historyByCategory` already built for `monthlyAvg`, carried
   * through so the expanded panel can chart it without recomputing.
   */
  history: number[];
  /**
   * Six months back to three ahead, oldest first: settled spend, the current
   * month split at today, and what the schedules have already committed.
   */
  months: CategoryMonth[];
}

type MonthKind = CategoryMonth["kind"];

interface PeriodBuckets {
  count: number;
  bucketOf: (d: Date) => number;
}

/**
 * A formatted amount that honours privacy mode.
 *
 * This page had no privacy support at all: every cap, every spend and every
 * remaining figure rendered in the clear with the mask switched on, which is
 * the one screen where the mask most obviously matters. Rather than thread a
 * `masked` prop through the card, the sheet and the special-budget section,
 * the component reads the context itself — the mask is a property of the
 * figure, not of whoever happens to be rendering it.
 */
function Money({ v, className }: { v: number; className?: string }) {
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  return (
    <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv", className)}>
      {formatCurrency(v)}
    </span>
  );
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
 * Pace bar — the design's one bar primitive: a `--bg-sunk` track at 6px
 * (9px with `tall`), a fill clamped to the track, and a 1.5px rule at the
 * elapsed share of the period so ahead-of-pace reads without any text.
 *
 * The fill only spends a status colour on a row that is actually in
 * trouble: `--neg` when over, `--warn` when close, otherwise the category's
 * own colour, so a healthy list reads as a colour-coded ledger rather than
 * a wall of green.
 */
function PaceBar({
  used,
  budget,
  status,
  elapsedFraction,
  color,
  tall = false,
  showTick = true,
}: {
  used: number;
  budget: number;
  status: Status;
  elapsedFraction: number;
  color?: string;
  tall?: boolean;
  showTick?: boolean;
}) {
  const { t } = useTranslation();
  const ratio = budget > 0 ? used / budget : 0;
  const fillPct = Math.min(Math.max(ratio, 0), 1) * 100;
  const fill =
    status === "over"
      ? "hsl(var(--neg))"
      : status === "warn"
      ? "hsl(var(--warn))"
      : color || "hsl(var(--primary))";
  const elapsedPctLabel = Math.round(Math.min(elapsedFraction, 1) * 100);
  return (
    <div className={cn("ft-progress-track w-full", tall && "tall")}>
      <span className="ft-progress-fill" style={{ width: `${fillPct}%`, background: fill }} />
      {showTick && budget > 0 && (
        <span
          // Today marker. The position reflects the elapsed share of
          // the period; comparing the fill's right edge to this tick
          // tells the user whether they're ahead of or behind pace.
          className="ft-progress-mark cursor-help"
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
 * Cumulative spend-vs-budget trend chart.
 *
 * Aggregates the per-category bucket series into a single cumulative spend
 * curve. Renders, exactly as the design's pace chart does:
 *  - five `--grid` rules across the plot
 *  - a dashed `--fg-dim` horizontal "budget" reference line
 *  - an accent area fill at 16 % under the actual curve
 *  - the actual cumulative line in accent
 *  - the projection continuing from today as a softer accent dash
 *  - a hollow end marker on the card surface at today's cumulative
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
  const { isPrivacyMode } = usePrivacy();
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
      className="block w-full overflow-visible"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height: 168 }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const gy = padT + f * (H - padT - padB);
        return (
          <line
            key={f}
            x1={padL}
            x2={W - padR}
            y1={gy}
            y2={gy}
            stroke="hsl(var(--grid))"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {totalBudget > 0 && (
        <>
          <line
            x1={padL}
            x2={W - padR}
            y1={budgetY}
            y2={budgetY}
            stroke="hsl(var(--fg-dim))"
            strokeWidth={1.4}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={W - padR}
            y={Math.max(padT + 8, budgetY - 6)}
            textAnchor="end"
            fontSize={10}
            fontFamily="Geist Mono, ui-monospace, monospace"
            fill="hsl(var(--fg-dim))"
            className={cn(isPrivacyMode && "ft-priv")}
          >
            {formatCurrency(totalBudget)}
          </text>
        </>
      )}
      {areaPath && <path d={areaPath} fill="hsl(var(--primary))" opacity={0.16} />}
      {projPath && (
        <path
          d={projPath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeDasharray="5 4"
          opacity={0.55}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {actualPath && (
        <path
          d={actualPath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle
        cx={paceX}
        cy={y(lastA)}
        r={3.2}
        fill="hsl(var(--card))"
        stroke="hsl(var(--primary))"
        strokeWidth={2.2}
        vectorEffect="non-scaling-stroke"
      />
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
  /** Inline cap editor in the expanded panel — the same write as the sheet. */
  onSaveBudget: (categoryId: string, monthlyBudget: number) => Promise<void>;
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
  onSaveBudget,
  busyId,
  formatCurrency,
  t,
}: BudgetCardProps) {
  const { isPrivacyMode } = usePrivacy();
  const used = stat.spent + (includeProjected ? stat.projected : 0);
  const budget = stat.periodBudget;
  const remaining =
    budget != null ? budget - used : null;
  const canApplySuggestion = showSuggestion(stat);

  return (
    <div className="transition-colors">
      {/* One row per category, the way the design tabulates them: identity,
          consumption, spent, remaining. The whole row is the disclosure —
          the chevron beside the name is the only affordance. Columns past
          the first two drop out at 1180px, where the row becomes
          icon / name / remaining. */}
      <div
        className="ft-bud cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          // Only the row itself — never a key pressed on the nested "Set"
          // control, which would otherwise activate both.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <CategoryIcon color={stat.category.color} icon={stat.category.icon} size={30} />

        <div className="min-w-0">
          <div className="ft-row-title flex items-center gap-2 min-w-0">
            <span className="truncate">{stat.category.name}</span>
            <ChevronDown
              className={cn(
                "h-[13px] w-[13px] flex-shrink-0 text-fg-dim transition-transform",
                expanded && "rotate-180"
              )}
            />
          </div>
          <div className="ft-row-sub truncate">
            {t("budget.opCount", {
              count: stat.txCount,
              defaultValue: `${stat.txCount} operations`,
            })}
            {" · "}
            {t("budget.avgShort", { defaultValue: "avg." })}{" "}
            <Money v={stat.monthlyAvg} />/{t("budget.month", { defaultValue: "mo" })}
          </div>
        </div>

        {/* Consumption */}
        <div className="ft-hide-sm min-w-0">
          {budget != null ? (
            <>
              <PaceBar
                used={used}
                budget={budget}
                status={stat.status}
                elapsedFraction={period.elapsedFraction}
                color={stat.category.color}
              />
              <div className="flex items-center justify-between gap-2 text-[11px] text-fg-dim font-mono mt-[5px]">
                <span>
                  {Math.round((stat.pct ?? 0) * 100)} %{" "}
                  {t("budget.ofBudget", { defaultValue: "of budget" })}
                </span>
                {stat.projected > 0 && (
                  <span className="whitespace-nowrap">
                    {t("budget.projectedShort", { defaultValue: "projected" })}{" "}
                    <Money v={stat.spent + stat.projected} />
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="ft-tag">
              {t("budget.statusNoBudget", { defaultValue: "No budget" })}
            </span>
          )}
        </div>

        {/* Spent */}
        <div className="ft-hide-sm text-right min-w-0">
          <div className="text-[13.5px] font-medium truncate">
            <Money v={used} />
          </div>
          <div className="text-[11px] text-fg-dim truncate">
            {budget != null ? (
              <>
                {t("budget.outOf", { defaultValue: "of" })} <Money v={budget} />
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* Remaining — or the way to give the category a budget at all.
            The colour and the "over" label carry the sign; the figure is
            printed absolute, as the design prints it. */}
        <div className="text-right min-w-0">
          {remaining != null ? (
            <>
              <div
                className={cn(
                  "text-[13.5px] font-medium truncate",
                  remaining < 0 && "text-neg"
                )}
              >
                <Money v={Math.abs(remaining)} />
              </div>
              <div className="text-[11px] text-fg-dim truncate">
                {remaining < 0
                  ? t("budget.over", { defaultValue: "over" })
                  : t("budget.remaining", { defaultValue: "left" })}
              </div>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEditBudget(stat);
              }}
              className="h-[29px] px-2.5 text-xs rounded-[9px] border-line-strong bg-bg-elev"
            >
              {t("budget.setBudget", { defaultValue: "Set" })}
            </Button>
          )}
        </div>
      </div>

      {/* Below the collapse breakpoint the consumption column is hidden, so
          the bar moves under the row rather than disappearing with it. */}
      {budget != null && (
        <div className="wide:hidden px-[22px] pb-3 -mt-1">
          <PaceBar
            used={used}
            budget={budget}
            status={stat.status}
            elapsedFraction={period.elapsedFraction}
            color={stat.category.color}
          />
        </div>
      )}

      {/* Expanded detail. The monthly chart takes the full width of the
          panel — ten bars in a third of it were unreadable — and the two
          things you act on afterwards, the biggest spends and the cap, sit
          under it as a pair. */}
      {expanded && (
        <div className="bg-bg-subtle border-t border-line-soft pt-1 pb-5 pl-[22px] pr-[22px] wide:pl-[68px]">
          <div className="mt-3.5">
            <div className="ft-eyebrow mb-2">
              {t("budget.monthByMonth", { defaultValue: "Month by month" })}
            </div>
            <CategoryMonthsChart
              months={stat.months}
              cap={stat.category.budget != null ? Number(stat.category.budget) : null}
              color={stat.category.color}
              formatCurrency={formatCurrency}
              masked={isPrivacyMode}
              t={t}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mt-4">
            {/* Biggest spends of the period. */}
            <div>
              <div className="ft-eyebrow mb-2">
                {t("budget.topSpends", { defaultValue: "Top spends" })}
              </div>
              <div className="flex flex-col gap-[7px]">
                {stat.topDrivers.slice(0, 3).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 text-[12.5px]"
                  >
                    <span className="truncate">{d.description}</span>
                    <Money v={d.amount} className="whitespace-nowrap" />
                  </div>
                ))}
                {stat.topDrivers.length === 0 && (
                  <span className="text-[12.5px] text-fg-dim">
                    {t("budget.nothingThisPeriod", {
                      defaultValue: "Nothing in the period shown.",
                    })}
                  </span>
                )}
              </div>
            </div>

            {/* Cap editor — the design edits the budget in place rather than
                sending the user to a side sheet. */}
            <div>
              <div className="ft-eyebrow mb-2">
                {t("budget.adjustCap", { defaultValue: "Adjust the cap" })}
              </div>
              <CapEditor
                key={stat.category.id}
                initial={
                  stat.category.budget != null
                    ? Number(stat.category.budget)
                    : stat.suggested || 0
                }
                onSave={(v) => onSaveBudget(stat.category.id, v)}
                t={t}
              />
              {canApplySuggestion && (
                <div className="text-[11.5px] text-fg-dim mt-[7px]">
                  {t("budget.suggestedFromHistory", {
                    defaultValue: "Suggested from history:",
                  })}{" "}
                  <Money v={stat.suggested} className="font-semibold" />
                  {" · "}
                  <button
                    type="button"
                    className="ft-link disabled:opacity-50"
                    disabled={busyId === stat.category.id}
                    onClick={() => applySuggestion(stat.category.id, stat.suggested)}
                  >
                    {t("budget.applyShort", { defaultValue: "apply" })}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* What was taken off, when anything was. Otherwise `spent` is a
              lone figure and there is no way to tell a category that cost
              540 from one that cost 700 and got 160 back. */}
          {(stat.refunded > 0 || stat.offsetIncome > 0) && (
            <div className="rounded-lg bg-bg-elev border border-line-soft px-3 py-2 flex flex-col gap-1 mt-3.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {t("budget.breakdownGross", { defaultValue: "Charged" })}
                </span>
                <Money v={stat.gross} />
              </div>
              {stat.refunded > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {t("budget.breakdownRefunded", { defaultValue: "Refunded" })}
                  </span>
                  <Money v={stat.refunded} className="text-pos before:content-['−']" />
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
                  <Money v={stat.offsetIncome} className="text-pos before:content-['−']" />
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] font-medium border-t border-line/60 pt-1 mt-0.5">
                <span>{t("budget.breakdownNet", { defaultValue: "Counted against budget" })}</span>
                <Money v={stat.spent} />
              </div>
            </div>
          )}
          {/* One quiet trailing line rather than a four-button bar. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3.5 text-[11.5px]">
            <button
              type="button"
              className="ft-link"
              onClick={() => onNavigateToTransactions(stat.category.id)}
            >
              {t("budget.viewTransactions", { defaultValue: "View transactions" })}
            </button>
            <button
              type="button"
              className="text-fg-dim hover:text-foreground transition-colors"
              onClick={() => onEditBudget(stat)}
            >
              {t("budget.editBudget", { defaultValue: "Edit budget" })}
            </button>
            <button
              type="button"
              className="text-fg-dim hover:text-foreground transition-colors"
              onClick={() => onEditCategory(stat.category)}
            >
              {t("budget.editCategory", { defaultValue: "Edit category" })}
            </button>
            <button
              type="button"
              className="text-fg-dim hover:text-neg transition-colors"
              onClick={() => onDelete(stat.category.id)}
            >
              {t("common.delete", { defaultValue: "Delete" })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline cap editor. Mounted fresh each time a row is expanded (keyed on the
 * category), so it always opens on the row's current cap without needing to
 * mirror it in an effect.
 */
function CapEditor({
  initial,
  onSave,
  t,
}: {
  initial: number;
  onSave: (monthlyBudget: number) => Promise<void>;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const [val, setVal] = useState<string>(String(initial));
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        aria-label={t("budget.monthlyBudget", { defaultValue: "Monthly budget" })}
        className="h-[34px] rounded-md border-line-strong bg-bg-elev text-[13px] tabular-nums"
      />
      <Button
        size="sm"
        disabled={saving}
        className="h-[29px] px-2.5 text-xs rounded-[9px] flex-shrink-0"
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(Math.max(0, Number(val) || 0));
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving
          ? t("common.saving", { defaultValue: "Saving…" })
          : t("common.save", { defaultValue: "Save" })}
      </Button>
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
  const { isPrivacyMode } = usePrivacy();
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
            ? "max-h-[90vh] border-t border-line"
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
                {delta > 0 ? "▲" : "▼"} <Money v={Math.abs(delta)} />{" "}
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
                <div className={cn("text-sm font-semibold", isPrivacyMode && "ft-priv")}>
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
                value={<Money v={stat.spent} />}
              />
              <ContextCell
                label={t("budget.statProjected", { defaultValue: "Projected" })}
                value={<Money v={stat.projected} />}
              />
              <ContextCell
                label={t("budget.statAvg", { defaultValue: "Avg / mo" })}
                value={<Money v={stat.monthlyAvg} />}
              />
              <ContextCell
                label={t("budget.statPrev", { defaultValue: "Prev period" })}
                value={<Money v={stat.prevSpent} />}
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

function ContextCell({ label, value }: { label: string; value: ReactNode }) {
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

/**
 * Status count — the design's tinted `.tag`, not a bordered control: the
 * tone itself carries the meaning, so there is no dot and no border. It
 * doubles as the quick filter for that status.
 */
function AttentionPip({
  tone,
  count,
  label,
  onClick,
  active,
}: {
  tone: "" | "neg" | "warn";
  count: number;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("ft-tag", tone, active && "ring-1 ring-inset ring-foreground/25")}
    >
      {`${count} ${label}`}
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
  const { t, i18n } = useTranslation();
  const { isPrivacyMode } = usePrivacy();
  const dateLocale = i18n.language === "fr" ? frLocale : enLocale;
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

  // --- projection ---------------------------------------------------------
  // The period's share of what is still to come, bucketed onto the period's
  // own x-axis. The rule-walking lives in `forEachFutureCharge` so that this
  // and the per-category monthly chart cannot drift apart about when a plan
  // or a debt stops.
  const forecastCtx = useMemo(
    () => ({ recurringTransactions, installmentPayments, debts, scheduledDebtPayments }),
    [recurringTransactions, installmentPayments, debts, scheduledDebtPayments]
  );

  const projectedByCategory = useMemo(() => {
    type Entry = { total: number; series: number[] };
    const map = new Map<string, Entry>();
    if (!includeProjected || period.to < today) return map;

    const from = period.from > today ? period.from : today;
    forEachFutureCharge(forecastCtx, from, period.to, (categoryId, date, amount) => {
      let entry = map.get(categoryId);
      if (!entry) {
        entry = { total: 0, series: new Array(period.buckets.count).fill(0) };
        map.set(categoryId, entry);
      }
      entry.total += amount;
      const idx = period.buckets.bucketOf(date);
      if (idx >= 0) entry.series[idx] += amount;
    });
    return map;
  }, [forecastCtx, includeProjected, period.from, period.to, period.buckets, today]);

  // --- monthly series ----------------------------------------------------
  // One calendar-month series per category, running from six months back to
  // three months ahead, and the source of both the expanded panel's chart
  // and the trailing history the suggestion is built from.
  //
  // Deliberately independent of the selected period: the panel answers "what
  // does this category normally cost, and what is already committed", which
  // does not change because the user is looking at Q1. It is also
  // independent of the `includeProjected` toggle — that decides whether
  // projections count toward the period's figures, while a bar labelled as
  // scheduled is making no claim about the period at all.
  const monthlySeries = useMemo(() => {
    const TRAIL = 6;
    const AHEAD = 3;

    const months: { from: Date; to: Date; key: string; label: string; kind: MonthKind }[] = [];
    for (let i = TRAIL; i >= -AHEAD; i--) {
      const ref = subMonths(today, i);
      months.push({
        from: startOfMonth(ref),
        to: endOfMonth(ref),
        key: format(ref, "yyyy-MM"),
        label: format(ref, "MMM", { locale: dateLocale }),
        kind: i > 0 ? "past" : i === 0 ? "current" : "future",
      });
    }

    const windowFrom = months[0].from;
    const windowTo = months[months.length - 1].to;
    const indexOfMonth = new Map(months.map((m, i) => [m.key, i]));
    const monthKeyOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const blank = () => ({
      actual: new Array(months.length).fill(0),
      forecast: new Array(months.length).fill(0),
    });
    const byCat = new Map<string, ReturnType<typeof blank>>();
    const entry = (id: string) => {
      let e = byCat.get(id);
      if (!e) {
        e = blank();
        byCat.set(id, e);
      }
      return e;
    };

    for (const tx of transactions) {
      if (!tx.category?.id) continue;
      const net = categorySpend(tx);
      if (net === 0) continue;
      const d = dateOf(tx);
      if (d < windowFrom || d > windowTo) continue;
      const idx = indexOfMonth.get(monthKeyOf(d));
      if (idx === undefined) continue;
      entry(tx.category.id).actual[idx] += net;
    }

    // From today, so the current month's bar splits at the present: settled
    // below, still-to-come hatched above. Starting at the 1st would double
    // every charge already paid this month.
    forEachFutureCharge(forecastCtx, today, windowTo, (categoryId, date, amount) => {
      const idx = indexOfMonth.get(monthKeyOf(date));
      if (idx === undefined) return;
      entry(categoryId).forecast[idx] += amount;
    });

    const out = new Map<string, CategoryMonth[]>();
    for (const cat of categories) {
      const e = byCat.get(cat.id);
      out.set(
        cat.id,
        months.map((m, i) => ({
          key: m.key,
          label: m.label,
          kind: m.kind,
          actual: e?.actual[i] ?? 0,
          forecast: e?.forecast[i] ?? 0,
        })),
      );
    }
    return { months: out, trail: TRAIL };
  }, [transactions, categories, dateOf, forecastCtx, today, dateLocale]);

  // The trailing six complete months, newest first — the shape `monthlyAvg`,
  // `p75` and the suggested cap have always been fed. Sliced off the series
  // above rather than scanned again, so the chart and the suggestion can
  // never disagree about what a month cost.
  const historyByCategory = useMemo(() => {
    const out = new Map<string, number[]>();
    for (const [id, series] of monthlySeries.months) {
      out.set(
        id,
        series
          .slice(0, monthlySeries.trail)
          .map((m) => m.actual)
          .reverse(),
      );
    }
    return out;
  }, [monthlySeries]);

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

      const months = monthlySeries.months.get(category.id) ?? [];
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
        txCount: driversInPeriod.length,
        history,
        months,
      };
    });
  }, [
    categories,
    transactions,
    dateOf,
    period,
    periodNets,
    projectedByCategory,
    historyByCategory,
    monthlySeries,
    today,
  ]);

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

  // All four options always render with their counts, so the control does
  // not reflow as data changes.
  const filterChips: { id: StatusFilter; label: string; n: number }[] = [
    { id: "all" as StatusFilter, label: t("budget.filterAll", { defaultValue: "All" }), n: stats.length },
    { id: "over" as StatusFilter, label: t("budget.filterOver", { defaultValue: "Over" }), n: totals.overCount },
    { id: "warn" as StatusFilter, label: t("budget.filterWarn", { defaultValue: "Close" }), n: totals.warnCount },
    {
      id: "noBudget" as StatusFilter,
      label: t("budget.filterNoBudget", { defaultValue: "No budget" }),
      n: totals.noBudgetCount,
    },
  ];

  // Named, with their suggested caps, so "Auto-budget" is reviewable.
  const suggestablePreview = stats
    .filter((s) => s.status === "noBudget" && s.suggested > 0)
    .map((s) => `${s.category.name} ${formatCurrency(s.suggested)}`)
    .join(" · ");

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
          {/* The design carries the period control in the page head, beside
              the page actions — there is no period card. */}
          <div className="flex flex-wrap items-center gap-[9px]">
            <Segmented
              label={t("budget.periodAria", { defaultValue: "Period" })}
              value={periodKey}
              onChange={(v) => setPeriodKey(v as PeriodKey)}
              options={[
                { value: "1m", label: t("budget.p1m", { defaultValue: "1M" }) },
                { value: "3m", label: t("budget.p3m", { defaultValue: "3M" }) },
                { value: "6m", label: t("budget.p6m", { defaultValue: "6M" }) },
                { value: "ytd", label: t("budget.pYtd", { defaultValue: "YTD" }) },
                { value: "1y", label: t("budget.p1y", { defaultValue: "1Y" }) },
                { value: "custom", label: t("budget.pCustom", { defaultValue: "Custom" }) },
              ]}
            />
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

        {/* Month / year / custom-range pickers — features the design's
            prototype stubbed out. Demoted to a borderless strip so the
            page's first surface is still the overview card. */}
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <div
            className={cn(
              "inline-flex h-[34px] rounded-md border transition-colors",
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
              className="h-[34px] border-0 bg-transparent px-3 text-xs font-medium hover:bg-transparent"
            />
          </div>
          <div
            className={cn(
              "inline-flex h-[34px] rounded-md border transition-colors",
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
              className="h-[34px] border-0 bg-transparent px-3 text-xs font-medium hover:bg-transparent"
            />
          </div>
          {periodKey === "custom" && (
            <>
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
            </>
          )}
        </div>

        {/* Overview and pace are one card split by a rule, not two cards with
            a gap: they are the same reading of the period — how much is gone,
            and whether that is ahead of the clock. */}
        <div className="ft-card !p-0 overflow-hidden grid grid-cols-1 wide:grid-cols-[1.1fr_1.5fr] [&>*+*]:border-t wide:[&>*+*]:border-t-0 wide:[&>*+*]:border-l [&>*+*]:border-line">
          {/* Summary card */}
          <div className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <span className="ft-eyebrow">
                {t("budget.overview", { defaultValue: "Overview" })} · {period.label}
              </span>
              <span className="ft-chip flex-shrink-0">
                {t("budget.dayN", {
                  n: period.elapsedDays,
                  total: period.totalDays,
                  defaultValue: `day ${period.elapsedDays} / ${period.totalDays}`,
                })}
              </span>
            </div>

            <div className="mt-3.5 mb-1">
              <Money
                v={totals.totalUsed}
                className="block font-medium whitespace-nowrap text-[26px] sm:text-[34px] leading-none tracking-[-.03em]"
              />
              <div className={cn("text-[13.5px] text-fg-mute mt-0.5", isPrivacyMode && "ft-priv")}>
                {t("budget.outOfBudget", {
                  amt: formatCurrency(totals.totalBudget),
                  defaultValue: `of ${formatCurrency(totals.totalBudget)} budget`,
                })}
              </div>
            </div>

            {/* The period read left-to-right: one tall bar with a rule at the
                elapsed fraction, so ahead-of-pace is a glance, not a figure. */}
            <div className="ft-progress-track tall w-full mt-3.5">
              <span
                className="ft-progress-fill"
                style={{
                  width: `${Math.min(Math.max(totals.utilization, 0), 1) * 100}%`,
                  background:
                    totals.utilization > 1 ? "hsl(var(--neg))" : "hsl(var(--primary))",
                }}
              />
              {totals.totalBudget > 0 && (
                <span
                  className="ft-progress-mark"
                  style={{ left: `${Math.min(period.elapsedFraction, 1) * 100}%` }}
                  aria-hidden
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-[11.5px] text-fg-dim mt-[7px]">
              <span>
                {Math.round(totals.utilization * 100)}%{" "}
                {t("budget.ofBudgetConsumed", { defaultValue: "of budget used" })}
              </span>
              <span>
                {Math.round(period.elapsedFraction * 100)}%{" "}
                {t("budget.periodElapsed", { defaultValue: "of the period elapsed" })}
              </span>
            </div>

            {/* Verdict — a sunk callout, not a pill: the headline says how far
                off pace, the line under it says what that is made of. */}
            {totals.totalBudget > 0 && (
              <div className="mt-[18px] p-3.5 rounded-2xl border border-line-soft bg-bg-subtle flex items-start gap-[11px]">
                <div
                  className={cn(
                    "ft-kpi-icon h-[26px] w-[26px] rounded-[9px]",
                    aheadOfPace ? "neg" : "pos"
                  )}
                >
                  {aheadOfPace ? (
                    <AlertTriangle className="h-[13px] w-[13px]" />
                  ) : (
                    <CheckCircle2 className="h-[13px] w-[13px]" />
                  )}
                </div>
                <div className={cn("text-[12.5px] min-w-0", isPrivacyMode && "ft-priv")}>
                  <b>
                    {aheadOfPace
                      ? t("budget.overPace", {
                          amt: formatCurrency(paceDelta),
                          defaultValue: `${formatCurrency(paceDelta)} over pace`,
                        })
                      : t("budget.underPace", {
                          amt: formatCurrency(Math.abs(paceDelta)),
                          defaultValue: `${formatCurrency(Math.abs(paceDelta))} under pace`,
                        })}
                  </b>
                  <div className="text-fg-mute mt-0.5">
                    {includeProjected && totals.totalProjected > 0
                      ? t("budget.includingProjected", {
                          amt: formatCurrency(totals.totalProjected),
                          defaultValue: `Including {{amt}} of projected upcoming spend.`,
                        })
                      : t("budget.actualOnly", {
                          defaultValue: "Based on actual spend so far.",
                        })}
                  </div>
                </div>
              </div>
            )}

            {/* Status counts → quick filters */}
            <div className="flex flex-wrap gap-[7px] mt-4">
              <AttentionPip
                tone="neg"
                count={totals.overCount}
                label={t("budget.pipOver", { defaultValue: "over" })}
                onClick={() => setStatusFilter("over")}
                active={statusFilter === "over"}
              />
              <AttentionPip
                tone="warn"
                count={totals.warnCount}
                label={t("budget.pipWarn", { defaultValue: "close" })}
                onClick={() => setStatusFilter("warn")}
                active={statusFilter === "warn"}
              />
              <AttentionPip
                tone=""
                count={totals.noBudgetCount}
                label={t("budget.pipNoBudget", { defaultValue: "no budget" })}
                onClick={() => setStatusFilter("noBudget")}
                active={statusFilter === "noBudget"}
              />
            </div>
          </div>

          {/* Trend card — the switch sits on the chart it governs, and the
              legend under the chart it names. */}
          <div className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="ft-card-title">
                  {t("budget.spendPace", { defaultValue: "Spending pace" })}
                </h3>
                <div className="ft-card-sub">
                  {t("budget.paceSub", {
                    defaultValue: "Cumulative spend over the period",
                  })}
                </div>
              </div>
              {showProjectedToggle && (
                <label className="flex items-center gap-2 text-xs font-semibold text-fg-mute cursor-pointer whitespace-nowrap flex-shrink-0">
                  <Switch
                    checked={includeProjected}
                    onCheckedChange={setIncludeProjected}
                    className="scale-75 data-[state=checked]:bg-primary"
                  />
                  {t("budget.includeProjectedShort", { defaultValue: "Include projected" })}
                </label>
              )}
            </div>
            <TrendChart
              stats={stats}
              includeProjected={includeProjected}
              period={period}
              formatCurrency={formatCurrency}
            />
            <div className="ft-legend mt-3">
              <span>
                <span className="ft-swatch" style={{ background: "hsl(var(--primary))" }} />
                {t("budget.legendActual", { defaultValue: "actual" })}
              </span>
              {includeProjected && (
                <span>
                  <span
                    className="ft-swatch"
                    style={{ background: "hsl(var(--primary))", opacity: 0.3 }}
                  />
                  {t("budget.legendProjected", { defaultValue: "projected" })}
                </span>
              )}
              {totals.totalBudget > 0 && (
                <span>
                  <span
                    className="inline-block w-[14px] border-t-[1.5px] border-dashed"
                    style={{ borderColor: "hsl(var(--fg-dim))" }}
                  />
                  {t("budget.legendBudget", { defaultValue: "budget" })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Auto-budget — the pack gives this its own full-width band rather
            than tucking it inside the overview, because it is an action on
            the whole page, not a footnote to the summary. */}
        {totals.suggestableCount > 0 && (
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-[14px] p-4 rounded-2xl border border-transparent"
            style={{ background: "hsl(var(--accent-wash))" }}
          >
            <div className="ft-kpi-icon acc">
              <Wand2 className="h-[15px] w-[15px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-[650]">
                {t("budget.autoBudgetTitle", {
                  n: totals.suggestableCount,
                  defaultValue: `${totals.suggestableCount} categories without a budget`,
                })}
              </div>
              {/* Naming the categories and their caps is what makes the
                  action reviewable before it fires. */}
              <div className="text-[12.5px] text-fg-mute mt-0.5">
                {t("budget.autoBudgetSub", {
                  defaultValue: "Apply suggested budgets based on history.",
                })}
                {suggestablePreview ? ` — ${suggestablePreview}` : ""}
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

        {/* Search then status, adjacent — one control group, not two ends of
            the page. */}
        <div className="flex flex-wrap items-center gap-[9px]">
          <div className="inline-flex items-center gap-2 h-[34px] px-3 rounded-md border border-line-strong bg-bg-elev w-[260px] max-w-full">
            <Search className="h-3.5 w-3.5 text-fg-dim flex-shrink-0" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("budget.searchPlaceholder", {
                defaultValue: "Search a category…",
              })}
              className="border-0 bg-transparent shadow-none h-full text-[13px] p-0 focus-visible:ring-0"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("common.clear", { defaultValue: "Clear" })}
                className="text-fg-dim hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Mutually exclusive views of one list — a segmented control, not
              loose chips. */}
          <Segmented
            label={t("budget.filterAria", { defaultValue: "Filter by status" })}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={filterChips.map((c) => ({ value: c.id, label: c.label, count: c.n }))}
          />
        </div>

        {/* One table, not a grid of cards: the pack tabulates categories so
            consumption and remaining line up down the page and can be
            compared at a glance. */}
        <div className="ft-card-flush">
          {filtered.length > 0 && (
            <div className="ft-bud-head">
              <span />
              <span>{t("budget.colCategory", { defaultValue: "Category" })}</span>
              <span className="ft-hide-sm">
                {t("budget.colConsumption", { defaultValue: "Consumption" })}
              </span>
              <span className="ft-hide-sm text-right">
                {t("budget.colSpent", { defaultValue: "Spent" })}
              </span>
              <span className="text-right">
                {t("budget.colRemaining", { defaultValue: "Remaining" })}
              </span>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="ft-empty">
              <Target className="h-[26px] w-[26px]" />
              <span className="ft-empty-title">
                {t("budget.emptyFiltered", {
                  defaultValue: "No categories match the current filter.",
                })}
              </span>
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
                onSaveBudget={saveBudget}
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
    <section>
      {/* Sections are separated by the page's own gap — the design draws no
          rule between them. */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3.5">
        <div className="min-w-0">
          <h2 className="ft-card-title text-base">
            {t("specialBudgets.sectionTitle", { defaultValue: "Special budgets" })}
          </h2>
          <div className="ft-card-sub">
            {t("specialBudgets.sectionSubtitle", {
              defaultValue:
                "Trips & events — linked transactions stay out of category budgets and are tracked here.",
            })}
          </div>
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
            <Money v={aggregate.engaged} className="font-semibold text-foreground" />{" "}
            {t("specialBudgets.aggEngaged", { defaultValue: "engaged" })}
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="whitespace-nowrap">
            {t("specialBudgets.aggOf", { defaultValue: "of" })}{" "}
            <Money v={aggregate.committed} />{" "}
            {t("specialBudgets.aggCommitted", { defaultValue: "committed" })}
          </span>
          <div className="ft-progress-track thin flex-1 min-w-[80px]">
            <span
              className="ft-progress-fill"
              style={{ width: `${aggregate.pct}%`, background: "hsl(var(--foreground))" }}
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
  const { isPrivacyMode } = usePrivacy();
  const locale: "fr" | "en" = i18n.language === "fr" ? "fr" : "en";

  const c = useMemo(
    () => computeSpecialBudget(budget, transactions, today),
    [budget, transactions, today]
  );
  const palette = paletteForColor(budget.color);
  const Icon = getSpecialBudgetIcon(budget.icon);
  const muted = budget.status === "closed" || budget.status === "planned";
  const fillPct = Math.min(c.ratio, 1) * 100;
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
      className={cn("ft-env", budget.status === "closed" && "opacity-80")}
    >
      {/* Top row: tinted tile + identity + status tag */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-[11px] min-w-0">
          <div
            className="h-9 w-9 rounded-[12px] flex-shrink-0 grid place-items-center"
            style={{ background: palette.tint, color: palette.ink }}
          >
            <Icon className="h-[17px] w-[17px]" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-[650] truncate">{budget.name}</div>
            <div className="ft-row-sub truncate">
              {formatSpecialBudgetRange(budget.start_date, budget.end_date, locale)}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "ft-tag flex-shrink-0 whitespace-nowrap",
            c.over && "neg",
            !c.over && statusCls === "planned" && "acc"
          )}
        >
          {t(`specialBudgets.status${budget.status[0].toUpperCase()}${budget.status.slice(1)}`, {
            defaultValue: budget.status,
          })}
        </span>
      </div>

      <div>
        {/* Money row */}
        <div className="flex items-baseline gap-[7px] mb-[7px]">
          <Money v={c.spent} className={cn("text-[19px] font-medium", c.over && "text-neg")} />
          <span className={cn("text-[12px] text-fg-mute", isPrivacyMode && "ft-priv")}>
            {t("budget.outOfBudget", {
              amt: formatCurrency(c.total),
              defaultValue: `of ${formatCurrency(c.total)} budget`,
            })}
          </span>
        </div>

        {/* Pace bar with the trip's own today tick */}
        <div className="ft-progress-track tall">
          <span
            className="ft-progress-fill"
            style={{
              width: `${fillPct}%`,
              background: c.over ? "hsl(var(--neg))" : palette.color,
              opacity: muted ? 0.55 : 1,
            }}
          />
          {showTick && (
            <span
              className="ft-progress-mark"
              style={{ left: `${Math.min(c.elapsedFrac ?? 0, 1) * 100}%` }}
              title={t("budget.today", { defaultValue: "Today" })}
              aria-hidden
            />
          )}
        </div>

        {/* Meta row: used share + guidance, then remaining */}
        <div className="flex items-center justify-between gap-3 text-[11.5px] text-fg-dim mt-1.5">
          <span className="truncate flex-1 min-w-0">
            {Math.round(c.ratio * 100)}%{" "}
            {t("specialBudgets.used", { defaultValue: "used" })}
            {guidance ? (
              <span className={cn(isPrivacyMode && "ft-priv")}> · {guidance}</span>
            ) : (
              ""
            )}
            {c.hot && (
              <span className="text-warn font-semibold ml-1.5">
                · {t("specialBudgets.hotPace", { defaultValue: "high pace" })}
              </span>
            )}
          </span>
          <span
            className={cn(
              "whitespace-nowrap flex-shrink-0 font-mono tabular-nums",
              c.remaining < 0 && "text-neg",
              isPrivacyMode && "ft-priv"
            )}
          >
            {c.remaining >= 0
              ? `${formatCurrency(c.remaining)} ${t("specialBudgets.remainingShort", {
                  defaultValue: "left",
                })}`
              : `${formatCurrency(Math.abs(c.remaining))} ${t("specialBudgets.overShort", {
                  defaultValue: "over",
                })}`}
          </span>
        </div>
      </div>

      {/* Optional savings-goal footer */}
      {goalName && (
        <div className="flex items-center gap-2 text-[11.5px] pt-2 border-t border-line-soft">
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
