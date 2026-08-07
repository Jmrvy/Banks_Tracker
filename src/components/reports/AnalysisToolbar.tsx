import { CalendarCheck, CalendarDays, Clock, Layers, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * View options for the analysis page, as chips sitting beside the tab row.
 * They modify how every panel below reads the same data, so they belong on the
 * same line as the tabs rather than in a band of their own.
 */
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

  const conventionLabel = dateType === 'value'
    ? t('settings.valueDate', { defaultValue: 'Value date' })
    : t('settings.accountingDate', { defaultValue: 'Accounting date' });

  const compareLabel = compareTo === '3mo'
    ? t('reports.analysis.threeMoAvg', { defaultValue: '3-mo avg' })
    : compareTo === 'yearAgo'
      ? t('reports.analysis.sameMonthLastYear', { defaultValue: 'Same mo. last yr' })
      : priorPeriodLabel;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setIncludeUpcoming(!includeUpcoming)}
        aria-pressed={includeUpcoming}
        className={cn("ft-chip", includeUpcoming && "active")}
      >
        <Clock className="h-3 w-3" />
        {t('reports.analysis.includeUpcoming', { defaultValue: 'Include upcoming' })}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="ft-chip">
          <SlidersHorizontal className="h-3 w-3" />
          <span className="hidden sm:inline">
            {t('reports.analysis.dateConvention', { defaultValue: 'Date convention' })} :{' '}
          </span>
          {conventionLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px]">
          <DropdownMenuLabel>
            {t('reports.analysis.dateConvention', { defaultValue: 'Date convention' })}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={dateType}
            onValueChange={(v) => setDateType(v as 'accounting' | 'value')}
          >
            <DropdownMenuRadioItem value="accounting" className="gap-2">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('settings.accountingDate', { defaultValue: 'Accounting date' })}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="value" className="gap-2">
              <CalendarCheck className="h-3.5 w-3.5" />
              {t('settings.valueDate', { defaultValue: 'Value date' })}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <p className="px-2 pb-1.5 pt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {t('reports.analysis.dateConventionHint', {
              defaultValue:
                'Accounting: when the transaction was recorded. Value: when the bank settled it (falls back to the accounting date if not set). Account balances are always accounting-dated, so value-date views reallocate flows across period boundaries — totals near a boundary can differ between the two conventions.',
            })}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="ft-chip">
          <Layers className="h-3 w-3" />
          <span className="hidden sm:inline">
            {t('reports.analysis.compareTo', { defaultValue: 'Compare to' })} :{' '}
          </span>
          {compareLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            {t('reports.analysis.compareTo', { defaultValue: 'Compare to' })}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={compareTo}
            onValueChange={(v) => setCompareTo(v as 'prior' | '3mo' | 'yearAgo')}
          >
            <DropdownMenuRadioItem value="prior">{priorPeriodLabel}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="3mo">
              {t('reports.analysis.threeMoAvg', { defaultValue: '3-mo avg' })}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="yearAgo">
              {t('reports.analysis.sameMonthLastYear', { defaultValue: 'Same mo. last yr' })}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
