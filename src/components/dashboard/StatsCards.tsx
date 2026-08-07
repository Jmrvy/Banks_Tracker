import { computePeriodStats, netIncomeAmount, netExpenseAmount } from "@/lib/reportsEngine";
import { useMemo, useState, useEffect, useRef, useId } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Wallet,
  Repeat,
  Info,
} from "lucide-react";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { ValueDateDifferenceModal } from "@/components/ValueDateDifferenceModal";
import { parseLocalDate, getTxDate } from "@/lib/dateUtils";

interface StatsCardsProps {
  startDate: Date;
  endDate: Date;
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
  onAvailableClick?: () => void;
  onTransactionsFiltered?: (transactions: Transaction[]) => void;
  onExcludedTransactionsFiltered?: (transactions: Transaction[]) => void;
}

interface MiniSpark {
  data: number[];
  color: string;
}

/**
 * KPI sparkline — stroke over a 22% → 0 gradient, the same treatment the
 * design gives every filled spark. 26px tall, tucked against the figure it
 * belongs to rather than closing the tile.
 */
function Sparkline({ data, color }: MiniSpark) {
  const gradientId = useId();
  if (!data || data.length < 2) return null;
  const w = 80;
  const h = 26;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / range) * (h - 4) - 2;
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StatsCards({
  startDate,
  endDate,
  onIncomeClick,
  onExpensesClick,
  onAvailableClick,
  onTransactionsFiltered,
  onExcludedTransactionsFiltered,
}: StatsCardsProps) {
  const { t, i18n } = useTranslation();
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [showDateDifferenceModal, setShowDateDifferenceModal] = useState(false);

  // KPI tiles show whole numbers — cents add no signal here and just eat
  // horizontal room. Modeled on the deck design's `fmt.usd(v, { cents: false })`.
  const formatKpi = (v: number) =>
    v.toLocaleString(i18n.language === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: preferences.currency,
      maximumFractionDigits: 0,
    });

  const activeDateType = preferences.dateType;

  const hasDateDifference = useMemo(() => {
    if (activeDateType !== "value") return false;
    return transactions.some((t) => {
      const transactionDate = parseLocalDate(t.transaction_date);
      const valueDate = parseLocalDate(t.value_date || t.transaction_date);
      const inA = transactionDate >= startDate && transactionDate <= endDate;
      const inB = valueDate >= startDate && valueDate <= endDate;
      return inA !== inB;
    });
  }, [transactions, startDate, endDate, activeDateType]);

  const dateOf = (txn: Transaction) => getTxDate(txn, activeDateType);

  const periodMs = endDate.getTime() - startDate.getTime();
  const priorEnd = new Date(startDate.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - periodMs);

  // Current period
  const {
    stats,
    filteredTransactions,
    excludedTransactions,
    incomeSpark,
    expenseSpark,
    balanceSpark,
    recurringSpark,
  } = useMemo(() => {
    const filtered = transactions.filter((tx) => {
      const d = dateOf(tx);
      return d >= startDate && d <= endDate;
    });

    const statsTxns = filtered.filter((t) => t.include_in_stats !== false);
    const excluded = filtered.filter((t) => t.include_in_stats === false);

    // The engine, not a local copy of its rules. These two tiles are the
    // first numbers seen after login, and they had drifted from every other
    // surface: repayments counted as spending, a repaid advance counted as
    // income gross, and over-refunds floored at zero.
    const periodStats = computePeriodStats(statsTxns as any);
    const moneyIn = periodStats.income;
    const moneyOut = periodStats.expenses;

    const available = accounts.reduce((s, a) => s + a.balance, 0);
    const activeRecurring = recurringTransactions.filter((rt) => rt.is_active).length;

    // Build daily buckets for sparklines (capped to ~30 buckets so sparkline stays readable)
    const dayMs = 86_400_000;
    const days = Math.max(2, Math.min(60, Math.round(periodMs / dayMs)));
    const bucketMs = periodMs / days;
    const incomeByBucket = new Array(days).fill(0);
    const expenseByBucket = new Array(days).fill(0);
    const netByBucket = new Array(days).fill(0);
    const recurringByBucket = new Array(days).fill(activeRecurring);

    // Per-bucket the engine cannot help — it returns totals — so mirror its
    // rules row by row rather than inventing looser ones, or the sparkline
    // tells a different story from the tile above it.
    for (const tx of statsTxns) {
      const d = dateOf(tx).getTime();
      const idx = Math.max(0, Math.min(days - 1, Math.floor((d - startDate.getTime()) / bucketMs)));
      if (tx.type === "income" && !tx.refund_of_transaction_id) {
        const net = netIncomeAmount(tx as any);
        // Income that came back on its category is a reduction of spend,
        // not earnings — the same treatment computePeriodStats gives it.
        if (tx.offsets_category) {
          expenseByBucket[idx] -= net;
          netByBucket[idx] += net;
        } else {
          incomeByBucket[idx] += net;
          netByBucket[idx] += net;
        }
      } else if (tx.type === "expense") {
        if (tx.repayment_of_transaction_id) continue;
        const net = netExpenseAmount(tx as any);
        expenseByBucket[idx] += net;
        netByBucket[idx] -= net;
      } else if (tx.type === "transfer") {
        const fee = Number(tx.transfer_fee || 0);
        expenseByBucket[idx] += fee;
        netByBucket[idx] -= fee;
      }
    }

    // Running balance series (cumulative net + initial baseline)
    const startBalance = available - netByBucket.reduce((s, v) => s + v, 0);
    const balanceSeries: number[] = new Array(days);
    let running = startBalance;
    for (let i = 0; i < days; i++) {
      running += netByBucket[i];
      balanceSeries[i] = running;
    }

    return {
      stats: {
        moneyIn,
        moneyOut,
        available,
        recurring: activeRecurring,
      },
      filteredTransactions: statsTxns,
      excludedTransactions: excluded,
      incomeSpark: incomeByBucket,
      expenseSpark: expenseByBucket,
      balanceSpark: balanceSeries,
      recurringSpark: recurringByBucket,
    };
  }, [transactions, accounts, recurringTransactions, startDate, endDate, activeDateType, periodMs]);

  // Prior-period totals for delta comparison
  const prior = useMemo(() => {
    const filtered = transactions.filter((tx) => {
      const d = dateOf(tx);
      return d >= priorStart && d <= priorEnd && tx.include_in_stats !== false;
    });
    // Same rules as the current period, or the "vs prior" caption compares
    // two differently-computed numbers and reports a change that is partly
    // an artefact of the arithmetic.
    const priorStats = computePeriodStats(filtered as any);
    return { moneyIn: priorStats.income, moneyOut: priorStats.expenses };
  }, [transactions, priorStart, priorEnd, activeDateType]);

  // Returns null when no meaningful comparison exists (no prior data, both zero, etc.)
  const trendPct = (cur: number, prv: number): number | null => {
    if (prv === 0 && cur === 0) return null;
    if (prv === 0) return null; // baseline missing → can't compute %
    return ((cur - prv) / Math.abs(prv)) * 100;
  };

  const onTransactionsFilteredRef = useRef(onTransactionsFiltered);
  const onExcludedTransactionsFilteredRef = useRef(onExcludedTransactionsFiltered);
  useEffect(() => {
    onTransactionsFilteredRef.current = onTransactionsFiltered;
    onExcludedTransactionsFilteredRef.current = onExcludedTransactionsFiltered;
  }, [onTransactionsFiltered, onExcludedTransactionsFiltered]);
  useEffect(() => {
    onTransactionsFilteredRef.current?.(filteredTransactions);
  }, [filteredTransactions]);
  useEffect(() => {
    onExcludedTransactionsFilteredRef.current?.(excludedTransactions);
  }, [excludedTransactions]);

  type Card = {
    id: string;
    label: string;
    value: number;
    isCount?: boolean;
    icon: typeof Wallet;
    iconClass: "pos" | "neg" | "acc" | "warn";
    spark: number[];
    sparkColor: string;
    trend: number | null;
    invert?: boolean;
  };

  const cards: Card[] = [
    {
      id: "income",
      label: t("common.income"),
      value: stats.moneyIn,
      // Flow, not trend: money coming in points down into the account, money
      // leaving points up. A TrendingUp glyph beside a "↓ 12%" delta chip
      // said two opposite things at once.
      icon: ArrowDownRight,
      iconClass: "pos",
      spark: incomeSpark,
      sparkColor: "hsl(var(--pos))",
      trend: trendPct(stats.moneyIn, prior.moneyIn),
    },
    {
      id: "expenses",
      label: t("common.expenses"),
      value: stats.moneyOut,
      icon: ArrowUpRight,
      iconClass: "neg",
      spark: expenseSpark,
      sparkColor: "hsl(var(--neg))",
      trend: trendPct(stats.moneyOut, prior.moneyOut),
      invert: true, // up = bad
    },
    {
      id: "available",
      label: t("reports.available"),
      value: stats.available,
      icon: Wallet,
      iconClass: "acc",
      spark: balanceSpark,
      sparkColor: "hsl(var(--primary))",
      trend: null, // running balance is absolute, no period-over-period meaning
    },
    {
      id: "recurring",
      label: t("dashboard.recurring"),
      value: stats.recurring,
      icon: Repeat,
      iconClass: "warn",
      isCount: true,
      spark: recurringSpark,
      sparkColor: "hsl(var(--warning))",
      trend: null,
    },
  ];

  const handleCardClick = (id: string) => {
    if (id === "income") onIncomeClick?.();
    else if (id === "expenses") onExpensesClick?.();
    else if (id === "available") onAvailableClick?.();
  };

  return (
    <>
      <div className="ft-g4">
        {cards.map((card) => {
          const clickable = card.id === "income" || card.id === "expenses" || card.id === "available";
          const trendNull = card.trend === null;
          const trendVal = card.trend ?? 0;
          const isUp = trendVal > 0;
          const goodUp = !card.invert;
          const flat = trendNull || Math.abs(trendVal) < 0.05;
          const cls = flat ? "flat" : isUp === goodUp ? "up" : "down";
          const showTrendCaption = card.id === "income" || card.id === "expenses";
          // A tile that goes nowhere is a <div>, not a dimmed button: the
          // design only ever lifts a KPI you can drill into, and assistive
          // tech shouldn't be told there is a disabled control here.
          const body = (
            <>
              {/* Top row: icon + label */}
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className={`ft-kpi-icon ${card.iconClass} flex-shrink-0`}>
                  <card.icon className="h-[15px] w-[15px]" />
                </div>
                <span className="ft-kpi-label flex items-center gap-1 min-w-0 truncate">
                  <span className="truncate">{card.label}</span>
                  {card.id === "available" && hasDateDifference && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDateDifferenceModal(true);
                      }}
                      className="p-0.5 rounded-md hover:bg-bg-hover flex-shrink-0"
                    >
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                </span>
              </div>

              {/* Big value */}
              <div className={`ft-kpi-value truncate min-w-0 ${isPrivacyMode ? "ft-priv" : ""}`}>
                {card.isCount ? card.value : formatKpi(card.value)}
              </div>

              {/* The curve sits directly under the figure it belongs to; the
                  caption closes the tile. */}
              <div className="h-[26px] -mt-0.5 -mb-1">
                <Sparkline data={card.spark} color={card.sparkColor} />
              </div>

              {/* Delta + caption */}
              {showTrendCaption ? (
                <div className="ft-kpi-foot min-w-0">
                  <span className={`ft-delta ${cls} whitespace-nowrap`}>
                    {trendNull ? (
                      "—"
                    ) : (
                      <>
                        {/* No arrow on a flat delta — a direction glyph on a
                            0.0% move claims movement that isn't there. */}
                        {flat ? null : isUp ? (
                          <ArrowUp className="h-[11px] w-[11px]" />
                        ) : (
                          <ArrowDown className="h-[11px] w-[11px]" />
                        )}
                        {(() => {
                          const v = Math.abs(trendVal);
                          return `${isUp ? "+" : "−"}${v >= 100 ? Math.round(v) : v.toFixed(1)}%`;
                        })()}
                      </>
                    )}
                  </span>
                  <span className="hidden md:inline truncate">
                    {trendNull
                      ? t("dashboard.noPriorData", { defaultValue: "no prior data" })
                      : t("dashboard.vsPrior", { defaultValue: "vs. prior" })}
                  </span>
                </div>
              ) : (
                <div className="ft-kpi-foot truncate">
                  {card.id === "available"
                    ? t("dashboard.acrossAccounts", { defaultValue: "across {{n}} accounts", n: accounts.length })
                    : t("dashboard.activePlans", { defaultValue: "active plans" })}
                </div>
              )}
            </>
          );
          return clickable ? (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardClick(card.id)}
              className="ft-kpi cursor-pointer"
            >
              {body}
            </button>
          ) : (
            <div key={card.id} className="ft-kpi">
              {body}
            </div>
          );
        })}
      </div>

      <ValueDateDifferenceModal
        open={showDateDifferenceModal}
        onOpenChange={setShowDateDifferenceModal}
        transactions={transactions}
        period={{ from: startDate, to: endDate }}
      />
    </>
  );
}
