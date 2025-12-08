import * as React from "react";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface YearPickerProps {
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function YearPicker({ selected, onSelect, placeholder = "Sélectionner une année", className }: YearPickerProps) {
  const currentYear = new Date().getFullYear();
  const selectedYear = selected?.getFullYear();
  
  // Génère une plage d'années centrée sur l'année actuelle
  const [startYear, setStartYear] = React.useState(() => {
    const year = selectedYear || currentYear;
    return Math.floor(year / 12) * 12;
  });
  
  const years = Array.from({ length: 12 }, (_, i) => startYear + i);
  
  const handleYearSelect = (year: number) => {
    const newDate = new Date(year, 0, 1);
    onSelect?.(newDate);
  };

  const goToPreviousDecade = () => {
    setStartYear(prev => prev - 12);
  };

  const goToNextDecade = () => {
    setStartYear(prev => prev + 12);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 sm:h-10 text-xs sm:text-sm",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="truncate">{selectedYear || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 pointer-events-auto">
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