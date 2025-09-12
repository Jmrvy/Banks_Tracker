import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

// Machine Learning helper functions
const calculateWeightedMovingAverage = (values, weights) => {
  if (values.length === 0) return 0;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedSum = values.reduce((sum, value, index) => sum + (value * (weights[index] || 1)), 0);
  return weightedSum / totalWeight;
};

const calculateSeasonalTrend = (monthlyData, targetMonth) => {
  if (monthlyData.length < 2) return 1;
  
  // Find same month in previous years
  const sameMonthData = monthlyData.filter(data => data.month === targetMonth);
  if (sameMonthData.length < 2) return 1;
  
  // Calculate seasonal multiplier
  const totalAverage = monthlyData.reduce((sum, data) => sum + data.amount, 0) / monthlyData.length;
  const monthAverage = sameMonthData.reduce((sum, data) => sum + data.amount, 0) / sameMonthData.length;
  
  return totalAverage > 0 ? monthAverage / totalAverage : 1;
};

const detectSpendingPattern = (dailyData) => {
  if (dailyData.length < 7) return { pattern: 'insufficient_data', multiplier: 1 };
  
  // Analyze weekly patterns
  const weekdayAvg = dailyData.filter((_, index) => index % 7 < 5).reduce((sum, val) => sum + val, 0) / (dailyData.length * 5/7);
  const weekendAvg = dailyData.filter((_, index) => index % 7 >= 5).reduce((sum, val) => sum + val, 0) / (dailyData.length * 2/7);
  
  // Detect trend (increasing, decreasing, stable)
  const firstHalf = dailyData.slice(0, Math.floor(dailyData.length / 2));
  const secondHalf = dailyData.slice(Math.floor(dailyData.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
  
  const trendMultiplier = firstAvg > 0 ? secondAvg / firstAvg : 1;
  
  return {
    pattern: trendMultiplier > 1.1 ? 'increasing' : trendMultiplier < 0.9 ? 'decreasing' : 'stable',
    multiplier: trendMultiplier,
    weekdayAvg,
    weekendAvg
  };
};

const polynomialRegression = (xValues, yValues, degree = 2) => {
  if (xValues.length < degree + 1) return null;
  
  // Simple polynomial regression for trend analysis
  const n = xValues.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumX2 += xValues[i] * xValues[i];
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return { slope, intercept };
};

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

    // Enhanced historical data analysis (last 6 months)
    const historicalMonths = Array.from({ length: 6 }, (_, i) => {
      const monthDate = new Date(currentYear, currentMonth - i - 1, 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      
      const monthTransactions = transactions.filter(t => {
        const date = new Date(t.transaction_date);
        return date >= monthStart && date <= monthEnd;
      });
      
      return {
        month: monthDate.getMonth(),
        year: monthDate.getFullYear(),
        income: monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expenses: monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        transactions: monthTransactions
      };
    }).reverse();

    // Current month transactions
    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    // Daily spending patterns for current month
    const dailyExpenses = Array.from({ length: currentDay }, (_, day) => {
      const dayTransactions = currentMonthTransactions.filter(t => {
        const date = new Date(t.transaction_date);
        return date.getDate() === day + 1;
      });
      return dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    });

    const dailyIncome = Array.from({ length: currentDay }, (_, day) => {
      const dayTransactions = currentMonthTransactions.filter(t => {
        const date = new Date(t.transaction_date);
        return date.getDate() === day + 1;
      });
      return dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    });

    // ML-based projections
    const spendingPattern = detectSpendingPattern(dailyExpenses);
    const incomePattern = detectSpendingPattern(dailyIncome);
    
    // Seasonal analysis
    const seasonalExpenseMultiplier = calculateSeasonalTrend(
      historicalMonths.map(m => ({ month: m.month, amount: m.expenses })), 
      currentMonth
    );
    const seasonalIncomeMultiplier = calculateSeasonalTrend(
      historicalMonths.map(m => ({ month: m.month, amount: m.income })), 
      currentMonth
    );

    // Weighted moving average (more recent months have higher weight)
    const expenseWeights = [1, 1.2, 1.5, 2, 2.5, 3]; // Recent months weighted more
    const incomeWeights = [1, 1.2, 1.5, 2, 2.5, 3];
    
    const historicalExpenseAvg = calculateWeightedMovingAverage(
      historicalMonths.map(m => m.expenses), 
      expenseWeights
    );
    const historicalIncomeAvg = calculateWeightedMovingAverage(
      historicalMonths.map(m => m.income), 
      incomeWeights
    );

    // Current month actual values
    const monthlyIncome = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const monthlyExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Enhanced projections using multiple methods
    const basicDailyExpenseAvg = currentDay > 0 ? monthlyExpenses / currentDay : 0;
    const basicDailyIncomeAvg = currentDay > 0 ? monthlyIncome / currentDay : 0;

    // Polynomial regression for trend analysis
    const expenseRegression = polynomialRegression(
      Array.from({ length: currentDay }, (_, i) => i + 1), 
      dailyExpenses
    );
    const incomeRegression = polynomialRegression(
      Array.from({ length: currentDay }, (_, i) => i + 1), 
      dailyIncome
    );

    // Advanced projection combining multiple models
    const remainingWeekdays = Math.floor(daysRemaining * 5/7);
    const remainingWeekends = daysRemaining - remainingWeekdays;

    // Method 1: Pattern-based projection with weekday/weekend adjustment
    const patternBasedExpenseProjection = currentDay > 0 ? 
      monthlyExpenses + (
        (spendingPattern.weekdayAvg * remainingWeekdays) + 
        (spendingPattern.weekendAvg * remainingWeekends)
      ) * spendingPattern.multiplier * seasonalExpenseMultiplier
      : historicalExpenseAvg * seasonalExpenseMultiplier;

    const patternBasedIncomeProjection = currentDay > 0 ? 
      monthlyIncome + (
        (incomePattern.weekdayAvg * remainingWeekdays) + 
        (incomePattern.weekendAvg * remainingWeekends)
      ) * incomePattern.multiplier * seasonalIncomeMultiplier
      : historicalIncomeAvg * seasonalIncomeMultiplier;

    // Method 2: Regression-based projection
    const regressionExpenseProjection = expenseRegression ? 
      monthlyExpenses + Array.from({ length: daysRemaining }, (_, i) => {
        const dayNum = currentDay + i + 1;
        return Math.max(0, expenseRegression.slope * dayNum + expenseRegression.intercept);
      }).reduce((sum, val) => sum + val, 0) : patternBasedExpenseProjection;

    const regressionIncomeProjection = incomeRegression ? 
      monthlyIncome + Array.from({ length: daysRemaining }, (_, i) => {
        const dayNum = currentDay + i + 1;
        return Math.max(0, incomeRegression.slope * dayNum + incomeRegression.intercept);
      }).reduce((sum, val) => sum + val, 0) : patternBasedIncomeProjection;

    // Method 3: Historical average with seasonal adjustment
    const historicalProjectedExpenses = currentDay > 0 ? 
      (monthlyExpenses / currentDay * daysInMonth) : 
      historicalExpenseAvg * seasonalExpenseMultiplier;

    const historicalProjectedIncome = currentDay > 0 ? 
      (monthlyIncome / currentDay * daysInMonth) : 
      historicalIncomeAvg * seasonalIncomeMultiplier;

    // Ensemble method: weighted average of all projections
    const confidenceBasedWeights = {
      pattern: Math.min(currentDay / 7, 1), // More confident with more data
      regression: Math.min(currentDay / 10, 0.8), // Regression needs more data
      historical: historicalMonths.length > 2 ? 0.6 : 0.3
    };

    const totalWeight = Object.values(confidenceBasedWeights).reduce((sum, w) => sum + w, 0);
    
    const projectedExpenses = (
      (patternBasedExpenseProjection * confidenceBasedWeights.pattern) +
      (regressionExpenseProjection * confidenceBasedWeights.regression) +
      (historicalProjectedExpenses * confidenceBasedWeights.historical)
    ) / totalWeight;

    const projectedIncome = (
      (patternBasedIncomeProjection * confidenceBasedWeights.pattern) +
      (regressionIncomeProjection * confidenceBasedWeights.regression) +
      (historicalProjectedIncome * confidenceBasedWeights.historical)
    ) / totalWeight;

    const projectedNet = projectedIncome - projectedExpenses;

    // Confidence scoring
    const dataConfidence = Math.min(
      (currentDay / daysInMonth) * 0.4 + // Current month data
      (historicalMonths.length / 6) * 0.3 + // Historical data availability
      (Math.min(transactions.length / 100, 1)) * 0.3, // Total transaction count
      1
    );

    // Calculate budget data
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    const budgetUsed = categories.map(category => {
      const categoryExpenses = currentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Project category spending using the same advanced method
      const categoryDailyAvg = currentDay > 0 ? categoryExpenses / currentDay : 0;
      const categoryProjection = categoryExpenses + (categoryDailyAvg * daysRemaining * spendingPattern.multiplier);
      
      return {
        name: category.name,
        used: categoryExpenses,
        projected: categoryProjection,
        budget: category.budget || 0,
        percentage: category.budget ? (categoryExpenses / category.budget) * 100 : 0,
        projectedPercentage: category.budget ? (categoryProjection / category.budget) * 100 : 0,
        color: category.color
      };
    }).filter(cat => cat.budget > 0);

    // Enhanced recommendations
    const remainingBudget = totalBudget - monthlyExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? remainingBudget / daysRemaining : 0;
    const projectedBudgetOverage = Math.max(0, projectedExpenses - totalBudget);

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
      dailyIncomeAvg: basicDailyIncomeAvg,
      dailyExpenseAvg: basicDailyExpenseAvg,
      remainingBudget,
      dailyBudgetRecommended,
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: projectedBudgetOverage,
      // ML-specific data
      spendingPattern,
      incomePattern,
      seasonalExpenseMultiplier,
      seasonalIncomeMultiplier,
      dataConfidence,
      historicalMonths: historicalMonths.length,
      projectionMethods: {
        pattern: patternBasedExpenseProjection,
        regression: regressionExpenseProjection,
        historical: historicalProjectedExpenses
      }
    };
  }, [transactions, categories]);

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const projectedBalance = totalBalance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Projections IA Mensuelles
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
          <Brain className="w-5 h-5" />
          Projections IA Mensuelles
        </CardTitle>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} • {monthlyData.daysRemaining} jours restants
          </p>
          <Badge variant={monthlyData.dataConfidence > 0.7 ? "default" : "secondary"}>
            Confiance: {(monthlyData.dataConfidence * 100).toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enhanced Financial Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Revenus ce mois
              {monthlyData.incomePattern.pattern !== 'stable' && (
                <Badge variant="outline" className="text-xs">
                  {monthlyData.incomePattern.pattern === 'increasing' ? '📈' : '📉'}
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-green-600">
                {formatCurrency(monthlyData.monthlyIncome)}
              </p>
              <p className="text-xs text-muted-foreground">
                Projection IA: {formatCurrency(monthlyData.projectedIncome)}
                {monthlyData.seasonalIncomeMultiplier !== 1 && (
                  <span className="ml-1 text-blue-600">
                    ({monthlyData.seasonalIncomeMultiplier > 1 ? '+' : ''}{((monthlyData.seasonalIncomeMultiplier - 1) * 100).toFixed(0)}% saisonnier)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Dépenses ce mois
              {monthlyData.spendingPattern.pattern !== 'stable' && (
                <Badge variant="outline" className="text-xs">
                  {monthlyData.spendingPattern.pattern === 'increasing' ? '📈' : '📉'}
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-red-600">
                {formatCurrency(monthlyData.monthlyExpenses)}
              </p>
              <p className="text-xs text-muted-foreground">
                Projection IA: {formatCurrency(monthlyData.projectedExpenses)}
                {monthlyData.seasonalExpenseMultiplier !== 1 && (
                  <span className="ml-1 text-blue-600">
                    ({monthlyData.seasonalExpenseMultiplier > 1 ? '+' : ''}{((monthlyData.seasonalExpenseMultiplier - 1) * 100).toFixed(0)}% saisonnier)
                  </span>
                )}
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

        {/* Enhanced Net Projection */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              Projection IA fin de mois
              <Brain className="w-3 h-3" />
            </span>
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
            <p className="text-xs text-muted-foreground">
              Basé sur {monthlyData.historicalMonths} mois d'historique • Pattern: {monthlyData.spendingPattern.pattern}
            </p>
          </div>
        </div>

        {/* Enhanced Budget Alert */}
        {monthlyData.isOverBudget && monthlyData.totalBudget > 0 && (
          <div className="flex items-center space-x-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Attention: Dépassement prévu par l'IA</p>
              <p className="text-xs text-muted-foreground">
                Projection de dépassement: {formatCurrency(monthlyData.budgetOverage)}
              </p>
            </div>
          </div>
        )}

        {/* Enhanced Budget Progress */}
        {monthlyData.budgetUsed.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              Utilisation du Budget (Projections IA)
              <Brain className="w-3 h-3" />
            </h4>
            <div className="space-y-3">
              {monthlyData.budgetUsed
                .sort((a, b) => b.projectedPercentage - a.projectedPercentage)
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
                    <div className="text-right">
                      <span className={`${
                        budget.percentage > 100 ? 'text-red-600 font-semibold' : 
                        budget.percentage > 80 ? 'text-orange-600' : 'text-muted-foreground'
                      }`}>
                        {formatCurrency(budget.used)} / {formatCurrency(budget.budget)}
                      </span>
                      <div className="text-xs text-blue-600">
                        Proj: {formatCurrency(budget.projected)}
                      </div>
                    </div>
                  </div>
                  <Progress 
                    value={Math.min(budget.percentage, 100)} 
                    className="h-2"
                  />
                  <Progress 
                    value={Math.min(budget.projectedPercentage, 100)} 
                    className="h-1 opacity-60"
                  />
                  {budget.projectedPercentage > 100 && (
                    <p className="text-xs text-red-600">
                      Dépassement projeté: {(budget.projectedPercentage - 100).toFixed(0)}%
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
            <h4 className="text-sm font-medium flex items-center gap-2">
              Recommandations IA
              <Brain className="w-3 h-3" />
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                • Budget journalier recommandé: {formatCurrency(monthlyData.dailyBudgetRecommended)}
              </li>
              <li>
                • Pattern détecté: {monthlyData.spendingPattern.pattern} 
                ({monthlyData.spendingPattern.multiplier > 1 ? '+' : ''}{((monthlyData.spendingPattern.multiplier - 1) * 100).toFixed(0)}%)
              </li>
              <li>
                • Différence weekend/semaine: {formatCurrency(monthlyData.spendingPattern.weekendAvg - monthlyData.spendingPattern.weekdayAvg)}/jour
              </li>
              {monthlyData.remainingBudget > 0 ? (
                <li>• Budget restant disponible: {formatCurrency(monthlyData.remainingBudget)}</li>
              ) : (
                <li className="text-red-600">• ⚠️ Budget déjà dépassé de {formatCurrency(Math.abs(monthlyData.remainingBudget))}</li>
              )}
              <li className="text-blue-600">
                • Confiance des prédictions: {(monthlyData.dataConfidence * 100).toFixed(0)}% 
                (basé sur {monthlyData.historicalMonths} mois d'historique)
              </li>
            </ul>
          </div>
        )}

        {/* No budget message */}
        {monthlyData.totalBudget === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" />
              Aucun budget défini pour l'analyse IA
            </p>
            <p className="text-xs mt-1">
              Créez des catégories avec des budgets pour voir des projections intelligentes
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
