import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Repeat, AlertTriangle } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";

const getRecurringOccurrences = (recurringTransactions = [], startDate, endDate) => {
  const occurrences = [];
  recurringTransactions.forEach(tx => {
    const freq = tx.frequency;
    const interval = tx.interval || 1;
    let dt = new Date(tx.start_date);

    // Avance jusqu’à la première occurance >= startDate
    while (dt < startDate) {
      switch (freq) {
        case "daily": dt.setDate(dt.getDate() + interval); break;
        case "weekly": dt.setDate(dt.getDate() + 7 * interval); break;
        case "monthly": dt.setMonth(dt.getMonth() + interval); break;
        case "quarterly": dt.setMonth(dt.getMonth() + 3 * interval); break;
        case "yearly": dt.setFullYear(dt.getFullYear() + interval); break;
        default: return;
      }
    }

    // Ajoute toutes occurrences entre startDate et endDate
    while (dt <= endDate && (!tx.end_date || dt <= new Date(tx.end_date))) {
      occurrences.push({ ...tx, transaction_date: new Date(dt) });
      switch (freq) {
        case "daily": dt.setDate(dt.getDate() + interval); break;
        case "weekly": dt.setDate(dt.getDate() + 7 * interval); break;
        case "monthly": dt.setMonth(dt.getMonth() + interval); break;
        case "quarterly": dt.setMonth(dt.getMonth() + 3 * interval); break;
        case "yearly": dt.setFullYear(dt.getFullYear() + interval); break;
      }
    }
  });
  return occurrences;
};

function MonthlyProjections() {
  const { transactions, accounts, categories, recurringTransactions, loading } = useFinancialData();
  const navigate = useNavigate();

  const monthlyData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const day = now.getDate();
    const daysRemaining = daysInMonth - day;

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth);
    const afterToday = new Date(year, month, day + 1);

    // Occurrences de transactions récurrentes pour ce mois
    const recurrences = getRecurringOccurrences(recurringTransactions ?? [], monthStart, monthEnd);
    const recurrencesPast = recurrences.filter(t => t.transaction_date <= now);
    const recurrencesFuture = recurrences.filter(t => t.transaction_date > now);

    // Transactions réelles ce mois (jusqu’à aujourd’hui)
    const realTxs = transactions.filter(t => {
      const d = new Date(t.transaction_date);
      return d >= monthStart && d <= now;
    });

    // Combine les transactions réelles et récurrentes passées
    const combinedTxs = [...realTxs, ...recurrencesPast];

    // Calculs des montants
    const income = combinedTxs.filter(t => t.type === "income").reduce((a, t) => a + t.amount, 0);
    const expenses = combinedTxs.filter(t => t.type === "expense").reduce((a, t) => a + t.amount, 0);

    const incomeFuture = recurrencesFuture.filter(t => t.type === "income").reduce((a, t) => a + t.amount, 0);
    const expensesFuture = recurrencesFuture.filter(t => t.type === "expense").reduce((a, t) => a + t.amount, 0);

    const projectedIncome = income + incomeFuture;
    const projectedExpenses = expenses + expensesFuture;
    const projectedNet = projectedIncome - projectedExpenses;

    const totalBudget = categories.reduce((a, c) => a + (c.budget || 0), 0);
    const budgetUsed = categories.map(c => {
      const used = combinedTxs.filter(t => t.category?.name === c.name && t.type === "expense").reduce((a, t) => a + t.amount, 0);
      const fut = recurrencesFuture.filter(t => t.category?.name === c.name && t.type === "expense").reduce((a, t) => a + t.amount, 0);
      return {
        name: c.name,
        used,
        projected: used + fut,
        recurringFuture: fut,
        budget: c.budget,
        percentage: c.budget ? (used / c.budget) * 100 : 0,
        projectedPercentage: c.budget ? ((used + fut) / c.budget) * 100 : 0,
        color: c.color,
      };
    }).filter(c => c.budget);

    const remainingBudget = totalBudget - expenses;
    const dailyBudgetRecommendation = daysRemaining > 0 ? (remainingBudget - expensesFuture) / daysRemaining : 0;

    return {
      income,
      expenses,
      projectedIncome,
      projectedExpenses,
      projectedNet,
      totalBudget,
      budgetUsed,
      remainingBudget,
      dailyBudgetRecommendation,
      daysInMonth,
      day,
      daysRemaining,
      isOverBudget: projectedExpenses > totalBudget,
      budgetExceededAmount: Math.max(projectedExpenses - totalBudget, 0),
      recurringFutureCount: recurrencesFuture.length,
    };
  }, [transactions, categories, recurringTransactions]);

  const totalBalance = accounts.reduce((a, acc) => a + acc.balance, 0);
  const projectedBalance = totalBalance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Repeat className="mr-1 inline" /> Chargement...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
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
          <Repeat className="mr-1 inline" /> Projections mensuelles (Transactions récurrentes)
        </CardTitle>
        <div className="flex justify-between items-center">
          <span>Jour {monthlyData.day} sur {monthlyData.daysInMonth} — {monthlyData.daysRemaining} restants</span>
          {monthlyData.recurringFutureCount > 0 && (
            <Badge>
              <Repeat className="mr-1 inline" /> {monthlyData.recurringFutureCount} transactions récurrentes à venir
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
          <p className="text-muted">Solde actuel : {totalBalance.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
          <p className="text-muted">Solde projeté : {projectedBalance.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
        </div>
        {monthlyData.isOverBudget && (
          <div className="mb-6 p-3 bg-red-100 border border-red-400 rounded flex items-center gap-3 text-red-700">
            <AlertTriangle /> Budget dépassé ! Dépassement estimé : {monthlyData.budgetExceededAmount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
          </div>
        )}
        {monthlyData.budgetUsed.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold">Budgets par catégorie</h4>
            {monthlyData.budgetUsed.map(cat => (
              <div key={cat.name} className="mb-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded" style={{ background: cat.color }} />
                    <span>{cat.name}</span>
                    {cat.recurringFuture > 0 && <Badge>Récurrente</Badge>}
                  </div>
                  <div>
                    {cat.used.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} / {cat.budget.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </div>
                </div>
                <div>
                  <Progress value={Math.min(cat.projectedPercentage, 100)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default Index;
