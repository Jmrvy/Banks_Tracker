import { TrendingUp } from "lucide-react";
import { MonthlyProjections } from "@/components/MonthlyProjections";
import { CategorySpendingList } from "@/components/CategorySpendingList";

const Insights = () => {

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Insights
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Analyses et projections</p>
        </div>

        {/* Content */}
        <div className="space-y-4 sm:space-y-6">
          <MonthlyProjections />
          <CategorySpendingList />
        </div>
      </div>
    </div>
  );
};

export default Insights;
