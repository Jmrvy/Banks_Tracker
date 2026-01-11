import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Calendar, Check, Loader2 } from 'lucide-react';
import { useFinancialData, RecurringTransaction } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, addDays, addWeeks, addMonths, addYears, isBefore, isEqual, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

interface RegularizeOverdueTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overdueTransactions: RecurringTransaction[];
}

interface MissedOccurrence {
  recurringId: string;
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  accountId: string;
  categoryId: string | null;
  accountName: string;
}

export const RegularizeOverdueTransactionsModal = ({
  open,
  onOpenChange,
  overdueTransactions,
}: RegularizeOverdueTransactionsModalProps) => {
  const { user } = useAuth();
  const { refetch, fetchRecurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [selectedOccurrences, setSelectedOccurrences] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate all missed occurrences for each overdue transaction
  const missedOccurrences = useMemo(() => {
    const occurrences: MissedOccurrence[] = [];
    const today = startOfDay(new Date());

    for (const rt of overdueTransactions) {
      const startDate = startOfDay(new Date(rt.start_date));
      let currentDate = startDate;

      // Generate all occurrences from start date until today
      while (isBefore(currentDate, today) || isEqual(currentDate, today)) {
        occurrences.push({
          recurringId: rt.id,
          date: new Date(currentDate),
          description: rt.description,
          amount: rt.amount,
          type: rt.type,
          accountId: rt.account_id,
          categoryId: rt.category_id,
          accountName: rt.account?.name || 'Compte inconnu',
        });

        // Move to next occurrence based on recurrence type
        switch (rt.recurrence_type) {
          case 'weekly':
            currentDate = addWeeks(currentDate, 1);
            break;
          case 'monthly':
            currentDate = addMonths(currentDate, 1);
            break;
          case 'quarterly':
            currentDate = addMonths(currentDate, 3);
            break;
          case 'yearly':
            currentDate = addYears(currentDate, 1);
            break;
        }
      }
    }

    return occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [overdueTransactions]);

  const toggleOccurrence = (key: string) => {
    setSelectedOccurrences(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOccurrences.size === missedOccurrences.length) {
      setSelectedOccurrences(new Set());
    } else {
      setSelectedOccurrences(new Set(missedOccurrences.map((_, i) => `${i}`)));
    }
  };

  const getOccurrenceKey = (index: number) => `${index}`;

  const handleRegularize = async () => {
    if (!user || selectedOccurrences.size === 0) return;

    setIsProcessing(true);
    try {
      const transactionsToCreate = missedOccurrences
        .filter((_, index) => selectedOccurrences.has(getOccurrenceKey(index)))
        .map(occurrence => ({
          user_id: user.id,
          account_id: occurrence.accountId,
          category_id: occurrence.categoryId,
          description: `${occurrence.description} (Régularisation)`,
          amount: occurrence.amount,
          type: occurrence.type,
          transaction_date: format(occurrence.date, 'yyyy-MM-dd'),
          value_date: format(occurrence.date, 'yyyy-MM-dd'),
          include_in_stats: true,
        }));

      const { error } = await supabase
        .from('transactions')
        .insert(transactionsToCreate);

      if (error) throw error;

      // Update next_due_date for each recurring transaction
      const recurringIdsToUpdate = new Set(
        missedOccurrences
          .filter((_, index) => selectedOccurrences.has(getOccurrenceKey(index)))
          .map(o => o.recurringId)
      );

      for (const recurringId of recurringIdsToUpdate) {
        const rt = overdueTransactions.find(t => t.id === recurringId);
        if (!rt) continue;

        // Calculate next due date after today
        const today = startOfDay(new Date());
        let nextDate = startOfDay(new Date(rt.start_date));

        while (isBefore(nextDate, today) || isEqual(nextDate, today)) {
          switch (rt.recurrence_type) {
            case 'weekly':
              nextDate = addWeeks(nextDate, 1);
              break;
            case 'monthly':
              nextDate = addMonths(nextDate, 1);
              break;
            case 'quarterly':
              nextDate = addMonths(nextDate, 3);
              break;
            case 'yearly':
              nextDate = addYears(nextDate, 1);
              break;
          }
        }

        await supabase
          .from('recurring_transactions')
          .update({ 
            next_due_date: format(nextDate, 'yyyy-MM-dd'),
            updated_at: new Date().toISOString()
          })
          .eq('id', recurringId)
          .eq('user_id', user.id);
      }

      toast.success(`${transactionsToCreate.length} transaction(s) créée(s) avec succès`);
      refetch();
      onOpenChange(false);
      setSelectedOccurrences(new Set());
    } catch (error) {
      console.error('Error regularizing transactions:', error);
      toast.error('Erreur lors de la régularisation');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalAmount = useMemo(() => {
    return missedOccurrences
      .filter((_, index) => selectedOccurrences.has(getOccurrenceKey(index)))
      .reduce((sum, o) => sum + (o.type === 'expense' ? -o.amount : o.amount), 0);
  }, [missedOccurrences, selectedOccurrences]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Régulariser les transactions en retard
          </DialogTitle>
          <DialogDescription>
            Sélectionnez les transactions manquées à créer rétroactivement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {missedOccurrences.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selectedOccurrences.size === missedOccurrences.length
                    ? 'Tout désélectionner'
                    : 'Tout sélectionner'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedOccurrences.size} / {missedOccurrences.length} sélectionné(s)
                </span>
              </div>

              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {missedOccurrences.map((occurrence, index) => {
                    const key = getOccurrenceKey(index);
                    const isSelected = selectedOccurrences.has(key);
                    
                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleOccurrence(key)}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOccurrence(key)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm truncate">
                                {occurrence.description}
                              </p>
                              <Badge
                                variant={occurrence.type === 'income' ? 'default' : 'destructive'}
                                className="shrink-0"
                              >
                                {occurrence.type === 'income' ? '+' : '-'}
                                {formatCurrency(occurrence.amount)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              <span>{format(occurrence.date, 'dd MMMM yyyy', { locale: fr })}</span>
                              <span>•</span>
                              <span>{occurrence.accountName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {selectedOccurrences.size > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Impact total</span>
                    <span className={`font-bold ${totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {totalAmount >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalAmount))}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleRegularize}
                  disabled={selectedOccurrences.size === 0 || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Créer {selectedOccurrences.size} transaction(s)
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Aucune transaction en retard à régulariser.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
