import { ArrowLeft, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MonthlyProjections } from "@/components/MonthlyProjections";
import { CategorySpendingList } from "@/components/CategorySpendingList";
import { TransactionHistory } from "@/components/TransactionHistory";

const Insights = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 pb-24">
      <div className="container mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Insights
            </h1>
            <p className="text-sm text-muted-foreground">Analyses et projections</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 sm:space-y-6">
          <MonthlyProjections />
          <CategorySpendingList />
          <TransactionHistory />
        </div>
      </div>
    </div>
  );
};

export default Insights;
