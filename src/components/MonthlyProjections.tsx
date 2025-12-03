import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Repeat, BarChart3, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { BudgetProjectionModal } from "@/components/BudgetProjectionModal";

export const MonthlyProjections = () => {
  const { transactions, accounts, categories, recurringTransactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  // State to toggle between recurring transactions and spending patterns
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;

    // Helper function to calculate next occurrence of a recurring transaction
    const getNextOccurrences = (recurring, fromDate, toDate) => {
      const occurrences = [];
      const startDate = new Date(Math.max(fromDate.getTime(), new Date(recurring.next_due_date).getTime()));
      const endDate = toDate;
      
      if (recurring.end_date && new Date(recurring.end_date) < fromDate) {
        return occurrences;
      }

      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        if (recurring.end_date && currentDate > new Date(recurring.end_date)) {
          break;
        }

        occurrences.push({
          date: new Date(currentDate),
          amount: recurring.amount,
          type: recurring.type,
          description: recurring.description,
          category: recurring.category,
          category_id: recurring.category_id
        });

        switch (recurring.recurrence_type) {
          case 'daily':
            currentDate.setDate(currentDate.getDate() + 1);
            break;
          case 'weekly':
            currentDate.setDate(currentDate.getDate() + 7);
            break;
          case 'biweekly':
            currentDate.setDate(currentDate.getDate() + 14);
            break;
          case 'monthly':
            currentDate.setMonth(currentDate.getMonth() + 1);
            break;
          case 'quarterly':
            currentDate.setMonth(currentDate.getMonth() + 3);
            break;
          case 'yearly':
            currentDate.setFullYear(currentDate.getFullYear() + 1);
            break;
          default:
            break;
        }
      }

      return occurrences;
    };

    // Filter transactions for current month
    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    // Calculate current month income and expenses from actual transactions
    const actualMonthlyIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const actualMonthlyExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const actualNetCashFlow = actualMonthlyIncome - actualMonthlyExpenses;

    // Get projected recurring transactions for the remaining days of the month
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const todayDate = new Date(currentYear, currentMonth, currentDay);

    // Get all recurring transaction occurrences for the current month
    const allRecurringOccurrences = [];
    recurringTransactions?.forEach(recurring => {
      if (recurring.is_active) {
        const occurrences = getNextOccurrences(recurring, monthStart, monthEnd);
        allRecurringOccurrences.push(...occurrences);
      }
    });

    // Split recurring transactions into past and future
    const futureRecurringOccurrences = allRecurringOccurrences.filter(occ => occ.date > todayDate);

    // Calculate projected income/expenses from recurring transactions
    const projectedRecurringIncome = futureRecurringOccurrences
      .filter(occ => occ.type === 'income')
      .reduce((sum, occ) => sum + occ.amount, 0);

    const projectedRecurringExpenses = futureRecurringOccurrences
      .filter(occ => occ.type === 'expense')
      .reduce((sum, occ) => sum + occ.amount, 0);

    const futureRecurringNet = projectedRecurringIncome - projectedRecurringExpenses;

    // Calculate averages for spending patterns
    const dailyIncomeAvg = currentDay > 0 ? actualMonthlyIncome / currentDay : 0;
    const dailyExpenseAvg = currentDay > 0 ? actualMonthlyExpenses / currentDay : 0;

    // Future projections based on spending patterns (only remaining days)
    const futureIncomeFromPatterns = dailyIncomeAvg * daysRemaining;
    const futureExpensesFromPatterns = dailyExpenseAvg * daysRemaining;
    const futurePatternNet = futureIncomeFromPatterns - futureExpensesFromPatterns;

    // Projections based on spending patterns (total month)
    const projectedIncomeFromPatterns = actualMonthlyIncome + futureIncomeFromPatterns;
    const projectedExpensesFromPatterns = actualMonthlyExpenses + futureExpensesFromPatterns;

    // Choose projection method based on toggle
    const projectedIncome = useSpendingPatterns 
      ? projectedIncomeFromPatterns 
      : actualMonthlyIncome + projectedRecurringIncome;
      
    const projectedExpenses = useSpendingPatterns 
      ? projectedExpensesFromPatterns 
      : actualMonthlyExpenses + projectedRecurringExpenses;

    const projectedNet = projectedIncome - projectedExpenses;

    // Calculate total budget from categories
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    // FIXED: Enhanced budget used per category calculation
    const budgetUsed = categories.map(category => {
      const actualCategoryExpenses = currentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      let projectedCategoryExpenses = 0;

      if (useSpendingPatterns) {
        // Project based on daily averages for this category
        const dailyCategoryExpenseAvg = currentDay > 0 ? actualCategoryExpenses / currentDay : 0;
        projectedCategoryExpenses = dailyCategoryExpenseAvg * daysRemaining;
      } else {
        // FIXED: Project based on recurring transactions - check both category_id and category name
        projectedCategoryExpenses = futureRecurringOccurrences
          .filter(occ => {
            // Check both category_id and category name for better matching
            return (occ.category_id === category.id || 
                   (occ.category && occ.category.name === category.name)) && 
                   occ.type === 'expense';
          })
          .reduce((sum, occ) => sum + occ.amount, 0);
      }

      const totalCategoryExpenses = actualCategoryExpenses + projectedCategoryExpenses;
      
      return {
        name: category.name,
        used: totalCategoryExpenses,
        actual: actualCategoryExpenses,
        projected: projectedCategoryExpenses,
        budget: category.budget || 0,
        percentage: category.budget ? (totalCategoryExpenses / category.budget) * 100 : 0,
        color: category.color
      };
    })
    .filter(cat => cat.budget > 0)
    // FIXED: Sort by total usage (actual + projected) descending to show most impacted first
    .sort((a, b) => (b.used || 0) - (a.used || 0));

    // Separate categories with spending vs no spending for better display
    const categoriesWithSpending = budgetUsed.filter(cat => cat.used > 0);
    const categoriesWithoutSpending = budgetUsed.filter(cat => cat.used === 0);

    // Calculate remaining budget and daily recommendations
    const remainingBudget = totalBudget - projectedExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? remainingBudget / daysRemaining : 0;

    // Get upcoming recurring transactions for display
    const upcomingRecurring = futureRecurringOccurrences
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);

    return {
      // Actual amounts (from transactions)
      actualMonthlyIncome,
      actualMonthlyExpenses,
      actualNetCashFlow,
      
      // Projected amounts (based on selected method)
      projectedIncome,
      projectedExpenses,
      projectedNet,
      
      // Future projections
      futureRecurringNet,
      futurePatternNet,
      projectedRecurringIncome,
      projectedRecurringExpenses,
      futureIncomeFromPatterns,
      futureExpensesFromPatterns,
      futureRecurringCount: futureRecurringOccurrences.length,
      upcomingRecurring,
      
      // Budget tracking - FIXED
      totalBudget,
      budgetUsed,
      categoriesWithSpending,
      categoriesWithoutSpending,
      remainingBudget,
      dailyBudgetRecommended,
      
      // Time tracking
      currentDay,
      daysInMonth,
      daysRemaining,
      dailyIncomeAvg,
      dailyExpenseAvg,
      
      // Alerts
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: Math.max(0, projectedExpenses - totalBudget)
    };
  }, [transactions, categories, recurringTransactions, useSpendingPatterns]);

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  
  // Calculate beginning of month balance (reverse engineer from current balance)
  const beginningOfMonthBalance = totalBalance - monthlyData.actualNetCashFlow;
  
  // Step 1: Current balance to end of month
  const futureNetCashFlow = useSpendingPatterns 
    ? monthlyData.futurePatternNet
    : monthlyData.futureRecurringNet;
  const projectedBalanceFromCurrent = totalBalance + futureNetCashFlow;
  
  // Step 2: Beginning of month to end of month  
  const projectedBalanceFromBeginning = beginningOfMonthBalance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Projections Mensuelles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Target className="w-4 h-4 sm:w-5 sm:h-5" />
            Projections du Mois
          </CardTitle>
          <Button 
            variant={useSpendingPatterns ? "default" : "outline"}
            size="sm"
            onClick={() => setUseSpendingPatterns(!useSpendingPatterns)}
            className="flex items-center gap-1.5 h-7 sm:h-8 text-xs sm:text-sm w-fit"
          >
            {useSpendingPatterns ? (
              <>
                <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Patterns</span>
              </>
            ) : (
              <>
                <Repeat className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Récurrents</span>
              </>
            )}
          </Button>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Jour {monthlyData.currentDay}/{monthlyData.daysInMonth} • {monthlyData.daysRemaining} jours restants
        </p>
      </CardHeader>
      
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="w-full bg-muted rounded-full h-1.5 sm:h-2">
            <div 
              className="bg-primary h-1.5 sm:h-2 rounded-full transition-all duration-300"
              style={{ width: `${((monthlyData.daysInMonth - monthlyData.daysRemaining) / monthlyData.daysInMonth) * 100}%` }}
            />
          </div>
        </div>

        {/* Financial Overview */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
              Revenus
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-green-600">
                {formatCurrency(monthlyData.actualMonthlyIncome)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                Proj: {formatCurrency(monthlyData.projectedIncome)}
              </p>
            </div>
          </div>
          
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
              Dépenses
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-red-600">
                {formatCurrency(monthlyData.actualMonthlyExpenses)}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                Proj: {formatCurrency(monthlyData.projectedExpenses)}
              </p>
            </div>
          </div>
        </div>

        {/* Projected Balance */}
        <div className="p-3 sm:p-4 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Solde fin de mois</p>
              <p className={`text-lg sm:text-2xl font-bold ${
                projectedBalanceFromCurrent >= totalBalance ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(projectedBalanceFromCurrent)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Variation</p>
              <p className={`text-sm sm:text-lg font-semibold ${
                futureNetCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {futureNetCashFlow >= 0 ? '+' : ''}{formatCurrency(futureNetCashFlow)}
              </p>
            </div>
          </div>
        </div>

        {/* Budget Alert */}
        {monthlyData.isOverBudget && monthlyData.totalBudget > 0 && (
          <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm font-medium text-destructive">Dépassement prévu</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                {formatCurrency(monthlyData.budgetOverage)} au-dessus
              </p>
            </div>
          </div>
        )}

        {/* Budget Details Button */}
        {monthlyData.totalBudget > 0 && (
          <Button 
            variant="outline" 
            className="w-full h-9 sm:h-10 text-xs sm:text-sm"
            onClick={() => setShowBudgetModal(true)}
          >
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            Budget: {formatCurrency(monthlyData.remainingBudget)}
          </Button>
        )}

        {/* No budget message */}
        {monthlyData.totalBudget === 0 && (
          <div className="text-center py-4 sm:py-6 text-muted-foreground">
            <Target className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs sm:text-sm">Aucun budget défini</p>
            <p className="text-[10px] sm:text-xs mt-1">
              Définissez des budgets pour vos catégories
            </p>
          </div>
        )}
      </CardContent>
      
      <BudgetProjectionModal 
        open={showBudgetModal}
        onOpenChange={setShowBudgetModal}
        useSpendingPatterns={useSpendingPatterns}
      />
    </Card>
  );
};
