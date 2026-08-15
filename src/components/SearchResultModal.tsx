import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Crown,
  Receipt,
  Search,
  Tag,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetHeader,
  DetailSheetTitle,
} from "@/components/ui/detail-sheet";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useDateFnsLocale } from "@/hooks/useDateFnsLocale";
import type { Transaction } from "@/hooks/useFinancialData";
import { parseLocalDate } from "@/lib/dateUtils";
import type { ParsedQuery } from "@/lib/searchQuery";
import { aggregateTransactions, signedNet } from "@/lib/transactionMath";

/** Per-category budget summary used by the budget intent. */
export interface BudgetSummaryRow {
  categoryId: string;
  categoryName: string;
  color: string;
  /** Monthly budget configured on the category, or null if unbudgeted. */
  monthlyBudget: number | null;
  /** Budget × number of months in the queried period. */
  expectedBudget: number | null;
  /** Spent in the period (net of refunds, actual transactions only). */
  spent: number;
  /** Projected future spend from recurring transactions (0 when not forecasted). */
  projectedSpend: number;
  /** Fraction of expected used (actual only), 0..N. Null when there's no budget. */
  pctUsed: number | null;
  /** Fraction of expected used including projections, 0..N. Null when there's no budget. */
  pctForecast: number | null;
  /** True when `spent > expectedBudget` (actual). */
  breached: boolean;
  /** True when `spent + projectedSpend > expectedBudget` (forecasted). */
  forecastBreached: boolean;
}

/** Average-stats panel data. */
export interface AverageStats {
  total: number;
  count: number;
  days: number;
  perDay: number;
  perWeek: number;
  perMonth: number;
}

interface SearchResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: ParsedQuery | null;
  /** Already-filtered transactions matching the query. */
  transactions: Transaction[];
  /** Names for matched filter chips. */
  matchedCategoryNames: string[];
  matchedAccountNames: string[];
  /** Optional: open the full Transactions page with the same filters. */
  onOpenTransactions?: () => void;
  /** When true, the parent is feeding rows that include
   *  `include_in_stats === false`. The toggle below lets the user flip this. */
  includeExcluded?: boolean;
  onIncludeExcludedChange?: (next: boolean) => void;
  /** Number of transactions that would be added by enabling the toggle. */
  excludedCount?: number;
  /** Budget intent: per-category breakdown. Provided by the parent. */
  budgetRows?: BudgetSummaryRow[];
  /** Average intent: aggregated stats over the period. */
  averageStats?: AverageStats | null;
}

const typeIcon = (type: Transaction["type"]) => {
  if (type === "income") return <ArrowDownRight className="w-3.5 h-3.5 text-pos" />;
  if (type === "expense") return <ArrowUpRight className="w-3.5 h-3.5 text-neg" />;
  return <ArrowRightLeft className="w-3.5 h-3.5 text-info" />;
};

