import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { DashboardHeader } from "@/components/DashboardHeader";
import { AccountCards } from "@/components/AccountCards";
import { BudgetGauge } from "@/components/BudgetGauge";
import { RecentTransactions } from "@/components/RecentTransactions";
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 pb-24">
      <div className="container mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-6">
        <DashboardHeader />
        <AccountCards />
        <RecurringTransactionsWarning />
        <BudgetGauge />
        <RecentTransactions />
      </div>
    </div>
  );
};

export default Index;
