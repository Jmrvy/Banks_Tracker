import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { DashboardHeader } from "@/components/DashboardHeader";
import { AccountCards } from "@/components/AccountCards";
import { SpendingOverview } from "@/components/SpendingOverview";
import { RecentTransactions } from "@/components/RecentTransactions";
import { MonthlyProjections } from "@/components/MonthlyProjections";

const Index = () => {
  const { user } = useAuth();
  const { loading } = useFinancialData();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div>Loading your financial data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 space-y-8">
        <DashboardHeader />
        <AccountCards />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SpendingOverview />
          <MonthlyProjections />
        </div>
        <RecentTransactions />
      </div>
    </div>
  );
};

export default Index;