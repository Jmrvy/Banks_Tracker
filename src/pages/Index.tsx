import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { DashboardHeader } from "@/components/DashboardHeader";
import { AccountCards } from "@/components/AccountCards";
import { SpendingOverview } from "@/components/SpendingOverview";
import { RecentTransactions } from "@/components/RecentTransactions";
import { MonthlyProjections } from "@/components/MonthlyProjections";
import { RecurringTransactionsWarning } from "@/components/RecurringTransactionsWarning";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();
  const { isOnboarding } = useOnboarding();

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
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-6 space-y-4 sm:space-y-6 lg:space-y-8">
        <DashboardHeader />
        <AccountCards />
        <RecurringTransactionsWarning />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          <SpendingOverview />
          <MonthlyProjections />
        </div>
        <RecentTransactions />
      </div>
    </div>
  );
};

export default Index;
