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
  payment_type: 'reimbursement' | 'payment';
  created_at: string;
  updated_at: string;
}

export interface InstallmentPaymentHistory {
  id: string;
  installment_payment_id: string;
  user_id: string;
  change_type: 'created' | 'updated' | 'amount_changed' | 'completed' | 'reactivated' | 'recalculated' | 'deleted';
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  change_description: string | null;
  created_at: string;
}

export const useInstallmentPayments = () => {
  const { user } = useAuth();
  const [installmentPayments, setInstallmentPayments] = useState<InstallmentPayment[]>([]);
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
      const processedData: InstallmentPayment[] = (data || []).map((ip) => ({
        ...ip,
        payment_type: (ip.payment_type as 'reimbursement' | 'payment') || 'payment'
      }));
      setInstallmentPayments(processedData);
    }
  };

  // Fetch history for a specific installment payment
  const fetchPaymentHistory = async (installmentPaymentId: string): Promise<InstallmentPaymentHistory[]> => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('installment_payment_history')
      .select('*')
      .eq('installment_payment_id', installmentPaymentId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }

    return (data || []) as InstallmentPaymentHistory[];
  };

  // Log a change to history
  const logHistoryChange = async (
    installmentPaymentId: string,
    changeType: InstallmentPaymentHistory['change_type'],
    oldValues: Record<string, any> | null,
    newValues: Record<string, any> | null,
    changeDescription?: string
  ) => {
    if (!user) return;

    const { error } = await supabase
      .from('installment_payment_history')
      .insert({
        installment_payment_id: installmentPaymentId,
        user_id: user.id,
        change_type: changeType,
        old_values: oldValues,
        new_values: newValues,
        change_description: changeDescription || null,
      });

    if (error) {
      console.error('Error logging history:', error);
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
    payment_type: 'reimbursement' | 'payment';
  }) => {
    if (!user) return { error: new Error('User not authenticated') };

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
        payment_type: data.payment_type,
      })
      .select()
      .single();

    if (installmentError) {
      console.error('Error creating installment payment:', installmentError);
      return { error: installmentError };
    }

    // Log creation in history
    await logHistoryChange(
      installmentData.id,
      'created',
      null,
      {
        total_amount: data.total_amount,
        installment_amount: data.installment_amount,
        frequency: data.frequency,
        payment_type: data.payment_type,
      },
      `Création du paiement échelonné: ${data.description}`
    );

    const recurringFrequency = data.frequency === 'weekly' ? 'weekly' :
                               data.frequency === 'monthly' ? 'monthly' :
                               'quarterly';

    const descriptionSuffix = data.payment_type === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';

    const recurringType = data.payment_type === 'reimbursement' ? 'income' : 'expense';

    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: user.id,
        description: `${data.description} (${descriptionSuffix})`,
        amount: data.installment_amount,
        type: recurringType,
        recurrence_type: recurringFrequency,
        start_date: data.start_date,
        next_due_date: data.start_date,
        account_id: data.account_id,
        category_id: data.category_id || null,
        is_active: true,
        installment_payment_id: installmentData.id,
      });

    if (recurringError) {
      console.error('Error creating recurring transaction:', recurringError);
      await supabase
        .from('installment_payments')
        .delete()
        .eq('id', installmentData.id);
      return { error: recurringError };
    }

    await fetchInstallmentPayments();
    return { error: null };
  };

  const updateInstallmentPayment = async (
    id: string,
    updates: Partial<InstallmentPayment>,
    skipHistory: boolean = false
  ) => {
    if (!user) return { error: new Error('User not authenticated') };

    const currentInstallment = installmentPayments.find(ip => ip.id === id);
    if (!currentInstallment && !skipHistory) {
      return { error: new Error('Installment payment not found') };
    }

    const finalUpdates = { ...updates };

    // If total_amount is being updated, recalculate remaining_amount
    if (updates.total_amount !== undefined && currentInstallment) {
      const amountAlreadyPaid = currentInstallment.total_amount - currentInstallment.remaining_amount;
      finalUpdates.remaining_amount = Math.max(0, updates.total_amount - amountAlreadyPaid);

      if (finalUpdates.remaining_amount <= 0) {
        finalUpdates.is_active = false;
      }
    }

    const { error } = await supabase
      .from('installment_payments')
      .update(finalUpdates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating installment payment:', error);
      return { error };
    }

    // Log history change
    if (!skipHistory && currentInstallment) {
      const changedFields: string[] = [];
      const oldValues: Record<string, string | number | boolean | null> = {};
      const newValues: Record<string, string | number | boolean | null> = {};

      // Track what changed
      if (updates.total_amount !== undefined && updates.total_amount !== currentInstallment.total_amount) {
        changedFields.push('montant total');
        oldValues.total_amount = currentInstallment.total_amount;
        newValues.total_amount = updates.total_amount;
      }
      if (updates.installment_amount !== undefined && updates.installment_amount !== currentInstallment.installment_amount) {
        changedFields.push('mensualité');
        oldValues.installment_amount = currentInstallment.installment_amount;
        newValues.installment_amount = updates.installment_amount;
      }
      if (updates.remaining_amount !== undefined && updates.remaining_amount !== currentInstallment.remaining_amount) {
        oldValues.remaining_amount = currentInstallment.remaining_amount;
        newValues.remaining_amount = updates.remaining_amount;
      }
      if (finalUpdates.remaining_amount !== undefined && finalUpdates.remaining_amount !== currentInstallment.remaining_amount) {
        oldValues.remaining_amount = currentInstallment.remaining_amount;
        newValues.remaining_amount = finalUpdates.remaining_amount;
      }
      if (updates.is_active !== undefined && updates.is_active !== currentInstallment.is_active) {
        changedFields.push(updates.is_active ? 'réactivé' : 'terminé');
        oldValues.is_active = currentInstallment.is_active;
        newValues.is_active = updates.is_active;
      }
      if (updates.frequency !== undefined && updates.frequency !== currentInstallment.frequency) {
        changedFields.push('fréquence');
        oldValues.frequency = currentInstallment.frequency;
        newValues.frequency = updates.frequency;
      }

      // Determine change type
      let changeType: InstallmentPaymentHistory['change_type'] = 'updated';
      if (updates.total_amount !== undefined || updates.installment_amount !== undefined) {
        changeType = 'amount_changed';
      }
      if (updates.is_active === false && currentInstallment.is_active === true) {
        changeType = 'completed';
      }
      if (updates.is_active === true && currentInstallment.is_active === false) {
        changeType = 'reactivated';
      }

      if (Object.keys(newValues).length > 0) {
        const description = changedFields.length > 0
          ? `Modification: ${changedFields.join(', ')}`
          : 'Mise à jour';

        await logHistoryChange(id, changeType, oldValues, newValues, description);
      }
    }

    // Synchronize with recurring transaction
    const recurringUpdates: Record<string, string | number | boolean | null> = {};

    if (updates.description !== undefined) {
      const paymentType = updates.payment_type || currentInstallment?.payment_type || 'payment';
      const descriptionSuffix = paymentType === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';
      recurringUpdates.description = `${updates.description} (${descriptionSuffix})`;
    }
    if (updates.installment_amount !== undefined) {
      recurringUpdates.amount = updates.installment_amount;
    }
    if (updates.account_id !== undefined) {
      recurringUpdates.account_id = updates.account_id;
    }
    if (updates.category_id !== undefined) {
      recurringUpdates.category_id = updates.category_id;
    }
    if (updates.next_payment_date !== undefined) {
      recurringUpdates.next_due_date = updates.next_payment_date;
    }
    // Always ensure recurring type matches the installment payment_type
    // This also repairs any historical type mismatch
    {
      const effectivePaymentType = updates.payment_type ?? currentInstallment?.payment_type ?? 'payment';
      recurringUpdates.type = effectivePaymentType === 'reimbursement' ? 'income' : 'expense';
      // Update description suffix if payment_type changed but description wasn't explicitly changed
      if (updates.payment_type !== undefined && updates.description === undefined && currentInstallment) {
        const descriptionSuffix = effectivePaymentType === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';
        const baseName = currentInstallment.description;
        recurringUpdates.description = `${baseName} (${descriptionSuffix})`;
      }
    }
    if (updates.frequency !== undefined) {
      const frequencyMap: Record<string, string> = {
        'weekly': 'weekly',
        'monthly': 'monthly',
        'quarterly': 'quarterly'
      };
      recurringUpdates.recurrence_type = frequencyMap[updates.frequency] || 'monthly';
    }
    if (updates.is_active !== undefined) {
      recurringUpdates.is_active = updates.is_active;
    }

    if (Object.keys(recurringUpdates).length > 0) {
      const { error: recurringError } = await supabase
        .from('recurring_transactions')
        .update(recurringUpdates)
        .eq('installment_payment_id', id)
        .eq('user_id', user.id);

      if (recurringError) {
        console.error('Error syncing recurring transaction:', recurringError);
      }
    }

    await fetchInstallmentPayments();
    return { error: null };
  };

  // Recalculate installment payment based on linked transactions
  // remaining_amount = total_amount - sum(linked transactions)
  // installment_amount is adjusted so remaining_periods × new_amount = remaining_amount
  // Also repairs corrupted next_due_date on the linked recurring transaction
  const recalculateInstallmentPayment = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    const currentInstallment = installmentPayments.find(ip => ip.id === id);
    if (!currentInstallment) {
      return { error: new Error('Installment payment not found') };
    }

    // Fetch all transactions linked to this installment payment
    const { data: linkedTransactions, error: txError } = await supabase
      .from('transactions')
      .select('id, amount, type')
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

    if (txError) {
      console.error('Error fetching linked transactions:', txError);
      return { error: txError };
    }

    // Calculate total paid from linked transactions: total_amount - sum(linked transactions)
    const totalPaid = (linkedTransactions || []).reduce((sum, tx) => sum + Number(tx.amount), 0);

    // Calculate new remaining amount
    const newRemainingAmount = Math.max(0, currentInstallment.total_amount - totalPaid);
    const isComplete = newRemainingAmount <= 0;

    // Recalculate installment_amount so remaining_periods × new_amount = remaining_amount
    let newInstallmentAmount = currentInstallment.installment_amount;
    if (newRemainingAmount > 0 && currentInstallment.installment_amount > 0) {
      const remainingPeriods = Math.max(1, Math.round(newRemainingAmount / currentInstallment.installment_amount));
      newInstallmentAmount = Math.round((newRemainingAmount / remainingPeriods) * 100) / 100;
    } else if (isComplete) {
      newInstallmentAmount = 0;
    }

    // Fetch linked recurring transaction (full data for date repair)
    const { data: linkedRecurring } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('installment_payment_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    // Repair corrupted next_due_date if needed
    let correctedNextDueDate: string | null = null;
    if (linkedRecurring) {
      const [sy, sm, sd] = linkedRecurring.start_date.split('-').map(Number);
      const startDate = new Date(sy, sm - 1, sd);

      const addInterval = (d: Date): Date => {
        const cy = d.getFullYear(), cm = d.getMonth(), cd = d.getDate();
        switch (linkedRecurring.recurrence_type) {
          case 'weekly': return new Date(cy, cm, cd + 7);
          case 'monthly': {
            const n = new Date(cy, cm + 1, cd);
            return n.getMonth() !== (cm + 1) % 12 ? new Date(cy, cm + 2, 0) : n;
          }
          case 'quarterly': {
            const n = new Date(cy, cm + 3, cd);
            return n.getMonth() !== (cm + 3) % 12 ? new Date(cy, cm + 4, 0) : n;
          }
          case 'yearly': return new Date(cy + 1, cm, cd);
          default: return new Date(cy, cm + 1, cd);
        }
      };

      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Walk from start_date to find the correct next_due_date
      const [ny, nm, nd] = linkedRecurring.next_due_date.split('-').map(Number);
      const storedNextDue = new Date(ny, nm - 1, nd);
      let occurrence = new Date(startDate);
      let prevOccurrence = occurrence;
      let iterations = 0;
      while (occurrence < storedNextDue && iterations < 500) {
        prevOccurrence = occurrence;
        occurrence = addInterval(occurrence);
        iterations++;
      }

      const correctDate = occurrence.getTime() === storedNextDue.getTime()
        ? occurrence
        : prevOccurrence;
      correctedNextDueDate = fmtDate(correctDate);

      // Fix corrupted next_due_date on the recurring transaction
      if (correctedNextDueDate !== linkedRecurring.next_due_date) {
        await supabase
          .from('recurring_transactions')
          .update({ next_due_date: correctedNextDueDate, updated_at: new Date().toISOString() })
          .eq('id', linkedRecurring.id)
          .eq('user_id', user.id);
      }
    }

    // Log the recalculation
    await logHistoryChange(
      id,
      'recalculated',
      {
        remaining_amount: currentInstallment.remaining_amount,
        installment_amount: currentInstallment.installment_amount,
        calculated_from: {
          total_amount: currentInstallment.total_amount,
          linked_transactions_count: (linkedTransactions || []).length,
        }
      },
      {
        remaining_amount: newRemainingAmount,
        installment_amount: newInstallmentAmount,
        total_paid: totalPaid,
      },
      `Recalcul: ${totalPaid.toFixed(2)}€ payé sur ${currentInstallment.total_amount.toFixed(2)}€, mensualité ajustée à ${newInstallmentAmount.toFixed(2)}€`
    );

    // Update the installment payment
    const updateData: Record<string, unknown> = {
      remaining_amount: newRemainingAmount,
      installment_amount: newInstallmentAmount,
      is_active: !isComplete,
    };

    // Sync next_payment_date from corrected recurring transaction date
    if (correctedNextDueDate) {
      updateData.next_payment_date = correctedNextDueDate;
    }

    const { error: updateError } = await supabase
      .from('installment_payments')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating installment payment:', updateError);
      return { error: updateError };
    }

    // Sync recurring transaction: update amount + deactivate if complete
    const recurringUpdate: Record<string, unknown> = {
      amount: newInstallmentAmount,
      updated_at: new Date().toISOString(),
    };
    if (isComplete) {
      recurringUpdate.is_active = false;
    }
    await supabase
      .from('recurring_transactions')
      .update(recurringUpdate)
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

    await fetchInstallmentPayments();

    return {
      error: null,
      result: {
        totalPaid,
        newRemainingAmount,
        newInstallmentAmount,
        linkedTransactionsCount: (linkedTransactions || []).length,
        isComplete,
      }
    };
  };

  const deleteInstallmentPayment = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    const currentInstallment = installmentPayments.find(ip => ip.id === id);

    // Log deletion before deleting
    if (currentInstallment) {
      await logHistoryChange(
        id,
        'deleted',
        {
          total_amount: currentInstallment.total_amount,
          remaining_amount: currentInstallment.remaining_amount,
          installment_amount: currentInstallment.installment_amount,
        },
        null,
        `Suppression du paiement échelonné: ${currentInstallment.description}`
      );
    }

    await supabase
      .from('recurring_transactions')
      .delete()
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchInstallmentPayments();
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

      return () => {
        installmentPaymentsSubscription.unsubscribe();
      };
    }
  }, [user]);

  const completeInstallmentPayment = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    await updateInstallmentPayment(id, {
      is_active: false,
      remaining_amount: 0,
    });

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

    let updatedAmount = installmentPayment.installment_amount;

    switch (adjustmentType) {
      case 'keep_current':
      case 'reduce_count':
        updatedAmount = installmentPayment.installment_amount;
        break;
      case 'reduce_amount':
      case 'custom':
        updatedAmount = newInstallmentAmount;
        break;
    }

    const { error: updateError } = await updateInstallmentPayment(id, {
      installment_amount: updatedAmount,
    });

    if (updateError) {
      return { error: updateError };
    }

    return { error: null };
  };

  return {
    installmentPayments,
    loading,
    createInstallmentPayment,
    updateInstallmentPayment,
    deleteInstallmentPayment,
    completeInstallmentPayment,
    adjustInstallmentPlan,
    recalculateInstallmentPayment,
    fetchPaymentHistory,
  };
};
