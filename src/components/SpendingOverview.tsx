import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SpendingCategory {
  name: string;
  amount: number;
  budget: number;
  color: string;
}

const spendingData: SpendingCategory[] = [
  { name: 'Alimentation', amount: 425, budget: 500, color: 'bg-primary' },
  { name: 'Transport', amount: 180, budget: 200, color: 'bg-accent' },
  { name: 'Loisirs', amount: 320, budget: 300, color: 'bg-warning' },
  { name: 'Santé', amount: 120, budget: 250, color: 'bg-success' },
  { name: 'Logement', amount: 1200, budget: 1200, color: 'bg-destructive' },
];

export const SpendingOverview = () => {
  const totalSpent = spendingData.reduce((sum, cat) => sum + cat.amount, 0);
  const totalBudget = spendingData.reduce((sum, cat) => sum + cat.budget, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Dépenses par Catégorie</span>
          <span className="text-sm font-normal text-muted-foreground">
            {totalSpent.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} / {' '}
            {totalBudget.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {spendingData.map((category) => {
          const percentage = (category.amount / category.budget) * 100;
          const isOverBudget = percentage > 100;
          
          return (
            <div key={category.name} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${category.color}`} />
                  <span className="font-medium">{category.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={isOverBudget ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    {category.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </span>
                  <span className="text-muted-foreground">
                    / {category.budget.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              </div>
              <Progress 
                value={Math.min(percentage, 100)} 
                className="h-2"
              />
              {isOverBudget && (
                <p className="text-xs text-destructive">
                  Dépassement de {((percentage - 100)).toFixed(1)}%
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};