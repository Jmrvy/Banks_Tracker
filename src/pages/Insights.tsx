import { useState, useMemo } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MonthlyProjections } from "@/components/MonthlyProjections";
import { CategorySpendingList } from "@/components/CategorySpendingList";
import { TransactionHistory } from "@/components/TransactionHistory";
import { TransactionSearch, TransactionFilters } from "@/components/TransactionSearch";

const Insights = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TransactionFilters>({
    searchText: '',
    type: 'all',
    categoryId: 'all',
    accountId: 'all',
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
  });

  // Compter les filtres actifs
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchText) count++;
    if (filters.type !== 'all') count++;
    if (filters.categoryId !== 'all') count++;
    if (filters.accountId !== 'all') count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.amountMin) count++;
    if (filters.amountMax) count++;
    return count;
  }, [filters]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Analyses et projections</p>
        </div>

        {/* Content */}
        <div className="space-y-4 sm:space-y-6">
          <MonthlyProjections />
          <CategorySpendingList />
          <TransactionSearch 
            filters={filters}
            onFiltersChange={setFilters}
            activeFiltersCount={activeFiltersCount}
          />
          <TransactionHistory filters={filters} />
        </div>
      </div>
    </div>
  );
};

export default Insights;
