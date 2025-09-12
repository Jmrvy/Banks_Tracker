import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { Progress } from "@/components/progress";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Repeat } from "lucide-react";
import { Badge } from "@/components/badge";
import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export const MonthlyProjections = () => {
  const { transactions, accounts, categories, recurringTransactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const monthlyData = useMemo(() => {
    // (Insérez ici la logique de calcul simplifiée avec uniquement les transactions récurrentes,
    // ou importez la fonction externe si vous préférez)

    // Cette partie reste identique au code précédent remis en commentaire pour simplification
    // Vous pouvez l'extraire dans un helper pour garder la clarté du composant

    return {
      monthlyIncome: 0,
      monthlyExpenses: 0,
      projectedIncome: 0,
      projectedExpenses: 0,
      projectedNet: 0,
      totalBudget: 0,
      budgetUsed: [],
      currentDay: 0,
      daysInMonth: 30,
      daysRemaining: 30,
      dailyAverage: 0,
      remainingBudget: 0,
      dailyBudgetRecommended: 0,
      isOverBudget: false,
      budgetOverage: 0,
      recurringTransactionsCount: 0,
      remainingRecurringIncome: 0,
      remainingRecurringExpenses: 0,
    };
  }, [transactions, categories, recurringTransactions]);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const projectedBalance = totalBalance + monthlyData.projectedNet;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5" />
            Projections Mensuelles (récurrentes)
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
          <Repeat className="w-5 h-5" />
          Projections Mensuelles (basées sur transactions récurrentes)
        </CardTitle>
        <div className="flex justify-between items-center">
          <div>
            Jour {monthlyData.currentDay} sur {monthlyData.daysInMonth} — {monthlyData.daysRemaining} jours restants
          </div>
          {monthlyData.recurringTransactionsCount > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Repeat className="w-4 h-4" />
              {monthlyData.recurringTransactionsCount} transaction(s) récurrente(s) prévues
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 text-green-600">
              <TrendingUp />
              Revenus réels
            </h3>
            <p className="text-xl font-bold">{formatCurrency(monthlyData.monthlyIncome)}</p>
            <p className="text-sm text-muted">
              Projection en intégrant récurrentes : {formatCurrency(monthlyData.projectedIncome)}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 text-red-600">
              <TrendingDown />
              Dépenses réelles
            </h3>
            <p className="text-xl font-bold">{formatCurrency(monthlyData.monthlyExpenses)}</p>
            <p className="text-sm text-muted">
              Projection en intégrant récurrentes : {formatCurrency(monthlyData.projectedExpenses)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="font-semibold mb-2">Projection nette estimée :</h4>
          <div className={`text-2xl font-bold ${monthlyData.projectedNet >=0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(monthlyData.projectedNet)}
          </div>
          <p className="text-sm text-muted">Solde actuel : {formatCurrency(totalBalance)}</p>
          <p className="text-sm text-muted">Solde projeté : {formatCurrency(projectedBalance)}</p>
        </div>

        {monthlyData.isOverBudget && (
          <div className="rounded border border-red-400 bg-red-100 p-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="font-semibold text-red-600">Budget dépassé</p>
              <p>Prévisionnel: {formatCurrency(monthlyData.budgetOverage)}</p>
            </div>
          </div>
        )}

        {/* Budget par catégorie */}
        {monthlyData.budgetUsed.length > 0 && (
          <div className="mt-6">
            <h4 className="font-semibold mb-2">Utilisation du budget (récurrentes incluses)</h4>
            {monthlyData.budgetUsed.map((cat) => (
              <div key={cat.name} className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></div>
                    <span>{cat.name}</span>
                    {cat.recurringTransactionsCount > 0 && (
                      <Badge variant="secondary" className="ml-2">Récurrente</Badge>
                    )}
                  </div>
                  <div>
                    {formatCurrency(cat.used)} / {formatCurrency(cat.budget)}
                  </div>
                </div>
                <Progress value={Math.min(cat.projected / cat.budget * 100, 100)} className="h-2" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-sm text-muted">
          {monthlyData.totalBudget > 0 ? (
            <>
              <div>Budget total: {formatCurrency(monthlyData.totalBudget)}</div>
              <div>
                Budget restant recommandé : {formatCurrency(monthlyData.dailyBudgetRecommended)} / jour
              </div>
            </>
          ) : (
            <div>Aucun budget défini</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
