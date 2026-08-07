import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePeriod } from "@/contexts/PeriodContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardPeriod } from "@/components/dashboard/DashboardPeriod";
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
  const { preferences } = useUserPreferences();
  const { t } = useTranslation();
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [excludedTransactions, setExcludedTransactions] = useState<Transaction[]>([]);

  // Quick Preview no longer gates Dashboard on every refresh. The user opts
  // in via a Settings toggle (`preferences.quickPreviewOnLogin`); a manual
  // override (the "Quick Preview" button in the page-head) still lets anyone
  // pop it open whenever they want.
  const [showQuickPreview, setShowQuickPreview] = useState(
    () => preferences.quickPreviewOnLogin
  );

  const handleShowFullDashboard = () => {
    setShowQuickPreview(false);
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

  // Time-of-day-aware greeting key. The four buckets each have their own
  // i18n key so French / English use the natural local form (no English
  // template translated word-for-word).
  const hour = new Date().getHours();
  const greetingKey =
    hour < 5 ? "dashboard.greetingNight"
    : hour < 12 ? "dashboard.greetingMorning"
    : hour < 18 ? "dashboard.greetingAfternoon"
    : "dashboard.greetingEvening";
  const greetingDefaults: Record<string, string> = {
    "dashboard.greetingNight": "Up late, {{name}}",
    "dashboard.greetingMorning": "Good morning, {{name}}",
    "dashboard.greetingAfternoon": "Good afternoon, {{name}}",
    "dashboard.greetingEvening": "Good evening, {{name}}",
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.home')}</div>
            <h1 className="ft-page-title">
              {firstName
                ? t(greetingKey, {
                    defaultValue: greetingDefaults[greetingKey],
                    name: firstName,
                  })
                : t('dashboard.title', { defaultValue: 'Dashboard' })}
            </h1>
            <div className="ft-page-sub">
              {t('dashboard.subtitle', { defaultValue: "Here's how your money moved this month." })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardPeriod
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuickPreview(true)}
              className="h-8 gap-1.5 rounded-[10px] px-2.5 text-xs font-medium"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              {t('dashboard.quickPreview')}
            </Button>
          </div>
        </div>

        {/* Hero net-worth */}
        <HeroNetWorth />

        {/* KPIs */}
        <div data-tour="kpis">
          <StatsCards
            startDate={dateRange.start}
            endDate={dateRange.end}
            onIncomeClick={() => setShowIncomeModal(true)}
            onExpensesClick={() => setShowExpensesModal(true)}
            onAvailableClick={() => setShowExcludedModal(true)}
            onTransactionsFiltered={setFilteredTransactions}
            onExcludedTransactionsFiltered={setExcludedTransactions}
          />
        </div>

        {/* Compact alerts (recurring warnings + overdue debt). Auto-fit grid
            so a single visible alert spans the full width instead of getting
            stretched to half — fixes the awkward half-width when only one
            of the two children is non-empty. */}
        {/* What needs attention, paired the way the deck pairs it: what you
            have overspent beside what is about to leave. Auto-fit so a lone
            surviving alert spans the row instead of being stretched to half. */}
        <div
          className="grid gap-3 md:gap-4 items-start [&>*:empty]:hidden empty:hidden"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}
        >
          <BudgetAlertsCard />
          <RecurringTransactionsWarning />
          <OverdueDebtPaymentsAlert />
        </div>

        {/* Where the money went, before where it sits: the two charts answer
            "what happened this period", which is the question the greeting
            and the KPI row just raised. */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 md:gap-5">
          <CashflowChart startDate={dateRange.start} endDate={dateRange.end} />
          <DistributionChart startDate={dateRange.start} endDate={dateRange.end} />
        </div>

        {/* Accounts (full width) */}
        <AccountsListCard />

        {/* Activity and goals close the page two-up — the running ledger on
            the left, what it is all for on the right. */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 md:gap-5 items-start">
          <AggregatedBalanceEvolution />
          <SavingsGoalsCard />
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
