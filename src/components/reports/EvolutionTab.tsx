import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Area, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { BalanceDataPoint, ReportsStats, RecurringData, SpendingPatternsData } from "@/hooks/useReportsData";
import { MonthlyProjections } from "@/components/MonthlyProjections";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";

interface EvolutionTabProps {
  balanceEvolutionData: BalanceDataPoint[];
  stats: ReportsStats;
  recurringData: RecurringData;
  spendingPatternsData: SpendingPatternsData | null;
  useSpendingPatterns: boolean;
  setUseSpendingPatterns: (value: boolean) => void;
}

const chartConfig = {
  solde: {
    label: "Solde",
    color: "hsl(var(--primary))"
  },
  soldeProjecte: {
    label: "Solde Projeté",
    color: "hsl(var(--primary) / 0.6)"
  }
};

export const EvolutionTab = ({
  balanceEvolutionData,
  stats,
  recurringData,
  spendingPatternsData,
  useSpendingPatterns,
  setUseSpendingPatterns
}: EvolutionTabProps) => {
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Résumé rapide - Cards compactes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Début</span>
            </div>
            <p className="text-sm sm:text-base font-bold truncate">
              {formatCurrency(stats.initialBalance)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-success truncate">
              +{formatCurrency(stats.income)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépenses</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-destructive truncate">
              -{formatCurrency(stats.expenses)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <Target className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Fin</span>
            </div>
            <p className={cn(
              "text-sm sm:text-base font-bold truncate",
              stats.finalBalance >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(stats.finalBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique d'évolution */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-4 pt-3 sm:pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-sm sm:text-base">Évolution du solde</CardTitle>
              <CardDescription className="text-[10px] sm:text-xs hidden sm:block">
                Projection sur 3 mois
              </CardDescription>
            </div>
            <div className="flex items-center space-x-1.5 sm:space-x-2 bg-muted/50 rounded-lg px-2 py-1">
              <Switch
                id="spending-patterns"
                checked={useSpendingPatterns}
                onCheckedChange={setUseSpendingPatterns}
                className="scale-75 sm:scale-90"
              />
              <label htmlFor="spending-patterns" className="text-[10px] sm:text-xs font-medium cursor-pointer">
                {useSpendingPatterns ? 'Patterns' : 'Récurrents'}
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-1.5 sm:px-4 pb-2 sm:pb-4">
          {balanceEvolutionData && balanceEvolutionData.length > 0 ? (
            <div className="w-full h-[180px] sm:h-[250px] lg:h-[300px] overflow-hidden">
              <ChartContainer config={chartConfig} className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart 
                    data={balanceEvolutionData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="date" 
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                      width={50}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <ChartTooltip 
                      content={
                        <ChartTooltipContent 
                          formatter={(value, name) => [
                            typeof value === 'number' 
                              ? formatCurrency(value)
                              : 'N/A',
                            name === 'solde' ? 'Solde réel' : 'Projeté'
                          ]}
                          labelFormatter={(label) => label}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="solde"
                      stroke={chartConfig.solde.color}
                      fill={chartConfig.solde.color}
                      fillOpacity={0.2}
                      strokeWidth={2}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="soldeProjecte"
                      stroke={chartConfig.soldeProjecte.color}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls={true}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          ) : (
            <div className="w-full h-[200px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projections mensuelles - Composant dédié */}
      <MonthlyProjections />

      {/* Projection récurrents vs patterns */}
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-4 pt-3 sm:pt-4">
          <CardTitle className="text-sm sm:text-base">
            Projection mensuelle
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs">
            Basée sur {useSpendingPatterns ? 'les patterns de dépenses' : 'les transactions récurrentes'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {useSpendingPatterns && spendingPatternsData ? (
              <>
                <div className="flex items-center justify-between sm:flex-col sm:items-start p-2 sm:p-3 rounded-lg bg-success/10">
                  <span className="text-xs sm:text-sm text-muted-foreground">Revenus projetés</span>
                  <span className="text-sm sm:text-lg font-bold text-success">
                    {formatCurrency(spendingPatternsData.projectedMonthlyIncome)}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-start p-2 sm:p-3 rounded-lg bg-destructive/10">
                  <span className="text-xs sm:text-sm text-muted-foreground">Dépenses projetées</span>
                  <span className="text-sm sm:text-lg font-bold text-destructive">
                    {formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-start p-2 sm:p-3 rounded-lg bg-primary/10">
                  <span className="text-xs sm:text-sm text-muted-foreground">Net mensuel</span>
                  <span className={cn(
                    "text-sm sm:text-lg font-bold",
                    spendingPatternsData.projectedMonthlyNet >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {spendingPatternsData.projectedMonthlyNet >= 0 ? "+" : ""}{formatCurrency(spendingPatternsData.projectedMonthlyNet)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between sm:flex-col sm:items-start p-2 sm:p-3 rounded-lg bg-success/10">
                  <span className="text-xs sm:text-sm text-muted-foreground">Revenus récurrents</span>
                  <span className="text-sm sm:text-lg font-bold text-success">
                    {formatCurrency(recurringData.monthlyIncome)}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-start p-2 sm:p-3 rounded-lg bg-destructive/10">
                  <span className="text-xs sm:text-sm text-muted-foreground">Dépenses récurrentes</span>
                  <span className="text-sm sm:text-lg font-bold text-destructive">
                    {formatCurrency(recurringData.monthlyExpenses)}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-start p-2 sm:p-3 rounded-lg bg-primary/10">
                  <span className="text-xs sm:text-sm text-muted-foreground">Net récurrent</span>
                  <span className={cn(
                    "text-sm sm:text-lg font-bold",
                    recurringData.monthlyNet >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {recurringData.monthlyNet >= 0 ? "+" : ""}{formatCurrency(recurringData.monthlyNet)}
                  </span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
