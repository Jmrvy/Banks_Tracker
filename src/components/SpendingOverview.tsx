import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { useState } from "react";

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

// Mock transactions by category
const transactionsByCategory: Record<string, any[]> = {
  'Alimentation': [
    {
      id: '1',
      description: 'Carrefour Market',
      amount: -45.80,
      bank: 'revolut' as const,
      date: '2024-01-04',
      type: 'expense' as const
    },
    {
      id: '2',
      description: 'Boulangerie Paul',
      amount: -12.50,
      bank: 'sg' as const,
      date: '2024-01-03',
      type: 'expense' as const
    },
    {
      id: '3',
      description: 'Monoprix',
      amount: -67.20,
      bank: 'boursorama' as const,
      date: '2024-01-02',
      type: 'expense' as const
    },
    {
      id: '4',
      description: 'Marché local',
      amount: -25.00,
      bank: 'sg' as const,
      date: '2024-01-01',
      type: 'expense' as const
    }
  ],
  'Transport': [
    {
      id: '5',
      description: 'Station Shell',
      amount: -62.40,
      bank: 'sg' as const,
      date: '2024-01-04',
      type: 'expense' as const
    },
    {
      id: '6',
      description: 'RATP - Navigo',
      amount: -75.20,
      bank: 'revolut' as const,
      date: '2024-01-01',
      type: 'expense' as const
    }
  ],
  'Loisirs': [
    {
      id: '7',
      description: 'Netflix',
      amount: -13.49,
      bank: 'boursorama' as const,
      date: '2024-01-03',
      type: 'expense' as const
    },
    {
      id: '8',
      description: 'Spotify',
      amount: -9.99,
      bank: 'sg' as const,
      date: '2024-01-01',
      type: 'expense' as const
    },
    {
      id: '9',
      description: 'Cinéma Gaumont',
      amount: -24.50,
      bank: 'revolut' as const,
      date: '2023-12-30',
      type: 'expense' as const
    }
  ],
  'Santé': [
    {
      id: '10',
      description: 'Pharmacie',
      amount: -28.90,
      bank: 'sg' as const,
      date: '2024-01-02',
      type: 'expense' as const
    },
    {
      id: '11',
      description: 'Médecin généraliste',
      amount: -25.00,
      bank: 'boursorama' as const,
      date: '2023-12-28',
      type: 'expense' as const
    }
  ],
  'Logement': [
    {
      id: '12',
      description: 'Loyer Janvier',
      amount: -1200.00,
      bank: 'sg' as const,
      date: '2024-01-01',
      type: 'expense' as const
    }
  ]
};

export const SpendingOverview = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  const totalSpent = spendingData.reduce((sum, cat) => sum + cat.amount, 0);
  const totalBudget = spendingData.reduce((sum, cat) => sum + cat.budget, 0);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

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
            <div 
              key={category.name} 
              className="space-y-2 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
              onClick={() => handleCategoryClick(category.name)}
            >
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
      
      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={selectedCategory ? transactionsByCategory[selectedCategory] || [] : []}
      />
    </Card>
  );
};