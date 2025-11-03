import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { startOfMonth, endOfMonth } from "date-fns";
import { PieChart } from "lucide-react";

export const CategorySpendingList = () => {
  const { transactions, categories, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const spendingData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    const currentMonthTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.transaction_date);
      return transactionDate >= monthStart && transactionDate <= monthEnd;
    });
    
    return categories.map(category => {
      const categoryTransactions = currentMonthTransactions.filter(t => 
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
    }).filter(cat => cat.amount > 0 || cat.budget > 0);
  }, [transactions, categories]);

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
      amount: -t.amount,
      bank: t.account?.bank || 'other',
      date: t.transaction_date,
      type: t.type as 'expense' | 'income' | 'transfer'
    }));
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PieChart className="w-5 h-5" />
            Dépenses par Catégorie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 p-3 rounded-lg bg-muted/30 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-muted" />
                  <div className="h-4 bg-muted rounded w-24" />
                </div>
                <div className="h-4 bg-muted rounded w-16" />
              </div>
              <div className="h-2 bg-muted rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (spendingData.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PieChart className="w-5 h-5" />
            Dépenses par Catégorie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <PieChart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune catégorie avec dépenses trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Créez des transactions pour suivre vos dépenses
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PieChart className="w-5 h-5" />
            Dépenses par Catégorie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {spendingData.map((category) => {
            const percentage = category.budget > 0 ? (category.amount / category.budget) * 100 : 0;
            const isOverBudget = percentage > 100;
            
            return (
              <div 
                key={category.name} 
                className="space-y-2 cursor-pointer hover:bg-accent/50 rounded-lg p-3 transition-all duration-200 border border-transparent hover:border-accent"
                onClick={() => handleCategoryClick(category.name)}
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" 
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="font-medium truncate">{category.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ({category.transactionCount})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    <span className={`text-sm font-semibold ${isOverBudget ? 'text-destructive' : 'text-foreground'}`}>
                      {formatCurrency(category.amount)}
                    </span>
                    {category.budget > 0 && (
                      <span className="text-muted-foreground text-xs">
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
                  <p className="text-xs text-destructive font-medium">
                    Dépassement de {(percentage - 100).toFixed(1)}%
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      
      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={selectedCategory ? getCategoryTransactions(selectedCategory) : []}
      />
    </>
  );
};
