import { useState, useMemo } from "react";
import { History } from "lucide-react";
import { TransactionSearch, TransactionFilters } from "@/components/TransactionSearch";
import { TransactionHistory } from "@/components/TransactionHistory";

const Transactions = () => {
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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historique complet avec filtres avancés
          </p>
        </div>

        {/* Search and Filters */}
        <TransactionSearch 
          filters={filters}
          onFiltersChange={setFilters}
          activeFiltersCount={activeFiltersCount}
        />

        {/* Transaction History */}
        <TransactionHistory filters={filters} />
      </div>
    </div>
  );
};

export default Transactions;
