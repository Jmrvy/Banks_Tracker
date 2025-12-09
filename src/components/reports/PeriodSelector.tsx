import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

interface PeriodSelectorProps {
  periodType: "month" | "year" | "custom";
  setPeriodType: (type: "month" | "year" | "custom") => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  dateRange: { from: Date; to: Date };
  setDateRange: (range: { from: Date; to: Date } | ((prev: { from: Date; to: Date }) => { from: Date; to: Date })) => void;
}

export const PeriodSelector = ({
  periodType,
  setPeriodType,
  selectedDate,
  setSelectedDate,
  dateRange,
  setDateRange
}: PeriodSelectorProps) => {
  // Fix timezone issue: create date at noon local time
  const fixTimezone = (date: Date) => new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12, 0, 0, 0
  );

  return (
    <Card>
      <CardContent className="p-2 sm:p-4 lg:p-6">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          {/* Type selector */}
          <div className="flex-shrink-0 w-[100px] sm:w-auto">
            <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Période</label>
            <Select value={periodType} onValueChange={(value: "month" | "year" | "custom") => setPeriodType(value)}>
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="year">Année</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodType === "month" && (
            <div className="flex-1 min-w-[120px]">
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Mois</label>
              <MonthPicker
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                placeholder="Mois"
              />
            </div>
          )}

          {periodType === "year" && (
            <div className="flex-1 min-w-[100px]">
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Année</label>
              <YearPicker
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                placeholder="Année"
              />
            </div>
          )}

          {periodType === "custom" && (
            <>
              <div className="flex-1 min-w-[90px]">
                <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Début</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 sm:h-9 justify-start text-left text-xs px-2">
                      <CalendarIcon className="mr-1 h-3 w-3 flex-shrink-0" />
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
              </div>
              <div className="flex-1 min-w-[90px]">
                <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Fin</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 sm:h-9 justify-start text-left text-xs px-2">
                      <CalendarIcon className="mr-1 h-3 w-3 flex-shrink-0" />
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
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};