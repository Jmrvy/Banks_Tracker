import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecurringTransaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isBefore, startOfDay, addWeeks, addQuarters, addYears } from "date-fns";
import { fr } from "date-fns/locale";

interface RecurringCalendarProps {
  transactions: RecurringTransaction[];
  onEdit: (transaction: RecurringTransaction) => void;
  onToggleActive: (id: string, currentStatus: boolean) => void;
  onDelete: (id: string, description: string) => void;
}

const RecurringCalendar = ({ transactions, onEdit, onToggleActive, onDelete }: RecurringCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTransaction, setSelectedTransaction] = useState<RecurringTransaction | null>(null);
  const [selectedDayTransactions, setSelectedDayTransactions] = useState<{ date: Date; transactions: { transaction: RecurringTransaction; isPast: boolean }[] } | null>(null);
  const { formatCurrency } = useUserPreferences();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const daysOfWeek = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Get all days in the current month view (including padding days)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Get the day of week for the first day (0 = Sunday, convert to Monday-based)
    let startDay = getDay(monthStart);
    startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Monday-based (0 = Monday)
    
    // Add padding days at the beginning
    const paddingDays: (Date | null)[] = Array(startDay).fill(null);
    
    return [...paddingDays, ...days];
  }, [currentMonth]);

  // Map transactions to their due dates within the current month (including past occurrences)
  const transactionsByDay = useMemo(() => {
    const map = new Map<string, { transaction: RecurringTransaction; isPast: boolean }[]>();
    const today = startOfDay(new Date());
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    transactions.forEach((transaction) => {
      if (!transaction.is_active) return;
      
      const startDate = new Date(transaction.start_date);
      const nextDueDate = new Date(transaction.next_due_date);
      
      // Calculate all occurrences of this transaction in the current month
      let currentOccurrence = new Date(startDate);
      
      // Move to first occurrence that could be in or before this month
      while (currentOccurrence < monthStart) {
        switch (transaction.recurrence_type) {
          case 'weekly':
            currentOccurrence = addWeeks(currentOccurrence, 1);
            break;
          case 'monthly':
            currentOccurrence = addMonths(currentOccurrence, 1);
            break;
          case 'quarterly':
            currentOccurrence = addQuarters(currentOccurrence, 1);
            break;
          case 'yearly':
            currentOccurrence = addYears(currentOccurrence, 1);
            break;
          default:
            currentOccurrence = addMonths(currentOccurrence, 1);
        }
      }
      
      // Add all occurrences within this month
      while (currentOccurrence <= monthEnd) {
        if (isSameMonth(currentOccurrence, currentMonth)) {
          const key = format(currentOccurrence, 'yyyy-MM-dd');
          const isPast = isBefore(currentOccurrence, today);
          const existing = map.get(key) || [];
          map.set(key, [...existing, { transaction, isPast }]);
        }
        
        // Move to next occurrence
        switch (transaction.recurrence_type) {
          case 'weekly':
            currentOccurrence = addWeeks(currentOccurrence, 1);
            break;
          case 'monthly':
            currentOccurrence = addMonths(currentOccurrence, 1);
            break;
          case 'quarterly':
            currentOccurrence = addQuarters(currentOccurrence, 1);
            break;
          case 'yearly':
            currentOccurrence = addYears(currentOccurrence, 1);
            break;
          default:
            currentOccurrence = addMonths(currentOccurrence, 1);
        }
      }
    });
    
    return map;
  }, [transactions, currentMonth]);

  const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const getTypeColor = (type: string) => {
    return type === 'income' ? 'bg-success' : 'bg-destructive';
  };

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuelle';
      case 'quarterly': return 'Trimestrielle';
      case 'yearly': return 'Annuelle';
      default: return type;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income': return 'Revenus';
      case 'expense': return 'Dépense';
      default: return type;
    }
  };

  return (
    <>
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-sm sm:text-lg font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 pt-0">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
            {daysOfWeek.map((day) => (
              <div
                key={day}
                className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1 sm:py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const dateKey = format(day, 'yyyy-MM-dd');
              const dayTransactions = transactionsByDay.get(dateKey) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={dateKey}
                  className={`aspect-square border rounded-md sm:rounded-lg p-0.5 sm:p-1 flex flex-col transition-colors ${
                    isToday 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border/50 hover:border-border'
                  } ${dayTransactions.length > 0 ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => {
                    if (dayTransactions.length > 0) {
                      // On mobile: always show day selection modal
                      // On desktop: show transaction directly if only one
                      if (isMobile) {
                        setSelectedDayTransactions({ date: day, transactions: dayTransactions });
                      } else if (dayTransactions.length === 1) {
                        setSelectedTransaction(dayTransactions[0].transaction);
                      } else {
                        setSelectedDayTransactions({ date: day, transactions: dayTransactions });
                      }
                    }
                  }}
                >
                  <span className={`text-[10px] sm:text-xs font-medium ${
                    isToday ? 'text-primary' : 'text-foreground'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  
                  {/* Transaction indicators */}
                  <div className="flex-1 overflow-hidden space-y-0.5 mt-0.5">
                    {dayTransactions.slice(0, 3).map(({ transaction, isPast }) => (
                      <div
                        key={transaction.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isMobile) {
                            setSelectedTransaction(transaction);
                          }
                        }}
                        className={`rounded px-0.5 sm:px-1 py-0.5 sm:cursor-pointer hover:opacity-80 transition-opacity ${
                          isPast
                            ? 'bg-muted/50 text-muted-foreground'
                            : transaction.type === 'income' 
                              ? 'bg-success/20 text-success' 
                              : 'bg-destructive/20 text-destructive'
                        }`}
                      >
                        <p className={`text-[8px] sm:text-[10px] font-medium truncate leading-tight ${isPast ? 'line-through' : ''}`}>
                          {transaction.description}
                        </p>
                        <p className="text-[7px] sm:text-[9px] font-semibold hidden sm:block">
                          {formatCurrency(transaction.amount)}
                        </p>
                      </div>
                    ))}
                    {dayTransactions.length > 3 && (
                      <span className="text-[8px] sm:text-[10px] text-muted-foreground">
                        +{dayTransactions.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 border-t border-border/50 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-success/20" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-destructive/20" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépenses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-muted/50" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Passées</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day Selection Modal (for mobile or multiple transactions) */}
      <Dialog open={!!selectedDayTransactions} onOpenChange={(open) => !open && setSelectedDayTransactions(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">
              Transactions du {selectedDayTransactions && format(selectedDayTransactions.date, 'd MMMM yyyy', { locale: fr })}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedDayTransactions?.transactions.map(({ transaction, isPast }) => (
              <div
                key={transaction.id}
                onClick={() => {
                  setSelectedDayTransactions(null);
                  setSelectedTransaction(transaction);
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                  isPast ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {transaction.type === 'income' ? (
                      <ArrowDownRight className="h-4 w-4 text-success flex-shrink-0" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-destructive flex-shrink-0" />
                    )}
                    <span className={`font-medium truncate text-sm ${isPast ? 'line-through' : ''}`}>
                      {transaction.description}
                    </span>
                  </div>
                  <span className={`font-bold text-sm flex-shrink-0 ${
                    transaction.type === 'income' ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(transaction.amount)}
                  </span>
                </div>
                {transaction.category && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: transaction.category.color }}
                    />
                    <span className="text-xs text-muted-foreground">{transaction.category.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              {selectedTransaction?.type === 'income' ? (
                <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
              ) : (
                <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              )}
              {selectedTransaction?.description}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Montant:</span>
                  <span className={`font-bold text-base sm:text-lg ${
                    selectedTransaction.type === 'income' ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(selectedTransaction.amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Type:</span>
                  <span className="font-medium text-xs sm:text-sm">{getTypeLabel(selectedTransaction.type)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Fréquence:</span>
                  <span className="font-medium text-xs sm:text-sm">{getRecurrenceLabel(selectedTransaction.recurrence_type)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Prochain paiement:</span>
                  <span className="font-medium text-xs sm:text-sm">
                    {new Date(selectedTransaction.next_due_date).toLocaleDateString('fr-FR', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Compte:</span>
                  <span className="font-medium text-xs sm:text-sm truncate max-w-[150px]">{selectedTransaction.account?.name}</span>
                </div>
                {selectedTransaction.category && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Catégorie:</span>
                    <Badge variant="outline" className="gap-1.5 text-xs">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: selectedTransaction.category.color }}
                      />
                      {selectedTransaction.category.name}
                    </Badge>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Statut:</span>
                  <Badge variant={selectedTransaction.is_active ? 'default' : 'secondary'} className="text-xs">
                    {selectedTransaction.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => {
                    onEdit(selectedTransaction);
                    setSelectedTransaction(null);
                  }}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => {
                    onToggleActive(selectedTransaction.id, selectedTransaction.is_active);
                    setSelectedTransaction(null);
                  }}
                >
                  {selectedTransaction.is_active ? 'Désactiver' : 'Activer'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => {
                    onDelete(selectedTransaction.id, selectedTransaction.description);
                    setSelectedTransaction(null);
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecurringCalendar;
