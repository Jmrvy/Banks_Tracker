import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Repeat, Info } from "lucide-react";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { ValueDateDifferenceModal } from "@/components/ValueDateDifferenceModal";

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
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [showDateDifferenceModal, setShowDateDifferenceModal] = useState(false);

  const activeDateType = preferences.dateType;

  const hasDateDifference = useMemo(() => {
    if (activeDateType !== "value") return false;

    return transactions.some((t) => {
      const transactionDate = new Date(t.transaction_date);
      const valueDate = new Date(t.value_date || t.transaction_date);

      const inPeriodByTransactionDate = transactionDate >= startDate && transactionDate <= endDate;
      const inPeriodByValueDate = valueDate >= startDate && valueDate <= endDate;

      return inPeriodByTransactionDate !== inPeriodByValueDate;
    });
  }, [transactions, startDate, endDate, activeDateType]);

  const { stats, filteredTransactions, excludedTransactions } = useMemo(() => {
    const filtered = transactions.filter(t => {
      const dateToUse = activeDateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);

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
      label: "Revenus",
      value: stats.moneyIn,
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10"
    },
    {
      label: "Dépenses",
      value: stats.moneyOut,
      icon: TrendingDown,
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    },
    {
      label: "Disponible",
      value: stats.available,
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      label: "Récurrents",
      value: stats.recurring,
      icon: Repeat,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      isCount: true
    }
  ];

  const handleCardClick = (label: string) => {
    if (label === "Revenus" && onIncomeClick) {
      onIncomeClick();
    } else if (label === "Dépenses" && onExpensesClick) {
      onExpensesClick();
    } else if (label === "Disponible" && onAvailableClick) {
      onAvailableClick();
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => (
          <Card
            key={card.label}
            className={`glass-hover ${
              (card.label === "Revenus" || card.label === "Dépenses" || card.label === "Disponible") ? "cursor-pointer" : ""
            }`}
            onClick={() => handleCardClick(card.label)}
          >
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0 mb-0.5 sm:mb-1">
                    <p className="text-xs sm:text-sm text-muted-foreground truncate min-w-0">{card.label}</p>
                    {card.label === "Disponible" && hasDateDifference && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDateDifferenceModal(true);
                        }}
                        className="p-0.5 rounded-lg hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                        aria-label="Voir les écarts entre date comptable et date valeur"
                      >
                        <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  <p className={`text-base sm:text-2xl font-bold truncate ${isPrivacyMode ? "blur-md select-none" : ""}`}>
                    {card.isCount ? card.value : formatCurrency(card.value)}
                  </p>
                </div>
                <div className={`h-7 w-7 sm:h-10 sm:w-10 rounded-full ${card.bgColor} backdrop-blur-sm items-center justify-center flex-shrink-0 ml-1 flex`}>
                  <card.icon className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
