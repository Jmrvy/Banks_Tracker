import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePeriod } from "@/contexts/PeriodContext";
import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ExcludedTransactionsModal } from "@/components/ExcludedTransactionsModal";
import { MobileQuickPreview } from "@/components/MobileQuickPreview";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();
  const { isOnboarding } = useOnboarding();
  const { selectedPeriod, setSelectedPeriod, dateRange, periodLabel } = usePeriod();
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [excludedTransactions, setExcludedTransactions] = useState<Transaction[]>([]);
  const [showQuickPreview, setShowQuickPreview] = useState(true);
  const isMobile = useIsMobile();

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

  // Show quick preview on mobile by default
  if (isMobile && showQuickPreview) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">Aperçu rapide</h1>
          <p className="text-sm text-muted-foreground">Vue d'ensemble de vos finances</p>
        </div>
        <MobileQuickPreview />
        <div className="px-4 pb-4">
          <button
            onClick={() => setShowQuickPreview(false)}
            className="w-full py-3 text-sm text-primary font-medium"
          >
            Afficher le tableau de bord complet
          </button>
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
          onAvailableClick={() => setShowExcludedModal(true)}
          onTransactionsFiltered={setFilteredTransactions}
          onExcludedTransactionsFiltered={setExcludedTransactions}
        />

        {/* Main content: Cashflow chart */}
        <CashflowChart startDate={dateRange.start} endDate={dateRange.end} />

        {/* Distribution chart below */}
        <DistributionChart startDate={dateRange.start} endDate={dateRange.end} />
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

      <ExcludedTransactionsModal
        open={showExcludedModal}
        onOpenChange={setShowExcludedModal}
        transactions={excludedTransactions}
        period={periodLabel}
      />
    </div>
  );
};

export default Index;
