import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TransactionSearch, TransactionFilters } from "@/components/TransactionSearch";
import { TransactionHistory } from "@/components/TransactionHistory";

const Transactions = () => {
  const { t } = useTranslation();
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
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.transactions')}</div>
            <h1 className="ft-page-title">{t('transactions.allTransactions', { defaultValue: 'All transactions' })}</h1>
            <div className="ft-page-sub">
              {t('transactions.subtitle', { defaultValue: 'Complete history with advanced filters' })}
            </div>
          </div>
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
