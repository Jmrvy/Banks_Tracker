import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Repeat, BarChart3, TrendingUp, TrendingDown, ArrowRight, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTouchFrame } from "@/components/charts/ChartTouchFrame";
import { RecurringData, SpendingPatternsData, ReportsPeriod } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import { parseLocalDate } from "@/lib/dateUtils";

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
  const { isPrivacyMode } = usePrivacy();
  const [showAllItems, setShowAllItems] = useState(false);
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

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
  const { expenseCategories, totalExpenseCat } = useMemo(() => {
    const cats = periodByCategory.filter(c => c.type === 'expense');
    return { expenseCategories: cats, totalExpenseCat: cats.reduce((s, c) => s + c.amount, 0) };
  }, [periodByCategory]);

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
  const sortedItems = useMemo(() => {
    return [...periodItems].sort((a, b) => {
      if (a.effectiveType !== b.effectiveType) {
        return a.effectiveType === 'expense' ? -1 : 1;
      }
      return b.periodAmount - a.periodAmount;
    });
  }, [periodItems]);

  const displayedItems = useMemo(
    () => (showAllItems ? sortedItems : sortedItems.slice(0, 5)),
    [showAllItems, sortedItems],
  );

  if (periodItems.length === 0) {
    return (
      <div className="ft-card">
        <div className="ft-empty">
          <Repeat className="h-8 w-8 opacity-40" />
          <span className="ft-empty-title">Aucune récurrence sur cette période</span>
          <span className="text-[11.5px] text-fg-dim">{period.label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Summary — same .ft-kpi tiles as the hero one scroll position above */}
      <div className="ft-g4">
        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon pos" aria-hidden>
              <TrendingUp className="h-[15px] w-[15px]" />
            </span>
            <span className="ft-kpi-label">{t('dashboard.incoming')}</span>
          </div>
          <div className={cn("ft-kpi-value text-[hsl(var(--pos))]", isPrivacyMode && "ft-priv")}>
            +{formatCurrency(periodIncome)}
          </div>
          <div className="ft-kpi-foot">
            <span className="ft-trunc"><span className="font-mono tabular-nums">{periodIncomeCount}</span> récurrence{periodIncomeCount > 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon neg" aria-hidden>
              <TrendingDown className="h-[15px] w-[15px]" />
            </span>
            <span className="ft-kpi-label">{t('dashboard.outgoing')}</span>
          </div>
          <div className={cn("ft-kpi-value text-[hsl(var(--neg))]", isPrivacyMode && "ft-priv")}>
            −{formatCurrency(periodExpenses)}
          </div>
          <div className="ft-kpi-foot">
            <span className="ft-trunc"><span className="font-mono tabular-nums">{periodExpenseCount}</span> récurrence{periodExpenseCount > 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon acc" aria-hidden>
              <ArrowRight className="h-[15px] w-[15px]" />
            </span>
            <span className="ft-kpi-label">Net</span>
          </div>
          <div className={cn("ft-kpi-value", periodNet >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]", isPrivacyMode && "ft-priv")}>
            {periodNet >= 0 ? '+' : ''}{formatCurrency(periodNet)}
          </div>
        </div>

        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon acc" aria-hidden>
              <Repeat className="h-[15px] w-[15px]" />
            </span>
            <span className="ft-kpi-label">Récurrences</span>
          </div>
          <div className="ft-kpi-value">{periodItems.length}</div>
          <div className="ft-kpi-foot">
            <span className="ft-trunc">{period.label}</span>
          </div>
        </div>
      </div>

      {/* Chart + Spending Patterns — collapses at the app-wide 1180px breakpoint */}
      <div className="ft-g2e">
        {/* Donut chart by category (expenses) */}
        {expenseCategories.length > 0 && (
          <Card className="  overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <h3 className="text-xs sm:text-sm font-semibold mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                {t('reports.outgoingRecurringByCategory')}
              </h3>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:w-1/2 h-[160px] sm:h-[180px]">
                  <ChartTouchFrame className="h-full w-full">
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
                              <div
                                className="rounded-md border border-line bg-card text-foreground p-2 shadow-sh-2"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                                  <span className="font-medium text-xs">{data.name}</span>
                                </div>
                                <div className="text-xs">
                                  <div className={cn("font-semibold font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(data.amount)}</div>
                                  <div className="text-muted-foreground text-[10px]"><span className="font-mono tabular-nums">{pct}%</span> — {data.count} occurrence{data.count > 1 ? 's' : ''}</div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  </ChartTouchFrame>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className={cn("text-base sm:text-lg font-semibold font-mono tabular-nums text-neg", isPrivacyMode && "ft-priv")}>{formatCurrency(totalExpenseCat)}</span>
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
                        <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0 font-mono tabular-nums">{pct}%</span>
                        <span className={cn("text-[10px] sm:text-xs font-semibold text-neg flex-shrink-0 font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(cat.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spending patterns */}
        <Card className=" ">
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
                    <p className={cn("text-xs sm:text-sm font-semibold text-success font-mono tabular-nums", isPrivacyMode && "ft-priv")}>+{formatCurrency(spendingPatternsData.dailyAvgIncome)}</p>
                  </div>
                  <div className="p-2 bg-destructive/5 border border-destructive/10 rounded-xl text-center">
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Moy. sortants/j</p>
                    <p className={cn("text-xs sm:text-sm font-semibold text-destructive font-mono tabular-nums", isPrivacyMode && "ft-priv")}>-{formatCurrency(spendingPatternsData.dailyAvgExpenses)}</p>
                  </div>
                  <div className={cn("p-2 rounded-xl text-center border", spendingPatternsData.dailyNet >= 0 ? "bg-success/5 border-success/10" : "bg-destructive/5 border-destructive/10")}>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Net/jour</p>
                    <p className={cn("text-xs sm:text-sm font-semibold font-mono tabular-nums", spendingPatternsData.dailyNet >= 0 ? "text-success" : "text-destructive", isPrivacyMode && "ft-priv")}>
                      {spendingPatternsData.dailyNet >= 0 ? '+' : ''}{formatCurrency(spendingPatternsData.dailyNet)}
                    </p>
                  </div>
                </div>

                <div className="p-2.5 bg-bg-subtle/60 border border-line rounded-xl space-y-2">
                  <h4 className="text-[10px] sm:text-xs font-medium">Projection mensuelle</h4>
                  <div className="space-y-1.5 text-[10px] sm:text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('reports.projectedIncoming')}</span>
                      <span className={cn("font-medium text-success font-mono tabular-nums", isPrivacyMode && "ft-priv")}>+{formatCurrency(spendingPatternsData.projectedMonthlyIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('reports.projectedOutgoing')}</span>
                      <span className={cn("font-medium text-destructive font-mono tabular-nums", isPrivacyMode && "ft-priv")}>-{formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5">
                      <span className="font-medium">Net projeté:</span>
                      <span className={cn("font-semibold font-mono tabular-nums", spendingPatternsData.projectedMonthlyNet >= 0 ? "text-success" : "text-destructive", isPrivacyMode && "ft-priv")}>
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
                      <span className="text-muted-foreground">{t('reports.recurringOutgoing')}</span>
                      <span className="font-medium"><span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(recurringData.monthlyExpenses)}</span>/mois</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('reports.projectedRealOutgoing')}</span>
                      <span className="font-medium"><span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}</span>/mois</span>
                    </div>
                    {spendingPatternsData.projectedMonthlyExpenses > 0 && (
                      <div className="flex justify-between border-t border-border pt-1.5">
                        <span className="text-muted-foreground">{t('reports.recurringShare', { defaultValue: 'Recurring share:' })}</span>
                        <span className="font-semibold text-accent-deep font-mono tabular-nums">
                          {((recurringData.monthlyExpenses / spendingPatternsData.projectedMonthlyExpenses) * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center">
                  Basé sur <span className="font-mono tabular-nums">{differenceInDays(period.to, period.from) + 1}</span> jours d'analyse
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
                  "p-2.5 sm:p-3 rounded-xl transition-all duration-300 border ",
                  "bg-bg-subtle/60 border-line hover:bg-bg-hover"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {recurring.category?.color && (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: recurring.category.color }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium truncate">{resolveNamePlaceholders(recurring.description, parseLocalDate(item.occurrenceDetails?.[0]?.date || recurring.next_due_date))}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 py-0 h-4">
                          {recurrenceLabel(recurring.recurrence_type)}
                        </Badge>
                        {isReimbursement && (
                          <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1 py-0 h-4 border-warn/50 text-warn">
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
                      "text-xs sm:text-sm font-semibold font-mono tabular-nums",
                      effectiveType === 'income' ? "text-success" : "text-destructive",
                      isPrivacyMode && "ft-priv"
                    )}>
                      {effectiveType === 'income' ? '+' : '-'}{formatCurrency(periodAmount)}
                    </p>
                    {pastOccurrences > 0 && futureOccurrences > 0 && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                        <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(pastAmount)}</span> passé / <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(futureAmount)}</span> à venir
                      </p>
                    )}
                    {occurrences > 1 && !(pastOccurrences > 0 && futureOccurrences > 0) && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                        <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(periodAmount / occurrences)}</span>/fois
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
