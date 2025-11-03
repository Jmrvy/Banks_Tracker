import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useMemo, useState } from "react";

interface BudgetProjectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  useSpendingPatterns: boolean;
}

export const BudgetProjectionModal = ({ open, onOpenChange, useSpendingPatterns }: BudgetProjectionModalProps) => {
  const { transactions, categories, recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [showNoBudget, setShowNoBudget] = useState(false);

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
        // Enrich occurrences with full category object
        const enrichedOccurrences = occurrences.map(occ => ({
          ...occ,
          category: categories.find(cat => cat.id === recurring.category_id)
        }));
        allRecurringOccurrences.push(...enrichedOccurrences);
      }
    });

    // Split recurring transactions into past and future
    const futureRecurringOccurrences = allRecurringOccurrences.filter(occ => occ.date > todayDate);
    
    console.log('Future recurring occurrences:', futureRecurringOccurrences);
    console.log('Categories:', categories);

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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader className="space-y-1 sm:space-y-2">
          <DialogTitle className="text-base sm:text-lg">Projections Budget</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Projection fin de mois basée sur vos {useSpendingPatterns ? 'dépenses actuelles' : 'transactions récurrentes'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {budgetData.totalBudget > 0 ? (
            <>
              {budgetData.categoriesWithSpending.length > 0 && (
                <div className="space-y-2 sm:space-y-3">
                  {budgetData.categoriesWithSpending.map((cat) => (
                    <div key={cat.name} className="space-y-2 p-2 sm:p-3 rounded-lg border bg-card">
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <div 
                            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-medium text-xs sm:text-sm truncate">{cat.name}</span>
                          {cat.percentage >= 100 && (
                            <Badge variant="destructive" className="text-[10px] sm:text-xs px-1 py-0 h-4 sm:h-5 flex-shrink-0">
                              <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            </Badge>
                          )}
                          {cat.percentage >= 90 && cat.percentage < 100 && (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 py-0 h-4 sm:h-5 flex-shrink-0">
                              <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            </Badge>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-semibold text-xs sm:text-sm">
                            {formatCurrency(cat.used)}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                            / {formatCurrency(cat.budget)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Progress 
                          value={Math.min(cat.percentage, 100)} 
                          className="h-1.5 sm:h-2"
                        />
                        <div className="text-[10px] sm:text-xs text-muted-foreground">
                          {cat.budget - cat.used > 0 
                            ? `${formatCurrency(cat.budget - cat.used)} disponible`
                            : `Dépassement de ${formatCurrency(cat.used - cat.budget)}`
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {budgetData.categoriesWithoutSpending.length > 0 && (
                <Collapsible open={showNoBudget} onOpenChange={setShowNoBudget} className="border-t pt-3 sm:pt-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full text-xs sm:text-sm font-medium hover:text-primary transition-colors">
                    <span>Budgets non utilisés ({budgetData.categoriesWithoutSpending.length})</span>
                    <ChevronDown className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform ${showNoBudget ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3">
                    {budgetData.categoriesWithoutSpending.map((cat) => (
                      <div key={cat.name} className="flex items-center justify-between p-1.5 sm:p-2 rounded bg-muted/30">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <div 
                            className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full" 
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-xs sm:text-sm">{cat.name}</span>
                        </div>
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          {formatCurrency(cat.budget)}
                        </span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          ) : (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <p className="text-sm sm:text-base">Aucun budget défini</p>
              <p className="text-xs sm:text-sm mt-2">Définissez des budgets dans vos catégories</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
