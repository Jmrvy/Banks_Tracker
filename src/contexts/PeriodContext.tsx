import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { subMonths, startOfMonth, endOfMonth, subYears, format } from "date-fns";
import { fr } from "date-fns/locale";

type PeriodType = "1m" | "3m" | "1y";

interface DateRange {
  start: Date;
  end: Date;
}

interface PeriodContextType {
  selectedPeriod: PeriodType;
  setSelectedPeriod: (period: PeriodType) => void;
  dateRange: DateRange;
  periodLabel: string;
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("1m");

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
      case "1y":
        start = startOfMonth(subYears(now, 1));
        end = endOfMonth(now);
        label = "Dernière année";
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, "MMMM yyyy", { locale: fr });
    }

    return { dateRange: { start, end }, periodLabel: label };
  }, [selectedPeriod]);

  return (
    <PeriodContext.Provider value={{ selectedPeriod, setSelectedPeriod, dateRange, periodLabel }}>
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
