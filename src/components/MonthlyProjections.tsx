import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Repeat, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { BudgetProjectionModal } from "@/components/BudgetProjectionModal";

export const MonthlyProjections = () => {
  const { transactions, accounts, categories, recurringTransactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;

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

    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const actualMonthlyIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const actualMonthlyExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const actualNetCashFlow = actualMonthlyIncome - actualMonthlyExpenses;

    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const todayDate = new Date(currentYear, currentMonth, currentDay);

    const allRecurringOccurrences = [];
    recurringTransactions?.forEach(recurring => {
      if (recurring.is_active) {
        const occurrences = getNextOccurrences(recurring, monthStart, monthEnd);
        allRecurringOccurrences.push(...occurrences);
      }
    });

    const futureRecurringOccurrences = allRecurringOccurrences.filter(occ => occ.date > todayDate);

    const projectedRecurringIncome = futureRecurringOccurrences
      .filter(occ => occ.type === 'income')
      .reduce((sum, occ) => sum + occ.amount, 0);

    const projectedRecurringExpenses = futureRecurringOccurrences
      .filter(occ => occ.type === 'expense')
      .reduce((sum, occ) => sum + occ.amount, 0);

    const futureRecurringNet = projectedRecurringIncome - projectedRecurringExpenses;

    const dailyIncomeAvg = currentDay > 0 ? actualMonthlyIncome / currentDay : 0;
    const dailyExpenseAvg = currentDay > 0 ? actualMonthlyExpenses / currentDay : 0;

    const futureIncomeFromPatterns = dailyIncomeAvg * daysRemaining;
    const futureExpensesFromPatterns = dailyExpenseAvg * daysRemaining;
    const futurePatternNet = futureIncomeFromPatterns - futureExpensesFromPatterns;

    const projectedIncomeFromPatterns = actualMonthlyIncome + futureIncomeFromPatterns;
    const projectedExpensesFromPatterns = actualMonthlyExpenses + futureExpensesFromPatterns;

    const projectedIncome = useSpendingPatterns 
      ? projectedIncomeFromPatterns 
      : actualMonthlyIncome + projectedRecurringIncome;
      
    const projectedExpenses = useSpendingPatterns 
      ? projectedExpensesFromPatterns 
      : actualMonthlyExpenses + projectedRecurringExpenses;

    const projectedNet = projectedIncome - projectedExpenses;

    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    const budgetUsed = categories.map(category => {
      const actualCategoryExpenses = currentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      let projectedCategoryExpenses = 0;

      if (useSpendingPatterns) {
        const dailyCategoryExpenseAvg = currentDay > 0 ? actualCategoryExpenses / currentDay : 0;
        projectedCategoryExpenses = dailyCategoryExpenseAvg * daysRemaining;
      } else {
        projectedCategoryExpenses = futureRecurringOccurrences
          .filter(occ => {
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
    .sort((a, b) => (b.used || 0) - (a.used || 0));

    const categoriesWithSpending = budgetUsed.filter(cat => cat.used > 0);
    const categoriesWithoutSpending = budgetUsed.filter(cat => cat.used === 0);

    const remainingBudget = totalBudget - projectedExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? remainingBudget / daysRemaining : 0;

    const upcomingRecurring = futureRecurringOccurrences
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);

    return {
      actualMonthlyIncome,
      actualMonthlyExpenses,
      actualNetCashFlow,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      futureRecurringNet,
      futurePatternNet,
      projectedRecurringIncome,
      projectedRecurringExpenses,
      futureIncomeFromPatterns,
      futureExpensesFromPatterns,
      futureRecurringCount: futureRecurringOccurrences.length,
      upcomingRecurring,
      totalBudget,
      budgetUsed,
      categoriesWithSpending,
      categoriesWithoutSpending,
      remainingBudget,
      dailyBudgetRecommended,
      currentDay,
      daysInMonth,
      daysRemaining,
      dailyIncomeAvg,
      dailyExpenseAvg,
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: Math.max(0, projectedExpenses - totalBudget)
    };
  }, [transactions, categories, recurringTransactions, useSpendingPatterns]);

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const beginningOfMonthBalance = totalBalance - monthlyData.actualNetCashFlow;
  
  const futureNetCashFlow = useSpendingPatterns 
    ? monthlyData.futurePatternNet
    : monthlyData.futureRecurringNet;
  const projectedBalanceFromCurrent = totalBalance + futureNetCashFlow;

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Target className="w-4 h-4" />
            Projections du Mois
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-3 bg-muted rounded w-3/4 mb-1.5"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="p-3 sm:p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
              <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Projections du Mois</span>
            </CardTitle>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
              Jour {monthlyData.currentDay}/{monthlyData.daysInMonth} • {monthlyData.daysRemaining}j restants
            </p>
          </div>
          <Button 
            variant={useSpendingPatterns ? "default" : "outline"}
            size="sm"
            onClick={() => setUseSpendingPatterns(!useSpendingPatterns)}
            className="h-6 sm:h-7 px-2 text-[10px] sm:text-xs flex-shrink-0"
          >
            {useSpendingPatterns ? (
              <>
                <BarChart3 className="w-3 h-3 mr-1" />
                <span className="hidden xs:inline">Patterns</span>
              </>
            ) : (
              <>
                <Repeat className="w-3 h-3 mr-1" />
                <span className="hidden xs:inline">Récurrents</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 sm:p-4 pt-0 space-y-3">
        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-1.5">
          <div 
            className="bg-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((monthlyData.daysInMonth - monthlyData.daysRemaining) / monthlyData.daysInMonth) * 100}%` }}
          />
        </div>

        {/* Financial Overview - Compact grid */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-lg bg-success/10">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-success" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus</span>
            </div>
            <p className="text-sm sm:text-base font-semibold text-success">
              {formatCurrency(monthlyData.actualMonthlyIncome)}
            </p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">
              → {formatCurrency(monthlyData.projectedIncome)}
            </p>
          </div>
          
          <div className="p-2 sm:p-2.5 rounded-lg bg-destructive/10">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown className="w-3 h-3 text-destructive" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépenses</span>
            </div>
            <p className="text-sm sm:text-base font-semibold text-destructive">
              {formatCurrency(monthlyData.actualMonthlyExpenses)}
            </p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">
              → {formatCurrency(monthlyData.projectedExpenses)}
            </p>
          </div>
        </div>

        {/* Projected Balance - Compact */}
        <div className="p-2.5 sm:p-3 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Solde fin de mois</p>
              <p className={`text-sm sm:text-lg font-bold ${
                projectedBalanceFromCurrent >= totalBalance ? 'text-success' : 'text-destructive'
              }`}>
                {formatCurrency(projectedBalanceFromCurrent)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">Variation</p>
              <p className={`text-xs sm:text-sm font-semibold ${
                futureNetCashFlow >= 0 ? 'text-success' : 'text-destructive'
              }`}>
                {futureNetCashFlow >= 0 ? '+' : ''}{formatCurrency(futureNetCashFlow)}
              </p>
            </div>
          </div>
        </div>

        {/* Budget Alert - Compact */}
        {monthlyData.isOverBudget && monthlyData.totalBudget > 0 && (
          <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-destructive">
                Dépassement: {formatCurrency(monthlyData.budgetOverage)}
              </p>
            </div>
          </div>
        )}

        {/* Budget Button - Compact */}
        {monthlyData.totalBudget > 0 && (
          <Button 
            variant="outline" 
            className="w-full h-7 sm:h-8 text-[10px] sm:text-xs"
            onClick={() => setShowBudgetModal(true)}
          >
            <DollarSign className="w-3 h-3 mr-1" />
            Budget restant: {formatCurrency(monthlyData.remainingBudget)}
          </Button>
        )}

        {/* No budget message - Compact */}
        {monthlyData.totalBudget === 0 && (
          <div className="text-center py-3 text-muted-foreground">
            <Target className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
            <p className="text-[10px] sm:text-xs">Aucun budget défini</p>
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
