import { Clock, Calendar, CalendarCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AnalysisToolbarProps {
  includeUpcoming: boolean;
  setIncludeUpcoming: (v: boolean) => void;
  dateType: 'accounting' | 'value';
  setDateType: (v: 'accounting' | 'value') => void;
  compareTo: 'prior' | '3mo' | 'yearAgo';
  setCompareTo: (v: 'prior' | '3mo' | 'yearAgo') => void;
  priorPeriodLabel: string;
}

const Segmented = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) => (
  <div className="inline-flex gap-[1px] rounded-lg border border-line bg-secondary p-[2px]">
    {options.map(opt => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={cn(
          "rounded-md px-2.5 py-[5px] text-[12px] font-medium leading-none tabular-nums tracking-[-0.005em] transition-colors",
          value === opt.value
            ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export const AnalysisToolbar = ({
  includeUpcoming,
  setIncludeUpcoming,
  dateType,
  setDateType,
  compareTo,
  setCompareTo,
  priorPeriodLabel,
}: AnalysisToolbarProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <Clock className="h-3 w-3 text-fg-dim" />
        <label className="text-[11px] font-medium text-muted-foreground cursor-pointer" htmlFor="incl-upcoming">
          {t('reports.analysis.includeUpcoming', { defaultValue: 'Include upcoming' })}
        </label>
        <Switch id="incl-upcoming" checked={includeUpcoming} onCheckedChange={setIncludeUpcoming} className="scale-75" />
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-medium text-muted-foreground">{t('reports.analysis.dateConvention', { defaultValue: 'Date convention' })}</span>
        <Segmented
          value={dateType}
          onChange={setDateType}
          options={[
            { value: 'accounting', label: <span className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" />{t('settings.accountingDate', { defaultValue: 'Accounting' })}</span> },
            { value: 'value', label: <span className="inline-flex items-center gap-1.5"><CalendarCheck className="h-3 w-3" />{t('settings.valueDate', { defaultValue: 'Value' })}</span> },
          ]}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-[11px] font-medium text-muted-foreground">{t('reports.analysis.compareTo', { defaultValue: 'Compare to' })}</span>
        <Segmented
          value={compareTo}
          onChange={setCompareTo}
          options={[
            { value: 'prior', label: priorPeriodLabel },
            { value: '3mo', label: t('reports.analysis.threeMoAvg', { defaultValue: '3-mo avg' }) },
            { value: 'yearAgo', label: t('reports.analysis.sameMonthLastYear', { defaultValue: 'Same mo. last yr' }) },
          ]}
        />
      </div>
    </div>
  );
};
