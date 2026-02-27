import * as React from "react";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";

interface YearPickerProps {
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  // Aliases for compatibility
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function YearPicker({
  selected,
  onSelect,
  value,
  onChange,
  placeholder,
  className
}: YearPickerProps) {
  const { i18n } = useTranslation();
  const defaultPlaceholder = i18n.language === 'fr' ? "Sélectionner une année" : "Select a year";

  // Support both prop conventions
  const selectedDate = selected ?? value;
  const handleSelect = onSelect ?? onChange;

  const currentYear = new Date().getFullYear();
  const selectedYear = selectedDate?.getFullYear();
  const [open, setOpen] = React.useState(false);

  // Génère une plage d'années centrée sur l'année actuelle
  const [startYear, setStartYear] = React.useState(() => {
    const year = selectedYear || currentYear;
    return Math.floor(year / 12) * 12;
  });

  const years = Array.from({ length: 12 }, (_, i) => startYear + i);

  const handleYearSelect = (year: number) => {
    const newDate = new Date(year, 0, 1);
    handleSelect?.(newDate);
    setOpen(false);
  };

  const goToPreviousDecade = () => {
    setStartYear(prev => prev - 12);
  };

  const goToNextDecade = () => {
    setStartYear(prev => prev + 12);
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
          <span className="truncate">{selectedYear || (placeholder || defaultPlaceholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          {/* Header avec navigation des décennies */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPreviousDecade}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h4 className="font-semibold">{startYear} - {startYear + 11}</h4>
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNextDecade}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Grille des années */}
          <div className="grid grid-cols-3 gap-2">
            {years.map((year) => {
              const isSelected = selectedYear === year;
              const isCurrent = year === currentYear;

              return (
                <Button
                  key={year}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleYearSelect(year)}
                  className={cn(
                    "h-8 text-sm",
                    isCurrent && !isSelected && "font-bold text-primary"
                  )}
                >
                  {year}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
