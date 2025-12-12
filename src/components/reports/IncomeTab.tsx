import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { IncomeCategory } from "@/hooks/useIncomeAnalysis";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, Hash, ChevronRight, Wallet } from "lucide-react";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { useState } from "react";

interface IncomeTabProps {
  incomeAnalysis: IncomeCategory[];
  totalIncome: number;
}

// Couleurs harmonieuses pour les catégories
const COLORS = [
  'hsl(142, 76%, 36%)', // green
  'hsl(217, 91%, 60%)', // blue
  'hsl(271, 91%, 65%)', // purple
  'hsl(38, 92%, 50%)',  // amber
  'hsl(330, 81%, 60%)', // pink
  'hsl(174, 84%, 40%)', // teal
  'hsl(24, 94%, 53%)',  // orange
  'hsl(262, 83%, 58%)', // violet
  'hsl(187, 92%, 45%)', // cyan
  'hsl(84, 85%, 45%)',  // lime
];

export const IncomeTab = ({ incomeAnalysis, totalIncome }: IncomeTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const totalTransactions = incomeAnalysis.reduce((sum, cat) => sum + cat.count, 0);

  if (incomeAnalysis.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-6 sm:p-8 text-center">
          <Wallet className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm sm:text-base text-muted-foreground">
            Aucun revenu pour cette période
          </p>
        </CardContent>
      </Card>
    );
  }

  // Données pour le graphique circulaire
  const pieChartData = incomeAnalysis.map((cat, index) => ({
    name: cat.category,
    value: cat.totalAmount,
    color: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Statistiques principales */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <div className="p-1 sm:p-1.5 bg-success/20 rounded-md">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Total</p>
            <p className="text-sm sm:text-lg lg:text-xl font-bold text-success truncate">
              {formatCurrency(totalIncome)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <div className="p-1 sm:p-1.5 bg-primary/20 rounded-md">
                <Hash className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Catégories</p>
            <p className="text-sm sm:text-lg lg:text-xl font-bold">
              {incomeAnalysis.length}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <div className="p-1 sm:p-1.5 bg-muted rounded-md">
                <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Transactions</p>
            <p className="text-sm sm:text-lg lg:text-xl font-bold">
              {totalTransactions}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique + Liste côte à côte sur desktop, empilés sur mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Graphique circulaire */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-0 px-3 sm:px-4 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base">Répartition</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-4">
            <div className="h-[180px] sm:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => handleCategoryClick(entry.name)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        const percent = ((Number(data.value) / totalIncome) * 100).toFixed(1);
                        return (
                          <div className="bg-popover border border-border rounded-lg p-2 sm:p-3 shadow-lg">
                            <p className="font-semibold text-xs sm:text-sm mb-1">{data.name}</p>
                            <p className="text-xs text-success">
                              {formatCurrency(Number(data.value))}
                            </p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground">{percent}%</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Légende compacte */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center mt-2">
              {pieChartData.slice(0, 5).map((entry, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => handleCategoryClick(entry.name)}
                >
                  <div 
                    className="w-2 h-2 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-[10px] sm:text-xs truncate max-w-[60px] sm:max-w-[80px]">
                    {entry.name}
                  </span>
                </div>
              ))}
              {pieChartData.length > 5 && (
                <span className="text-[10px] sm:text-xs text-muted-foreground px-1.5">
                  +{pieChartData.length - 5}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Liste des catégories */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base">Détail par catégorie</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 max-h-[300px] sm:max-h-[350px] overflow-y-auto">
            <div className="space-y-2">
              {incomeAnalysis.map((category, index) => {
                const percentage = (category.totalAmount / totalIncome) * 100;
                const color = COLORS[index % COLORS.length];
                
                return (
                  <div 
                    key={category.category} 
                    className="p-2 sm:p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer active:scale-[0.98]"
                    onClick={() => handleCategoryClick(category.category)}
                  >
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div 
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs sm:text-sm font-medium truncate">
                          {category.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs sm:text-sm font-bold text-success">
                            {formatCurrency(category.totalAmount)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {category.count} tx • {percentage.toFixed(0)}%
                          </p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                      </div>
                    </div>
                    
                    <Progress 
                      value={percentage} 
                      className="h-1 sm:h-1.5"
                      style={{ 
                        '--progress-color': color 
                      } as React.CSSProperties}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={modalTransactions}
      />
    </div>
  );
};
