import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Brain, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

// Helper functions pour les transactions récurrentes
const getNextOccurrences = (recurringTransaction, fromDate, toDate) => {
  const occurrences = [];
  const frequency = recurringTransaction.frequency;
  const interval = recurringTransaction.interval || 1;
  const startDate = new Date(recurringTransaction.start_date);
  let nextDate = new Date(startDate);

  // Ajuster la date de début si elle est antérieure à fromDate
  while (nextDate < fromDate) {
    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + interval);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + (interval * 7));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + interval);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + (interval * 3));
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + interval);
        break;
    }
  }

  // Générer toutes les occurrences dans la période
  while (nextDate <= toDate && (!recurringTransaction.end_date || nextDate <= new Date(recurringTransaction.end_date))) {
    if (nextDate >= fromDate) {
      occurrences.push({
        date: new Date(nextDate),
        amount: recurringTransaction.amount,
        type: recurringTransaction.type,
        category: recurringTransaction.category,
        description: recurringTransaction.description,
        isRecurring: true,
        originalRecurring: recurringTransaction
      });
    }

    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + interval);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + (interval * 7));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + interval);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + (interval * 3));
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + interval);
        break;
    }
  }

  return occurrences;
};

const calculateWeightedMovingAverage = (values, weights) => {
  if (values.length === 0) return 0;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedSum = values.reduce((sum, value, index) => sum + (value * (weights[index] || 1)), 0);
  return weightedSum / totalWeight;
};

const calculateSeasonalTrend = (monthlyData, targetMonth) => {
  if (monthlyData.length < 2) return 1;
  
  const sameMonthData = monthlyData.filter(data => data.month === targetMonth);
  if (sameMonthData.length < 2) return 1;
  
  const totalAverage = monthlyData.reduce((sum, data) => sum + data.amount, 0) / monthlyData.length;
  const monthAverage = sameMonthData.reduce((sum, data) => sum + data.amount, 0) / sameMonthData.length;
  
  return totalAverage > 0 ? monthAverage / totalAverage : 1;
};

