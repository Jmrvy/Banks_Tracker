import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InstallmentPayment {
  id: string;
  user_id: string;
  description: string;
  total_amount: number;
  remaining_amount: number;
  installment_amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly';
  start_date: string;
  next_payment_date: string;
  end_date: string | null;
  account_id: string;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstallmentPaymentRecord {
  id: string;
  user_id: string;
  installment_payment_id: string;
  payment_date: string;
  amount: number;
  transaction_id: string | null;
  is_paid: boolean;
  created_at: string;
}

export const useInstallmentPayments = () => {
  const { user } = useAuth();
  const [installmentPayments, setInstallmentPayments] = useState<InstallmentPayment[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<InstallmentPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstallmentPayments = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching installment payments:', error);
    } else {
      setInstallmentPayments((data || []) as InstallmentPayment[]);
    }
  };

  const fetchPaymentRecords = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('installment_payment_records')
      .select('*')
      .eq('user_id', user.id)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('Error fetching payment records:', error);
    } else {
      setPaymentRecords(data || []);
    }
  };

  const createInstallmentPayment = async (data: {
    description: string;
    total_amount: number;
    installment_amount: number;
    frequency: 'weekly' | 'monthly' | 'quarterly';
    start_date: string;
    account_id: string;
    category_id?: string;
  }) => {
    if (!user) return { error: new Error('User not authenticated') };

    // First, create the installment payment
    const { data: installmentData, error: installmentError } = await supabase
      .from('installment_payments')
      .insert({
        user_id: user.id,
        description: data.description,
        total_amount: data.total_amount,
        remaining_amount: data.total_amount,
        installment_amount: data.installment_amount,
        frequency: data.frequency,
        start_date: data.start_date,
        next_payment_date: data.start_date,
        account_id: data.account_id,
        category_id: data.category_id || null,
      })
      .select()
      .single();

    if (installmentError) {
      console.error('Error creating installment payment:', installmentError);
      return { error: installmentError };
    }

    // Then, create the corresponding recurring transaction
    const recurringFrequency = data.frequency === 'weekly' ? 'weekly' :
                               data.frequency === 'monthly' ? 'monthly' :
                               'quarterly';

    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: user.id,
        description: `${data.description} (Paiement échelonné)`,
        amount: data.installment_amount,
        type: 'expense',
        recurrence_type: recurringFrequency,
        start_date: data.start_date,
        next_due_date: data.start_date, // Set next due date to start date
        account_id: data.account_id,
        category_id: data.category_id || null,
        is_active: true,
        installment_payment_id: installmentData.id, // Link to installment payment
      });

    if (recurringError) {
      console.error('Error creating recurring transaction:', recurringError);
      // Rollback: delete the installment payment
      await supabase
        .from('installment_payments')
        .delete()
        .eq('id', installmentData.id);
      return { error: recurringError };
    }

    await fetchInstallmentPayments();
    return { error: null };
  };

  const updateInstallmentPayment = async (id: string, updates: Partial<InstallmentPayment>) => {
    if (!user) return { error: new Error('User not authenticated') };

    const { error } = await supabase
      .from('installment_payments')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating installment payment:', error);
      return { error };
    }

    await fetchInstallmentPayments();
    return { error: null };
  };

  const deleteInstallmentPayment = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    // First, delete the linked recurring transaction
    await supabase
      .from('recurring_transactions')
      .delete()
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

    // Then delete the installment payment
    const { error } = await supabase
      .from('installment_payments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting installment payment:', error);
      return { error };
    }

    await fetchInstallmentPayments();
    return { error: null };
  };

  const recordPayment = async (installmentPaymentId: string, amount: number, transactionId: string | null = null) => {
    if (!user) return { error: new Error('User not authenticated') };

    const installmentPayment = installmentPayments.find(ip => ip.id === installmentPaymentId);
    if (!installmentPayment) return { error: new Error('Installment payment not found') };

    // Create payment record
    const { error: recordError } = await supabase
      .from('installment_payment_records')
      .insert({
        user_id: user.id,
        installment_payment_id: installmentPaymentId,
        payment_date: new Date().toISOString().split('T')[0],
        amount,
        transaction_id: transactionId,
        is_paid: true,
      });

    if (recordError) {
      console.error('Error recording payment:', recordError);
      return { error: recordError };
    }

    // Update remaining amount and next payment date
    const newRemainingAmount = installmentPayment.remaining_amount - amount;
    const nextPaymentDate = calculateNextPaymentDate(installmentPayment.next_payment_date, installmentPayment.frequency);
    const isComplete = newRemainingAmount <= 0;

    await updateInstallmentPayment(installmentPaymentId, {
      remaining_amount: newRemainingAmount,
      next_payment_date: nextPaymentDate,
      is_active: !isComplete,
    });

    // If installment is complete, also disable the linked recurring transaction
    if (isComplete) {
      await supabase
        .from('recurring_transactions')
        .update({ is_active: false })
        .eq('installment_payment_id', installmentPaymentId)
        .eq('user_id', user.id);
    }

    await fetchPaymentRecords();
    return { error: null };
  };

  const calculateNextPaymentDate = (currentDate: string, frequency: 'weekly' | 'monthly' | 'quarterly'): string => {
    const date = new Date(currentDate);
    
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
    }
    
    return date.toISOString().split('T')[0];
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchInstallmentPayments(), fetchPaymentRecords()]);
      setLoading(false);
    };

    if (user) {
      loadData();

      const installmentPaymentsSubscription = supabase
        .channel('installment_payments_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'installment_payments',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchInstallmentPayments();
          }
        )
        .subscribe();

      const recordsSubscription = supabase
        .channel('installment_payment_records_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'installment_payment_records',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchPaymentRecords();
          }
        )
        .subscribe();

      return () => {
        installmentPaymentsSubscription.unsubscribe();
        recordsSubscription.unsubscribe();
      };
    }
  }, [user]);

  const completeInstallmentPayment = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    // Mark installment as complete
    await updateInstallmentPayment(id, {
      is_active: false,
      remaining_amount: 0,
    });

    // Also disable the linked recurring transaction
    await supabase
      .from('recurring_transactions')
      .update({ is_active: false })
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

    return { error: null };
  };

  const adjustInstallmentPlan = async (
    id: string,
    adjustmentType: 'keep_current' | 'reduce_amount' | 'reduce_count' | 'custom',
    newInstallmentAmount: number
  ) => {
    if (!user) return { error: new Error('User not authenticated') };

    const installmentPayment = installmentPayments.find(ip => ip.id === id);
    if (!installmentPayment) return { error: new Error('Installment payment not found') };

    // Update installment amount based on adjustment type
    let updatedAmount = installmentPayment.installment_amount;

    switch (adjustmentType) {
      case 'keep_current':
      case 'reduce_count':
        // Keep the current installment amount
        updatedAmount = installmentPayment.installment_amount;
        break;
      case 'reduce_amount':
      case 'custom':
        // Use the new amount provided
        updatedAmount = newInstallmentAmount;
        break;
    }

    // Update the installment payment
    const { error: updateError } = await updateInstallmentPayment(id, {
      installment_amount: updatedAmount,
    });

    if (updateError) {
      return { error: updateError };
    }

    // Also update the linked recurring transaction amount
    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .update({ amount: updatedAmount })
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

    if (recurringError) {
      console.error('Error updating recurring transaction amount:', recurringError);
      return { error: recurringError };
    }

    await fetchInstallmentPayments();
    return { error: null };
  };

  return {
    installmentPayments,
    paymentRecords,
    loading,
    createInstallmentPayment,
    updateInstallmentPayment,
    deleteInstallmentPayment,
    completeInstallmentPayment,
    recordPayment,
    adjustInstallmentPlan,
  };
};