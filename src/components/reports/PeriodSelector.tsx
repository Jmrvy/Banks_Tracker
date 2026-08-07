import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface PeriodSelectorProps {
  periodType: "month" | "year" | "custom";
  setPeriodType: (type: "month" | "year" | "custom") => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  dateRange: { from: Date; to: Date };
  setDateRange: (range: { from: Date; to: Date } | ((prev: { from: Date; to: Date }) => { from: Date; to: Date })) => void;
}

/**
 * The period control belongs on the page head beside the report action, not in
 * a card band of its own — so it renders as a segmented pill plus whichever
 * picker the selected granularity needs. State and handlers are untouched.
 */

// Matches `.btn.sm`: 29px tall, 10px inset, 12px face, 9px corner.
const TRIGGER_CLS =
  "h-[29px] w-auto rounded-[9px] px-2.5 text-[12px] font-550 border-line-strong gap-1.5 [&_svg]:size-[13px] [&_svg]:mr-0";

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

  const options: { value: "month" | "year" | "custom"; label: string }[] = [
    { value: "month", label: t('reports.analysis.periodMonth', { defaultValue: 'Month' }) },
    { value: "year", label: t('common.year', { defaultValue: 'Year' }) },
    { value: "custom", label: t('reports.custom', { defaultValue: 'Custom' }) },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Inline beside the report action, so the control keeps its own width
          instead of the shared component's page-level full bleed. */}
      <Segmented
        options={options}
        value={periodType}
        onChange={setPeriodType}
        className="mx-0 px-0"
        label={t('reports.period', { defaultValue: 'Period' })}
      />

      {periodType === "month" && (
        <MonthPicker
          selected={selectedDate}
          onSelect={(date) => date && setSelectedDate(date)}
          placeholder={t('reports.analysis.periodMonth', { defaultValue: 'Month' })}
          className={TRIGGER_CLS}
        />
      )}

      {periodType === "year" && (
        <YearPicker
          selected={selectedDate}
          onSelect={(date) => date && setSelectedDate(date)}
          placeholder={t('common.year')}
          className={TRIGGER_CLS}
        />
      )}

      {periodType === "custom" && (
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                aria-label={t('common.selectStartDate', { defaultValue: 'Select start date' })}
                className={cn(TRIGGER_CLS, "justify-start font-normal")}
              >
                <CalendarIcon className="flex-shrink-0" />
                <span className="truncate">{format(dateRange.from, "dd/MM/yy")}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: fixTimezone(date) }))}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <span aria-hidden className="text-fg-dim text-[12px]">–</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                aria-label={t('common.selectEndDate', { defaultValue: 'Select end date' })}
                className={cn(TRIGGER_CLS, "justify-start font-normal")}
              >
                <CalendarIcon className="flex-shrink-0" />
                <span className="truncate">{format(dateRange.to, "dd/MM/yy")}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
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
