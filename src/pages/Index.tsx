import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useState, useMemo } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { subMonths, startOfMonth, endOfMonth, subYears, format } from "date-fns";
import { fr } from "date-fns/locale";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();
  const { isOnboarding } = useOnboarding();
  const [selectedPeriod, setSelectedPeriod] = useState("1m");
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);

  // Calculate date range based on selected period
  const { dateRange, periodLabel } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = now;
    let label: string;

    switch (selectedPeriod) {
      case "1m":
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, "MMMM yyyy", { locale: fr });
        break;
      case "3m":
        start = startOfMonth(subMonths(now, 2));
        end = endOfMonth(now);
        label = "Derniers 3 mois";
        break;
      case "1y":
        start = startOfMonth(subYears(now, 1));
        end = endOfMonth(now);
        label = "Dernière année";
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, "MMMM yyyy", { locale: fr });
    }

    return { dateRange: { start, end }, periodLabel: label };
  }, [selectedPeriod]);

  if (loading || isOnboarding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <div>{isOnboarding ? 'Configuration de votre compte...' : 'Chargement de vos données financières...'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-24">
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      <div className="p-3 md:p-4 lg:p-6 space-y-4 md:space-y-6">
        <RecurringTransactionsWarning />

        {/* Stats cards */}
        <StatsCards 
          startDate={dateRange.start} 
          endDate={dateRange.end}
          onIncomeClick={() => setShowIncomeModal(true)}
          onExpensesClick={() => setShowExpensesModal(true)}
          onTransactionsFiltered={setFilteredTransactions}
        />

        {/* Main content: Cashflow + Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <CashflowChart startDate={dateRange.start} endDate={dateRange.end} />
          </div>
          <div className="lg:col-span-1">
            <DistributionChart startDate={dateRange.start} endDate={dateRange.end} />
          </div>
        </div>
      </div>

      <TransactionTypeModal
        open={showIncomeModal}
        onOpenChange={setShowIncomeModal}
        transactions={filteredTransactions.filter(t => t.type === 'income')}
        type="income"
        period={periodLabel}
      />

      <TransactionTypeModal
        open={showExpensesModal}
        onOpenChange={setShowExpensesModal}
        transactions={filteredTransactions.filter(t => t.type === 'expense')}
        type="expense"
        period={periodLabel}
      />
    </div>
  );
};

export default Index;
