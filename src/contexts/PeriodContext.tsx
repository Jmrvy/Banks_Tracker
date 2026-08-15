import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { subMonths, startOfMonth, endOfMonth, subYears, format, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";

export type PeriodType = "1m" | "3m" | "ytd" | "1y" | "custom";

interface DateRange {
  start: Date;
  end: Date;
}

interface CustomDateRange {
  from: Date;
  to: Date;
}

interface PeriodContextType {
  selectedPeriod: PeriodType;
  setSelectedPeriod: (period: PeriodType) => void;
  dateRange: DateRange;
  periodLabel: string;
  customDateRange: CustomDateRange;
  setCustomDateRange: (range: CustomDateRange) => void;
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("1m");
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const { dateRange, periodLabel } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfMonth(now);
    let label: string;

    switch (selectedPeriod) {
      case "1m":
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, "MMMM yyyy", { locale: fr });
        break;
      case "3m":
        start = startOfMonth(subMonths(now, 2));
        end = endOfMonth(now);
        label = "Derniers 3 mois";
        break;
      case "ytd":
        start = new Date(now.getFullYear(), 0, 1);
        end = endOfMonth(now);
        label = "Depuis début " + now.getFullYear();
        break;
      case "1y":
        start = startOfMonth(subYears(now, 1));
        end = endOfMonth(now);
        label = "Dernière année";
        break;
      case "custom":
        // Pickers anchor picked days at noon (timezone guard); normalize to
        // whole days so first-day transactions (parsed at local midnight)
        // aren't excluded by `d >= start` checks downstream.
        start = startOfDay(customDateRange.from);
        end = endOfDay(customDateRange.to);
        label = `${format(start, "dd/MM/yy", { locale: fr })} - ${format(end, "dd/MM/yy", { locale: fr })}`;
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, "MMMM yyyy", { locale: fr });
    }

    return { dateRange: { start, end }, periodLabel: label };
  }, [selectedPeriod, customDateRange]);

  const value = useMemo(() => ({
    selectedPeriod,
    setSelectedPeriod,
    dateRange,
    periodLabel,
    customDateRange,
    setCustomDateRange
  }), [selectedPeriod, dateRange, periodLabel, customDateRange]);

  return (
    <PeriodContext.Provider value={value}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const context = useContext(PeriodContext);
  if (context === undefined) {
    throw new Error("usePeriod must be used within a PeriodProvider");
  }
  return context;
}
