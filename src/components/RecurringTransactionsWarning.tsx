import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, AlertTriangle, Repeat, ArrowRight } from 'lucide-react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useNavigate } from 'react-router-dom';

export const RecurringTransactionsWarning = () => {
  const { recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const navigate = useNavigate();

  const upcomingTransactions = useMemo(() => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        const nextDue = new Date(rt.next_due_date);
        return nextDue >= today && nextDue <= nextWeek;
      })
      .sort((a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime());
  }, [recurringTransactions]);

  const overdueTransactions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        const nextDue = new Date(rt.next_due_date);
        nextDue.setHours(0, 0, 0, 0);
        return nextDue < today;
      })
      .sort((a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime());
  }, [recurringTransactions]);

  if (upcomingTransactions.length === 0 && overdueTransactions.length === 0) {
    return null;
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'text-green-600 dark:text-green-400';
      case 'expense': return 'text-red-600 dark:text-red-400';
      default: return 'text-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income': return '↗';
      case 'expense': return '↘';
      default: return '•';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Demain";
    if (diffDays < 0) return `Il y a ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`;
    return `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-4">
      {/* Overdue Transactions Alert */}
      {overdueTransactions.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10 dark:border-destructive/30 dark:bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-foreground">
            <div className="flex items-center justify-between">
              <span>
                {overdueTransactions.length} transaction{overdueTransactions.length > 1 ? 's' : ''} récurrente{overdueTransactions.length > 1 ? 's' : ''} en retard
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/recurring-transactions')}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                Voir
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Upcoming Transactions */}
      {upcomingTransactions.length > 0 && (
        <Card className="border-border bg-card dark:border-border/50">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-foreground dark:text-foreground flex items-center gap-2 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              Transactions récurrentes à venir
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="space-y-1.5 sm:space-y-2">
              {upcomingTransactions.slice(0, 3).map((transaction) => (
                <div
                  key={transaction.id}
                  className="p-2 sm:p-3 rounded-lg bg-muted/30 dark:bg-muted/20 border border-border/50"
                >
                  {/* Mobile view - compact single line */}
                  <div className="flex items-center justify-between gap-2 sm:hidden">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm flex-shrink-0">{getTypeIcon(transaction.type)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate text-foreground">{transaction.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(transaction.next_due_date)}
                        </p>
                      </div>
                    </div>
                    <p className={`text-xs font-semibold flex-shrink-0 ${getTypeColor(transaction.type)}`}>
                      {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                    </p>
                  </div>

                  {/* Desktop view - full details */}
                  <div className="hidden sm:flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="text-base mt-0.5">{getTypeIcon(transaction.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{transaction.description}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{transaction.account?.name}</span>
                          {transaction.category && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: transaction.category.color }}
                                />
                                <span>{transaction.category.name}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${getTypeColor(transaction.type)}`}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(transaction.next_due_date)}
                        </p>
                        <span className="text-xs text-muted-foreground">•</span>
                        <p className="text-xs text-muted-foreground">
                          {transaction.recurrence_type === 'weekly' ? 'Hebdo' : 
                           transaction.recurrence_type === 'monthly' ? 'Mensuel' : 
                           transaction.recurrence_type === 'yearly' ? 'Annuel' : transaction.recurrence_type}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {upcomingTransactions.length > 3 && (
                <div className="text-center pt-1 sm:pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/recurring-transactions')}
                    className="text-muted-foreground hover:text-foreground text-xs sm:text-sm h-7 sm:h-8"
                  >
                    Voir {upcomingTransactions.length - 3} autre{upcomingTransactions.length - 3 > 1 ? 's' : ''}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
