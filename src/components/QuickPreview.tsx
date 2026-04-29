import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Wallet, Calendar, ArrowRight, TrendingUp, TrendingDown, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useFinancialData, RecurringTransaction } from "@/hooks/useFinancialData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parseLocalDate } from "@/lib/dateUtils";
import { format, addDays, isAfter, isBefore, startOfToday, startOfMonth, endOfMonth } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { getRecurringDisplayAmount, getRecurringEffectiveType } from "@/lib/recurringAmount";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";

interface ScheduledDebtPayment {
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean | null;
}

interface QuickPreviewProps {
  onShowFullDashboard: () => void;
}

export const QuickPreview = ({ onShowFullDashboard }: QuickPreviewProps) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const [isRevealed, setIsRevealed] = useState(true);
  const { accounts, recurringTransactions, transactions } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts } = useDebts();
  const { user } = useAuth();
  const { formatCurrency, preferences } = useUserPreferences();
  const navigate = useNavigate();
  const [scheduledDebtPayments, setScheduledDebtPayments] = useState<ScheduledDebtPayment[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('scheduled_debt_payments')
      .select('debt_id, scheduled_date, scheduled_amount, is_paid')
      .eq('user_id', user.id)
      .then(({ data }) => setScheduledDebtPayments(data || []));
  }, [user]);

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  const isPositive = totalBalance >= 0;

  // Monthly income and expenses
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const activeDateType = preferences.dateType;

    const monthTransactions = transactions.filter(t => {
      const date = activeDateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd && t.include_in_stats !== false;
    });

    const income = monthTransactions
      .filter(t => t.type === 'income' && !t.refund_of_transaction_id)
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const refundedAmount = t.refunded_amount || 0;
        return sum + Math.max(0, t.amount - refundedAmount);
      }, 0);

    return { income, expenses, net: income - expenses };
  }, [transactions, preferences.dateType]);


  const upcomingTransactions = useMemo(() => {
    const today = startOfToday();
    const nextWeek = addDays(today, 7);

    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        // Skip completed installments
        if (rt.installment_payment_id) {
          const ip = installmentPayments.find(p => p.id === rt.installment_payment_id);
          if (!ip || !ip.is_active || ip.remaining_amount <= 0) return false;
        }
        // Skip completed debts
        if (rt.debt_id) {
          const debt = debts.find(d => d.id === rt.debt_id);
          if (!debt || debt.status === 'completed' || debt.remaining_amount <= 0) return false;
        }
        const dueDate = parseLocalDate(rt.next_due_date);
        return !isBefore(dueDate, today) && !isAfter(dueDate, nextWeek);
      })
      .sort((a, b) => parseLocalDate(a.next_due_date).getTime() - parseLocalDate(b.next_due_date).getTime())
      .slice(0, 5);
  }, [recurringTransactions, installmentPayments, debts]);

  const BlurredAmount = ({ amount, className = "" }: { amount: string; className?: string }) => (
    <span className={`transition-all duration-300 ${!isRevealed ? 'blur-md select-none' : ''} ${className}`}>
      {amount}
    </span>
  );

  const currentMonth = format(new Date(), 'MMMM yyyy', { locale: dateLocale });

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-5 md:space-y-6 max-w-5xl mx-auto">
      {/* Toggle Button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsRevealed(!isRevealed)}
          className="gap-1.5 text-muted-foreground hover:text-foreground h-8 px-2 sm:px-3"
        >
          {isRevealed ? (
            <><EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="text-xs sm:text-sm">{t('quickPreview.hide')}</span></>
          ) : (
            <><Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /><span className="text-xs sm:text-sm">{t('quickPreview.show')}</span></>
          )}
        </Button>
      </div>

      {/* Total Balance - Hero card */}
      <div className="hero-card glass-shimmer p-5 sm:p-6 md:p-8 animate-glass-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-muted-foreground/80 font-medium">{t('quickPreview.totalBalance')}</p>
            <BlurredAmount
              amount={formatCurrency(totalBalance)}
              className={`text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight ${isPositive ? "text-success" : "text-destructive"}`}
            />
          </div>
          <div className={`icon-badge icon-badge-lg ${isPositive ? 'bg-success/10' : 'bg-destructive/10'}`}>
            {isPositive ? (
              <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-success" />
            ) : (
              <TrendingDown className="w-6 h-6 sm:w-7 sm:h-7 text-destructive" />
            )}
          </div>
        </div>
      </div>

      {/* Monthly summary - 3 stat cards */}
      <div>
        <p className="section-header mb-3 capitalize">{currentMonth}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="icon-badge icon-badge-sm bg-success/10">
                <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-success" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{t('common.income')}</p>
            <BlurredAmount
              amount={formatCurrency(monthlyStats.income)}
              className="text-sm sm:text-base md:text-lg font-bold text-success"
            />
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="icon-badge icon-badge-sm bg-destructive/10">
                <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{t('common.expenses')}</p>
            <BlurredAmount
              amount={formatCurrency(monthlyStats.expenses)}
              className="text-sm sm:text-base md:text-lg font-bold text-destructive"
            />
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="icon-badge icon-badge-sm bg-primary/10">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{t('dashboard.net')}</p>
            <BlurredAmount
              amount={formatCurrency(monthlyStats.net)}
              className={`text-sm sm:text-base md:text-lg font-bold ${monthlyStats.net >= 0 ? 'text-success' : 'text-destructive'}`}
            />
          </div>
        </div>
      </div>

      {/* Accounts and Upcoming grid */}
      <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
        {/* Accounts Card */}
        <Card className="border-white/[0.06]">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                <span className="font-semibold text-xs sm:text-sm">{t('quickPreview.myAccounts')}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] sm:text-xs h-6 sm:h-7 px-1.5 sm:px-2"
                onClick={() => navigate('/accounts')}
              >
                {t('quickPreview.viewAll')}
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />
              </Button>
            </div>

            <div className="space-y-1">
              {accounts.slice(0, 4).map((account) => (
                <div
                  key={account.id}
                  className="glass-row flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate('/accounts', { state: { selectedAccountId: account.id } })}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${account.balance >= 0 ? 'bg-success' : 'bg-destructive'}`} />
                    <span className="text-xs sm:text-sm font-medium truncate">
                      {account.name}
                    </span>
                  </div>
                  <BlurredAmount
                    amount={formatCurrency(account.balance)}
                    className={`text-xs sm:text-sm font-semibold ${account.balance >= 0 ? 'text-foreground' : 'text-destructive'}`}
                  />
                </div>
              ))}
              {accounts.length > 4 && (
                <p className="text-[10px] sm:text-xs text-muted-foreground text-center pt-1">
                  {t('quickPreview.otherAccounts', { count: accounts.length - 4 })}
                </p>
              )}
              {accounts.length === 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                  {t('quickPreview.noAccountsConfigured')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Transactions Card */}
        <Card className="border-white/[0.06]">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                <span className="font-semibold text-xs sm:text-sm">{t('quickPreview.upcoming7d')}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] sm:text-xs h-6 sm:h-7 px-1.5 sm:px-2"
                onClick={() => navigate('/recurring-transactions')}
              >
                {t('quickPreview.viewAll')}
                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />
              </Button>
            </div>

            <div className="space-y-1">
              {upcomingTransactions.map((transaction) => {
                const displayAmount = getRecurringDisplayAmount(
                  transaction,
                  transaction.next_due_date,
                  installmentPayments,
                  debts,
                  scheduledDebtPayments
                );
                const effectiveType = getRecurringEffectiveType(transaction, installmentPayments);
                return (
                  <button
                    key={transaction.id}
                    onClick={() => navigate('/recurring-transactions')}
                    className="glass-row flex items-center justify-between w-full text-left"
                  >
                    <div className="flex flex-col min-w-0 flex-1 mr-2">
                      <span className="text-xs sm:text-sm font-medium truncate">
                        {resolveNamePlaceholders(transaction.description, parseLocalDate(transaction.next_due_date))}
                      </span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        {format(parseLocalDate(transaction.next_due_date), 'EEE d MMM', { locale: dateLocale })}
                      </span>
                    </div>
                    <BlurredAmount
                      amount={`${effectiveType === 'expense' ? '-' : '+'}${formatCurrency(displayAmount)}`}
                      className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${
                        effectiveType === 'income' ? 'text-success' : 'text-destructive'
                      }`}
                    />
                  </button>
                );
              })}
              {upcomingTransactions.length === 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                  {t('quickPreview.noUpcomingTransactions')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Continue to Dashboard Button */}
      <div className="flex justify-center pt-1 sm:pt-2">
        <Button
          onClick={onShowFullDashboard}
          className="w-full md:w-auto md:min-w-[280px] h-10 sm:h-11 md:h-12 rounded-2xl"
          size="lg"
        >
          <span className="text-xs sm:text-sm md:text-base">{t('quickPreview.fullDashboard')}</span>
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5 sm:ml-2" />
        </Button>
      </div>
    </div>
  );
};
