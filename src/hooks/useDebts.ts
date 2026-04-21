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
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export const useDebts = () => {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
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
    const { error } = await supabase
      .from('debts')
      .update(updates)
      .eq('id', id);

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

  const deleteDebt = async (id: string) => {
    if (!user) return;

    // Delete linked transactions (debt payment transactions created via LinkDebtPaymentModal)
    // Find debt_payments with notes starting with "Lié à:" to identify linked transaction descriptions
    const { data: debtPayments } = await supabase
      .from('debt_payments')
      .select('notes')
      .eq('debt_id', id)
      .eq('user_id', user.id);

    // Delete recurring transactions linked to this debt via debt_id (reliable)
    await supabase
      .from('recurring_transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('debt_id', id);

    // Also delete by description as fallback for older records without debt_id
    const debt = debts.find(d => d.id === id);
    if (debt) {
      const suffixReceived = `${debt.description} (Remboursement dette)`;
      const suffixGiven = `${debt.description} (Remboursement prêt)`;

      // Delete auto-created transactions (use .in() to avoid injection via .or() string interpolation)
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .in('description', [suffixReceived, suffixGiven]);

      // Delete any remaining recurring transactions matched by description
      await supabase
        .from('recurring_transactions')
        .delete()
        .eq('user_id', user.id)
        .in('description', [suffixReceived, suffixGiven]);
    }

    // debt_payments and scheduled_debt_payments are CASCADE-deleted by the DB
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
      description: "Dette supprimée avec succès"
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
      await Promise.all([fetchDebts(), fetchPayments()]);
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

      return () => {
        debtsSubscription.unsubscribe();
        paymentsSubscription.unsubscribe();
      };
    }
  }, [user]);

  return {
    debts,
    payments,
    loading,
    createDebt,
    updateDebt,
    deleteDebt,
    addPayment,
    deletePayment
  };
};
