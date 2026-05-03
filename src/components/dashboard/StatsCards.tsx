import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, TrendingDown, Wallet, Repeat, Info } from "lucide-react";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { ValueDateDifferenceModal } from "@/components/ValueDateDifferenceModal";
import { parseLocalDate } from "@/lib/dateUtils";

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

function Sparkline({ data, color }: MiniSpark) {
  if (!data || data.length < 2) return null;
  const w = 80;
  const h = 28;
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
    >
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
  const { t } = useTranslation();
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [showDateDifferenceModal, setShowDateDifferenceModal] = useState(false);

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

  const dateOf = (txn: Transaction) =>
    activeDateType === "value"
      ? parseLocalDate(txn.value_date || txn.transaction_date)
      : parseLocalDate(txn.transaction_date);

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

    const moneyIn = statsTxns
      .filter((t) => t.type === "income" && !t.refund_of_transaction_id)
      .reduce((s, t) => s + t.amount, 0);

    const moneyOut = statsTxns
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Math.max(0, t.amount - (t.refunded_amount || 0)), 0);

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

    for (const tx of statsTxns) {
      const d = dateOf(tx).getTime();
      const idx = Math.max(0, Math.min(days - 1, Math.floor((d - startDate.getTime()) / bucketMs)));
      if (tx.type === "income" && !tx.refund_of_transaction_id) {
        incomeByBucket[idx] += tx.amount;
        netByBucket[idx] += tx.amount;
      } else if (tx.type === "expense") {
        const net = Math.max(0, tx.amount - (tx.refunded_amount || 0));
        expenseByBucket[idx] += net;
        netByBucket[idx] -= net;
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
    const moneyIn = filtered
      .filter((t) => t.type === "income" && !t.refund_of_transaction_id)
      .reduce((s, t) => s + t.amount, 0);
    const moneyOut = filtered
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Math.max(0, t.amount - (t.refunded_amount || 0)), 0);
    return { moneyIn, moneyOut };
  }, [transactions, priorStart, priorEnd, activeDateType]);

  const trendPct = (cur: number, prv: number) => {
    if (prv === 0) return cur === 0 ? 0 : 100;
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
    icon: typeof TrendingUp;
    iconClass: "pos" | "neg" | "acc" | "warn";
    spark: number[];
    sparkColor: string;
    trend: number;
    invert?: boolean;
  };

  const cards: Card[] = [
    {
      id: "income",
      label: t("common.income"),
      value: stats.moneyIn,
      icon: TrendingUp,
      iconClass: "pos",
      spark: incomeSpark,
      sparkColor: "hsl(var(--pos))",
      trend: trendPct(stats.moneyIn, prior.moneyIn),
    },
    {
      id: "expenses",
      label: t("common.expenses"),
      value: stats.moneyOut,
      icon: TrendingDown,
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
      trend: 0, // running balance is absolute, no period-over-period meaning
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
      trend: 0,
    },
  ];

  const handleCardClick = (id: string) => {
    if (id === "income") onIncomeClick?.();
    else if (id === "expenses") onExpensesClick?.();
    else if (id === "available") onAvailableClick?.();
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => {
          const clickable = card.id === "income" || card.id === "expenses" || card.id === "available";
          const isUp = card.trend > 0;
          const goodUp = !card.invert;
          const flat = Math.abs(card.trend) < 0.05 || (card.trend === 0 && (card.id === "available" || card.id === "recurring"));
          const cls = flat ? "flat" : isUp === goodUp ? "up" : "down";
          const showTrendCaption = card.id === "income" || card.id === "expenses";
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => clickable && handleCardClick(card.id)}
              disabled={!clickable}
              className={`ft-kpi text-left ${clickable ? "cursor-pointer" : "cursor-default"}`}
            >
              {/* Top row: icon + label */}
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className={`ft-kpi-icon ${card.iconClass} flex-shrink-0`}>
                  <card.icon className="h-4 w-4" />
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
              <div
                className={`ft-kpi-value truncate min-w-0 ${isPrivacyMode ? "blur-md select-none" : ""}`}
                style={{ fontSize: "clamp(1.125rem, 4.4vw, 1.625rem)" }}
              >
                {card.isCount ? card.value : formatCurrency(card.value)}
              </div>

              {/* Delta + caption */}
              {showTrendCaption ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                  <span className={`ft-delta ${cls} whitespace-nowrap`}>
                    {flat ? "—" : isUp ? "↑" : "↓"} {Math.abs(card.trend).toFixed(1)}%
                  </span>
                  <span className="hidden sm:inline truncate">
                    {t("dashboard.vsPriorPeriod", { defaultValue: "vs. prior period" })}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground truncate">
                  {card.id === "available"
                    ? t("dashboard.acrossAccounts", { defaultValue: "across {{n}} accounts", n: accounts.length })
                    : t("dashboard.activePlans", { defaultValue: "active plans" })}
                </div>
              )}

              {/* Sparkline */}
              <div className="h-7 -mt-1">
                <Sparkline data={card.spark} color={card.sparkColor} />
              </div>
            </button>
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
