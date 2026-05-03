import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePeriod } from "@/contexts/PeriodContext";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { HeroNetWorth } from "@/components/dashboard/HeroNetWorth";
import { AccountsListCard } from "@/components/dashboard/AccountsListCard";
import { SavingsGoalsCard } from "@/components/dashboard/SavingsGoalsCard";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";
import { OverdueDebtPaymentsAlert } from "@/components/OverdueDebtPaymentsAlert";
import { BudgetAlertsCard } from "@/components/BudgetAlertsCard";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ExcludedTransactionsModal } from "@/components/ExcludedTransactionsModal";
import { QuickPreview } from "@/components/QuickPreview";
import { AggregatedBalanceEvolution } from "@/components/dashboard/AggregatedBalanceEvolution";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Filter, Download } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();
  const { needsOnboarding } = useOnboarding();
  const { selectedPeriod, setSelectedPeriod, dateRange, periodLabel } = usePeriod();
  const { t } = useTranslation();
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [excludedTransactions, setExcludedTransactions] = useState<Transaction[]>([]);

  // Show quick preview only once per session (on first login/refresh)
  const [showQuickPreview, setShowQuickPreview] = useState(() => {
    return sessionStorage.getItem('quickPreviewDismissed') !== 'true';
  });

  const handleShowFullDashboard = () => {
    setShowQuickPreview(false);
    sessionStorage.setItem('quickPreviewDismissed', 'true');
  };

  if (loading) {
    return <LoadingSpinner text={t('dashboard.loadingData')} />;
  }

  // Redirect new users to onboarding setup
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  // Show quick preview on each login / page refresh
  if (showQuickPreview) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-24">
        <div className="px-4 md:px-8 py-6 md:py-8 border-b border-line">
          <div className="max-w-5xl mx-auto">
            <div className="ft-eyebrow mb-1.5">{t('dashboard.quickPreview')}</div>
            <h1 className="ft-page-title">{t('dashboard.quickPreviewSubtitle')}</h1>
          </div>
        </div>
        <QuickPreview onShowFullDashboard={handleShowFullDashboard} />
      </div>
    );
  }

  const firstName = user?.user_metadata?.full_name?.split(" ")[0]
    || user?.email?.split("@")[0]
    || "";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.home')}</div>
            <h1 className="ft-page-title">
              {firstName
                ? t('dashboard.greeting', { defaultValue: 'Good morning, {{name}}', name: firstName })
                : t('dashboard.title', { defaultValue: 'Dashboard' })}
            </h1>
            <div className="ft-page-sub">
              {t('dashboard.subtitle', { defaultValue: "Here's how your money moved this month." })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuickPreview(true)}
              className="gap-1.5 h-8 text-xs"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              {t('dashboard.quickPreview')}
            </Button>
          </div>
        </div>

        {/* Hero net-worth */}
        <HeroNetWorth />

        {/* KPIs */}
        <StatsCards
          startDate={dateRange.start}
          endDate={dateRange.end}
          onIncomeClick={() => setShowIncomeModal(true)}
          onExpensesClick={() => setShowExpensesModal(true)}
          onAvailableClick={() => setShowExcludedModal(true)}
          onTransactionsFiltered={setFilteredTransactions}
          onExcludedTransactionsFiltered={setExcludedTransactions}
        />

        {/* Compact alerts (recurring warnings + overdue debt) — 2-up on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 [&>*:empty]:hidden empty:hidden">
          <RecurringTransactionsWarning />
          <OverdueDebtPaymentsAlert />
        </div>

        {/* Budget breaches — full-width so per-category progress rows render legibly */}
        <BudgetAlertsCard />

        {/* Accounts (full width) */}
        <AccountsListCard />

        {/* Global balance evolution — running balance per recent transaction
            (replaces the old Recent activity card, same visual design) */}
        <AggregatedBalanceEvolution />

        {/* Cashflow + categories two-up */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 md:gap-5">
          <CashflowChart startDate={dateRange.start} endDate={dateRange.end} />
          <DistributionChart startDate={dateRange.start} endDate={dateRange.end} />
        </div>

        {/* Savings goals */}
        <SavingsGoalsCard />
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
