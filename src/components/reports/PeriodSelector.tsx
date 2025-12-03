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
      <CardHeader>
        <CardTitle>Sélectionner la période</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type de période</label>
              <Select value={periodType} onValueChange={(value: "month" | "year" | "custom") => setPeriodType(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mois</SelectItem>
                  <SelectItem value="year">Année</SelectItem>
                  <SelectItem value="custom">Personnalisée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodType === "month" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Mois</label>
                <MonthPicker
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  placeholder="Choisir un mois"
                />
              </div>
            )}

            {periodType === "year" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Année</label>
                <YearPicker
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  placeholder="Choisir une année"
                />
              </div>
            )}

            {periodType === "custom" && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date début</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date fin</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
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
        </div>
      </CardContent>
    </Card>
  );
};