import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';

interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budget: number;
  spent: number;
  percent: number;
}

export const BudgetAlertsCard = () => {
  const { transactions, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const alerts = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const categoriesWithBudget = categories.filter(c => c.budget && c.budget > 0);
    if (categoriesWithBudget.length === 0) return [];

    const monthExpenses = transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const d = new Date(t.transaction_date);
      return d >= monthStart && d <= monthEnd;
    });

    const statuses: BudgetStatus[] = categoriesWithBudget
      .map(cat => {
        const spent = monthExpenses
          .filter(t => t.category?.id === cat.id)
          .reduce((sum, t) => sum + t.amount, 0);
        const percent = (spent / cat.budget!) * 100;
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          categoryColor: cat.color,
          budget: cat.budget!,
          spent,
          percent,
        };
      })
      .filter(s => s.percent >= 80)
      .sort((a, b) => b.percent - a.percent);

    return statuses;
  }, [transactions, categories]);

  if (alerts.length === 0) return null;

  const exceeded = alerts.filter(a => a.percent >= 100);
  const approaching = alerts.filter(a => a.percent < 100);

  return (
    <div className="space-y-2">
      {exceeded.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10 dark:border-destructive/30 dark:bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-foreground">
            <p className="text-xs sm:text-sm font-medium mb-2">
              {exceeded.length} budget{exceeded.length > 1 ? 's' : ''} dépassé{exceeded.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {exceeded.map(a => (
                <div key={a.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.categoryColor }} />
                      <span className="font-medium">{a.categoryName}</span>
                    </div>
                    <span className="text-destructive font-medium">
                      {formatCurrency(a.spent)} / {formatCurrency(a.budget)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, a.percent)} className="h-1.5" />
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {approaching.length > 0 && (
        <Alert className="border-orange-500/50 bg-orange-500/10 dark:border-orange-500/30 dark:bg-orange-500/5">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-foreground">
            <p className="text-xs sm:text-sm font-medium mb-2">
              {approaching.length} budget{approaching.length > 1 ? 's' : ''} bientôt atteint{approaching.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {approaching.map(a => (
                <div key={a.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.categoryColor }} />
                      <span className="font-medium">{a.categoryName}</span>
                    </div>
                    <span className="text-orange-600 dark:text-orange-400 font-medium">
                      {formatCurrency(a.spent)} / {formatCurrency(a.budget)} ({Math.round(a.percent)}%)
                    </span>
                  </div>
                  <Progress value={a.percent} className="h-1.5" />
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
