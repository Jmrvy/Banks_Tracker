import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";
import { BarChart3, Calendar, CalendarCheck } from "lucide-react";
import { useReportsData } from "@/hooks/useReportsData";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { StatsCards } from "@/components/reports/StatsCards";
import { EvolutionTab } from "@/components/reports/EvolutionTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { RecurringTab } from "@/components/reports/RecurringTab";
import { IncomeTab } from "@/components/reports/IncomeTab";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  const [incomeExpenseDateType, setIncomeExpenseDateType] = useState<'accounting' | 'value'>('accounting');

  // Données pour Évolution et Récurrents - toujours en date comptable
  const {
    loading,
    period,
    stats,
    balanceEvolutionData,
    recurringData,
    spendingPatternsData,
    accounts,
    filteredTransactions
  } = useReportsData(periodType, selectedDate, dateRange, useSpendingPatterns, 'accounting');

  // Données pour Revenus et Dépenses - selon le choix de l'utilisateur
  const {
    stats: incomeExpenseStats,
    categoryChartData,
    incomeAnalysis,
    filteredTransactions: incomeExpenseTransactions
  } = useReportsData(periodType, selectedDate, dateRange, useSpendingPatterns, incomeExpenseDateType);

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
      <div className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6 max-w-[1600px] mx-auto w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              Rapports
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
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
        <Tabs defaultValue="evolution" className="space-y-3 w-full">
          <TabsList className="w-full grid grid-cols-4 bg-muted/30 h-9 sm:h-10 p-0.5 sm:p-1 rounded-lg">
            <TabsTrigger value="evolution" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8 data-[state=active]:bg-background">
              Évolution
            </TabsTrigger>
            <TabsTrigger value="income" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8 data-[state=active]:bg-background">
              Revenus
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8 data-[state=active]:bg-background">
              Dépenses
            </TabsTrigger>
            <TabsTrigger value="recurring" className="text-[10px] sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8 data-[state=active]:bg-background">
              Récurrents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="evolution" className="mt-3">
            <EvolutionTab
              balanceEvolutionData={balanceEvolutionData}
              stats={stats}
              recurringData={recurringData}
              spendingPatternsData={spendingPatternsData}
              useSpendingPatterns={useSpendingPatterns}
              setUseSpendingPatterns={setUseSpendingPatterns}
            />
          </TabsContent>

          <TabsContent value="income" className="mt-3 space-y-3">
            {/* Sélecteur de type de date pour Revenus */}
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Type de date :</span>
              <ToggleGroup 
                type="single" 
                value={incomeExpenseDateType} 
                onValueChange={(value) => value && setIncomeExpenseDateType(value as 'accounting' | 'value')}
                className="h-8"
              >
                <ToggleGroupItem value="accounting" className="text-xs h-7 px-2 gap-1">
                  <Calendar className="h-3 w-3" />
                  Comptable
                </ToggleGroupItem>
                <ToggleGroupItem value="value" className="text-xs h-7 px-2 gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  Valeur
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <IncomeTab 
              incomeAnalysis={incomeAnalysis}
              totalIncome={incomeExpenseStats.income}
            />
          </TabsContent>

          <TabsContent value="categories" className="mt-3 space-y-3">
            {/* Sélecteur de type de date pour Dépenses */}
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Type de date :</span>
              <ToggleGroup 
                type="single" 
                value={incomeExpenseDateType} 
                onValueChange={(value) => value && setIncomeExpenseDateType(value as 'accounting' | 'value')}
                className="h-8"
              >
                <ToggleGroupItem value="accounting" className="text-xs h-7 px-2 gap-1">
                  <Calendar className="h-3 w-3" />
                  Comptable
                </ToggleGroupItem>
                <ToggleGroupItem value="value" className="text-xs h-7 px-2 gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  Valeur
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <CategoriesTab 
              categoryChartData={categoryChartData} 
              transactions={incomeExpenseTransactions}
            />
          </TabsContent>

          <TabsContent value="recurring" className="mt-3">
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