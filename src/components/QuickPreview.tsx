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
        ? parseLocalDate(t.value_date || t.transaction_date)
        : parseLocalDate(t.transaction_date);
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

  const BlurredAmount = ({
    amount,
    className = "",
    block = false,
  }: {
    amount: string;
    className?: string;
    block?: boolean;
  }) => {
    const Tag = block ? "div" : "span";
    return (
      <Tag className={`transition-all duration-300 ${!isRevealed ? 'blur-md select-none' : ''} ${className}`}>
        {amount}
      </Tag>
    );
  };

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

      {/* Total Balance - Hero panel */}
      <div className="ft-hero">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="ft-hero-eyebrow">
              <span className="live" />
              {t('quickPreview.totalBalance')}
            </div>
            <BlurredAmount
              block
              amount={formatCurrency(totalBalance)}
              className={`ft-hero-value mt-3 break-words ${isPositive ? "" : "text-destructive"}`}
            />
          </div>
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl grid place-items-center flex-shrink-0 mb-6 ${isPositive ? "bg-pos/12 text-pos" : "bg-neg/12 text-destructive"}`}>
            {isPositive ? <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" /> : <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />}
          </div>
        </div>
        <div className="h-6" />
      </div>

      {/* Monthly summary KPIs */}
      <div>
        <p className="ft-eyebrow mb-2 capitalize">{currentMonth}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
          <div className="ft-kpi p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="ft-kpi-icon pos flex-shrink-0"><ArrowDownRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></div>
              <span className="ft-kpi-label truncate">{t('common.income')}</span>
            </div>
            <BlurredAmount
              amount={formatCurrency(monthlyStats.income)}
              block
              className="ft-kpi-value text-pos truncate min-w-0"
            />
          </div>
          <div className="ft-kpi p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="ft-kpi-icon neg flex-shrink-0"><ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></div>
              <span className="ft-kpi-label truncate">{t('common.expenses')}</span>
            </div>
            <BlurredAmount
              amount={formatCurrency(monthlyStats.expenses)}
              block
              className="ft-kpi-value text-destructive truncate min-w-0"
            />
          </div>
          <div className="ft-kpi p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="ft-kpi-icon acc flex-shrink-0"><Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></div>
              <span className="ft-kpi-label truncate">{t('dashboard.net')}</span>
            </div>
            <BlurredAmount
              amount={`${formatCurrency(monthlyStats.net)}`}
              block
              className={`ft-kpi-value truncate min-w-0 ${monthlyStats.net >= 0 ? 'text-pos' : 'text-destructive'}`}
            />
          </div>
        </div>
      </div>

      {/* Accounts and Upcoming grid */}
      <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
        {/* Accounts Card */}
        <div className="ft-card-flush flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="ft-card-title">{t('quickPreview.myAccounts')}</h3>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/accounts')}>
              {t('quickPreview.viewAll')}
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex flex-col">
            {accounts.slice(0, 4).map((account) => (
              <button
                key={account.id}
                type="button"
                className="flex items-center justify-between px-5 py-3 border-b border-line last:border-b-0 hover:bg-bg-subtle/60 transition-colors text-left"
                onClick={() => navigate('/accounts', { state: { selectedAccountId: account.id } })}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${account.balance >= 0 ? 'bg-pos' : 'bg-destructive'}`} />
                  <span className="text-sm font-medium truncate">
                    {account.name}
                  </span>
                </div>
                <BlurredAmount
                  amount={formatCurrency(account.balance)}
                  className={`font-mono text-sm font-semibold ${account.balance >= 0 ? '' : 'text-destructive'}`}
                />
              </button>
            ))}
            {accounts.length > 4 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t('quickPreview.otherAccounts', { count: accounts.length - 4 })}
              </p>
            )}
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t('quickPreview.noAccountsConfigured')}
              </p>
            )}
          </div>
        </div>

        {/* Upcoming Transactions Card */}
        <div className="ft-card-flush flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="ft-card-title">{t('quickPreview.upcoming7d')}</h3>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate('/recurring-transactions')}>
              {t('quickPreview.viewAll')}
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex flex-col">
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
                  className="flex items-center justify-between px-5 py-3 border-b border-line last:border-b-0 hover:bg-bg-subtle/60 transition-colors text-left"
                >
                  <div className="flex flex-col min-w-0 flex-1 mr-2">
                    <span className="text-sm font-medium truncate">
                      {resolveNamePlaceholders(transaction.description, parseLocalDate(transaction.next_due_date))}
                    </span>
                    <span className="text-[11px] text-fg-dim">
                      {format(parseLocalDate(transaction.next_due_date), 'EEE d MMM', { locale: dateLocale })}
                    </span>
                  </div>
                  <BlurredAmount
                    amount={`${effectiveType === 'expense' ? '-' : '+'}${formatCurrency(displayAmount)}`}
                    className={`font-mono text-sm font-semibold whitespace-nowrap ${
                      effectiveType === 'income' ? 'text-pos' : 'text-destructive'
                    }`}
                  />
                </button>
              );
            })}
            {upcomingTransactions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {t('quickPreview.noUpcomingTransactions')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Continue to Dashboard Button */}
      <div className="flex justify-center pt-2">
        <Button
          onClick={onShowFullDashboard}
          className="w-full md:w-auto md:min-w-[280px] h-10 md:h-11 font-semibold gap-2"
          size="lg"
        >
          <span>{t('quickPreview.fullDashboard')}</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
