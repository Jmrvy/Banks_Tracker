import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export const MonthlyProjections = () => {
  const { transactions, accounts, categories, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const monthlyData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;

    // Filter transactions for current month
    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    // Calculate current month income and expenses
    const monthlyIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate daily averages
    const dailyIncomeAvg = currentDay > 0 ? monthlyIncome / currentDay : 0;
    const dailyExpenseAvg = currentDay > 0 ? monthlyExpenses / currentDay : 0;

    // Project for end of month
    const projectedIncome = monthlyIncome + (dailyIncomeAvg * daysRemaining);
    const projectedExpenses = monthlyExpenses + (dailyExpenseAvg * daysRemaining);
    const projectedNet = projectedIncome - projectedExpenses;

    // Calculate total budget from categories
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    // Calculate budget used per category
    const budgetUsed = categories.map(category => {
      const categoryExpenses = currentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      return {
        name: category.name,
        used: categoryExpenses,
        budget: category.budget || 0,
        percentage: category.budget ? (categoryExpenses / category.budget) * 100 : 0,
        color: category.color
      };
    }).filter(cat => cat.budget > 0);

    // Calculate recommended daily budget
    const remainingBudget = totalBudget - monthlyExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? remainingBudget / daysRemaining : 0;

    return {
      monthlyIncome,
      monthlyExpenses,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      totalBudget,
      budgetUsed,
      currentDay,
      daysInMonth,
      daysRemaining,
      dailyIncomeAvg,
      dailyExpenseAvg,
      remainingBudget,
      dailyBudgetRecommended,
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: Math.max(0, projectedExpenses - totalBudget)
    };
  }, [transactions, categories]);

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
                {formatCurrency(monthlyData.monthlyIncome)}
              </p>
              <p className="text-xs text-muted-foreground">
                Projection: {formatCurrency(monthlyData.projectedIncome)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Dépenses ce mois
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-red-600">
                {formatCurrency(monthlyData.monthlyExpenses)}
              </p>
              <p className="text-xs text-muted-foreground">
                Projection: {formatCurrency(monthlyData.projectedExpenses)}
              </p>
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
            <span className="text-sm font-medium">Projection fin de mois</span>
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

        {/* Budget Progress - Only show top categories with budgets */}
        {monthlyData.budgetUsed.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Utilisation du Budget</h4>
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
                      Dépassement de {(budget.percentage - 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {monthlyData.totalBudget > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium">Recommandations</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                • Budget journalier recommandé: {formatCurrency(monthlyData.dailyBudgetRecommended)}
              </li>
              <li>
                • Moyennes actuelles: {formatCurrency(monthlyData.dailyIncomeAvg)}/jour revenus, {formatCurrency(monthlyData.dailyExpenseAvg)}/jour dépenses
              </li>
              {monthlyData.remainingBudget > 0 ? (
                <li>• Budget restant disponible: {formatCurrency(monthlyData.remainingBudget)}</li>
              ) : (
                <li className="text-red-600">• ⚠️ Budget déjà dépassé de {formatCurrency(Math.abs(monthlyData.remainingBudget))}</li>
              )}
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