export function SearchResultModal({
  open,
  onOpenChange,
  query,
  transactions,
  matchedCategoryNames,
  matchedAccountNames,
  onOpenTransactions,
  includeExcluded,
  onIncludeExcludedChange,
  excludedCount = 0,
  budgetRows = [],
  averageStats = null,
}: SearchResultModalProps) {
  const { t } = useTranslation();
  const { formatCurrency, preferences } = useUserPreferences();
  const dateLocale = useDateFnsLocale();
  const { isPrivacyMode } = usePrivacy();

  // Display date respects the user's accounting-vs-value preference,
  // matching how StatsCards and the rest of the app pick a date.
  const displayDate = (tx: Transaction): Date =>
    preferences.dateType === "value"
      ? parseLocalDate(tx.value_date || tx.transaction_date)
      : parseLocalDate(tx.transaction_date);

  // Sort by the user's preferred date, newest first. Supabase returns
  // transactions ordered by transaction_date desc, which is wrong for
  // a value-date user — their list would jump around chronologically.
  // For the "top" intent we override this and sort by absolute amount
  // descending so the user sees the biggest hits first.
  const sortedTransactions = useMemo(() => {
    if (query?.intent === "top") {
      return [...transactions].sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
    }
    return [...transactions].sort((a, b) => displayDate(b).getTime() - displayDate(a).getTime());
    // displayDate is defined inline; it only varies with preferences.dateType.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, preferences.dateType, query?.intent]);

  // Signed totals from the shared aggregator. `net` is the headline
  // figure; positive when matched rows are net inflow, negative when net
  // outflow. Transfers between user accounts contribute 0 by design.
  const totals = useMemo(() => {
    const agg = aggregateTransactions(transactions);
    return { sum: agg.net, count: agg.count, transferCount: agg.transferCount };
  }, [transactions]);

  // Category breakdown uses the signed net per transaction and excludes
  // transfers (they're internal movements, not category spend/income).
  // Magnitudes are displayed; sign is reflected via colour in the row.
  const breakdown = useMemo(() => {
    if (!query || query.type === "transfer") return [];
    const map = new Map<string, { name: string; color: string; total: number; count: number }>();
    for (const tx of transactions) {
      if (tx.type === "transfer") continue;
      const key = tx.category?.id ?? "__none__";
      const name = tx.category?.name ?? t("transactions.uncategorized", { defaultValue: "Uncategorized" });
      // hsl() wrapper is load-bearing: the token holds bare HSL components, so
      // consuming it raw painted the uncategorised swatch transparent.
      const color = tx.category?.color ?? "hsl(var(--muted-foreground))";
      const entry = map.get(key) ?? { name, color, total: 0, count: 0 };
      entry.total += signedNet(tx);
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 6);
  }, [transactions, query, t]);

  if (!query) return null;

  const periodLabel = t(query.periodLabelKey, { defaultValue: query.periodLabelDefault });
  const typeLabel = query.type
    ? t(`search.type.${query.type}`, {
        defaultValue:
          query.type === "income" ? "Income" : query.type === "expense" ? "Expenses" : "Transfers",
      })
    : t("search.type.all", { defaultValue: "All transactions" });

  const intentTitle = (() => {
    switch (query.intent) {
      case "budget":
        return query.breachesOnly
          ? t("search.intent.budgetBreaches", { defaultValue: "Budget breaches" })
          : t("search.intent.budget", { defaultValue: "Budget" });
      case "top":
        return t("search.intent.top", { defaultValue: "Top {{n}} expenses", n: query.topN });
      case "average":
        return t("search.intent.average", { defaultValue: "Average" });
      default:
        return typeLabel;
    }
  })();

  // Color + sign follow the actual signed net so a mixed query (e.g.
  // "easyjet" matching expenses + a funding transfer) shows the right
  // direction without needing an explicit type filter.
  const totalColor =
    totals.sum > 0 ? "text-pos" : totals.sum < 0 ? "text-neg" : "text-foreground";
  const totalSign = totals.sum > 0 ? "+" : totals.sum < 0 ? "−" : "";

  // Filter the budget rows for breaches-only requests right at render
  // time so the parent can hand us the full set without recomputing.
  const displayBudgetRows = query.breachesOnly
    ? budgetRows.filter((r) => r.breached)
    : budgetRows;

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange}>
      <DetailSheetHeader>
        <DetailSheetTitle>
          {query.intent === "budget" ? (
            <Target className="w-5 h-5 text-primary" />
          ) : query.intent === "top" ? (
            <Crown className="w-5 h-5 text-primary" />
          ) : query.intent === "average" ? (
            <TrendingUp className="w-5 h-5 text-primary" />
          ) : (
            <Receipt className="w-5 h-5 text-primary" />
          )}
          {intentTitle}
          <span className="text-muted-foreground font-normal">·</span>
          <span className="font-normal text-muted-foreground">{periodLabel}</span>
        </DetailSheetTitle>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {matchedCategoryNames.map((name) => (
            <Badge key={`cat-${name}`} variant="secondary" className="text-xs">
              <Tag className="w-3 h-3 mr-1" />
              {name}
            </Badge>
          ))}
          {matchedAccountNames.map((name) => (
            <Badge key={`acc-${name}`} variant="secondary" className="text-xs">
              <Wallet className="w-3 h-3 mr-1" />
              {name}
            </Badge>
          ))}
          {query.descriptionTokens.map((tok) => (
            <Badge
              key={`desc-${tok}`}
              variant="outline"
              className="text-xs bg-info/10 text-info border-info/30"
            >
              <Search className="w-3 h-3 mr-1" />
              {tok}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">
            <Calendar className="w-3 h-3 mr-1" />
            {format(query.dateRange.start, "d MMM yyyy", { locale: dateLocale })}
            {" – "}
            {format(query.dateRange.end, "d MMM yyyy", { locale: dateLocale })}
          </Badge>
        </div>
      </DetailSheetHeader>

      <DetailSheetBody>
        {/* BUDGET INTENT — progress bar per category */}
        {query.intent === "budget" && (
          <div className="space-y-2">
            {query.forecasted && (
              <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                <Zap className="w-3 h-3 text-info" />
                {t("search.forecastedNote", {
                  defaultValue: "Includes projected recurring transactions",
                })}
              </div>
            )}
            {displayBudgetRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {query.breachesOnly
                  ? t("search.noBreaches", {
                      defaultValue: "No budget breaches in this period.",
                    })
                  : t("search.noBudgets", {
                      defaultValue: "No category has a budget set.",
                    })}
              </p>
            ) : (
              displayBudgetRows.map((row) => {
                const isForecasted = query.forecasted && row.projectedSpend > 0;
                // Actual bar uses actual pctUsed; forecast bar uses pctForecast
                const pct = row.pctUsed ?? 0;
                const pctF = row.pctForecast ?? pct;
                const barPct = Math.min(100, pct * 100);
                // Projected segment width: difference between forecast and actual, capped at 100 total
                const projBarPct = isForecasted
                  ? Math.min(100, pctF * 100) - barPct
                  : 0;
                const effectivePct = isForecasted ? pctF : pct;
                const breachedNow = row.breached;
                const breachedForecast = isForecasted ? row.forecastBreached : false;
                const barColor = breachedNow
                  ? "bg-neg"
                  : pct >= 0.8
                  ? "bg-warning"
                  : "bg-pos";
                const projBarColor = breachedForecast
                  ? "bg-neg/50"
                  : effectivePct >= 0.8
                  ? "bg-warning/50"
                  : "bg-pos/40";
                return (
                  <div
                    key={row.categoryId}
                    className="px-3 py-3 rounded-xl border border-line bg-card"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="text-sm font-medium truncate">{row.categoryName}</span>
                        {breachedNow ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-neg/40 text-neg bg-neg/10 px-1.5 py-0 h-4"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                            {t("search.breachBadge", { defaultValue: "Over budget" })}
                          </Badge>
                        ) : breachedForecast ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-warning/40 text-warning bg-warning/10 px-1.5 py-0 h-4"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                            {t("search.forecastBreachBadge", { defaultValue: "Forecast over" })}
                          </Badge>
                        ) : row.pctUsed !== null && effectivePct >= 0.8 ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-warning/40 text-warning bg-warning/10 px-1.5 py-0 h-4"
                          >
                            {t("search.budgetCloseBadge", { defaultValue: "Close" })}
                          </Badge>
                        ) : row.monthlyBudget !== null ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-pos/40 text-pos bg-pos/10 px-1.5 py-0 h-4"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            {t("search.budgetOnTrackBadge", { defaultValue: "On track" })}
                          </Badge>
                        ) : null}
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {row.pctUsed !== null
                          ? isForecasted
                            ? `${(pct * 100).toFixed(0)}% · ${(pctF * 100).toFixed(0)}% ${t("search.forecastSuffix", { defaultValue: "forecast" })}`
                            : `${(pct * 100).toFixed(0)}%`
                          : "—"}
                      </span>
                    </div>
                    {row.expectedBudget !== null ? (
                      <>
                        {/* Split progress bar: solid = actual, hatched = projected */}
                        <div className="h-1.5 rounded-full bg-bg-subtle overflow-hidden flex">
                          <div
                            className={`h-full transition-all ${barColor} rounded-l-full`}
                            style={{ width: `${barPct}%` }}
                          />
                          {isForecasted && projBarPct > 0 && (
                            <div
                              className={`h-full transition-all ${projBarColor}`}
                              style={{
                                width: `${projBarPct}%`,
                                backgroundImage:
                                  "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 4px)",
                              }}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                          {isForecasted ? (
                            <span className={cn(isPrivacyMode && "ft-priv")}>
                              <span className="text-foreground font-medium font-mono tabular-nums">
                                {formatCurrency(row.spent)}
                              </span>
                              <span className="text-info/80 font-mono tabular-nums">
                                {" +"}
                                {formatCurrency(row.projectedSpend)}
                              </span>
                              {" / "}
                              <span className="font-mono tabular-nums">
                                {formatCurrency(row.expectedBudget)}
                              </span>
                            </span>
                          ) : (
                            <span className={cn(isPrivacyMode && "ft-priv")}>
                              <span className="text-foreground font-medium font-mono tabular-nums">
                                {formatCurrency(row.spent)}
                              </span>
                              {" / "}
                              <span className="font-mono tabular-nums">
                                {formatCurrency(row.expectedBudget)}
                              </span>
                            </span>
                          )}
                          {isForecasted ? (
                            <span
                              className={cn(
                                breachedForecast && "text-warning font-medium",
                                isPrivacyMode && "ft-priv"
                              )}
                            >
                              {breachedForecast ? (
                                <>
                                  <span className="font-mono tabular-nums">
                                    +{formatCurrency(row.spent + row.projectedSpend - row.expectedBudget)}
                                  </span>{" "}
                                  {t("search.overBy", { defaultValue: "over" })}
                                </>
                              ) : (
                                <>
                                  <span className="font-mono tabular-nums">
                                    {formatCurrency(row.expectedBudget - row.spent - row.projectedSpend)}
                                  </span>{" "}
                                  {t("search.left", { defaultValue: "left" })}
                                </>
                              )}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                breachedNow && "text-neg font-medium",
                                isPrivacyMode && "ft-priv"
                              )}
                            >
                              {breachedNow ? (
                                <>
                                  <span className="font-mono tabular-nums">
                                    +{formatCurrency(row.spent - row.expectedBudget)}
                                  </span>{" "}
                                  {t("search.overBy", { defaultValue: "over" })}
                                </>
                              ) : (
                                <>
                                  <span className="font-mono tabular-nums">
                                    {formatCurrency(row.expectedBudget - row.spent)}
                                  </span>{" "}
                                  {t("search.left", { defaultValue: "left" })}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        {/* Legend for forecasted view */}
                        {isForecasted && (
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-3 h-1.5 rounded-sm" style={{ backgroundColor: row.color }} />
                              {t("search.actualLabel", { defaultValue: "Actual" })}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="w-3 h-1.5 rounded-sm opacity-50"
                                style={{
                                  backgroundColor: row.color,
                                  backgroundImage:
                                    "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)",
                                }}
                              />
                              {t("search.projectedLabel", { defaultValue: "Projected" })}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p
                        className={cn(
                          "text-[11px] text-muted-foreground",
                          isPrivacyMode && "ft-priv"
                        )}
                      >
                        {t("search.noBudgetSet", {
                          defaultValue: "No budget set · spent {{spent}}",
                          spent: formatCurrency(row.spent),
                        })}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* AVERAGE INTENT — per-day / per-week / per-month figures */}
        {query.intent === "average" && averageStats && (
          <div className="space-y-3">
            <div className="text-center py-5 bg-bg-subtle border border-line rounded-2xl">
              <p className={`text-3xl font-bold tabular-nums ${totalColor}`}>
                {query.type === "income" ? "+" : query.type === "expense" ? "-" : ""}
                {formatCurrency(Math.abs(averageStats.perDay))}
                <span className="text-base font-normal text-muted-foreground ml-1">
                  / {t("search.perDay", { defaultValue: "day" })}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t("search.averageOver", {
                  defaultValue: "Over {{days}} days · {{count}} transactions",
                  days: averageStats.days,
                  count: averageStats.count,
                })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-3 rounded-xl border border-line bg-card">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t("search.perWeek", { defaultValue: "Per week" })}
                </p>
                <p className="text-base font-semibold tabular-nums mt-1">
                  {formatCurrency(Math.abs(averageStats.perWeek))}
                </p>
              </div>
              <div className="px-3 py-3 rounded-xl border border-line bg-card">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t("search.perMonth", { defaultValue: "Per month" })}
                </p>
                <p className="text-base font-semibold tabular-nums mt-1">
                  {formatCurrency(Math.abs(averageStats.perMonth))}
                </p>
              </div>
              <div className="px-3 py-3 rounded-xl border border-line bg-card">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t("search.totalLabel", { defaultValue: "Total" })}
                </p>
                <p className="text-base font-semibold tabular-nums mt-1">
                  {formatCurrency(Math.abs(averageStats.total))}
                </p>
              </div>
              <div className="px-3 py-3 rounded-xl border border-line bg-card">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {t("search.countLabel", { defaultValue: "Count" })}
                </p>
                <p className="text-base font-semibold tabular-nums mt-1">{averageStats.count}</p>
              </div>
            </div>
          </div>
        )}

        {/* DEFAULT (transactions / top) — headline figure. Sign + colour
            follow the actual signed net so a mixed query reflects the
            true direction. A footer note surfaces transfer count since
            transfers contribute 0 to the net. */}
        {(query.intent === "transactions" || query.intent === "top") && (
          <div className="text-center py-5 bg-bg-subtle border border-line rounded-2xl">
            <p className={`text-3xl font-bold tabular-nums ${totalColor}`}>
              {totalSign}
              {formatCurrency(Math.abs(totals.sum))}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {query.intent === "top"
                ? t("search.topSummary", {
                    defaultValue: "Top {{n}} of {{count}} transactions",
                    n: Math.min(query.topN, totals.count),
                    count: totals.count,
                  })
                : t("search.transactionCount", {
                    count: totals.count,
                    defaultValue: `${totals.count} transaction${totals.count === 1 ? "" : "s"}`,
                  })}
              {totals.transferCount > 0 && (
                <>
                  {" · "}
                  {t("search.includesTransfers", {
                    count: totals.transferCount,
                    defaultValue: `includes ${totals.transferCount} transfer${totals.transferCount === 1 ? "" : "s"} (net 0)`,
                  })}
                </>
              )}
            </p>
          </div>
        )}

        {/* Power-user diagnostic: include rows that are explicitly
            excluded from stats (e.g. internal transfers tagged out).
            Hidden when there's nothing to add. */}
        {onIncludeExcludedChange && excludedCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-line bg-bg-subtle/30">
            <div className="min-w-0">
              <Label className="text-xs">
                {t("search.includeExcluded", {
                  defaultValue: "Include excluded transactions",
                })}
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("search.includeExcludedHint", {
                  count: excludedCount,
                  defaultValue: `+${excludedCount} excluded from stats`,
                })}
              </p>
            </div>
            <Switch
              checked={!!includeExcluded}
              onCheckedChange={onIncludeExcludedChange}
            />
          </div>
        )}

        {/* Category breakdown — only for the default transactions view.
            Excludes transfers (filtered in `breakdown` memo). Percentages
            use the sum of absolute row totals so each share stays positive
            even when some rows are income and others expense; row totals
            display signed amounts with matching sign + colour. */}
        {query.intent === "transactions" && breakdown.length > 1 && (() => {
          const breakdownAbsTotal = breakdown.reduce((acc, r) => acc + Math.abs(r.total), 0);
          return (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {t("search.breakdown", { defaultValue: "Breakdown by category" })}
              </p>
              <div className="space-y-1.5">
                {breakdown.map((row) => {
                  const pct = breakdownAbsTotal ? (Math.abs(row.total) / breakdownAbsTotal) * 100 : 0;
                  const rowColor =
                    row.total > 0 ? "text-pos" : row.total < 0 ? "text-neg" : "";
                  return (
                    <div
                      key={row.name}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-subtle/50 border border-line"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="text-sm flex-1 truncate">{row.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                      <span className={`text-sm font-medium tabular-nums ${rowColor}`}>
                        {row.total > 0 ? "+" : row.total < 0 ? "−" : ""}
                        {formatCurrency(Math.abs(row.total))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Transaction list — shown for default transactions view and
            for the top intent. Hidden for budget/average since their
            panels are the answer in themselves. */}
        {(query.intent === "transactions" || query.intent === "top") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {query.intent === "top"
                ? t("search.topList", {
                    defaultValue: "Top {{n}}",
                    n: Math.min(query.topN, transactions.length),
                  })
                : t("search.matchingTransactions", { defaultValue: "Matching transactions" })}
            </p>
            {onOpenTransactions && transactions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onOpenTransactions}
              >
                {t("search.openInTransactions", { defaultValue: "Open in Transactions" })}
              </Button>
            )}
          </div>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("search.noResults", { defaultValue: "No transactions match this query." })}
            </p>
          ) : (
            <div className="space-y-1.5">
              {sortedTransactions.slice(0, query.intent === "top" ? query.topN : 50).map((tx) => {
                // Per-row magnitude: expense rows display net-of-refund;
                // income / transfer rows display the raw amount. Sign is
                // shown separately based on type, so this is always
                // positive. Note: this differs from signedNet() (used for
                // the headline) which collapses transfers to 0.
                const net =
                  tx.type === "expense"
                    ? Number(tx.amount) - Number(tx.refunded_amount || 0)
                    : Number(tx.amount);
                const wasRefunded =
                  tx.type === "expense" && (Number(tx.refunded_amount) || 0) > 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card hover:bg-bg-subtle/40 transition-colors"
                  >
                    {typeIcon(tx.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {format(displayDate(tx), "d MMM yyyy", { locale: dateLocale })}
                        </span>
                        {tx.account?.name && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            · {tx.account.name}
                          </span>
                        )}
                        {tx.category?.name && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0"
                            style={{
                              backgroundColor: `${tx.category.color}1f`,
                              color: tx.category.color,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: tx.category.color }}
                            />
                            {tx.category.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          tx.type === "income"
                            ? "text-pos"
                            : tx.type === "expense"
                            ? "text-neg"
                            : ""
                        }`}
                      >
                        {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                        {formatCurrency(Math.abs(net))}
                      </span>
                      {wasRefunded && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {t("search.refundedHint", {
                            refunded: formatCurrency(Number(tx.refunded_amount) || 0),
                            defaultValue: `net of ${formatCurrency(Number(tx.refunded_amount) || 0)} refunded`,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {query.intent !== "top" && transactions.length > 50 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  {t("search.truncated", {
                    count: transactions.length - 50,
                    defaultValue: `+${transactions.length - 50} more — open in Transactions to see all`,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
        )}
      </DetailSheetBody>
    </DetailSheet>
  );
}
