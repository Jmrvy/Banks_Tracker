import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Repeat, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/financialData";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const getNextOccurrences = (recurringTransaction, fromDate, toDate) => {
  const occurrences = [];
  const frequency = recurringTransaction.frequency;
  const interval = recurringTransaction.interval || 1;
  let nextDate = new Date(recurringTransaction.start_date);

  // Advance nextDate until it reaches fromDate
  while (nextDate < fromDate) {
    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + interval);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7 * interval);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + interval);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3 * interval);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + interval);
        break;
      default:
        return [];
    }
  }
  // Collect occurrences within interval
  while (nextDate <= toDate && (!recurringTransaction.end_date || nextDate <= new Date(recurringTransaction.end_date))) {
    occurrences.push({
      ...recurringTransaction,
      transaction_date: new Date(nextDate),
      isRecurring: true,
    });
    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + interval);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7 * interval);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + interval);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3 * interval);
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
  const navigate = useNavigate();

  const monthlyData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth, daysInMonth);
    const remainingPeriodStart = new Date(currentYear, currentMonth, currentDay + 1);

    // Recurring transactions for current month (past and future)
    const recurringThisMonth = recurringTransactions?.flatMap(r => getNextOccurrences(r, monthStart, monthEnd)) ?? [];
    const recurringPast = recurringThisMonth.filter(t => t.transaction_date <= now);
    const recurringFuture = recurringThisMonth.filter(t => t.transaction_date > now);

    // Actual transactions during current month
    const actualTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= now;
    });

    // Combine actual + past recurring transactions
    const allCurrentTransactions = [...actualTransactions, ...recurringPast];

    // Income and Expenses so far
    const income = allCurrentTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = allCurrentTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Income and Expenses expected from future recurring transactions
    const recurringIncomeFuture = recurringFuture
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const recurringExpenseFuture = recurringFuture
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    // Projection sums
    const projectedIncome = income + recurringIncomeFuture;
    const projectedExpenses = expenses + recurringExpenseFuture;
    const projectedNet = projectedIncome - projectedExpenses;

    // Budget info
    const totalBudget = categories.reduce((sum, c) => sum + (c.budget ?? 0), 0);
    const budgetUsed = categories.map(c => {
      const used = allCurrentTransactions
        .filter(t => t.category?.name === c.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      const futureRecurring = recurringFuture
        .filter(t => t.category?.name === c.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        name: c.name,
        used,
        projected: used + futureRecurring,
        recurringFuture: futureRecurring,
        budget: c.budget ?? 0,
        percentage: c.budget ? (used / c.budget) * 100 : 0,
        projectedPercentage: c.budget ? ((used + futureRecurring) / c.budget) * 100 : 0,
        color: c.color
      };
    }).filter(c => c.budget);

    const remainingBudget = totalBudget - expenses;
    const dailyBudgetRecommended = daysRemaining > 0 ? (remainingBudget - recurringExpenseFuture) / daysRemaining : 0;

    return {
      income,
      expenses,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      totalBudget,
      budgetUsed,
      currentDay,
      daysInMonth: daysInMonth,
      daysRemaining,
      remainingBudget,
      dailyBudgetRecommended,
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: Math.max(projectedExpenses - totalBudget, 0),
      recurringFutureCount: recurringFuture.length
    };
  }, [transactions, categories, recurringTransactions]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const projectedBalance = totalBalance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Repeat className="inline-block mr-2" /> Chargement des projections mensuelles...
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Loading Placeholder */}
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-5 bg-gray-300 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Repeat className="inline-block mr-2" /> Projections Mensuelles (transaction récurrente)
        </CardTitle>
        <div className="flex justify-between items-center">
          <div>Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} — {monthlyData.daysRemaining} restants</div>
          {monthlyData.recurringFutureCount > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Repeat /> {monthlyData.recurringFutureCount} transactions récurrentes prévues
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-green-600 font-semibold flex items-center gap-2"><TrendingUp /> Revenus</h3>
            <p className="text-2xl font-bold">{monthlyData.income.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'})}</p>
            <p className="text-sm text-muted">Projection (excl. flexible): {monthlyData.projectedIncome.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'})}</p>
          </div>
          <div>
            <h3 className="text-red-600 font-semibold flex items-center gap-2"><TrendingDown /> Dépenses</h3>
            <p className="text-2xl font-bold">{monthlyData.expenses.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'})}</p>
            <p className="text-sm text-muted">Projection (excl. flexible): {monthlyData.projectedExpenses.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'})}</p>
          </div>
        </div>
        <div className="mb-6">
          <h3 className="text-lg font-semibold">Solde Net Projeté:</h3>
          <p className={`text-3xl font-bold ${monthlyData.projectedNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {monthlyData.projectedNet.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})}
          </p>
          <p className="text-muted">Solde actuel: {totalBalance.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})}</p>
          <p className="text-muted">Solde projeté: {projectedBalance.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})}</p>
        </div>

        {monthlyData.isOverBudget && (
          <div className="mb-6 border border-red-400 bg-red-100 px-4 py-3 rounded flex items-center gap-3 text-red-700">
            <AlertTriangle /> Budget dépassé ! Dépassement estimé: {monthlyData.budgetOverage.toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'})}
          </div>
        )}

        {monthlyData.budgetUsed.length > 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Budgets par catégorie</h3>
            {monthlyData.budgetUsed.map(cat => (
              <div key={cat.name} className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded" style={{background: cat.color}}></span>
                    <span>{cat.name}</span>
                    {cat.recurringFuture > 0 && <Badge variant="outline" className="ml-2">Récurrente</Badge>}
                  </div>
                  <div>
                    {cat.used.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})} / {cat.budget.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})}
                  </div>
                </div>
                <Progress value={Math.min(cat.projectedPercentage, 100)} />
              </div>
            ))}
          </div>
        )}
        
        {/* Additional UI elements as needed */}
      </CardContent>
    </Card>
  );
};
