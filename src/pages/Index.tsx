import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePeriod } from "@/contexts/PeriodContext";
import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ExcludedTransactionsModal } from "@/components/ExcludedTransactionsModal";
import { QuickPreview } from "@/components/QuickPreview";
import { AggregatedBalanceEvolution } from "@/components/dashboard/AggregatedBalanceEvolution";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";

const QUICK_PREVIEW_SHOWN_KEY = "budget-app-quick-preview-shown";

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
  
  // Show quick preview only on first visit (check localStorage)
  const [showQuickPreview, setShowQuickPreview] = useState(() => {
    const hasSeenPreview = localStorage.getItem(QUICK_PREVIEW_SHOWN_KEY);
    return !hasSeenPreview;
  });

  // Mark preview as seen when user clicks to go to full dashboard
  const handleShowFullDashboard = () => {
    localStorage.setItem(QUICK_PREVIEW_SHOWN_KEY, "true");
    setShowQuickPreview(false);
  };

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

  // Show quick preview only on first visit
  if (showQuickPreview) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-8">
        <div className="p-4 md:p-6 lg:p-8 border-b">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Aperçu rapide</h1>
            <p className="text-sm md:text-base text-muted-foreground">Vue d'ensemble de vos finances</p>
          </div>
        </div>
        <QuickPreview onShowFullDashboard={handleShowFullDashboard} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-24">
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      {/* Button to go back to quick preview */}
      <div className="px-3 md:px-4 lg:px-6 pt-3 md:pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowQuickPreview(true)}
          className="gap-2 text-xs md:text-sm"
        >
          <LayoutDashboard className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Aperçu rapide
        </Button>
      </div>

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

        {/* Aggregated balance evolution chart */}
        <AggregatedBalanceEvolution />

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
