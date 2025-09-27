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
        <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <div className="flex items-center justify-between">
              <span>
                {overdueTransactions.length} transaction{overdueTransactions.length > 1 ? 's' : ''} récurrente{overdueTransactions.length > 1 ? 's' : ''} en retard
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/recurring-transactions')}
                className="text-red-600 border-red-300 hover:bg-red-100 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900"
              >
                Voir
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Upcoming Transactions */}
      {upcomingTransactions.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-800 dark:text-orange-200 flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              Transactions récurrentes à venir
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {upcomingTransactions.slice(0, 3).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-black/20"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-lg">{getTypeIcon(transaction.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{transaction.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                  <div className="flex items-center gap-2 text-right">
                    <div>
                      <p className={`text-sm font-medium ${getTypeColor(transaction.type)}`}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(transaction.next_due_date)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {transaction.recurrence_type === 'weekly' ? 'Hebdo' : 
                       transaction.recurrence_type === 'monthly' ? 'Mensuel' : 
                       transaction.recurrence_type === 'yearly' ? 'Annuel' : transaction.recurrence_type}
                    </Badge>
                  </div>
                </div>
              ))}
              
              {upcomingTransactions.length > 3 && (
                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/recurring-transactions')}
                    className="text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    Voir {upcomingTransactions.length - 3} autre{upcomingTransactions.length - 3 > 1 ? 's' : ''} transaction{upcomingTransactions.length - 3 > 1 ? 's' : ''}
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
