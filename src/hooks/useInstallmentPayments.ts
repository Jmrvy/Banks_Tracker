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
        frequency: ip.frequency as 'weekly' | 'monthly' | 'quarterly',
        payment_type: (ip.payment_type as 'reimbursement' | 'payment') || 'payment'
      }));
      setInstallmentPayments(processedData);
    }
  };

  // Fetch history for a specific installment payment
  const fetchPaymentHistory = async (installmentPaymentId: string): Promise<InstallmentPaymentHistory[]> => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('installment_payment_history' as any)
      .select('*')
      .eq('installment_payment_id', installmentPaymentId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }

    return (data || []) as unknown as InstallmentPaymentHistory[];
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
      .from('installment_payment_history' as any)
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

    // Always fetch current state from DB to avoid stale in-memory state
    const { data: freshData, error: fetchError } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !freshData) {
      console.error('[installment-update] Error fetching current:', fetchError);
      return { error: fetchError || new Error('Installment payment not found') };
    }

    const currentInstallment: InstallmentPayment = {
      ...freshData,
      frequency: freshData.frequency as 'weekly' | 'monthly' | 'quarterly',
      payment_type: (freshData.payment_type as 'reimbursement' | 'payment') || 'payment',
    };

    // Build the update payload — send all provided fields
    const dbUpdates: Record<string, unknown> = {};
    const allowedFields: Array<keyof InstallmentPayment> = [
      'description', 'total_amount', 'installment_amount', 'frequency',
      'next_payment_date', 'account_id', 'category_id', 'payment_type',
      'is_active', 'remaining_amount', 'end_date',
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        dbUpdates[field] = updates[field];
      }
    }

    // If total_amount is being updated, recalculate remaining_amount
    if (dbUpdates.total_amount !== undefined) {
      const amountAlreadyPaid = currentInstallment.total_amount - currentInstallment.remaining_amount;
      const newRemaining = Math.max(0, (dbUpdates.total_amount as number) - amountAlreadyPaid);
      dbUpdates.remaining_amount = newRemaining;
      if (newRemaining <= 0) {
        dbUpdates.is_active = false;
      }
    }

    if (Object.keys(dbUpdates).length === 0) {
      return { error: null };
    }

    // Update and select back to confirm persistence
    console.info('[installment-update] Sending dbUpdates:', JSON.stringify(dbUpdates));
    const { data: updatedRow, error } = await supabase
      .from('installment_payments')
      .update(dbUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[installment-update] Supabase update error:', error);
      return { error };
    }

    if (!updatedRow) {
      console.error('[installment-update] Update returned no row — RLS or filter issue');
      return { error: new Error('Update did not persist — no row returned') };
    }

    console.info('[installment-update] Update returned:', JSON.stringify(updatedRow));

    // Post-update verification: re-read from DB to confirm persistence
    const { data: verifyRow } = await supabase
      .from('installment_payments')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (verifyRow) {
      const mismatches: string[] = [];
      for (const [key, val] of Object.entries(dbUpdates)) {
        const dbVal = (verifyRow as any)[key];
        if (typeof val === 'number' && typeof dbVal === 'number') {
          if (Math.abs(val - dbVal) > 0.001) mismatches.push(`${key}: sent=${val}, db=${dbVal}`);
        } else if (val !== dbVal) {
          mismatches.push(`${key}: sent=${val}, db=${dbVal}`);
        }
      }
      if (mismatches.length > 0) {
        console.error('[installment-update] VERIFICATION FAILED! Mismatches:', mismatches);
        // Retry the update once
        console.info('[installment-update] Retrying update...');
        const { error: retryError } = await supabase
          .from('installment_payments')
          .update(dbUpdates)
          .eq('id', id)
          .eq('user_id', user.id);
        if (retryError) {
          console.error('[installment-update] Retry failed:', retryError);
        } else {
          console.info('[installment-update] Retry succeeded');
        }
      } else {
        console.info('[installment-update] Verification passed ✓');
      }
    }

    // Log history change — compare DB before vs after
    if (!skipHistory) {
      const changedFields: string[] = [];
      const oldValues: Record<string, string | number | boolean | null> = {};
      const newValues: Record<string, string | number | boolean | null> = {};

      const fieldLabels: Record<string, string> = {
        total_amount: 'montant total',
        installment_amount: 'mensualité',
        remaining_amount: 'montant restant',
        frequency: 'fréquence',
        description: 'description',
        payment_type: 'type de paiement',
        next_payment_date: 'prochain paiement',
        account_id: 'compte',
        category_id: 'catégorie',
        is_active: 'statut',
      };

      for (const field of allowedFields) {
        const oldVal = currentInstallment[field];
        const newVal = updatedRow[field];
        let changed = false;
        if (typeof oldVal === 'number' && typeof newVal === 'number') {
          changed = Math.abs(oldVal - newVal) > 0.001;
        } else {
          changed = oldVal !== newVal;
        }
        if (changed) {
          oldValues[field] = oldVal as string | number | boolean | null;
          newValues[field] = newVal as string | number | boolean | null;
          if (fieldLabels[field]) {
            changedFields.push(fieldLabels[field]);
          }
        }
      }

      if (Object.keys(newValues).length > 0) {
        let changeType: InstallmentPaymentHistory['change_type'] = 'updated';
        if (newValues.total_amount !== undefined || newValues.installment_amount !== undefined) {
          changeType = 'amount_changed';
        }
        if (updatedRow.is_active === false && currentInstallment.is_active === true) {
          changeType = 'completed';
        }
        if (updatedRow.is_active === true && currentInstallment.is_active === false) {
          changeType = 'reactivated';
        }

        const description = changedFields.length > 0
          ? `Modification: ${changedFields.join(', ')}`
          : 'Mise à jour';

        await logHistoryChange(id, changeType, oldValues, newValues, description);
      }
    }

    // Synchronize with recurring transaction using the confirmed updated values
    const effectivePaymentType = (updatedRow.payment_type as string) || 'payment';
    const effectiveDescription = updatedRow.description as string;
    const descSuffix = effectivePaymentType === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';

    const recurringUpdates: Record<string, string | number | boolean | null> = {
      type: effectivePaymentType === 'reimbursement' ? 'income' : 'expense',
      description: `${effectiveDescription} (${descSuffix})`,
      amount: updatedRow.installment_amount,
      account_id: updatedRow.account_id,
      category_id: updatedRow.category_id,
      is_active: updatedRow.is_active,
    };

    if (updates.next_payment_date !== undefined) {
      recurringUpdates.next_due_date = updates.next_payment_date;
    }
    if (updates.frequency !== undefined) {
      const frequencyMap: Record<string, string> = {
        'weekly': 'weekly',
        'monthly': 'monthly',
        'quarterly': 'quarterly'
      };
      recurringUpdates.recurrence_type = frequencyMap[updates.frequency] || 'monthly';
    }

    if (Object.keys(recurringUpdates).length > 0) {
      const { error: recurringError, count } = await supabase
        .from('recurring_transactions')
        .update(recurringUpdates)
        .eq('installment_payment_id', id)
        .eq('user_id', user.id);

      if (recurringError) {
        console.error('Error syncing recurring transaction:', recurringError);
      } else {
        // Notify useFinancialData to refresh recurring transactions
        window.dispatchEvent(new CustomEvent('installment-recurring-updated'));
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

    // Sync recurring transaction: update amount, type + deactivate if complete
    const recurringUpdate: Record<string, unknown> = {
      amount: newInstallmentAmount,
      type: currentInstallment.payment_type === 'reimbursement' ? 'income' : 'expense',
      updated_at: new Date().toISOString(),
    };
    if (isComplete) {
      recurringUpdate.is_active = false;
    }

    // Also update the description suffix to match current payment_type
    const descSuffix = currentInstallment.payment_type === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';
    recurringUpdate.description = `${currentInstallment.description} (${descSuffix})`;

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

  // Repair stale links: ensure each installment's linked recurring transaction
  // has matching type, amount, and description suffix
  const repairStaleLinks = async () => {
    if (!user) return;

    const { data: installments } = await supabase
      .from('installment_payments')
      .select('id, description, installment_amount, payment_type, is_active, frequency')
      .eq('user_id', user.id);

    if (!installments || installments.length === 0) return;

    const { data: recurrings } = await supabase
      .from('recurring_transactions')
      .select('id, installment_payment_id, type, amount, description, is_active, recurrence_type')
      .eq('user_id', user.id)
      .not('installment_payment_id', 'is', null);

    if (!recurrings) return;

    const recurringByInstallmentId = new Map(
      recurrings.map(r => [r.installment_payment_id, r])
    );

    for (const ip of installments) {
      const rt = recurringByInstallmentId.get(ip.id);
      if (!rt) continue;

      const expectedType = ip.payment_type === 'reimbursement' ? 'income' : 'expense';
      const expectedSuffix = ip.payment_type === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';
      const expectedDesc = `${ip.description} (${expectedSuffix})`;

      const fixes: Record<string, unknown> = {};
      if (rt.type !== expectedType) fixes.type = expectedType;
      if (Math.abs(Number(rt.amount) - ip.installment_amount) > 0.01) fixes.amount = ip.installment_amount;
      if (rt.description !== expectedDesc) fixes.description = expectedDesc;
      if (rt.is_active !== ip.is_active) fixes.is_active = ip.is_active;

      if (Object.keys(fixes).length > 0) {
        fixes.updated_at = new Date().toISOString();
        console.info(`[installment-repair] Fixing recurring ${rt.id} for installment ${ip.id}:`, fixes);
        await supabase
          .from('recurring_transactions')
          .update(fixes)
          .eq('id', rt.id)
          .eq('user_id', user.id);
      }
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchInstallmentPayments();
      // Repair stale links after initial load
      await repairStaleLinks();
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

  const deleteHistoryEntry = async (entryId: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    const { error } = await supabase
      .from('installment_payment_history' as any)
      .delete()
      .eq('id', entryId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting history entry:', error);
      return { error };
    }
    return { error: null };
  };

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
    deleteHistoryEntry,
  };
};
