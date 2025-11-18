import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useReportsData } from "@/hooks/useReportsData";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { StatsCards } from "@/components/reports/StatsCards";
import { EvolutionTab } from "@/components/reports/EvolutionTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { RecurringTab } from "@/components/reports/RecurringTab";
import { IncomeTab } from "@/components/reports/IncomeTab";
import { SavingsGoalsTab } from "@/components/reports/SavingsGoalsTab";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";

const Reports = () => {
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 pb-24">
      <div className="container mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/")}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Rapports
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {period.label}
              </p>
            </div>
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
        <Tabs defaultValue="evolution" className="space-y-3 sm:space-y-4">
          <TabsList className="grid w-full grid-cols-5 mx-auto bg-muted/30 h-8 sm:h-9 p-0.5 sm:p-1 rounded-lg">
            <TabsTrigger value="evolution" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3">Évolution</TabsTrigger>
            <TabsTrigger value="income" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3">Revenus</TabsTrigger>
            <TabsTrigger value="categories" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3">Catégories</TabsTrigger>
            <TabsTrigger value="recurring" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3">Récap</TabsTrigger>
            <TabsTrigger value="savings" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3">Épargne</TabsTrigger>
          </TabsList>

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

          <TabsContent value="savings">
            <SavingsGoalsTab 
              transactions={filteredTransactions}
              period={period}
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