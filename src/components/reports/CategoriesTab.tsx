import { useMemo, useState, useCallback } from "react";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { CategoryData, PeriodRecurringItem } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { Transaction as FinancialTransaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { TrendingDown, Target, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { CategoryCumulativeChart } from "@/components/charts/CategoryCumulativeChart";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import { useTranslation } from "react-i18next";
import { parseLocalDate } from "@/lib/dateUtils";

interface CategoriesTabProps {
  categoryChartData: CategoryData[];
  transactions: FinancialTransaction[];
  periodStart: Date;
  periodEnd: Date;
  includeUpcoming?: boolean;
  upcomingItems?: PeriodRecurringItem[];
  projectedExpenses?: number;
  dateType?: 'accounting' | 'value';
}

// Helper to get upcoming items for a specific category
const getUpcomingForCategory = (catName: string, upcomingItems?: PeriodRecurringItem[]) => {
  if (!upcomingItems) return [];
  return upcomingItems.filter(item => 
    (item.recurring.category?.name || 'Sans catégorie') === catName && item.futureOccurrences > 0
  );
};

export const CategoriesTab = ({ categoryChartData, transactions, periodStart, periodEnd, includeUpcoming, upcomingItems, projectedExpenses, dateType }: CategoriesTabProps) => {
  const isMobile = useIsMobile();
  const { preferences, formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Hovered slice index, or null when the cursor is outside the donut.
  // Drives the center label so it morphs into the hovered slice's
  // figures instead of letting a tooltip overlap the static total.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const getCategoryTransactions = useCallback(() => {
    if (!selectedCategory) return [];

    const activeDateType = dateType || preferences.dateType;

    const realTxs = transactions
      // Special-budget transactions are counted under the special budget
      // bracket, not under their category — exclude here.
      .filter(t => t.category?.name === selectedCategory && t.type === 'expense' && t.include_in_stats !== false && !t.special_budget_id)
      .map(t => {
        const refundedAmount = (t as any).refunded_amount || 0;
        const grossAmount = Math.abs(t.amount);
        const netAmount = Math.max(0, grossAmount - refundedAmount);

        return {
          id: t.id,
          description: t.description,
          amount: grossAmount,
          netAmount,
          refundedAmount,
          isFullyRefunded: refundedAmount >= grossAmount,
          hasRefund: refundedAmount > 0,
          bank: t.account?.bank || 'other',
          date: activeDateType === 'value' ? ((t as any).value_date || t.transaction_date) : t.transaction_date,
          valueDate: (t as any).value_date,
          type: t.type as 'expense' | 'income' | 'transfer',
          isProjected: false,
        };
      });

    if (includeUpcoming && upcomingItems && selectedCategory) {
      const catUpcoming = getUpcomingForCategory(selectedCategory, upcomingItems);
      for (const item of catUpcoming) {
        const rt = item.recurring;
        const futureDetails = (item.occurrenceDetails || []).filter(d => d.isFuture);
        futureDetails.forEach((occ, idx) => {
          realTxs.push({
            id: `projected-${rt.id}-${idx}`,
            description: resolveNamePlaceholders(rt.description, parseLocalDate(occ.date)),
            amount: occ.amount,
            netAmount: occ.amount,
            refundedAmount: 0,
            isFullyRefunded: false,
            hasRefund: false,
            bank: (rt as any).account?.bank || 'other',
            date: occ.date,
            valueDate: occ.date,
            type: 'expense',
            isProjected: true,
          });
        });
      }
    }

    return realTxs.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
  }, [selectedCategory, dateType, preferences.dateType, transactions, includeUpcoming, upcomingItems]);

  // Build chart data: include projected amounts when upcoming is active
  const chartData = useMemo(() => {
    const merged = new Map<string, { value: number; projected: number; color: string }>();
    for (const c of categoryChartData) {
      if (c.spent > 0) {
        merged.set(c.name, { value: Math.abs(c.spent), projected: 0, color: c.color });
      }
    }
    if (includeUpcoming && upcomingItems) {
      for (const item of upcomingItems) {
        if (item.futureOccurrences <= 0) continue;
        const catName = item.recurring.category?.name || 'Sans catégorie';
        const catColor = item.recurring.category?.color || 'hsl(var(--muted-foreground))';
        const existing = merged.get(catName);
        if (existing) {
          existing.projected += item.futurePeriodAmount;
        } else {
          merged.set(catName, { value: 0, projected: item.futurePeriodAmount, color: catColor });
        }
      }
    }
    return Array.from(merged.entries())
      .map(([name, { value, projected, color }]) => ({
        name,
        value: includeUpcoming ? value + projected : value,
        realValue: value,
        projected,
        color,
      }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [categoryChartData, includeUpcoming, upcomingItems]);

  const totalChartValue = useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData]);
  const totalRealSpent = chartData.reduce((sum, item) => sum + item.realValue, 0);
  const totalSpent = totalChartValue;
  
  // Compute per-category projected amounts from future upcoming items only
  const projectedByCategory = new Map<string, number>();
  if (includeUpcoming && upcomingItems) {
    for (const item of upcomingItems) {
      const catName = item.recurring.category?.name || 'Sans catégorie';
      projectedByCategory.set(catName, (projectedByCategory.get(catName) || 0) + item.futurePeriodAmount);
    }
  }
  const totalProjectedFromItems = includeUpcoming ? Array.from(projectedByCategory.values()).reduce((s, v) => s + v, 0) : 0;
  const totalProjected = totalProjectedFromItems;
  const grandTotal = totalRealSpent + totalProjected;
  const totalBudget = categoryChartData.reduce((sum, c) => sum + (c.budget || 0), 0);
  const categoriesWithBudget = categoryChartData.filter(c => c.budget > 0);
  
  // When includeUpcoming, use spent + projected for budget comparison
  const getEffectiveSpent = (cat: CategoryData) => cat.spent + (projectedByCategory.get(cat.name) || 0);
  const overBudgetCategories = categoriesWithBudget
    .filter(c => includeUpcoming ? getEffectiveSpent(c) > c.budget : c.spent > c.budget)
    .sort((a, b) => (getEffectiveSpent(b) / b.budget) - (getEffectiveSpent(a) / a.budget));
  const underBudgetCategories = categoriesWithBudget
    .filter(c => includeUpcoming ? getEffectiveSpent(c) <= c.budget : c.spent <= c.budget)
    .sort((a, b) => (getEffectiveSpent(b) / b.budget) - (getEffectiveSpent(a) / a.budget));

  const hasAnyData = chartData.length > 0 || (includeUpcoming && totalProjected > 0);

  if (!hasAnyData) {
    return (
      <div className="ft-card">
        <div className="ft-empty">
          <TrendingDown className="h-8 w-8 opacity-40" />
          <span className="ft-empty-title">{t('reports.noExpensesFound')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Summary — same .ft-kpi tiles as the hero one scroll position above */}
      <div className={includeUpcoming ? "ft-g3" : "ft-g4"}>
        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon neg" aria-hidden>
              <TrendingDown className="h-[15px] w-[15px]" />
            </span>
            <span className="ft-kpi-label">{t('reports.realExpenses')}</span>
          </div>
          <div className={cn("ft-kpi-value text-[hsl(var(--neg))]", isPrivacyMode && "ft-priv")}>
            {formatCurrency(totalRealSpent)}
          </div>
        </div>

        {includeUpcoming && (
          <div className="ft-kpi">
            <div className="ft-row">
              <span className="ft-kpi-icon acc" aria-hidden>
                <Clock className="h-[15px] w-[15px]" />
              </span>
              <span className="ft-kpi-label">{t('reports.projected')}</span>
            </div>
            <div className={cn("ft-kpi-value text-accent-deep", isPrivacyMode && "ft-priv")}>
              {formatCurrency(totalProjected)}
            </div>
            <div className="ft-kpi-foot">
              <span className="ft-trunc">
                {t('reports.totalExpected')}:{' '}
                <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>
                  {formatCurrency(grandTotal)}
                </span>
              </span>
            </div>
          </div>
        )}

        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon acc" aria-hidden>
              <Target className="h-[15px] w-[15px]" />
            </span>
            <span className="ft-kpi-label">{t('reports.totalBudget')}</span>
          </div>
          <div className={cn("ft-kpi-value", isPrivacyMode && "ft-priv")}>
            {formatCurrency(totalBudget)}
          </div>
        </div>

        {!includeUpcoming && (
          <>
            <div className="ft-kpi">
              <div className="ft-row">
                <span className="ft-kpi-icon warn" aria-hidden>
                  <AlertTriangle className="h-[15px] w-[15px]" />
                </span>
                <span className="ft-kpi-label">{t('reports.exceeded')}</span>
              </div>
              <div className="ft-kpi-value text-warn">{overBudgetCategories.length}</div>
            </div>

            <div className="ft-kpi">
              <div className="ft-row">
                <span className="ft-kpi-icon pos" aria-hidden>
                  <CheckCircle2 className="h-[15px] w-[15px]" />
                </span>
                <span className="ft-kpi-label">{t('reports.underBudget')}</span>
              </div>
              <div className="ft-kpi-value text-[hsl(var(--pos))]">{underBudgetCategories.length}</div>
            </div>
          </>
        )}
      </div>

      {/* Main Content: Chart + Legend */}
      <Card className="  overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Donut Chart */}
            <div className="relative w-full sm:w-1/2 h-[180px] sm:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={isMobile ? 70 : 85}
                    innerRadius={isMobile ? 45 : 55}
                    dataKey="value"
                    paddingAngle={2}
                    strokeWidth={0}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        className="cursor-pointer transition-opacity"
                        style={{
                          opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.55,
                        }}
                        onMouseEnter={() => setHoveredIndex(index)}
                        onClick={() => handleCategoryClick(entry.name)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text — morphs into the hovered slice's info to
                  avoid overlapping with a floating tooltip. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2 text-center">
                {hoveredIndex !== null && chartData[hoveredIndex] ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: chartData[hoveredIndex].color }}
                      />
                      <span className="text-[11px] sm:text-xs font-medium truncate max-w-[100px]">
                        {chartData[hoveredIndex].name}
                      </span>
                    </div>
                    <span className={cn("text-base sm:text-lg font-semibold font-mono tabular-nums leading-tight", isPrivacyMode && "ft-priv")}>
                      {formatCurrency(chartData[hoveredIndex].value)}
                    </span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">{((chartData[hoveredIndex].value / totalSpent) * 100).toFixed(1)}%</span> {t('reports.ofTotal')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={cn("text-lg sm:text-xl font-semibold font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(totalSpent)}</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      {includeUpcoming ? t('reports.totalExpected') : t('reports.totalLabel')}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="w-full sm:w-1/2 grid grid-cols-2 gap-1.5 sm:gap-2 max-h-[180px] sm:max-h-[220px] overflow-y-auto">
              {chartData.slice(0, 8).map((item, index) => {
                const percentage = ((item.value / totalSpent) * 100).toFixed(0);
                return (
                  <button
                    key={index}
                    onClick={() => handleCategoryClick(item.name)}
                    className="flex items-center gap-2 p-1.5 sm:p-2 rounded-xl bg-bg-subtle/60 border border-line hover:bg-bg-hover transition-all duration-300 text-left group"
                  >
                    <div
                      className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 group-hover:scale-110 transition-transform"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] sm:text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground font-mono tabular-nums">{percentage}%</p>
                    </div>
                  </button>
                );
              })}
              {chartData.length > 8 && (
                <div className="col-span-2 text-center py-1">
                  <span className="text-[10px] text-muted-foreground">+{chartData.length - 8} {t('reports.otherCategories')}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cumulative Chart */}
      <CategoryCumulativeChart
        data={chartData.map((item, index) => ({
          name: item.name,
          value: item.value,
          color: item.color,
          percentage: totalSpent > 0 ? (item.value / totalSpent) * 100 : 0
        }))}
        title={t('reports.cumulativeByCategory')}
        formatCurrency={formatCurrency}
        showCard={true}
      />

      {/* Budget Analysis */}
      {categoriesWithBudget.length > 0 && (overBudgetCategories.length > 0 || underBudgetCategories.length > 0) && (
        <Card className=" ">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              {t('reports.budgetAnalysis')}
            </h3>

            {/* Always over budget */}
            {overBudgetCategories.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] sm:text-xs text-destructive font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {t('reports.budgetsExceeded')}
                </p>
                <div className="space-y-1">
                  {overBudgetCategories
                    .map((cat, i) => {
                      const effectiveSpent = getEffectiveSpent(cat);
                      const pct = Math.round((effectiveSpent / cat.budget) * 100);
                      const overAmount = effectiveSpent - cat.budget;
                      const projected = projectedByCategory.get(cat.name) || 0;
                      return (
                        <button
                          key={i}
                          onClick={() => handleCategoryClick(cat.name)}
                          className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-all text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs font-medium truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 font-mono tabular-nums">
                              {pct}%
                            </Badge>
                            <span className={cn("text-[10px] sm:text-xs text-destructive font-semibold font-mono tabular-nums", isPrivacyMode && "ft-priv")}>
                              +{formatCurrency(overAmount)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Under budget / well managed */}
            {underBudgetCategories.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] sm:text-xs text-success font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('reports.budgetsRespected')}
                </p>
                <div className="space-y-1">
                  {underBudgetCategories
                    .map((cat, i) => {
                      const effectiveSpent = getEffectiveSpent(cat);
                      const pct = cat.budget > 0 ? Math.round((effectiveSpent / cat.budget) * 100) : 0;
                      const remaining = cat.budget - effectiveSpent;
                      const isUnderUsed = pct < 30;
                      return (
                        <button
                          key={i}
                          onClick={() => handleCategoryClick(cat.name)}
                          className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-success/5 border border-success/10 hover:bg-success/10 transition-all text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs font-medium truncate">{cat.name}</span>
                            {isUnderUsed && (
                              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-muted-foreground border-muted-foreground/30">
                                {t('reports.littleUsed')}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono tabular-nums">
                              {pct}%
                            </Badge>
                            <span className="text-[10px] sm:text-xs text-success font-medium">
                              <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(remaining)}</span> {t('reports.remaining')}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* No budget categories info */}
            {categoryChartData.filter(c => {
              const effective = includeUpcoming ? getEffectiveSpent(c) : c.spent;
              return effective > 0 && !c.budget;
            }).length > 0 && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Target className="w-3 h-3" />
                {t('reports.categoriesWithoutBudget', {
                  count: categoryChartData.filter(c => {
                    const effective = includeUpcoming ? getEffectiveSpent(c) : c.spent;
                    return effective > 0 && !c.budget;
                  }).length
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Categories List */}
      <div className="space-y-2">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground px-1">{t('reports.categoryDetail')}</h3>
        <div className="space-y-1.5">
          {categoryChartData
            .filter(c => c.spent > 0 || (includeUpcoming && (projectedByCategory.get(c.name) || 0) > 0))
            .sort((a, b) => {
              const effectiveA = includeUpcoming ? a.spent + (projectedByCategory.get(a.name) || 0) : a.spent;
              const effectiveB = includeUpcoming ? b.spent + (projectedByCategory.get(b.name) || 0) : b.spent;
              const aHasBudget = a.budget > 0;
              const bHasBudget = b.budget > 0;
              if (aHasBudget && !bHasBudget) return -1;
              if (!aHasBudget && bHasBudget) return 1;
              if (!aHasBudget && !bHasBudget) return effectiveB - effectiveA;
              const aRemaining = a.budget - effectiveA;
              const bRemaining = b.budget - effectiveB;
              return aRemaining - bRemaining;
            })
            .map((category, index) => {
              const projected = projectedByCategory.get(category.name) || 0;
              const effectiveSpent = includeUpcoming ? category.spent + projected : category.spent;
              const percentage = category.budget > 0 ? (effectiveSpent / category.budget) * 100 : 0;
              const isOverBudget = category.budget > 0 && effectiveSpent > category.budget;
              const remaining = category.budget > 0 ? category.budget - effectiveSpent : 0;
              
              return (
                <button
                  key={index}
                  onClick={() => handleCategoryClick(category.name)}
                  className={cn(
                    "w-full p-2.5 sm:p-3 rounded-xl transition-all duration-300 text-left",
                    "bg-bg-subtle/60 hover:bg-bg-hover border border-line hover:border-line-strong",
                    "active:scale-[0.99] "
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="font-medium text-xs sm:text-sm truncate">{category.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {category.budget > 0 && (
                        <Badge
                          variant={isOverBudget ? "destructive" : "secondary"}
                          className="text-[9px] sm:text-[10px] px-1.5 py-0 h-4 sm:h-5 font-mono tabular-nums"
                        >
                          {percentage.toFixed(0)}%
                        </Badge>
                      )}
                      <div className="text-right">
                        <span className={cn(
                          "font-semibold text-xs sm:text-sm font-mono tabular-nums",
                          isOverBudget ? "text-destructive" : "text-foreground",
                          isPrivacyMode && "ft-priv"
                        )}>
                          {formatCurrency(effectiveSpent)}
                        </span>
                        {includeUpcoming && projected > 0 && (
                          <span className={cn("text-[9px] text-accent-deep block", isPrivacyMode && "ft-priv")}>
                            {t('reports.ofWhichProjected', { amount: formatCurrency(projected) })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {category.budget > 0 && (
                    <div className="space-y-1.5">
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isOverBudget ? "bg-destructive" : "bg-success"
                          )}
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                        <span>{t('reports.budget')}: <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(category.budget)}</span></span>
                        <span className={cn(
                          "font-medium",
                          remaining > 0 ? "text-success" : "text-destructive"
                        )}>
                          {remaining >= 0 ? t('reports.remains') : t('reports.overage')}: <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(Math.abs(remaining))}</span>
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {!category.budget && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Target className="w-3 h-3" />
                      <span>{t('reports.noBudgetDefined')}</span>
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      {/* Upcoming Recurring Items */}
      {includeUpcoming && upcomingItems && upcomingItems.length > 0 && (
        <Card className="  border-dashed border-primary/30">
          <CardContent className="p-3 sm:p-4 space-y-2">
            <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {t('reports.upcomingRecurring')}
            </h3>
            <div className="space-y-1">
              {upcomingItems
                .filter(item => item.futureOccurrences > 0)
                .sort((a, b) => b.futurePeriodAmount - a.futurePeriodAmount)
                .map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.recurring.category?.color || 'hsl(var(--muted-foreground))' }}
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block">{resolveNamePlaceholders(item.recurring.description, parseLocalDate(item.occurrenceDetails?.find(d => d.isFuture)?.date || item.recurring.next_due_date))}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {item.futureOccurrences}x • {item.recurring.category?.name || t('common.uncategorized')}
                        </span>
                      </div>
                    </div>
                    <span className={cn("text-xs font-semibold text-accent-deep flex-shrink-0 font-mono tabular-nums", isPrivacyMode && "ft-priv")}>
                      {formatCurrency(item.futurePeriodAmount)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={getCategoryTransactions()}
        categoryData={selectedCategory ? categoryChartData.find(c => c.name === selectedCategory) : undefined}
        allTransactions={transactions}
        periodStart={periodStart}
        periodEnd={periodEnd}
        dateType={dateType}
        includeUpcoming={includeUpcoming}
        upcomingItems={selectedCategory ? getUpcomingForCategory(selectedCategory, upcomingItems) : undefined}
      />
    </div>
  );
};
