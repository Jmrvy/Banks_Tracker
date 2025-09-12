import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

// Fonction pour générer les occurrences récurrentes entre deux dates
const getNextOccurrences = (recurringTransaction, fromDate, toDate) => {
  const occurrences = [];
  const frequency = recurringTransaction.frequency;
  const interval = recurringTransaction.interval || 1;
  const startDate = new Date(recurringTransaction.start_date);
  let nextDate = new Date(startDate);

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
      default:
        return []; // fréquence non prise en charge
    }
  }

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

    // Transactions récurrentes prévues pour le reste du mois
    const recurringTransactionsRemaining = recurringTransactions?.flatMap(recurring => 
      getNextOccurrences(recurring, remainingPeriodStart, monthEnd)
    ) || [];

    // Transactions récurrentes passées ce mois ci (avant aujourd'hui)
    const recurringTransactionsPast = recurringTransactions?.flatMap(recurring => 
      getNextOccurrences(recurring, monthStart, now)
    ) || [];

    // Transactions réelles ce mois ci
    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    // Combinaison des transactions réelles + récurrentes passées
    const allCurrentMonthTransactions = [...currentMonthTransactions, ...recurringTransactionsPast];

    // Calcul revenus et dépenses actuels (réels + récurrents passés)
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

    // Projection du net incluant uniquement les récurrents prévus
    const projectedIncome = monthlyIncome + remainingRecurringIncome;
    const projectedExpenses = monthlyExpenses + remainingRecurringExpenses;
    const projectedNet = projectedIncome - projectedExpenses;

    // Total budget des catégories
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    // Utilisation du budget par catégorie (réel uniquement)
    const budgetUsed = categories.map(category => {
      const categoryExpenses = allCurrentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const categoryRecurringRemaining = recurringTransactionsRemaining
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      const categoryProjection = categoryExpenses + categoryRecurringRemaining;

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

    // Recommandations de budget restantes
    const remainingBudget = totalBudget - monthlyExpenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? (remainingBudget - remainingRecurringExpenses) / daysRemaining : 0;

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
      remainingRecurringIncome,
      remainingRecurringExpenses,
      dailyBudgetRecommended,
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: Math.max(0, projectedExpenses - totalBudget),
    };
  }, [transactions, categories, recurringTransactions]);

  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const projectedBalance = totalBalance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5" />
            Projections Mensuelles (Récurrentes)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
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
          <Repeat className="w-5 h-5" />
          Projections Mensuelles (Basées sur Récurrentes)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} • {monthlyData.daysRemaining} jours restants
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenu et dépense */}
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

        {/* Utilisation du budget avec projections */}
        {monthlyData.budgetUsed.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Utilisation du Budget</h4>
            <div className="space-y-3">
              {monthlyData.budgetUsed
                .sort((a, b) => b.projectedPercentage - a.projectedPercentage)
                .slice(0, 4)
                .map(budget => (
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
                ))}
            </div>
          </div>
        )}

        {/* Recommandations */}
        {monthlyData.totalBudget > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium">Recommandations</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Budget journalier recommandé : {formatCurrency(monthlyData.dailyBudgetRecommended)}</li>
              {monthlyData.remainingBudget > 0 ? (
                <li>• Budget restant : {formatCurrency(monthlyData.remainingBudget - monthlyData.remainingRecurringExpenses)}</li>
              ) : (
                <li className="text-red-600">• ⚠️ Budget déjà dépassé</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
