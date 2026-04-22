import { useState, useEffect } from 'react';
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
  is_paid: boolean | null;
  paid_date: string | null;
  actual_amount: number | null;
}

export const useDebts = () => {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledDebtPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchDebts = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les dettes",
        variant: "destructive"
      });
      return;
    }

    setDebts(data || []);
  };

  const fetchPayments = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('debt_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('Error fetching payments:', error);
      return;
    }

    setPayments(data || []);
  };

  const fetchScheduledPayments = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('scheduled_debt_payments')
      .select('id, debt_id, scheduled_date, scheduled_amount, principal_amount, interest_amount, is_paid, paid_date, actual_amount')
      .eq('user_id', user.id)
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('Error fetching scheduled payments:', error);
      return;
    }

    setScheduledPayments(data || []);
  };

  const getNextScheduledAmount = (debtId: string): number | null => {
    const next = scheduledPayments.find(sp => sp.debt_id === debtId && !sp.is_paid);
    return next ? next.scheduled_amount : null;
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
        title: "Erreur",
        description: "Impossible de créer la dette",
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: "Succès",
      description: "Dette créée avec succès"
    });

    await fetchDebts();
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
        title: "Erreur",
        description: "Impossible de modifier la dette",
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: "Succès",
      description: "Dette modifiée avec succès"
    });

    await fetchDebts();
  };

  const getDebtDeletionImpact = async (id: string): Promise<{ transactionCount: number; recurringCount: number; paymentCount: number }> => {
    if (!user) return { transactionCount: 0, recurringCount: 0, paymentCount: 0 };

    // Count recurring transactions linked to this debt
    const { data: linkedRecurring } = await supabase
      .from('recurring_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('debt_id', id);

    const recurringIds = (linkedRecurring || []).map(r => r.id);

    // Also count by description fallback
    const debt = debts.find(d => d.id === id);
    if (debt) {
      const suffixReceived = `${debt.description} (Remboursement dette)`;
      const suffixGiven = `${debt.description} (Remboursement prêt)`;
      const { data: legacyRecurring } = await supabase
        .from('recurring_transactions')
        .select('id')
        .eq('user_id', user.id)
        .in('description', [suffixReceived, suffixGiven]);
      (legacyRecurring || []).forEach(r => {
        if (!recurringIds.includes(r.id)) recurringIds.push(r.id);
      });
    }

    // Count transactions created from these recurring transactions
    let transactionCount = 0;
    if (recurringIds.length > 0) {
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('recurring_transaction_id', recurringIds);
      transactionCount = count || 0;
    }

    // Count debt_payments
    const { count: paymentCount } = await supabase
      .from('debt_payments')
      .select('id', { count: 'exact', head: true })
      .eq('debt_id', id)
      .eq('user_id', user.id);

    return {
      transactionCount,
      recurringCount: recurringIds.length,
      paymentCount: paymentCount || 0,
    };
  };

  const deleteDebt = async (id: string) => {
    if (!user) return;

    // 1. Find all recurring transactions linked to this debt
    const { data: linkedRecurring } = await supabase
      .from('recurring_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('debt_id', id);

    const recurringIds = (linkedRecurring || []).map(r => r.id);

    // Also find by description fallback for older records
    const debt = debts.find(d => d.id === id);
    if (debt) {
      const suffixReceived = `${debt.description} (Remboursement dette)`;
      const suffixGiven = `${debt.description} (Remboursement prêt)`;
      const { data: legacyRecurring } = await supabase
        .from('recurring_transactions')
        .select('id')
        .eq('user_id', user.id)
        .in('description', [suffixReceived, suffixGiven]);
      (legacyRecurring || []).forEach(r => {
        if (!recurringIds.includes(r.id)) recurringIds.push(r.id);
      });
    }

    // 2. Delete all transactions created from these recurring transactions
    if (recurringIds.length > 0) {
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .in('recurring_transaction_id', recurringIds);
    }

    // 3. Delete the recurring transactions themselves
    if (recurringIds.length > 0) {
      await supabase
        .from('recurring_transactions')
        .delete()
        .eq('user_id', user.id)
        .in('id', recurringIds);
    }

    // 4. Delete the debt (debt_payments and scheduled_debt_payments are CASCADE-deleted by the DB)
    const { error } = await supabase
      .from('debts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la dette",
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: "Succès",
      description: "Dette et transactions associées supprimées avec succès"
    });

    await fetchDebts();
    await fetchPayments();
  };

  const addPayment = async (paymentData: Omit<DebtPayment, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;

    const { error } = await supabase
      .from('debt_payments')
      .insert([{ ...paymentData, user_id: user.id }]);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter le paiement",
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: "Succès",
      description: "Paiement enregistré avec succès"
    });

    await fetchDebts();
    await fetchPayments();
  };

  const deletePayment = async (id: string) => {
    const { error } = await supabase
      .from('debt_payments')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le paiement",
        variant: "destructive"
      });
      throw error;
    }

    toast({
      title: "Succès",
      description: "Paiement supprimé avec succès"
    });

    await fetchDebts();
    await fetchPayments();
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchDebts(), fetchPayments(), fetchScheduledPayments()]);
      setLoading(false);
    };

    if (user) {
      loadData();

      const debtsSubscription = supabase
        .channel('debts_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, fetchDebts)
        .subscribe();

      const paymentsSubscription = supabase
        .channel('payments_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_payments' }, fetchPayments)
        .subscribe();

      const scheduledSubscription = supabase
        .channel('scheduled_debt_payments_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_debt_payments' }, () => {
          fetchDebts();
          fetchScheduledPayments();
        })
        .subscribe();

      return () => {
        debtsSubscription.unsubscribe();
        paymentsSubscription.unsubscribe();
        scheduledSubscription.unsubscribe();
      };
    }
  }, [user]);

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
    getNextScheduledAmount
  };
};
