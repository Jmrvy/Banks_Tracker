import { useMemo } from "react";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, BarChart3, CalendarDays } from "lucide-react";
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
      <div className="ft-card">
        <div className="ft-empty">
          <CalendarDays className="h-8 w-8 opacity-40" />
          <span className="ft-empty-title">
            {t('reports.analysis.nothingComing', { defaultValue: 'Nothing scheduled in this period' })}
          </span>
        </div>
      </div>
    );
  }

  const net = totalIncome - totalExpenses;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Summary */}
      <div className="ft-g3">
        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon pos" aria-hidden><ArrowDown className="h-[15px] w-[15px]" /></span>
            <span className="ft-kpi-label">{t('reports.analysis.expected', { defaultValue: 'Expected' })}</span>
          </div>
          <div className="ft-kpi-value text-[hsl(var(--pos))]">+{formatCurrency(totalIncome)}</div>
        </div>
        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon neg" aria-hidden><ArrowUp className="h-[15px] w-[15px]" /></span>
            <span className="ft-kpi-label">{t('reports.analysis.dueOut', { defaultValue: 'Due out' })}</span>
          </div>
          <div className="ft-kpi-value text-[hsl(var(--neg))]">−{formatCurrency(totalExpenses)}</div>
        </div>
        <div className="ft-kpi">
          <div className="ft-row">
            <span className="ft-kpi-icon acc" aria-hidden><BarChart3 className="h-[15px] w-[15px]" /></span>
            <span className="ft-kpi-label">{t('reports.analysis.netComing', { defaultValue: 'Net' })}</span>
          </div>
          <div className={cn("ft-kpi-value", net >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
            {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net))}
          </div>
        </div>
      </div>

      {/* Grouped by day */}
      <div className="ft-card-flush">
        <div className="ft-card-head">
          <div className="min-w-0">
            <h3 className="ft-card-title">{t('reports.analysis.upcomingByDay', { defaultValue: 'Coming up, by day' })}</h3>
            <div className="ft-card-sub">{period.label}</div>
          </div>
        </div>
        <div className="pb-2">
          {grouped.map(group => (
            <div key={group.date}>
              <div className="ft-daylab">
                <span className="capitalize">{formatDayLabel(group.dateObj)}</span>
                <span className="ft-num font-normal normal-case tracking-normal flex items-center gap-2">
                  {group.dayIncome > 0 && <span className="text-[hsl(var(--pos))]">+{formatCurrency(group.dayIncome)}</span>}
                  {group.dayExpenses > 0 && <span className="text-[hsl(var(--neg))]">−{formatCurrency(group.dayExpenses)}</span>}
                </span>
              </div>
              {group.items.map(tx => (
                <div key={tx.id} className="ft-list-row tx">
                  <div
                    aria-hidden
                    className={cn("ft-glyph sq border-transparent",
                      tx.type === 'income'
                        ? "bg-[hsl(var(--pos-soft))] text-[hsl(var(--pos))]"
                        : "bg-[hsl(var(--neg-soft))] text-[hsl(var(--neg))]")}
                  >
                    {tx.type === 'income'
                      ? <ArrowDownRight className="h-4 w-4" />
                      : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="ft-row-title ft-trunc">{tx.description}</div>
                    <div className="ft-row-sub ft-trunc">
                      {[tx.account, tx.category?.name].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className={cn("ft-row-amt",
                    tx.type === 'income' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
                    {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
