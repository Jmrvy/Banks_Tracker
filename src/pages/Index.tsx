import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData, Transaction } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePeriod } from "@/contexts/PeriodContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { HeroNetWorth } from "@/components/dashboard/HeroNetWorth";
import { AccountsListCard } from "@/components/dashboard/AccountsListCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { SavingsGoalsCard } from "@/components/dashboard/SavingsGoalsCard";
import { UpcomingCard } from "@/components/dashboard/UpcomingCard";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";
import { OverdueDebtPaymentsAlert } from "@/components/OverdueDebtPaymentsAlert";
import { BudgetAlertsCard } from "@/components/BudgetAlertsCard";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ExcludedTransactionsModal } from "@/components/ExcludedTransactionsModal";
import { QuickPreview } from "@/components/QuickPreview";
import { AggregatedBalanceEvolution } from "@/components/dashboard/AggregatedBalanceEvolution";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { LayoutDashboard, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();
  const { needsOnboarding } = useOnboarding();
  const {
    selectedPeriod,
    setSelectedPeriod,
    dateRange,
    periodLabel,
    customDateRange,
    setCustomDateRange,
  } = usePeriod();
  const { preferences } = useUserPreferences();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
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

  // Noon, so a DST shift can never roll the picked day backward.
  const fixTimezone = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);

  const periods = [
    { label: "1M", value: "1m" },
    { label: "3M", value: "3m" },
    { label: "YTD", value: "ytd" },
    { label: "1Y", value: "1y" },
    { label: t("common.custom", { defaultValue: "Custom" }), value: "custom" },
  ];

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
        <div className="px-4 md:px-[30px] py-6 md:py-8 border-b border-line">
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
    <div className="min-h-screen bg-background">
      <div className="ft-page">
        {/* Page head — the page's own controls live here, never in the topbar:
            AppTopbar is about the whole app (where you are, privacy, theme). */}
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

          <div className="flex items-center gap-[9px] flex-wrap">
            <div className="ft-seg" role="group" aria-label={t('reports.period', { defaultValue: 'Period' })}>
              {periods.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={selectedPeriod === p.value ? "active" : ""}
                  aria-pressed={selectedPeriod === p.value}
                  onClick={() => setSelectedPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {selectedPeriod === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550] gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>
                        {t("common.from")}{" "}
                        {format(customDateRange.from, "dd/MM/yy", { locale: dateLocale })}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={customDateRange.from}
                      onSelect={(date) =>
                        date &&
                        setCustomDateRange({
                          ...customDateRange,
                          from: fixTimezone(date),
                        })
                      }
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550] gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>
                        {t("common.until")}{" "}
                        {format(customDateRange.to, "dd/MM/yy", { locale: dateLocale })}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={customDateRange.to}
                      onSelect={(date) =>
                        date &&
                        setCustomDateRange({ ...customDateRange, to: fixTimezone(date) })
                      }
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuickPreview(true)}
              className="h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550] gap-1.5"
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

        {/* What needs attention, paired the way the deck pairs it: what you
            have overspent beside what is about to leave. A fixed 2-up — a
            third live alert wraps to a second row at half width rather than
            squeezing the band into three columns. */}
        <div className="ft-g2e items-start [&>*:empty]:hidden empty:hidden">
          <BudgetAlertsCard />
          <RecurringTransactionsWarning />
          <OverdueDebtPaymentsAlert />
        </div>

        {/* Where the money went, before where it sits: the two charts answer
            "what happened this period", which is the question the greeting
            and the KPI row just raised. */}
        <div className="ft-g2">
          <CashflowChart startDate={dateRange.start} endDate={dateRange.end} />
          <DistributionChart startDate={dateRange.start} endDate={dateRange.end} />
        </div>

        {/* Accounts (full width) */}
        <AccountsListCard />

        {/* The pack closes on a pair: what already happened on the left,
            what is about to and what it is all for on the right. The balance
            chart is ours rather than the pack's — it sits under the activity
            list instead of standing in for it. */}
        <div className="ft-g2 items-start">
          <div className="flex flex-col gap-[18px]">
            <RecentActivityCard />
            <AggregatedBalanceEvolution />
          </div>
          <div className="flex flex-col gap-[18px]">
            <UpcomingCard />
            <SavingsGoalsCard />
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
