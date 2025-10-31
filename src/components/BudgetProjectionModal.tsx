import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useMemo } from "react";

interface BudgetProjectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  useSpendingPatterns: boolean;
}

export const BudgetProjectionModal = ({ open, onOpenChange, useSpendingPatterns }: BudgetProjectionModalProps) => {
  const { transactions, categories, recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const budgetData = useMemo(() => {
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
      
      if (recurring.end_date && new Date(recurring.end_date) < fromDate) {
        return occurrences;
      }

      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
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

    // Split recurring transactions into past and future
    const futureRecurringOccurrences = allRecurringOccurrences.filter(occ => occ.date > todayDate);

    // Calculate total budget from categories
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    // Calculate budget used per category
    const budgetUsed = categories.map(category => {
      const actualCategoryExpenses = currentMonthTransactions
        .filter(t => t.category?.name === category.name && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      let projectedCategoryExpenses = 0;

      if (useSpendingPatterns) {
        const dailyCategoryExpenseAvg = currentDay > 0 ? actualCategoryExpenses / currentDay : 0;
        projectedCategoryExpenses = dailyCategoryExpenseAvg * daysRemaining;
      } else {
        projectedCategoryExpenses = futureRecurringOccurrences
          .filter(occ => {
            return (occ.category_id === category.id || 
                   (occ.category && occ.category.name === category.name)) && 
                   occ.type === 'expense';
          })
          .reduce((sum, occ) => sum + occ.amount, 0);
      }

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
    })
    .filter(cat => cat.budget > 0)
    .sort((a, b) => (b.used || 0) - (a.used || 0));

    // Separate categories with spending vs no spending
    const categoriesWithSpending = budgetUsed.filter(cat => cat.used > 0);
    const categoriesWithoutSpending = budgetUsed.filter(cat => cat.used === 0);

    return {
      totalBudget,
      categoriesWithSpending,
      categoriesWithoutSpending
    };
  }, [transactions, categories, recurringTransactions, useSpendingPatterns]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Utilisation du Budget Projeté</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {budgetData.totalBudget > 0 ? (
            <>
              {/* Categories with Spending */}
              {budgetData.categoriesWithSpending.length > 0 && (
                <div className="space-y-3">
                  {budgetData.categoriesWithSpending.map((cat) => (
                    <div key={cat.name} className="space-y-2 p-3 rounded-lg border bg-card">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="font-medium text-sm">{cat.name}</span>
                            {cat.percentage >= 100 && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Dépassé
                              </Badge>
                            )}
                            {cat.percentage >= 90 && cat.percentage < 100 && (
                              <Badge variant="secondary" className="text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Presque atteint
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>Actuel: {formatCurrency(cat.actual)}</span>
                            <span>Projeté: {formatCurrency(cat.projected)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">
                            {formatCurrency(cat.used)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            sur {formatCurrency(cat.budget)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Progress 
                          value={Math.min(cat.percentage, 100)} 
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{cat.percentage.toFixed(0)}% utilisé</span>
                          <span>
                            {cat.budget - cat.used > 0 
                              ? `${formatCurrency(cat.budget - cat.used)} restant`
                              : `${formatCurrency(cat.used - cat.budget)} au-dessus`
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Categories without Spending */}
              {budgetData.categoriesWithoutSpending.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Catégories sans dépenses ce mois</p>
                  <div className="space-y-2">
                    {budgetData.categoriesWithoutSpending.map((cat) => (
                      <div key={cat.name} className="flex items-center justify-between p-2 rounded bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Budget: {formatCurrency(cat.budget)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Aucun budget défini</p>
              <p className="text-sm mt-2">Ajoutez des budgets à vos catégories pour voir les projections</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
