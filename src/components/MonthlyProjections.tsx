import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Repeat, BarChart3, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export const MonthlyProjections = () => {
  const { transactions, accounts, categories, recurringTransactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  // State to toggle between recurring transactions and spending patterns
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);

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
        .filter(t => t.category?.id === category.id && t.type === 'expense')
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Projections Mensuelles
          {!useSpendingPatterns && monthlyData.futureRecurringCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              <Repeat className="w-3 h-3 mr-1" />
              {monthlyData.futureRecurringCount} récurrentes
            </Badge>
          )}
          {useSpendingPatterns && (
            <Badge variant="outline" className="ml-2">
              <BarChart3 className="w-3 h-3 mr-1" />
              Patterns
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} • {monthlyData.daysRemaining} jours restants
        </p>
        
        {/* Toggle Button */}
        <div className="mt-3">
          <Button 
            variant={useSpendingPatterns ? "default" : "outline"}
            size="sm"
            onClick={() => setUseSpendingPatterns(!useSpendingPatterns)}
            className="flex items-center gap-2"
          >
            <BarChart3 className="w-3 h-3" />
            {useSpendingPatterns ? 'Utiliser récurrents' : 'Use spending patterns'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Financial Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Revenus ce mois
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-green-600">
                {formatCurrency(monthlyData.actualMonthlyIncome)}
              </p>
              <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground">
                  Projection: {formatCurrency(monthlyData.projectedIncome)}
                </p>
                {!useSpendingPatterns && monthlyData.projectedRecurringIncome > 0 && (
                  <p className="text-xs text-blue-600">
                    +{formatCurrency(monthlyData.projectedRecurringIncome)} récurrents
                  </p>
                )}
                {useSpendingPatterns && monthlyData.futureIncomeFromPatterns > 0 && (
                  <p className="text-xs text-orange-600">
                    +{formatCurrency(monthlyData.futureIncomeFromPatterns)} patterns
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Dépenses ce mois
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-red-600">
                {formatCurrency(monthlyData.actualMonthlyExpenses)}
              </p>
              <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground">
                  Projection: {formatCurrency(monthlyData.projectedExpenses)}
                </p>
                {!useSpendingPatterns && monthlyData.projectedRecurringExpenses > 0 && (
                  <p className="text-xs text-red-600">
                    +{formatCurrency(monthlyData.projectedRecurringExpenses)} récurrents
                  </p>
                )}
                {useSpendingPatterns && monthlyData.futureExpensesFromPatterns > 0 && (
                  <p className="text-xs text-orange-600">
                    +{formatCurrency(monthlyData.futureExpensesFromPatterns)} patterns
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar for month */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{monthlyData.daysInMonth - monthlyData.daysRemaining} jours écoulés</span>
            <span>{monthlyData.daysRemaining} jours restants</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((monthlyData.daysInMonth - monthlyData.daysRemaining) / monthlyData.daysInMonth) * 100}%` }}
            />
          </div>
        </div>

        {/* Two-Step Projection */}
        <div className="space-y-4">
          {/* Step 1: Current Balance to End of Month */}
          <div className="p-4 rounded-lg border bg-blue-50/50 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-blue-800 flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Étape 1: Projection depuis solde actuel
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1">
                <span className="text-sm">Solde actuel</span>
                <span className="font-medium">{formatCurrency(totalBalance)}</span>
              </div>
              
              <div className="flex justify-between items-center py-1">
                <span className="text-sm">
                  Flux futurs ({useSpendingPatterns ? 'patterns' : 'récurrents'})
                </span>
                <span className={`font-medium ${
                  futureNetCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {futureNetCashFlow >= 0 ? '+' : ''}{formatCurrency(futureNetCashFlow)}
                </span>
              </div>
              
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Solde projeté fin de mois</span>
                  <span className={`text-lg font-bold ${
                    projectedBalanceFromCurrent >= totalBalance ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(projectedBalanceFromCurrent)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Beginning of Month to End of Month */}
          <div className="p-4 rounded-lg border bg-green-50/50 border-green-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-green-800 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Étape 2: Projection mensuelle complète
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1">
                <span className="text-sm">Solde début de mois</span>
                <span className="font-medium">{formatCurrency(beginningOfMonthBalance)}</span>
              </div>
              
              <div className="flex justify-between items-center py-1">
                <span className="text-sm">Net mensuel projeté</span>
                <span className={`font-medium ${
                  monthlyData.projectedNet >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {monthlyData.projectedNet >= 0 ? '+' : ''}{formatCurrency(monthlyData.projectedNet)}
                </span>
              </div>
              
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Solde projeté fin de mois</span>
                  <span className={`text-lg font-bold ${
                    projectedBalanceFromBeginning >= beginningOfMonthBalance ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(projectedBalanceFromBeginning)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Calculation verification */}
          <div className="p-3 rounded-lg bg-muted/30 border">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Étape 1: {formatCurrency(totalBalance)} + ({formatCurrency(futureNetCashFlow)}) = {formatCurrency(projectedBalanceFromCurrent)}</div>
              <div>Étape 2: {formatCurrency(beginningOfMonthBalance)} + ({formatCurrency(monthlyData.projectedNet)}) = {formatCurrency(projectedBalanceFromBeginning)}</div>
              <div className="pt-1 border-t border-muted text-center font-medium">
                Les deux méthodes donnent le même résultat: {formatCurrency(projectedBalanceFromCurrent)}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Recurring Transactions - Only show when not using spending patterns */}
        {!useSpendingPatterns && monthlyData.upcomingRecurring.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Repeat className="w-4 h-4" />
              Prochaines Transactions Récurrentes
            </h4>
            <div className="space-y-2">
              {monthlyData.upcomingRecurring.map((upcoming, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm">
                  <div className="flex items-center space-x-2">
                    {upcoming.category && (
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: upcoming.category.color }}
                      />
                    )}
                    <span className="font-medium">{upcoming.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(upcoming.date).toLocaleDateString('fr-FR', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </span>
                  </div>
                  <span className={`font-semibold ${
                    upcoming.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {upcoming.type === 'income' ? '+' : '-'}{formatCurrency(upcoming.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Budget Alert */}
        {monthlyData.isOverBudget && monthlyData.totalBudget > 0 && (
          <div className="flex items-center space-x-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Attention: Dépassement prévu</p>
              <p className="text-xs text-muted-foreground">
                Réduisez vos dépenses de {formatCurrency(monthlyData.budgetOverage)} pour respecter le budget
              </p>
            </div>
          </div>
        )}

        {/* Budget Progress - ENHANCED */}
        {(monthlyData.categoriesWithSpending.length > 0 || monthlyData.categoriesWithoutSpending.length > 0) && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              Utilisation du Budget (incluant {useSpendingPatterns ? 'patterns' : 'récurrents'})
            </h4>
            
            {/* Categories with spending (most impacted first) */}
            {monthlyData.categoriesWithSpending.length > 0 && (
              <div className="space-y-3">
                {monthlyData.categoriesWithSpending.map((budget) => (
                  <div key={budget.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: budget.color }}
                        />
                        <span className="font-medium">{budget.name}</span>
                        {budget.projected > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {useSpendingPatterns ? (
                              <BarChart3 className="w-2 h-2 mr-1" />
                            ) : (
                              <Repeat className="w-2 h-2 mr-1" />
                            )}
                            +{formatCurrency(budget.projected)}
                          </Badge>
                        )}
                      </div>
                      <span className={`${
                        budget.percentage > 100 ? 'text-red-600 font-semibold' : 
                        budget.percentage > 80 ? 'text-orange-600' : 'text-muted-foreground'
                      }`}>
                        {formatCurrency(budget.used)} / {formatCurrency(budget.budget)}
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(budget.percentage, 100)} 
                      className="h-2"
                    />
                    {budget.percentage > 100 && (
                      <p className="text-xs text-red-600">
                        Dépassement prévu de {(budget.percentage - 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Categories without spending (grayed out) */}
            {monthlyData.categoriesWithoutSpending.length > 0 && (
              <div className="space-y-2 mt-4 pt-3 border-t border-muted">
                <span className="text-xs text-muted-foreground">Catégories sans dépenses</span>
                <div className="space-y-2">
                  {monthlyData.categoriesWithoutSpending.map((budget) => (
                    <div key={budget.name} className="flex items-center justify-between text-sm opacity-60">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: budget.color }}
                        />
                        <span>{budget.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatCurrency(budget.used)} / {formatCurrency(budget.budget)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Recommendations */}
        {monthlyData.totalBudget > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium">
              Recommandations (basées sur {useSpendingPatterns ? 'patterns' : 'récurrents'})
            </h4>
            
            {/* Top spending categories */}
            {monthlyData.categoriesWithSpending.length > 0 && (
              <div className="mb-3 p-3 bg-yellow-50/50 rounded-lg border border-yellow-200">
                <h5 className="text-xs font-medium text-yellow-800 mb-2">Catégories les plus impactées:</h5>
                <div className="space-y-1">
                  {monthlyData.categoriesWithSpending.slice(0, 3).map(cat => (
                    <div key={cat.name} className="text-xs text-yellow-700">
                      • <span className="font-medium">{cat.name}</span>: 
                      {cat.actual > 0 && <span> {formatCurrency(cat.actual)} dépensé</span>}
                      {cat.projected > 0 && <span> + {formatCurrency(cat.projected)} prévu</span>}
                      {cat.percentage > 100 && <span className="text-red-600"> (dépassement!)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                • Budget journalier recommandé: {formatCurrency(monthlyData.dailyBudgetRecommended)}
              </li>
              {!useSpendingPatterns && (
                <li>
                  • Récurrents à venir: +{formatCurrency(monthlyData.projectedRecurringIncome)} revenus, 
                  -{formatCurrency(monthlyData.projectedRecurringExpenses)} dépenses
                </li>
              )}
              {useSpendingPatterns && (
                <li>
                  • Patterns restants: +{formatCurrency(monthlyData.futureIncomeFromPatterns)} revenus, 
                  -{formatCurrency(monthlyData.futureExpensesFromPatterns)} dépenses
                </li>
              )}
              {monthlyData.remainingBudget > 0 ? (
                <li>• Budget restant disponible: {formatCurrency(monthlyData.remainingBudget)}</li>
              ) : (
                <li className="text-red-600">
                  • ⚠️ Budget dépassé de {formatCurrency(Math.abs(monthlyData.remainingBudget))}
                </li>
              )}
              <li className="pt-1 border-t border-muted">
                • Moyennes historiques: {formatCurrency(monthlyData.dailyIncomeAvg)}/jour revenus, 
                {formatCurrency(monthlyData.dailyExpenseAvg)}/jour dépenses
              </li>
            </ul>
          </div>
        )}

        {/* No budget message */}
        {monthlyData.totalBudget === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">Aucun budget défini</p>
            <p className="text-xs mt-1">
              Créez des catégories avec des budgets pour voir des projections détaillées
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