const detectSpendingPattern = (dailyData) => {
  if (dailyData.length < 7) return { pattern: 'insufficient_data', multiplier: 1, weekdayAvg: 0, weekendAvg: 0 };
  
  const weekdayData = dailyData.filter((_, index) => {
    const dayOfWeek = new Date().getDay() - dailyData.length + index + 1;
    return dayOfWeek % 7 < 5 && dayOfWeek % 7 > 0;
  });
  const weekendData = dailyData.filter((_, index) => {
    const dayOfWeek = new Date().getDay() - dailyData.length + index + 1;
    return dayOfWeek % 7 === 0 || dayOfWeek % 7 === 6;
  });
  
  const weekdayAvg = weekdayData.length > 0 ? weekdayData.reduce((sum, val) => sum + val, 0) / weekdayData.length : 0;
  const weekendAvg = weekendData.length > 0 ? weekendData.reduce((sum, val) => sum + val, 0) / weekendData.length : 0;
  
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

    // Dates importantes
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const remainingPeriodStart = new Date(currentYear, currentMonth, currentDay + 1);

    // **NOUVEAU : Génération des transactions récurrentes pour le reste du mois**
    const recurringTransactionsThisMonth = recurringTransactions?.flatMap(recurring => 
      getNextOccurrences(recurring, monthStart, monthEnd)
    ) || [];

    const recurringTransactionsRemaining = recurringTransactions?.flatMap(recurring => 
      getNextOccurrences(recurring, remainingPeriodStart, monthEnd)
    ) || [];

    console.log('Transactions récurrentes trouvées pour ce mois:', recurringTransactionsThisMonth.length);
    console.log('Transactions récurrentes restantes:', recurringTransactionsRemaining.length);

    // Analyse historique (6 derniers mois) incluant les récurrentes
    const historicalMonths = Array.from({ length: 6 }, (_, i) => {
      const monthDate = new Date(currentYear, currentMonth - i - 1, 1);
      const histMonthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const histMonthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      
      const monthTransactions = transactions.filter(t => {
        const date = new Date(t.transaction_date);
        return date >= histMonthStart && date <= histMonthEnd;
      });

      // Ajouter les transactions récurrentes historiques
      const histRecurringTransactions = recurringTransactions?.flatMap(recurring => 
        getNextOccurrences(recurring, histMonthStart, histMonthEnd)
      ) || [];
      
      const allMonthTransactions = [...monthTransactions, ...histRecurringTransactions];
      
      return {
        month: monthDate.getMonth(),
        year: monthDate.getFullYear(),
        income: allMonthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expenses: allMonthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        transactions: allMonthTransactions
      };
    }).reverse();

    // Transactions actuelles du mois (réelles + récurrentes déjà passées)
    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    // Ajouter les transactions récurrentes qui auraient dû se produire jusqu'à maintenant
    const recurringTransactionsPast = recurringTransactionsThisMonth.filter(rt => 
      rt.date <= now
    );

    const allCurrentMonthTransactions = [...currentMonthTransactions, ...recurringTransactionsPast];

    // **CALCULS AVANCÉS AVEC RÉCURRENTES**
    
    // Revenus et dépenses actuels (incluant récurrentes passées)
    const monthlyIncome = allCurrentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const monthlyExpenses = allCurrentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Revenus et dépenses récurrents prévus pour le reste du mois
    const remainingRecurringIncome = recurringTransactionsRemaining
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const remainingRecurringExpenses = recurringTransactionsRemaining
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Données quotidiennes pour le pattern analysis
    const dailyExpenses = Array.from({ length: currentDay }, (_, day) => {
      const dayTransactions = allCurrentMonthTransactions.filter(t => {
        const date = new Date(t.transaction_date || t.date);
        return date.getDate() === day + 1;
      });
      return dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    });

    const dailyIncome = Array.from({ length: currentDay }, (_, day) => {
      const dayTransactions = allCurrentMonthTransactions.filter(t => {
        const date = new Date(t.transaction_date || t.date);
        return date.getDate() === day + 1;
      });
      return dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    });

    // Pattern analysis
    const spendingPattern = detectSpendingPattern(dailyExpenses);
    const incomePattern = detectSpendingPattern(dailyIncome);
    
    // Analyse saisonnière
    const seasonalExpenseMultiplier = calculateSeasonalTrend(
      historicalMonths.map(m => ({ month: m.month, amount: m.expenses })), 
      currentMonth
    );
    const seasonalIncomeMultiplier = calculateSeasonalTrend(
      historicalMonths.map(m => ({ month: m.month, amount: m.income })), 
      currentMonth
    );

    // Moyennes pondérées historiques
    const expenseWeights = [1, 1.2, 1.5, 2, 2.5, 3];
    const incomeWeights = [1, 1.2, 1.5, 2, 2.5, 3];
    
    const historicalExpenseAvg = calculateWeightedMovingAverage(
      historicalMonths.map(m => m.expenses), 
      expenseWeights
    );
    const historicalIncomeAvg = calculateWeightedMovingAverage(
      historicalMonths.map(m => m.income), 
      incomeWeights
    );

    // **PROJECTIONS AVANCÉES AVEC RÉCURRENTES**
    
    // Méthode 1: Pattern + Récurrentes
    const basicDailyExpenseAvg = currentDay > 0 ? (monthlyExpenses - recurringTransactionsPast.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)) / currentDay : 0;
    const basicDailyIncomeAvg = currentDay > 0 ? (monthlyIncome - recurringTransactionsPast.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)) / currentDay : 0;

    const remainingWeekdays = Math.floor(daysRemaining * 5/7);
    const remainingWeekends = daysRemaining - remainingWeekdays;

    const patternBasedExpenseProjection = monthlyExpenses + 
      remainingRecurringExpenses + 
      ((spendingPattern.weekdayAvg * remainingWeekdays) + 
       (spendingPattern.weekendAvg * remainingWeekends)) * spendingPattern.multiplier * seasonalExpenseMultiplier;

    const patternBasedIncomeProjection = monthlyIncome + 
      remainingRecurringIncome + 
      ((incomePattern.weekdayAvg * remainingWeekdays) + 
       (incomePattern.weekendAvg * remainingWeekends)) * incomePattern.multiplier * seasonalIncomeMultiplier;

    // Méthode 2: Historique + Récurrentes
    const historicalProjectedExpenses = currentDay > 0 ? 
      monthlyExpenses + remainingRecurringExpenses + (basicDailyExpenseAvg * daysRemaining) : 
      historicalExpenseAvg * seasonalExpenseMultiplier;

    const historicalProjectedIncome = currentDay > 0 ? 
      monthlyIncome + remainingRecurringIncome + (basicDailyIncomeAvg * daysRemaining) : 
      historicalIncomeAvg * seasonalIncomeMultiplier;

    // Méthode 3: Récurrentes pures (baseline très fiable)
    const recurringOnlyExpenseProjection = monthlyExpenses + remainingRecurringExpenses;
    const recurringOnlyIncomeProjection = monthlyIncome + remainingRecurringIncome;

    // Ensemble method avec pondération améliorée
    const confidenceBasedWeights = {
      pattern: Math.min(currentDay / 7, 1) * 0.4,
      historical: historicalMonths.length > 2 ? 0.3 : 0.15,
      recurring: 0.3 // Poids important pour les récurrentes car très fiables
    };

    const totalWeight = Object.values(confidenceBasedWeights).reduce((sum, w) => sum + w, 0);
    
    const projectedExpenses = (
      (patternBasedExpenseProjection * confidenceBasedWeights.pattern) +
      (historicalProjectedExpenses * confidenceBasedWeights.historical) +
      (recurringOnlyExpenseProjection * confidenceBasedWeights.recurring)
    ) / totalWeight;

    const projectedIncome = (
      (patternBasedIncomeProjection * confidenceBasedWeights.pattern) +
      (historicalProjectedIncome * confidenceBasedWeights.historical) +
      (recurringOnlyIncomeProjection * confidenceBasedWeights.recurring)
    ) / totalWeight;

    const projectedNet = projectedIncome - projectedExpenses;

    // Score de confiance amélioré (récurrentes augmentent la confiance)
    const recurringCoverageExpenses = remainingRecurringExpenses > 0 ? 
      Math.min(remainingRecurringExpenses / (projectedExpenses - monthlyExpenses), 1) : 0;
    const recurringCoverageIncome = remainingRecurringIncome > 0 ? 
      Math.min(remainingRecurringIncome / (projectedIncome - monthlyIncome), 1) : 0;

    const dataConfidence = Math.min(
      (currentDay / daysInMonth) * 0.3 + 
      (historicalMonths.length / 6) * 0.25 + 
      (Math.min(transactions.length / 100, 1)) * 0.2 +
      ((recurringCoverageExpenses + recurringCoverageIncome) / 2) * 0.25, // Bonus récurrentes
      1
    );

    // Budget data avec projections récurrentes par catégorie
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    const budgetUsed = categories.map(category => {
      const categoryExpenses = allCurrentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const categoryRecurringRemaining = recurringTransactionsRemaining
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const categoryDailyAvg = currentDay > 0 ? categoryExpenses / currentDay : 0;
      const categoryProjection = categoryExpenses + categoryRecurringRemaining + (categoryDailyAvg * daysRemaining * spendingPattern.multiplier);
      
      return {
        name: category.name,
        used: categoryExpenses,
        projected: categoryProjection,
        recurringRemaining: categoryRecurringRemaining,
        budget: category.budget || 0,
        percentage: category.budget ? (categoryExpenses / category.budget) * 100 : 0,
        projectedPercentage: category.budget ? (categoryProjection / category.budget) * 100 : 0,
        color: category.color
      };
    }).filter(cat => cat.budget > 0);

    const remainingBudget = totalBudget - monthlyExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? (remainingBudget - remainingRecurringExpenses) / daysRemaining : 0;
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
      // Nouvelles données récurrentes
      remainingRecurringIncome,
      remainingRecurringExpenses,
      recurringTransactionsCount: recurringTransactionsRemaining.length,
      recurringCoverageExpenses,
      recurringCoverageIncome,
      // ML data
      spendingPattern,
      incomePattern,
      seasonalExpenseMultiplier,
      seasonalIncomeMultiplier,
      dataConfidence,
      historicalMonths: historicalMonths.length,
      projectionMethods: {
        pattern: patternBasedExpenseProjection,
        historical: historicalProjectedExpenses,
        recurring: recurringOnlyExpenseProjection
      }
    };
  }, [transactions, categories, recurringTransactions]);

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
          <div className="flex gap-2">
            {monthlyData.recurringTransactionsCount > 0 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                {monthlyData.recurringTransactionsCount} récurrentes
              </Badge>
            )}
            <Badge variant={monthlyData.dataConfidence > 0.7 ? "default" : "secondary"}>
              Confiance: {(monthlyData.dataConfidence * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enhanced Financial Overview avec récurrentes */}
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
                {monthlyData.remainingRecurringIncome > 0 && (
                  <span className="ml-1 text-blue-600">
                    (+ {formatCurrency(monthlyData.remainingRecurringIncome)} récurrents)
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
                {monthlyData.remainingRecurringExpenses > 0 && (
                  <span className="ml-1 text-blue-600">
                    (+ {formatCurrency(monthlyData.remainingRecurringExpenses)} récurrents)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Transactions récurrentes détail */}
        {(monthlyData.remainingRecurringIncome > 0 || monthlyData.remainingRecurringExpenses > 0) && (
          <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">
              <Repeat className="w-4 h-4" />
              Transactions récurrentes prévues ce mois
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {monthlyData.remainingRecurringIncome > 0 && (
                <div>
                  <span className="text-green-600">Revenus: {formatCurrency(monthlyData.remainingRecurringIncome)}</span>
                </div>
              )}
              {monthlyData.remainingRecurringExpenses > 0 && (
                <div>
                  <span className="text-red-600">Dépenses: {formatCurrency(monthlyData.remainingRecurringExpenses)}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Couverture: {(monthlyData.recurringCoverageExpenses * 100).toFixed(0)}% dépenses, {(monthlyData.recurringCoverageIncome * 100).toFixed(0)}% revenus
            </p>
          </div>
        )}

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
              {monthlyData.recurringTransactionsCount > 0 && <Repeat className="w-3 h-3 text-blue-600" />}
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
              Basé sur {monthlyData.historicalMonths} mois d'historique + {monthlyData.recurringTransactionsCount} récurrentes • Pattern: {monthlyData.spendingPattern.pattern}
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
                {monthlyData.remainingRecurringExpenses > 0 && (
                  <span> (dont {formatCurrency(monthlyData.remainingRecurringExpenses)} récurrents inévitables)</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Enhanced Budget Progress avec récurrentes */}
        {monthlyData.budgetUsed.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              Utilisation du Budget (Projections IA + Récurrentes)
              <Brain className="w-3 h-3" />
              <Repeat className="w-3 h-3 text-blue-600" />
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
                      {budget.recurringRemaining > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Repeat className="w-2 h-2 mr-1" />
                          {formatCurrency(budget.recurringRemaining)}
                        </Badge>
                      )}
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
                      {budget.recurringRemaining > 0 && (
                        <span> (récurrentes inévitables: {formatCurrency(budget.recurringRemaining)})</span>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced Recommendations avec récurrentes */}
        {monthlyData.totalBudget > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium flex items-center gap-2">
              Recommandations IA + Récurrentes
              <Brain className="w-3 h-3" />
              <Repeat className="w-3 h-3 text-blue-600" />
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                • Budget journalier recommandé (hors récurrentes): {formatCurrency(monthlyData.dailyBudgetRecommended)}
              </li>
              <li>
                • Pattern détecté: {monthlyData.spendingPattern.pattern} 
                ({monthlyData.spendingPattern.multiplier > 1 ? '+' : ''}{((monthlyData.spendingPattern.multiplier - 1) * 100).toFixed(0)}%)
              </li>
              {monthlyData.recurringTransactionsCount > 0 && (
                <li className="text-blue-600">
                  • Transactions récurrentes: {monthlyData.recurringTransactionsCount} prévues 
                  ({formatCurrency(monthlyData.remainingRecurringExpenses)} dépenses + {formatCurrency(monthlyData.remainingRecurringIncome)} revenus)
                </li>
              )}
              <li>
                • Différence weekend/semaine: {formatCurrency(monthlyData.spendingPattern.weekendAvg - monthlyData.spendingPattern.weekdayAvg)}/jour
              </li>
              {monthlyData.remainingBudget > monthlyData.remainingRecurringExpenses ? (
                <li>• Budget flexible restant: {formatCurrency(monthlyData.remainingBudget - monthlyData.remainingRecurringExpenses)}</li>
              ) : (
                <li className="text-red-600">• ⚠️ Budget déjà dépassé (après récurrentes: {formatCurrency(Math.abs(monthlyData.remainingBudget - monthlyData.remainingRecurringExpenses))})</li>
              )}
              <li className="text-blue-600">
                • Confiance des prédictions: {(monthlyData.dataConfidence * 100).toFixed(0)}% 
                (historique + {monthlyData.recurringCoverageExpenses > 0.5 ? 'forte' : 'faible'} couverture récurrentes)
              </li>
            </ul>
          </div>
        )}

        {/* No budget message */}
        {monthlyData.totalBudget === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" />
              <Repeat className="w-4 h-4 text-blue-600" />
              Analyse IA + Récurrentes disponible
            </p>
            <p className="text-xs mt-1">
              {monthlyData.recurringTransactionsCount > 0 
                ? `${monthlyData.recurringTransactionsCount} transactions récurrentes détectées. Créez des budgets pour une analyse complète.`
                : "Créez des catégories avec des budgets et des transactions récurrentes pour des projections intelligentes"
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
