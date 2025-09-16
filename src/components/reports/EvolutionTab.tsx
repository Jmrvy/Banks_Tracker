import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Area, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { BalanceDataPoint, ReportsStats, RecurringData, SpendingPatternsData } from "@/hooks/useReportsData";

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
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Évolution du solde</CardTitle>
              <CardDescription>
                Évolution de votre solde avec projection sur 3 mois
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="spending-patterns"
                checked={useSpendingPatterns}
                onCheckedChange={setUseSpendingPatterns}
              />
              <label htmlFor="spending-patterns" className="text-sm font-medium">
                {useSpendingPatterns ? 'Spending Patterns' : 'Récurrents'}
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {balanceEvolutionData && balanceEvolutionData.length > 0 ? (
            <div className="w-full h-[400px] md:h-[500px] overflow-hidden relative">
              <div className="absolute inset-0 p-2">
                <ChartContainer config={chartConfig} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart 
                      data={balanceEvolutionData}
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis 
                        dataKey="date" 
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        className="text-muted-foreground"
                        tickFormatter={(value) => 
                          value.toLocaleString('fr-FR', { 
                            style: 'currency', 
                            currency: 'EUR',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                          })
                        }
                      />
                      <ChartTooltip 
                        content={
                          <ChartTooltipContent 
                            formatter={(value, name) => [
                              typeof value === 'number' 
                                ? value.toLocaleString('fr-FR', { 
                                    style: 'currency', 
                                    currency: 'EUR' 
                                  })
                                : 'N/A',
                              name === 'solde' ? 'Solde réel' : `Solde projeté (${useSpendingPatterns ? 'patterns' : 'récurrents'})`
                            ]}
                            labelFormatter={(label) => `Date: ${label}`}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="solde"
                        stroke={chartConfig.solde.color}
                        fill={chartConfig.solde.color}
                        fillOpacity={0.3}
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
            </div>
          ) : (
            <div className="w-full h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">Aucune donnée disponible pour le graphique</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Résumé des soldes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Solde de début:</span>
              <span className="text-sm font-mono">
                {formatCurrency(stats.initialBalance)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Variation nette:</span>
              <span className={cn(
                "text-sm font-mono",
                stats.netPeriodBalance >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {stats.netPeriodBalance >= 0 ? "+" : ""}{formatCurrency(stats.netPeriodBalance)}
              </span>
            </div>
            <div className="flex justify-between items-center border-t pt-2">
              <span className="text-sm font-medium">Solde de fin:</span>
              <span className={cn(
                "text-sm font-mono font-bold",
                stats.finalBalance >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatCurrency(stats.finalBalance)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projection mensuelle</CardTitle>
            <CardDescription>
              Basée sur {useSpendingPatterns ? 'les patterns de dépenses' : 'les transactions récurrentes'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {useSpendingPatterns && spendingPatternsData ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Revenus projetés:</span>
                  <span className="text-sm font-mono text-green-600">
                    {formatCurrency(spendingPatternsData.projectedMonthlyIncome)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Dépenses projetées:</span>
                  <span className="text-sm font-mono text-red-600">
                    {formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-sm font-medium">Net mensuel projeté:</span>
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    spendingPatternsData.projectedMonthlyNet >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {spendingPatternsData.projectedMonthlyNet >= 0 ? "+" : ""}{formatCurrency(spendingPatternsData.projectedMonthlyNet)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Revenus récurrents:</span>
                  <span className="text-sm font-mono text-green-600">
                    {formatCurrency(recurringData.monthlyIncome)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Dépenses récurrentes:</span>
                  <span className="text-sm font-mono text-red-600">
                    {formatCurrency(recurringData.monthlyExpenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-sm font-medium">Net récurrent mensuel:</span>
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    recurringData.monthlyNet >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {recurringData.monthlyNet >= 0 ? "+" : ""}{formatCurrency(recurringData.monthlyNet)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};