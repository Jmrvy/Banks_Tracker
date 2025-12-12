import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";
import { BarChart3 } from "lucide-react";
import { useReportsData } from "@/hooks/useReportsData";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { StatsCards } from "@/components/reports/StatsCards";
import { EvolutionTab } from "@/components/reports/EvolutionTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { RecurringTab } from "@/components/reports/RecurringTab";
import { IncomeTab } from "@/components/reports/IncomeTab";
import { InsightsTab } from "@/components/reports/InsightsTab";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";

const Reports = () => {
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<"month" | "year" | "custom">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);

  const {
    loading,
    period,
    stats,
    balanceEvolutionData,
    categoryChartData,
    recurringData,
    spendingPatternsData,
    incomeAnalysis,
    accounts,
    filteredTransactions
  } = useReportsData(periodType, selectedDate, dateRange, useSpendingPatterns);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <div>Chargement des récapitulatifs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 overflow-x-hidden">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              Rapports
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {period.label}
            </p>
          </div>
        </div>

        {/* Filtres de période */}
        <PeriodSelector
          periodType={periodType}
          setPeriodType={setPeriodType}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />

        {/* Résumé des soldes */}
        <StatsCards 
          stats={stats} 
          accountsCount={accounts.length}
          onIncomeClick={() => setShowIncomeModal(true)}
          onExpensesClick={() => setShowExpensesModal(true)}
        />

        {/* Graphiques et analyses */}
        <Tabs defaultValue="evolution" className="space-y-3 sm:space-y-4 w-full">
          <div className="w-full overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            <TabsList className="inline-flex sm:flex sm:w-full bg-muted/30 h-9 sm:h-10 p-0.5 sm:p-1 rounded-lg min-w-max sm:min-w-0">
              <TabsTrigger value="evolution" className="text-[11px] sm:text-xs lg:text-sm px-3 sm:px-3 sm:flex-1 min-w-0 whitespace-nowrap">
                <span className="sm:hidden">📈</span>
                <span className="hidden sm:inline">Évolution</span>
              </TabsTrigger>
              <TabsTrigger value="insights" className="text-[11px] sm:text-xs lg:text-sm px-3 sm:px-3 sm:flex-1 min-w-0 whitespace-nowrap">
                <span className="sm:hidden">🎯</span>
                <span className="hidden sm:inline">Projections</span>
              </TabsTrigger>
              <TabsTrigger value="income" className="text-[11px] sm:text-xs lg:text-sm px-3 sm:px-3 sm:flex-1 min-w-0 whitespace-nowrap">
                <span className="sm:hidden">💰</span>
                <span className="hidden sm:inline">Revenus</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="text-[11px] sm:text-xs lg:text-sm px-3 sm:px-3 sm:flex-1 min-w-0 whitespace-nowrap">
                <span className="sm:hidden">📊</span>
                <span className="hidden sm:inline">Catégories</span>
              </TabsTrigger>
              <TabsTrigger value="recurring" className="text-[11px] sm:text-xs lg:text-sm px-3 sm:px-3 sm:flex-1 min-w-0 whitespace-nowrap">
                <span className="sm:hidden">🔄</span>
                <span className="hidden sm:inline">Récap</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="evolution">
            <EvolutionTab
              balanceEvolutionData={balanceEvolutionData}
              stats={stats}
              recurringData={recurringData}
              spendingPatternsData={spendingPatternsData}
              useSpendingPatterns={useSpendingPatterns}
              setUseSpendingPatterns={setUseSpendingPatterns}
            />
          </TabsContent>

          <TabsContent value="insights">
            <InsightsTab />
          </TabsContent>

          <TabsContent value="income">
            <IncomeTab 
              incomeAnalysis={incomeAnalysis}
              totalIncome={stats.income}
            />
          </TabsContent>

          <TabsContent value="categories">
            <CategoriesTab 
              categoryChartData={categoryChartData} 
              transactions={filteredTransactions}
            />
          </TabsContent>

          <TabsContent value="recurring">
            <RecurringTab
              recurringData={recurringData}
              spendingPatternsData={spendingPatternsData}
              period={period}
              useSpendingPatterns={useSpendingPatterns}
              setUseSpendingPatterns={setUseSpendingPatterns}
            />
          </TabsContent>
        </Tabs>
      </div>

      <TransactionTypeModal
        open={showIncomeModal}
        onOpenChange={setShowIncomeModal}
        transactions={filteredTransactions.filter(t => t.type === 'income')}
        type="income"
        period={period.label}
      />

      <TransactionTypeModal
        open={showExpensesModal}
        onOpenChange={setShowExpensesModal}
        transactions={filteredTransactions.filter(t => t.type === 'expense')}
        type="expense"
        period={period.label}
      />
    </div>
  );
};

export default Reports;