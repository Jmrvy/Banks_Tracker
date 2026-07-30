import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Debt {
  id: string;
  user_id: string;
  description: string;
  type: 'loan_given' | 'loan_received';
  total_amount: number;
  remaining_amount: number;
  interest_rate: number;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'defaulted';
  contact_name: string | null;
  contact_info: string | null;
  notes: string | null;
  payment_frequency: string | null;
  payment_amount: number;
  loan_type: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  user_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  insurance_amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface ScheduledDebtPayment {
  id: string;
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  principal_amount: number;
  interest_amount: number;
  insurance_amount: number;
  is_paid: boolean | null;
  paid_date: string | null;
  actual_amount: number | null;
}

const DEBT_QUERY_KEYS = {
  debts: (userId: string) => ['debts', userId] as const,
  payments: (userId: string) => ['debtPayments', userId] as const,
  scheduledPayments: (userId: string) => ['scheduledDebtPayments', userId] as const,
};

export const useDebts = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const debtsQuery = useQuery({
    queryKey: DEBT_QUERY_KEYS.debts(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("debts.loadError", { defaultValue: "Unable to load debts" }),
          variant: "destructive"
        });
        throw error;
      }

      return (data ?? []) as Debt[];
    },
    enabled: !!user,
  });

  const paymentsQuery = useQuery({
    queryKey: DEBT_QUERY_KEYS.payments(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_payments')
        .select('*')
        .eq('user_id', user!.id)
        .order('payment_date', { ascending: false });

      if (error) {
        console.error('Error fetching payments:', error);
        throw error;
      }

      return (data ?? []) as DebtPayment[];
    },
    enabled: !!user,
  });

  const scheduledPaymentsQuery = useQuery({
    queryKey: DEBT_QUERY_KEYS.scheduledPayments(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_debt_payments')
        .select('id, debt_id, scheduled_date, scheduled_amount, principal_amount, interest_amount, insurance_amount, is_paid, paid_date, actual_amount')
        .eq('user_id', user!.id)
        .order('scheduled_date', { ascending: true });

      if (error) {
        console.error('Error fetching scheduled payments:', error);
        throw error;
      }

      return (data ?? []) as ScheduledDebtPayment[];
    },
    enabled: !!user,
  });

  const debts = debtsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const scheduledPayments = scheduledPaymentsQuery.data ?? [];
  const loading = !user ? false : (debtsQuery.isLoading || paymentsQuery.isLoading || scheduledPaymentsQuery.isLoading);

  const invalidateDebts = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: DEBT_QUERY_KEYS.debts(user.id) });
  }, [user, queryClient]);

  const invalidatePayments = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: DEBT_QUERY_KEYS.payments(user.id) });
  }, [user, queryClient]);

  const invalidateScheduledPayments = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: DEBT_QUERY_KEYS.scheduledPayments(user.id) });
  }, [user, queryClient]);

  useEffect(() => {
    if (!user) return;

    // Unique per hook instance. `supabase.channel(topic)` returns the
    // *existing* channel when one already has that topic, and seventeen
    // components call useDebts(). With a fixed name the second mount gets
    // the first mount's already-joined channel, adds bindings to it, and
    // the server rejects the join with "cannot add postgres_changes
    // callbacks … after subscribe()" — subscribe() only sends bindings
    // while the channel is still closed. Sharing one object also means the
    // first unmount removed the channel out from under everyone else.
    const channelId = `debt_data_changes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${user.id}` },
        () => invalidateDebts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debt_payments', filter: `user_id=eq.${user.id}` },
        () => invalidatePayments()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_debt_payments', filter: `user_id=eq.${user.id}` },
        () => {
          invalidateDebts();
          invalidateScheduledPayments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, invalidateDebts, invalidatePayments, invalidateScheduledPayments]);

  const getNextScheduledAmount = (debtId: string): number | null => {
    const next = scheduledPayments.find(sp => sp.debt_id === debtId && !sp.is_paid);
    return next ? next.scheduled_amount : null;
  };

  const getNextScheduledPayment = (debtId: string): ScheduledDebtPayment | null => {
    return scheduledPayments.find(sp => sp.debt_id === debtId && !sp.is_paid) ?? null;
  };

  const createDebt = async (debtData: Omit<Debt, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<string | undefined> => {
    if (!user) return;

    const { data, error } = await supabase
      .from('debts')
      .insert([{ ...debtData, user_id: user.id }])
      .select('id')
      .single();

    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("debts.createError", { defaultValue: "Unable to create the debt" }),
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: t("common.success", { defaultValue: "Success" }),
      description: t("debts.createSuccess", { defaultValue: "Debt created successfully" })
    });

    invalidateDebts();
    return data?.id;
  };

  const updateDebt = async (id: string, updates: Partial<Debt>) => {
    if (!user) return;

    const { error } = await supabase
      .from('debts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("debts.updateError", { defaultValue: "Unable to update the debt" }),
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: t("common.success", { defaultValue: "Success" }),
      description: t("debts.updateSuccess", { defaultValue: "Debt updated successfully" })
    });

    invalidateDebts();
  };

  const getDebtDeletionImpact = async (id: string): Promise<{ transactionCount: number; recurringCount: number; paymentCount: number }> => {
    if (!user) return { transactionCount: 0, recurringCount: 0, paymentCount: 0 };

    const { data: linkedRecurring, error: linkedRecurringError } = await supabase
      .from('recurring_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('debt_id', id);

    if (linkedRecurringError) {
      console.error('Error fetching linked recurring transactions:', linkedRecurringError);
    }

    const recurringIds = (linkedRecurring || []).map(r => r.id);

    const debt = debts.find(d => d.id === id);
    if (debt) {
      const suffixReceived = `${debt.description} (Remboursement dette)`;
      const suffixGiven = `${debt.description} (Remboursement prêt)`;
      const { data: legacyRecurring, error: legacyError } = await supabase
        .from('recurring_transactions')
        .select('id')
        .eq('user_id', user.id)
        .in('description', [suffixReceived, suffixGiven]);

      if (legacyError) {
        console.error('Error fetching legacy recurring transactions:', legacyError);
      }

      (legacyRecurring || []).forEach(r => {
        if (!recurringIds.includes(r.id)) recurringIds.push(r.id);
      });
    }

    let transactionCount = 0;
    if (recurringIds.length > 0) {
      const { count, error: txCountError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('recurring_transaction_id', recurringIds);

      if (txCountError) {
        console.error('Error counting linked transactions:', txCountError);
      }

      transactionCount = count || 0;
    }

    const { count: paymentCount, error: paymentCountError } = await supabase
      .from('debt_payments')
      .select('id', { count: 'exact', head: true })
      .eq('debt_id', id)
      .eq('user_id', user.id);

    if (paymentCountError) {
      console.error('Error counting debt payments:', paymentCountError);
    }

    return {
      transactionCount,
      recurringCount: recurringIds.length,
      paymentCount: paymentCount || 0,
    };
  };

  const deleteDebt = async (id: string) => {
    if (!user) return;

    const { data: linkedRecurring, error: linkedRecurringError } = await supabase
      .from('recurring_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('debt_id', id);

    if (linkedRecurringError) {
      console.error('Error fetching linked recurring transactions for deletion:', linkedRecurringError);
    }

    const recurringIds = (linkedRecurring || []).map(r => r.id);

    const debt = debts.find(d => d.id === id);
    if (debt) {
      const suffixReceived = `${debt.description} (Remboursement dette)`;
      const suffixGiven = `${debt.description} (Remboursement prêt)`;
      const { data: legacyRecurring, error: legacyError } = await supabase
        .from('recurring_transactions')
        .select('id')
        .eq('user_id', user.id)
        .in('description', [suffixReceived, suffixGiven]);

      if (legacyError) {
        console.error('Error fetching legacy recurring transactions for deletion:', legacyError);
      }

      (legacyRecurring || []).forEach(r => {
        if (!recurringIds.includes(r.id)) recurringIds.push(r.id);
      });
    }

    if (recurringIds.length > 0) {
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .in('recurring_transaction_id', recurringIds);
    }

    if (recurringIds.length > 0) {
      await supabase
        .from('recurring_transactions')
        .delete()
        .eq('user_id', user.id)
        .in('id', recurringIds);
    }

    const { error } = await supabase
      .from('debts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("debts.deleteError", { defaultValue: "Unable to delete the debt" }),
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: t("common.success", { defaultValue: "Success" }),
      description: t("debts.deleteSuccess", { defaultValue: "Debt and associated transactions deleted successfully" })
    });

    invalidateDebts();
    invalidatePayments();
  };

  const addPayment = async (paymentData: Omit<DebtPayment, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;

    const { error } = await supabase
      .from('debt_payments')
      .insert([{ ...paymentData, user_id: user.id }]);

    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("debts.addPaymentError", { defaultValue: "Unable to add the payment" }),
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: t("common.success", { defaultValue: "Success" }),
      description: t("debts.addPaymentSuccess", { defaultValue: "Payment recorded successfully" })
    });

    invalidateDebts();
    invalidatePayments();
  };

  const deletePayment = async (id: string) => {
    const { error } = await supabase
      .from('debt_payments')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("debts.deletePaymentError", { defaultValue: "Unable to delete the payment" }),
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: t("common.success", { defaultValue: "Success" }),
      description: t("debts.deletePaymentSuccess", { defaultValue: "Payment deleted successfully" })
    });

    invalidateDebts();
    invalidatePayments();
  };

  return {
    debts,
    payments,
    scheduledPayments,
    loading,
    createDebt,
    updateDebt,
    deleteDebt,
    getDebtDeletionImpact,
    addPayment,
    deletePayment,
    getNextScheduledAmount,
    getNextScheduledPayment
  };
};
