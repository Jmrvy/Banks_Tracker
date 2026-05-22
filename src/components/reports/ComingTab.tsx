import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { format, isToday, isTomorrow } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import type { RecurringData, ReportsPeriod } from "@/hooks/useReportsData";

interface ComingTabProps {
  recurringData: RecurringData;
  period: ReportsPeriod;
}

export const ComingTab = ({ recurringData, period }: ComingTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

  const grouped = useMemo(() => {
    const items: Array<{
      id: string; description: string; amount: number; date: string;
      type: 'income' | 'expense'; category?: { name: string; color: string }; account?: string;
    }> = [];
    for (const pi of recurringData.periodItems) {
      const future = (pi.occurrenceDetails || []).filter(d => d.isFuture);
      future.forEach((occ, idx) => {
        items.push({
          id: `${pi.recurring.id}-${idx}`,
          description: resolveNamePlaceholders(pi.recurring.description, parseLocalDate(occ.date)),
          amount: occ.amount, date: occ.date, type: pi.effectiveType,
          category: pi.recurring.category ? { name: pi.recurring.category.name, color: pi.recurring.category.color } : undefined,
          account: pi.recurring.account?.name,
        });
      });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    const byDay = new Map<string, typeof items>();
    for (const it of items) {
      const arr = byDay.get(it.date) || [];
      arr.push(it);
      byDay.set(it.date, arr);
    }
    return Array.from(byDay.entries()).map(([date, list]) => ({
      date,
      dateObj: parseLocalDate(date),
      items: list,
      dayIncome: list.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0),
      dayExpenses: list.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0),
    }));
  }, [recurringData.periodItems]);

  const totalIncome = grouped.reduce((s, g) => s + g.dayIncome, 0);
  const totalExpenses = grouped.reduce((s, g) => s + g.dayExpenses, 0);

  const formatDayLabel = (d: Date) => {
    if (isToday(d)) return t('common.today', { defaultValue: 'Today' });
    if (isTomorrow(d)) return t('common.tomorrow', { defaultValue: 'Tomorrow' });
    return format(d, 'EEEE d MMMM', { locale: dateLocale });
  };

  if (grouped.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {t('reports.analysis.nothingComing', { defaultValue: 'Nothing scheduled in this period' })}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-line bg-card p-3">
          <p className="text-[10.5px] text-muted-foreground">{t('reports.analysis.expected', { defaultValue: 'Expected' })}</p>
          <p className="font-mono text-base font-semibold tabular-nums text-[hsl(var(--pos))]">+{formatCurrency(totalIncome)}</p>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <p className="text-[10.5px] text-muted-foreground">{t('reports.analysis.dueOut', { defaultValue: 'Due out' })}</p>
          <p className="font-mono text-base font-semibold tabular-nums text-[hsl(var(--neg))]">−{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <p className="text-[10.5px] text-muted-foreground">{t('reports.analysis.netComing', { defaultValue: 'Net' })}</p>
          <p className={cn("font-mono text-base font-semibold tabular-nums",
            totalIncome - totalExpenses >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
            {totalIncome - totalExpenses >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totalIncome - totalExpenses))}
          </p>
        </div>
      </div>

      {/* Grouped by day */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm">{t('reports.analysis.upcomingByDay', { defaultValue: 'Coming up, by day' })}</CardTitle>
          <CardDescription className="text-[10.5px]">{period.label}</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 pb-4 space-y-3">
          {grouped.map(group => (
            <div key={group.date} className="rounded-lg border border-line bg-bg-subtle/50">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-card text-foreground border border-line flex-shrink-0">
                    <span className="text-[11px] font-mono font-semibold">{format(group.dateObj, 'd', { locale: dateLocale })}</span>
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium capitalize truncate">{formatDayLabel(group.dateObj)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {group.items.length} {t('reports.analysis.items', { defaultValue: 'items' })}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end text-[10.5px] font-mono tabular-nums flex-shrink-0">
                  {group.dayIncome > 0 && <span className="text-[hsl(var(--pos))]">+{formatCurrency(group.dayIncome)}</span>}
                  {group.dayExpenses > 0 && <span className="text-[hsl(var(--neg))]">−{formatCurrency(group.dayExpenses)}</span>}
                </div>
              </div>
              <div className="divide-y divide-line">
                {group.items.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={cn("grid h-6 w-6 flex-shrink-0 place-items-center rounded-md",
                        tx.type === 'income' ? "bg-[hsl(var(--pos)/0.12)]" : "bg-[hsl(var(--neg)/0.12)]")}>
                        {tx.type === 'income'
                          ? <ArrowDownRight className="h-3 w-3 text-[hsl(var(--pos))]" />
                          : <ArrowUpRight className="h-3 w-3 text-[hsl(var(--neg))]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{tx.description}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {tx.account && <span className="truncate">{tx.account}</span>}
                          {tx.category && (
                            <>
                              {tx.account && <span>•</span>}
                              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tx.category.color }} />
                              <span className="truncate">{tx.category.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={cn("flex-shrink-0 font-mono text-xs font-semibold tabular-nums",
                      tx.type === 'income' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
                      {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
