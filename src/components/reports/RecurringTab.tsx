import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Repeat, BarChart3, TrendingUp, TrendingDown, ArrowRight, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { RecurringData, SpendingPatternsData, ReportsPeriod } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";

interface RecurringTabProps {
  recurringData: RecurringData;
  spendingPatternsData: SpendingPatternsData | null;
  period: ReportsPeriod;
  useSpendingPatterns: boolean;
  setUseSpendingPatterns: (value: boolean) => void;
}

export const RecurringTab = ({
  recurringData,
  spendingPatternsData,
  period,
  useSpendingPatterns,
  setUseSpendingPatterns
}: RecurringTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const [showAllItems, setShowAllItems] = useState(false);

  const {
    periodItems,
    periodIncome,
    periodExpenses,
    periodNet,
    periodIncomeCount,
    periodExpenseCount,
    periodByCategory,
  } = recurringData;

  // Donut chart data — only expenses by category for the period
  const expenseCategories = periodByCategory.filter(c => c.type === 'expense');
  const totalExpenseCat = expenseCategories.reduce((s, c) => s + c.amount, 0);

  const recurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Hebdo';
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trim.';
      case 'yearly': return 'Annuel';
      default: return type;
    }
  };

  // Sort period items: expenses first, then by amount desc
  const sortedItems = [...periodItems].sort((a, b) => {
    if (a.effectiveType !== b.effectiveType) {
      return a.effectiveType === 'expense' ? -1 : 1;
    }
    return b.periodAmount - a.periodAmount;
  });

  const displayedItems = showAllItems ? sortedItems : sortedItems.slice(0, 5);

  if (periodItems.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="text-center py-12">
          <Repeat className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">Aucune récurrence sur cette période</p>
          <p className="text-[10px] text-muted-foreground mt-1">{period.label}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 animate-glass-fade-in">
        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="icon-badge icon-badge-sm bg-success/10">
                <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Entrants</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-success">+{formatCurrency(periodIncome)}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{periodIncomeCount} récurrence{periodIncomeCount > 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="icon-badge icon-badge-sm bg-destructive/10">
                <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Sortants</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-destructive">-{formatCurrency(periodExpenses)}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{periodExpenseCount} récurrence{periodExpenseCount > 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="icon-badge icon-badge-sm bg-muted/50">
                <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Net</span>
            </div>
            <p className={cn("text-sm sm:text-base font-bold", periodNet >= 0 ? "text-success" : "text-destructive")}>
              {periodNet >= 0 ? '+' : ''}{formatCurrency(periodNet)}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="icon-badge icon-badge-sm bg-primary/10">
                <Repeat className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Récurrences</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{periodItems.length}</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{period.label}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Spending Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Donut chart by category (expenses) */}
        {expenseCategories.length > 0 && (
          <Card className="glass-hover animate-glass-slide-up overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <h3 className="text-xs sm:text-sm font-semibold mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                Sortants récurrents par catégorie
              </h3>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:w-1/2 h-[160px] sm:h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseCategories}
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        innerRadius={42}
                        dataKey="amount"
                        nameKey="name"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {expenseCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const pct = totalExpenseCat > 0 ? ((data.amount / totalExpenseCat) * 100).toFixed(1) : '0';
                            return (
                              <div className="rounded-lg border bg-background/95 backdrop-blur-sm p-2 shadow-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                                  <span className="font-medium text-xs">{data.name}</span>
                                </div>
                                <div className="text-xs">
                                  <div className="font-semibold">{formatCurrency(data.amount)}</div>
                                  <div className="text-muted-foreground text-[10px]">{pct}% — {data.count} occurrence{data.count > 1 ? 's' : ''}</div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base sm:text-lg font-bold text-destructive">{formatCurrency(totalExpenseCat)}</span>
                    <span className="text-[9px] sm:text-[10px] text-muted-foreground">sur la période</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="w-full sm:w-1/2 space-y-1 max-h-[180px] overflow-y-auto">
                  {expenseCategories.map((cat, i) => {
                    const pct = totalExpenseCat > 0 ? ((cat.amount / totalExpenseCat) * 100).toFixed(0) : '0';
                    return (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded-md">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-xs font-medium truncate">{cat.name}</p>
                        </div>
                        <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">{pct}%</span>
                        <span className="text-[10px] sm:text-xs font-semibold text-destructive flex-shrink-0">{formatCurrency(cat.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spending patterns */}
        <Card className="glass-hover animate-glass-slide-up">
          <CardContent className="p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-semibold mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Patterns de dépenses
            </h3>
            {spendingPatternsData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-success/5 border border-success/10 rounded-xl text-center">
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Moy. entrants/j</p>
                    <p className="text-xs sm:text-sm font-semibold text-success">+{formatCurrency(spendingPatternsData.dailyAvgIncome)}</p>
                  </div>
                  <div className="p-2 bg-destructive/5 border border-destructive/10 rounded-xl text-center">
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Moy. sortants/j</p>
                    <p className="text-xs sm:text-sm font-semibold text-destructive">-{formatCurrency(spendingPatternsData.dailyAvgExpenses)}</p>
                  </div>
                  <div className={cn("p-2 rounded-xl text-center border", spendingPatternsData.dailyNet >= 0 ? "bg-success/5 border-success/10" : "bg-destructive/5 border-destructive/10")}>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Net/jour</p>
                    <p className={cn("text-xs sm:text-sm font-semibold", spendingPatternsData.dailyNet >= 0 ? "text-success" : "text-destructive")}>
                      {spendingPatternsData.dailyNet >= 0 ? '+' : ''}{formatCurrency(spendingPatternsData.dailyNet)}
                    </p>
                  </div>
                </div>

                <div className="p-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-2">
                  <h4 className="text-[10px] sm:text-xs font-medium">Projection mensuelle</h4>
                  <div className="space-y-1.5 text-[10px] sm:text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entrants projetés:</span>
                      <span className="font-medium text-success">+{formatCurrency(spendingPatternsData.projectedMonthlyIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sortants projetés:</span>
                      <span className="font-medium text-destructive">-{formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5">
                      <span className="font-medium">Net projeté:</span>
                      <span className={cn("font-bold", spendingPatternsData.projectedMonthlyNet >= 0 ? "text-success" : "text-destructive")}>
                        {spendingPatternsData.projectedMonthlyNet >= 0 ? '+' : ''}{formatCurrency(spendingPatternsData.projectedMonthlyNet)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Comparison: recurring vs patterns */}
                <div className="p-2.5 bg-primary/5 rounded-xl border border-primary/10">
                  <h4 className="text-[10px] sm:text-xs font-medium mb-2">Récurrents vs Réalité</h4>
                  <div className="space-y-1.5 text-[10px] sm:text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sortants récurrents:</span>
                      <span className="font-medium">{formatCurrency(recurringData.monthlyExpenses)}/mois</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sortants réels projetés:</span>
                      <span className="font-medium">{formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}/mois</span>
                    </div>
                    {spendingPatternsData.projectedMonthlyExpenses > 0 && (
                      <div className="flex justify-between border-t border-border pt-1.5">
                        <span className="text-muted-foreground">Part des récurrents:</span>
                        <span className="font-bold text-primary">
                          {((recurringData.monthlyExpenses / spendingPatternsData.projectedMonthlyExpenses) * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center">
                  Basé sur {differenceInDays(period.to, period.from) + 1} jours d'analyse
                </p>
              </div>
            ) : (
              <div className="text-center py-6">
                <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">
                  Activez les patterns pour comparer vos récurrents aux dépenses réelles
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] sm:text-xs"
                  onClick={() => setUseSpendingPatterns(true)}
                >
                  Activer les patterns
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed list */}
      <div className="space-y-2">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground px-1 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          Récurrences sur la période ({periodItems.length})
        </h3>
        <div className="space-y-1.5">
          {displayedItems.map((item) => {
            const { recurring, occurrences, periodAmount, effectiveType, pastOccurrences, futureOccurrences, pastAmount, futureAmount } = item;
            const isReimbursement = recurring.installment_payment_id && recurring.type === 'income';

            return (
              <div
                key={recurring.id}
                className={cn(
                  "p-2.5 sm:p-3 rounded-xl transition-all duration-300 border backdrop-blur-sm",
                  "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {recurring.category?.color && (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: recurring.category.color }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium truncate">{resolveNamePlaceholders(recurring.description, new Date(recurring.next_due_date))}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 py-0 h-4">
                          {recurrenceLabel(recurring.recurrence_type)}
                        </Badge>
                        {isReimbursement && (
                          <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 py-0 h-4 border-orange-500/50 text-orange-500">
                            Remb.
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[8px] sm:text-[10px] px-1 py-0 h-4">
                          ×{occurrences}
                        </Badge>
                        {pastOccurrences > 0 && futureOccurrences > 0 && (
                          <span className="text-[8px] sm:text-[10px] text-muted-foreground">
                            ({pastOccurrences} passée{pastOccurrences > 1 ? 's' : ''} · {futureOccurrences} à venir)
                          </span>
                        )}
                        {pastOccurrences > 0 && futureOccurrences === 0 && (
                          <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 py-0 h-4 border-muted-foreground/40 text-muted-foreground">
                            Passée
                          </Badge>
                        )}
                        {pastOccurrences === 0 && futureOccurrences > 0 && (
                          <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 py-0 h-4 border-primary/40 text-primary">
                            À venir
                          </Badge>
                        )}
                        {recurring.category && (
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{recurring.category.name}</span>
                        )}
                        {recurring.account && (
                          <>
                            <span className="text-[9px] text-muted-foreground">•</span>
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{recurring.account.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={cn(
                      "text-xs sm:text-sm font-semibold",
                      effectiveType === 'income' ? "text-success" : "text-destructive"
                    )}>
                      {effectiveType === 'income' ? '+' : '-'}{formatCurrency(periodAmount)}
                    </p>
                    {pastOccurrences > 0 && futureOccurrences > 0 && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                        {formatCurrency(pastAmount)} passé / {formatCurrency(futureAmount)} à venir
                      </p>
                    )}
                    {occurrences > 1 && !(pastOccurrences > 0 && futureOccurrences > 0) && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                        {formatCurrency(periodAmount / occurrences)}/fois
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {sortedItems.length > 5 && (
          <button
            onClick={() => setShowAllItems(!showAllItems)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {showAllItems ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Voir moins
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Voir les {sortedItems.length - 5} autres
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
