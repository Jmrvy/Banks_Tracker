import { Clock, Layers, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
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
 * View modifiers sit on the tab row as filter chips, flushed right — they
 * change how the tabs below read, so they belong beside them rather than in a
 * band of their own. Each chip opens a small popover holding a segmented
 * control; the include-upcoming chip is itself the toggle.
 */

// The shared control is full-bleed by default (it is normally a page-level
// band); inside a popover it must stay within the panel's inset.
const POPOVER_SEG = "mx-0 px-0";

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

  const dateTypeLabel = dateType === 'value'
    ? t('settings.valueDate', { defaultValue: 'Value date' })
    : t('settings.accountingDate', { defaultValue: 'Accounting date' });

  const compareLabel = compareTo === '3mo'
    ? t('reports.analysis.threeMoAvg', { defaultValue: '3-mo avg' })
    : compareTo === 'yearAgo'
      ? t('reports.analysis.sameMonthLastYear', { defaultValue: 'Same mo. last yr' })
      : priorPeriodLabel;

  return (
    <>
      <button
        type="button"
        onClick={() => setIncludeUpcoming(!includeUpcoming)}
        aria-pressed={includeUpcoming}
        className={cn("ft-chip ft-focusable", includeUpcoming && "active")}
      >
        <Clock className="h-[13px] w-[13px]" aria-hidden />
        {t('reports.analysis.includeUpcoming', { defaultValue: 'Include upcoming' })}
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="ft-chip ft-focusable">
            <SlidersHorizontal className="h-[13px] w-[13px]" aria-hidden />
            {t('reports.analysis.dateConventionChip', { value: dateTypeLabel, defaultValue: 'Convention: {{value}}' })}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] p-3.5">
          <Segmented
            value={dateType}
            onChange={setDateType}
            className={POPOVER_SEG}
            label={t('reports.analysis.dateConvention', { defaultValue: 'Date convention' })}
            options={[
              { value: 'accounting', label: t('settings.accountingDate', { defaultValue: 'Accounting date' }) },
              { value: 'value', label: t('settings.valueDate', { defaultValue: 'Value date' }) },
            ]}
          />
          <p className="mt-3 text-[11.5px] leading-relaxed text-fg-dim">
            {t('reports.analysis.dateConventionHint', {
              defaultValue:
                'Accounting: when the transaction was recorded. Value: when the bank settled it (falls back to the accounting date if not set). Account balances are always accounting-dated, so value-date views reallocate flows across period boundaries — totals near a boundary can differ between the two conventions.',
            })}
          </p>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="ft-chip ft-focusable">
            <Layers className="h-[13px] w-[13px]" aria-hidden />
            {t('reports.analysis.compareToChip', { value: compareLabel, defaultValue: 'Compare to: {{value}}' })}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] p-3.5">
          <Segmented
            value={compareTo}
            onChange={setCompareTo}
            className={POPOVER_SEG}
            label={t('reports.analysis.compareTo', { defaultValue: 'Compare to' })}
            options={[
              { value: 'prior', label: priorPeriodLabel },
              { value: '3mo', label: t('reports.analysis.threeMoAvg', { defaultValue: '3-mo avg' }) },
              { value: 'yearAgo', label: t('reports.analysis.sameMonthLastYear', { defaultValue: 'Same mo. last yr' }) },
            ]}
          />
        </PopoverContent>
      </Popover>
    </>
  );
};
