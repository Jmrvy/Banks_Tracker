import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Repeat, AlertTriangle } from "lucide-react";

const getRecurringTransactionsInRange = (recurringTxs, fromDate, toDate) => {
  const occurrences = [];
  recurringTxs.forEach(tx => {
    const freq = tx.frequency;
    const interval = tx.interval || 1;
    let nextDate = new Date(tx.start_date);

    while (nextDate < fromDate) {
      switch (freq) {
        case "daily":
          nextDate.setDate(nextDate.getDate() + interval); break;
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7 * interval); break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + interval); break;
        case "yearly":
          nextDate.setFullYear(nextDate.getFullYear() + interval); break;
        default:
          return;
      }
    }

    while (nextDate <= toDate && (!tx.end_date || new Date(tx.end_date) >= nextDate)) {
      occurrences.push({ ...tx, transaction_date: new Date(nextDate) });
      switch (freq) {
        case "daily":
          nextDate.setDate(nextDate.getDate() + interval); break;
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7 * interval); break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + interval); break;
        case "yearly":
          nextDate.setFullYear(nextDate.getFullYear() + interval); break;
      }
    }
  });
  return occurrences;
};

export const MonthlyProjections = () => {
  const {
    transactions,
    accounts,
    categories,
    recurringTransactions,
    loading,
  } = useFinancialData();

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
    const afterToday = new Date(currentYear, currentMonth, currentDay + 1);

    // All recurring txs in month, split past/future
    const recurringAll = getRecurringTransactionsInRange(recurringTransactions || [], monthStart, monthEnd);
    const recurringFuture = recurringAll.filter(tx => tx.transaction_date > now);
    const recurringPast = recurringAll.filter(tx => tx.transaction_date <= now);

    // Transactions so far, combine actual + past recurring
    const transactionsCurrentMonth = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= now;
    });
    const combinedTxs = [...transactionsCurrentMonth, ...recurringPast];

    const income = combinedTxs.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const expenses = combinedTxs.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

    const recurringFutureIncome = recurringFuture.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const recurringFutureExpenses = recurringFuture.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

    const projectedIncome = income + recurringFutureIncome;
    const projectedExpenses = expenses + recurringFutureExpenses;
    const projectedNet = projectedIncome - projectedExpenses;

    const totalBudget = categories.reduce((acc, c) => acc + (c.budget || 0), 0);
    const budgetUsed = categories.map(c => {
      const used = combinedTxs.filter(t => t.category?.name === c.name && t.type === "expense").reduce((a, t) => a + t.amount, 0);
      const future = recurringFuture.filter(t => t.category?.name === c.name && t.type === "expense").reduce((a, t) => a + t.amount, 0);
      return {
        name: c.name,
        used,
        projected: used + future,
        recurringFuture: future,
        budget: c.budget || 0,
        percentage: c.budget ? (used / c.budget) * 100 : 0,
        projectedPercentage: c.budget ? ((used + future) / c.budget) * 100 : 0,
        color: c.color,
      };
    }).filter(c => c.budget);

    const remainingBudget = totalBudget - expenses;
    const dailyBudget = daysRemaining > 0 ? (remainingBudget - recurringFutureExpenses) / daysRemaining : 0;

    return {
      income,
      expenses,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      totalBudget,
      budgetUsed,
      daysInMonth,
      currentDay,
      daysRemaining,
      remainingBudget,
      dailyBudget,
      recurringFutureCount: recurringFuture.length,
      isOverBudget: projectedExpenses > totalBudget,
      budgetOverage: Math.max(projectedExpenses - totalBudget, 0),
    };
  }, [transactions, categories, recurringTransactions]);

  const balance = accounts.reduce((acc, a) => acc + a.balance, 0);
  const projectedBalance = balance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Repeat className="mr-1 inline" /> Chargement...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map(i => (
              <div key={i} className="bg-gray-300 h-5 rounded animate-pulse" />
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
          <Repeat className="mr-1 inline" /> Projections mensuelles (récurrentes)
        </CardTitle>
        <div className="flex justify-between items-center">
          <span>Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} &mdash; {monthlyData.daysRemaining} restants</span>
          {monthlyData.recurringFutureCount > 0 && (
            <Badge>
              <Repeat className="mr-1 inline" /> {monthlyData.recurringFutureCount} transactions récurrentes
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-green-600 flex items-center">
              <TrendingUp className="mr-1" /> Revenus
            </h3>
            <p className="text-2xl font-bold">{monthlyData.income.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
            <p className="text-xs text-muted">Projection : {monthlyData.projectedIncome.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
          </div>
          <div>
            <h3 className="text-red-600 flex items-center">
              <TrendingDown className="mr-1" /> Dépenses
            </h3>
            <p className="text-2xl font-bold">{monthlyData.expenses.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
            <p className="text-xs text-muted">Projection : {monthlyData.projectedExpenses.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
          </div>
        </div>

        <div className="mb-6">
          <h3>Solde estimé</h3>
          <p className={`text-3xl font-bold ${monthlyData.projectedNet >= 0 ? "text-green-600" : "text-red-600"}`}>
            {monthlyData.projectedNet.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
          </p>
          <p className="text-muted">Solde actuel : {balance.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
          <p className="text-muted">Solde projeté : {projectedBalance.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
        </div>

        {monthlyData.isOverBudget && (
          <div className="mb-6 p-3 bg-red-100 border border-red-400 rounded flex items-center gap-3 text-red-700">
            <AlertTriangle /> Le budget est dépassé ! Dépassement estimé : {monthlyData.budgetOverage.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
          </div>
        )}

        {monthlyData.budgetUsed.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold">Budgets par catégorie</h4>
            {monthlyData.budgetUsed.map(cat => (
              <div key={cat.name} className="mb-3">
                <div className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded" style={{ background: cat.color }} />
                    <span>{cat.name}</span>
                    {cat.recurringFuture > 0 && <Badge>Récurrente</Badge>}
                  </div>
                  <div>
                    {cat.used.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} / {cat.budget.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </div>
                </div>
                <Progress value={Math.min(cat.projectedPercentage, 100)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MonthlyProjections;
