import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export const SpendingOverview = () => {
  const { transactions, categories, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Calculate spending by category from actual transactions
  const spendingData = useMemo(() => {
    return categories.map(category => {
      const categoryTransactions = transactions.filter(t => 
        t.category?.name === category.name && t.type === 'expense'
      );
      
      const amount = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      return {
        name: category.name,
        amount,
        budget: category.budget || 0,
        color: category.color,
        transactionCount: categoryTransactions.length
      };
    }).filter(cat => cat.amount > 0 || cat.budget > 0); // Show categories with spending OR budget
  }, [transactions, categories]);

  const totalSpent = spendingData.reduce((sum, cat) => sum + cat.amount, 0);
  const totalBudget = spendingData.reduce((sum, cat) => sum + cat.budget, 0);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const getCategoryTransactions = (categoryName: string) => {
    return transactions.filter(t => 
      t.category?.name === categoryName && (t.type === 'expense' || t.type === 'transfer')
    ).map(t => ({
      id: t.id,
      description: t.description,
      amount: -t.amount, // Make negative for display
      bank: t.account?.bank || 'other',
      date: t.transaction_date,
      type: t.type as 'expense' | 'income' | 'transfer'
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dépenses par Catégorie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse w-3 h-3 rounded-full bg-muted" />
                  <div className="animate-pulse h-4 bg-muted rounded w-24" />
                </div>
                <div className="animate-pulse h-4 bg-muted rounded w-16" />
              </div>
              <div className="animate-pulse h-2 bg-muted rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (spendingData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dépenses par Catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Aucune catégorie avec dépenses ou budget trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Créez des transactions ou définissez des budgets pour suivre vos dépenses
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Dépenses par Catégorie</span>
          <span className="text-sm font-normal text-muted-foreground">
            {formatCurrency(totalSpent)} / {formatCurrency(totalBudget)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {spendingData.map((category) => {
          const percentage = category.budget > 0 ? (category.amount / category.budget) * 100 : 0;
          const isOverBudget = percentage > 100;
          
          return (
            <div 
              key={category.name} 
              className="space-y-2 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
              onClick={() => handleCategoryClick(category.name)}
            >
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="font-medium">{category.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({category.transactionCount} transaction{category.transactionCount > 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={isOverBudget ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    {formatCurrency(category.amount)}
                  </span>
                  {category.budget > 0 && (
                    <span className="text-muted-foreground">
                      / {formatCurrency(category.budget)}
                    </span>
                  )}
                </div>
              </div>
              {category.budget > 0 && (
                <Progress 
                  value={Math.min(percentage, 100)} 
                  className="h-2"
                />
              )}
              {isOverBudget && (
                <p className="text-xs text-destructive">
                  Dépassement de {(percentage - 100).toFixed(1)}%
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
      
      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={selectedCategory ? getCategoryTransactions(selectedCategory) : []}
      />
    </Card>
  );
};
