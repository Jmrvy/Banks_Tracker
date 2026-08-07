import { useTranslation } from "react-i18next";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { usePeriod } from "@/contexts/PeriodContext";

interface DashboardPeriodProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}

/**
 * The dashboard's period control.
 *
 * Lives in the page header beside the title, not in a sticky bar of its own —
 * the app already has one topbar, and a second row of chrome repeating the
 * breadcrumb and the privacy / theme toggles is chrome, not information.
 */
export function DashboardPeriod({ selectedPeriod, onPeriodChange }: DashboardPeriodProps) {
  const { t } = useTranslation();
  const { customDateRange, setCustomDateRange } = usePeriod();

  // Noon local time, so a date never lands on the previous day in a timezone
  // behind UTC.
  const fixTimezone = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);

  const pillClass = "h-8 w-auto gap-1.5 rounded-[10px] px-2.5 text-xs font-medium";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={t("reports.periodLabel", { defaultValue: "Period" })}
        value={selectedPeriod}
        onChange={onPeriodChange}
        options={[
          { value: "1m", label: "1M" },
          { value: "3m", label: "3M" },
          { value: "ytd", label: "YTD" },
          { value: "1y", label: "1Y" },
          { value: "custom", label: t("common.custom", { defaultValue: "Custom" }) },
        ]}
      />

      {selectedPeriod === "custom" && (
        <div className="inline-flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={pillClass}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(customDateRange.from, "dd/MM/yy", { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={customDateRange.from}
                onSelect={(date) =>
                  date && setCustomDateRange({ ...customDateRange, from: fixTimezone(date) })
                }
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-fg-dim">→</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={pillClass}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(customDateRange.to, "dd/MM/yy", { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={customDateRange.to}
                onSelect={(date) =>
                  date && setCustomDateRange({ ...customDateRange, to: fixTimezone(date) })
                }
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
