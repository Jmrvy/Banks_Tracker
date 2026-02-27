import * as React from "react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";

interface MonthPickerProps {
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  // Aliases for compatibility
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function MonthPicker({
  selected,
  onSelect,
  value,
  onChange,
  placeholder,
  className
}: MonthPickerProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.language === 'fr' ? fr : enUS;
  const MONTHS = i18n.language === 'fr' ? MONTHS_FR : MONTHS_EN;
  const defaultPlaceholder = i18n.language === 'fr' ? "Sélectionner un mois" : "Select a month";

  // Support both prop conventions
  const selectedDate = selected ?? value;
  const handleSelect = onSelect ?? onChange;

  const [currentYear, setCurrentYear] = React.useState(selectedDate?.getFullYear() || new Date().getFullYear());
  const [open, setOpen] = React.useState(false);

  // Update currentYear when selectedDate changes
  React.useEffect(() => {
    if (selectedDate) {
      setCurrentYear(selectedDate.getFullYear());
    }
  }, [selectedDate]);

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(currentYear, monthIndex, 1);
    handleSelect?.(newDate);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 sm:h-10 text-xs sm:text-sm",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">
            {selectedDate ? format(selectedDate, "MMMM yyyy", { locale }) : (placeholder || defaultPlaceholder)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          {/* Header avec navigation des années */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentYear(prev => prev - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h4 className="font-semibold">{currentYear}</h4>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentYear(prev => prev + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Grille des mois */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((month, index) => {
              const isSelected = selectedDate &&
                selectedDate.getFullYear() === currentYear &&
                selectedDate.getMonth() === index;

              return (
                <Button
                  key={month}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleMonthSelect(index)}
                  className="h-8 text-sm"
                >
                  {month.slice(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
