import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useState, useMemo } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CashflowChart } from "@/components/dashboard/CashflowChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";
import { subMonths, startOfMonth, endOfMonth, subYears } from "date-fns";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();
  const { isOnboarding } = useOnboarding();
  const [selectedPeriod, setSelectedPeriod] = useState("1m");

  // Calculate date range based on selected period
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (selectedPeriod) {
      case "1m":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "3m":
        start = startOfMonth(subMonths(now, 2));
        end = endOfMonth(now);
        break;
      case "1y":
        start = startOfMonth(subYears(now, 1));
        end = endOfMonth(now);
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    return { start, end };
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
    <div className="min-h-screen bg-background pb-24">
      <DashboardHeader
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      <div className="p-6 space-y-6">
        <RecurringTransactionsWarning />

        {/* Stats cards */}
        <StatsCards startDate={dateRange.start} endDate={dateRange.end} />

        {/* Main content: Cashflow + Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CashflowChart startDate={dateRange.start} endDate={dateRange.end} />
          </div>
          <div className="lg:col-span-1">
            <DistributionChart startDate={dateRange.start} endDate={dateRange.end} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
