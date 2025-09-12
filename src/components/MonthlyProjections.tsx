import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export const MonthlyProjections = () => {
  const { transactions, accounts, categories, recurringTransactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

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
      
      // Check if recurring transaction has ended
      if (recurring.end_date && new Date(recurring.end_date) < fromDate) {
        return occurrences;
      }

      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        // Don't include if past end_date
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

        // Calculate next occurrence based on recurrence_type
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
            // Unknown recurrence type, break to avoid infinite loop
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

    // Split recurring transactions into past (already should have been processed) and future
    const futureRecurringOccurrences = allRecurringOccurrences.filter(occ => occ.date > todayDate);

    // Calculate projected income/expenses from recurring transactions
    const projectedRecurringIncome = futureRecurringOccurrences
      .filter(occ => occ.type === 'income')
      .reduce((sum, occ) => sum + occ.amount, 0);

    const projectedRecurringExpenses = futureRecurringOccurrences
      .filter(occ => occ.type === 'expense')
      .reduce((sum, occ) => sum + occ.amount, 0);

    // Total projected amounts (actual + future recurring)
    const projectedIncome = actualMonthlyIncome + projectedRecurringIncome;
    const projectedExpenses = actualMonthlyExpenses + projectedRecurringExpenses;
    const projectedNet = projectedIncome - projectedExpenses;

    // Calculate total budget from categories
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    // Calculate budget used per category (including projected recurring expenses)
    const budgetUsed = categories.map(category => {
      const actualCategoryExpenses = currentMonthTransactions
        .filter(t => t.category?.id === category.id && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const projectedCategoryExpenses = futureRecurringOccurrences
        .filter(occ => occ.category_id === category.id && occ.type === 'expense')
        .reduce((sum, occ) => sum + occ.amount, 0);

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
    }).filter(cat => cat.budget > 0);

    // Calculate remaining budget and daily recommendations
    const remainingBudget = totalBudget - projectedExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? remainingBudget / daysRemaining : 0;

    // Calculate averages for historical context
    const dailyIncomeAvg = currentDay > 0 ? actualMonthlyIncome / currentDay : 0;
    const dailyExpenseAvg = currentDay > 0 ? actualMonthlyExpenses / currentDay : 0;

    // Get upcoming recurring transactions for display
    const upcomingRecurring = futureRecurringOccurrences
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3); // Show next 3 upcoming

    return {
      // Actual amounts (from transactions)
      actualMonthlyIncome,
      actualMonthlyExpenses,
      
      // Projected amounts (actual + recurring)
      projectedIncome,
      projectedExpenses,
      projectedNet,
      
      // Recurring transaction details
      projectedRecurringIncome,
      projectedRecurringExpenses,
      futureRecurringCount: futureRecurringOccurrences.length,
      upcomingRecurring,
      
      // Budget tracking
      totalBudget,
      budgetUsed,
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
  }, [transactions, categories, recurringTransactions]);

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const projectedBalance = totalBalance + monthlyData.projectedNet;

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
          {monthlyData.futureRecurringCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              <Repeat className="w-3 h-3 mr-1" />
              {monthlyData.futureRecurringCount} récurrentes
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} • {monthlyData.daysRemaining} jours restants
        </p>
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
                {monthlyData.projectedRecurringIncome > 0 && (
                  <p className="text-xs text-blue-600">
                    +{formatCurrency(monthlyData.projectedRecurringIncome)} récurrents
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
                {monthlyData.projectedRecurringExpenses > 0 && (
                  <p className="text-xs text-red-600">
                    +{formatCurrency(monthlyData.projectedRecurringExpenses)} récurrents
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

        {/* Net Projection */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Projection fin de mois (basée sur récurrents)</span>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className={`text-2xl font-bold ${
              monthlyData.projectedNet >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {monthlyData.projectedNet >= 0 ? '+' : ''}{formatCurrency(monthlyData.projectedNet)}
            </p>
            <p className="text-sm text-muted-foreground">
              Solde projeté: {formatCurrency(projectedBalance)}
            </p>
          </div>
        </div>

        {/* Upcoming Recurring Transactions */}
        {monthlyData.upcomingRecurring.length > 0 && (
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

        {/* Budget Progress - Enhanced with recurring transaction info */}
        {monthlyData.budgetUsed.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Utilisation du Budget (incluant récurrents)</h4>
            <div className="space-y-3">
              {monthlyData.budgetUsed
                .sort((a, b) => b.percentage - a.percentage)
                .slice(0, 4)
                .map((budget) => (
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
                          <Repeat className="w-2 h-2 mr-1" />
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
          </div>
        )}

        {/* Enhanced Recommendations */}
        {monthlyData.totalBudget > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium">Recommandations (basées sur récurrents)</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                • Budget journalier recommandé: {formatCurrency(monthlyData.dailyBudgetRecommended)}
              </li>
              <li>
                • Récurrents à venir: +{formatCurrency(monthlyData.projectedRecurringIncome)} revenus, 
                -{formatCurrency(monthlyData.projectedRecurringExpenses)} dépenses
              </li>
              {monthlyData.remainingBudget > 0 ? (
                <li>• Budget restant disponible: {formatCurrency(monthlyData.remainingBudget)}</li>
              ) : (
                <li className="text-red-600">
                  • ⚠️ Budget dépassé de {formatCurrency(Math.abs(monthlyData.remainingBudget))} avec récurrents
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
