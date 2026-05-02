import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
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

export function StatsCards({ startDate, endDate, onIncomeClick, onExpensesClick, onAvailableClick, onTransactionsFiltered, onExcludedTransactionsFiltered }: StatsCardsProps) {
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

      const inPeriodByTransactionDate = transactionDate >= startDate && transactionDate <= endDate;
      const inPeriodByValueDate = valueDate >= startDate && valueDate <= endDate;

      return inPeriodByTransactionDate !== inPeriodByValueDate;
    });
  }, [transactions, startDate, endDate, activeDateType]);

  const { stats, filteredTransactions, excludedTransactions } = useMemo(() => {
    const filtered = transactions.filter(t => {
      const dateToUse = activeDateType === 'value'
        ? parseLocalDate(t.value_date || t.transaction_date)
        : parseLocalDate(t.transaction_date);

      return dateToUse >= startDate && dateToUse <= endDate;
    });

    // Filtrer uniquement les transactions qui doivent être incluses dans les stats
    const statsTransactions = filtered.filter(t => t.include_in_stats !== false);
    
    // Transactions exclues des stats sur la période
    const excluded = filtered.filter(t => t.include_in_stats === false);

    // Calculate income - exclude refunds as they're handled via net amount on expenses
    const moneyIn = statsTransactions
      .filter(t => t.type === 'income' && !t.refund_of_transaction_id)
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate expenses using NET amount (original amount - refunded amount)
    // This way, if 200€ expense has 160€ refunded, only 40€ is counted
    // If fully refunded (refunded >= amount), net is 0 (excess is separate income)
    const moneyOut = statsTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const refundedAmount = t.refunded_amount || 0;
        const netAmount = Math.max(0, t.amount - refundedAmount);
        return sum + netAmount;
      }, 0);

    const available = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    const activeRecurring = recurringTransactions.filter(rt => rt.is_active).length;

    return {
      stats: {
        moneyIn,
        moneyOut,
        available,
        recurring: activeRecurring
      },
      filteredTransactions: statsTransactions, // Only pass transactions included in stats
      excludedTransactions: excluded
    };
  }, [transactions, accounts, recurringTransactions, startDate, endDate, activeDateType]);

  // Use refs to store callbacks to avoid dependency issues
  const onTransactionsFilteredRef = useRef(onTransactionsFiltered);
  const onExcludedTransactionsFilteredRef = useRef(onExcludedTransactionsFiltered);
  
  // Update refs when callbacks change
  useEffect(() => {
    onTransactionsFilteredRef.current = onTransactionsFiltered;
    onExcludedTransactionsFilteredRef.current = onExcludedTransactionsFiltered;
  }, [onTransactionsFiltered, onExcludedTransactionsFiltered]);

  // Notify parent of filtered transactions using useEffect for proper side effects
  useEffect(() => {
    if (onTransactionsFilteredRef.current) {
      onTransactionsFilteredRef.current(filteredTransactions);
    }
  }, [filteredTransactions]);

  useEffect(() => {
    if (onExcludedTransactionsFilteredRef.current) {
      onExcludedTransactionsFilteredRef.current(excludedTransactions);
    }
  }, [excludedTransactions]);

  const cards = [
    {
      id: "income",
      label: t('common.income'),
      value: stats.moneyIn,
      icon: TrendingUp,
      iconClass: "pos",
    },
    {
      id: "expenses",
      label: t('common.expenses'),
      value: stats.moneyOut,
      icon: TrendingDown,
      iconClass: "neg",
    },
    {
      id: "available",
      label: t('reports.available'),
      value: stats.available,
      icon: Wallet,
      iconClass: "acc",
    },
    {
      id: "recurring",
      label: t('dashboard.recurring'),
      value: stats.recurring,
      icon: Repeat,
      iconClass: "warn",
      isCount: true
    }
  ];

  const handleCardClick = (id: string) => {
    if (id === "income" && onIncomeClick) {
      onIncomeClick();
    } else if (id === "expenses" && onExpensesClick) {
      onExpensesClick();
    } else if (id === "available" && onAvailableClick) {
      onAvailableClick();
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => {
          const clickable = card.id === "income" || card.id === "expenses" || card.id === "available";
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => clickable && handleCardClick(card.id)}
              disabled={!clickable}
              className={`ft-kpi text-left ${clickable ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`ft-kpi-icon ${card.iconClass}`}>
                  <card.icon className="h-4 w-4" />
                </div>
                <span className="ft-kpi-label flex items-center gap-1">
                  {card.label}
                  {card.id === "available" && hasDateDifference && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDateDifferenceModal(true);
                      }}
                      className="p-0.5 rounded-md hover:bg-bg-hover"
                    >
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                </span>
              </div>
              <div className={`ft-kpi-value truncate ${isPrivacyMode ? "blur-md select-none" : ""}`}>
                {card.isCount ? card.value : formatCurrency(card.value)}
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
