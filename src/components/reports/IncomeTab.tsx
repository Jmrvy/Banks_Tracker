import { Card } from "@/components/ui/card";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { IncomeCategory } from "@/hooks/useIncomeAnalysis";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { TrendingUp, DollarSign, Hash, Euro, PoundSterling } from "lucide-react";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { useState } from "react";

interface IncomeTabProps {
  incomeAnalysis: IncomeCategory[];
  totalIncome: number;
}

export const IncomeTab = ({ incomeAnalysis, totalIncome }: IncomeTabProps) => {
  const { formatCurrency, preferences } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Sélectionner l'icône appropriée selon la devise
  const getCurrencyIcon = () => {
    switch (preferences.currency) {
      case 'EUR':
        return Euro;
      case 'GBP':
        return PoundSterling;
      case 'USD':
      default:
        return DollarSign;
    }
  };

  const CurrencyIcon = getCurrencyIcon();

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const selectedCategoryData = incomeAnalysis.find(cat => cat.category === selectedCategory);
  const modalTransactions = selectedCategoryData?.transactions.map(t => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    bank: t.account?.name || 'other',
    date: t.transaction_date,
    type: 'income' as const
  })) || [];

  if (incomeAnalysis.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Aucun revenu pour cette période
        </div>
      </Card>
    );
  }

  // Couleurs pour les catégories
  const COLORS = [
    '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899',
    '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16'
  ];

  // Données pour le graphique en barres
  const barChartData = incomeAnalysis.map((cat, index) => ({
    name: cat.category.length > 20 ? cat.category.substring(0, 20) + '...' : cat.category,
    fullName: cat.category,
    amount: cat.totalAmount,
    count: cat.count,
    color: COLORS[index % COLORS.length]
  }));

  // Données pour le graphique circulaire
  const pieChartData = incomeAnalysis.map((cat, index) => ({
    name: cat.category,
    value: cat.totalAmount,
    color: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-4">
      {/* Statistiques globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <CurrencyIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-green-700 dark:text-green-300">Total Revenus</p>
              <p className="text-lg font-bold text-green-900 dark:text-green-100 truncate">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-blue-700 dark:text-blue-300">Catégories</p>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{incomeAnalysis.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Hash className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-purple-700 dark:text-purple-300">Transactions</p>
              <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                {incomeAnalysis.reduce((sum, cat) => sum + cat.count, 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Graphique en barres */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">Revenus par Catégorie</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={100}
                className="text-xs"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold text-sm mb-1">{data.fullName}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Montant: {formatCurrency(data.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {data.count} transaction{data.count > 1 ? 's' : ''}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="amount" 
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data) => handleCategoryClick(data.fullName)}
              >
                {barChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Graphique circulaire */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">Répartition des Revenus</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => {
                  const percent = ((entry.value / totalIncome) * 100).toFixed(0);
                  return `${percent}%`;
                }}
                labelLine={false}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0];
                    const percent = ((Number(data.value) / totalIncome) * 100).toFixed(1);
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold text-sm mb-1">{data.name}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          {formatCurrency(Number(data.value))}
                        </p>
                        <p className="text-xs text-muted-foreground">{percent}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Liste détaillée des catégories */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Détail des Catégories</h3>
        <div className="space-y-3">
          {incomeAnalysis.map((category, index) => {
            const percentage = ((category.totalAmount / totalIncome) * 100).toFixed(1);
            const color = COLORS[index % COLORS.length];
            
            return (
              <div 
                key={category.category} 
                className="border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleCategoryClick(category.category)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm truncate">{category.category}</h4>
                      <p className="text-xs text-muted-foreground">
                        {category.count} transaction{category.count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="font-bold text-sm text-green-600 dark:text-green-400">
                      {formatCurrency(category.totalAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{percentage}%</p>
                  </div>
                </div>
                
                {/* Barre de progression */}
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all"
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: color
                    }}
                  />
                </div>
                
                {/* Exemples de transactions */}
                <div className="mt-2 text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Exemples:</p>
                  <ul className="space-y-0.5">
                    {category.transactions.slice(0, 3).map((t, i) => (
                      <li key={i} className="truncate">• {t.description}</li>
                    ))}
                    {category.transactions.length > 3 && (
                      <li className="text-primary">+ {category.transactions.length - 3} autre{category.transactions.length - 3 > 1 ? 's' : ''}</li>
                    )}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={modalTransactions}
      />
    </div>
  );
};
