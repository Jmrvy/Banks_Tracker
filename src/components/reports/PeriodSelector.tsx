import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

interface PeriodSelectorProps {
  periodType: "month" | "year" | "custom";
  setPeriodType: (type: "month" | "year" | "custom") => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  dateRange: { from: Date; to: Date };
  setDateRange: (range: { from: Date; to: Date } | ((prev: { from: Date; to: Date }) => { from: Date; to: Date })) => void;
}

/**
 * Period control for the analysis page. Sits inline in the page header rather
 * than in a card of its own — the range is a property of the page, not a
 * section of it, so it reads as a header control next to the title.
 */
export const PeriodSelector = ({
  periodType,
  setPeriodType,
  selectedDate,
  setSelectedDate,
  dateRange,
  setDateRange
}: PeriodSelectorProps) => {
  const { t } = useTranslation();
  // Fix timezone issue: create date at noon local time
  const fixTimezone = (date: Date) => new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12, 0, 0, 0
  );

  const pickerClass = "h-8 w-auto min-w-0 rounded-[10px] px-2.5 text-xs font-medium";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={t('reports.periodLabel', { defaultValue: 'Period' })}
        value={periodType}
        onChange={(value) => setPeriodType(value as "month" | "year" | "custom")}
        options={[
          { value: 'month', label: t('common.month', { defaultValue: 'Month' }) },
          { value: 'year', label: t('common.year', { defaultValue: 'Year' }) },
          { value: 'custom', label: t('common.custom', { defaultValue: 'Custom' }) },
        ]}
      />

      {periodType === "month" && (
        <MonthPicker
          selected={selectedDate}
          onSelect={(date) => date && setSelectedDate(date)}
          placeholder={t('common.month', { defaultValue: 'Month' })}
          className={pickerClass}
        />
      )}

      {periodType === "year" && (
        <YearPicker
          selected={selectedDate}
          onSelect={(date) => date && setSelectedDate(date)}
          placeholder={t('common.year', { defaultValue: 'Year' })}
          className={pickerClass}
        />
      )}

      {periodType === "custom" && (
        <div className="inline-flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={pickerClass}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                {format(dateRange.from, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: fixTimezone(date) }))}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-fg-dim">→</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={pickerClass}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                {format(dateRange.to, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateRange.to}
                onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: fixTimezone(date) }))}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};
