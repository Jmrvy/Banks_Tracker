import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { roundCurrency } from '@/lib/currency';

export type PlanLockField = 'total' | 'amount' | 'count';

/** Which single field the user is modifying. The other two are derived using
 *  fixed rules (see `applyPlanAdjustment` for the rules). */
export type PlanModifyField = 'total' | 'amount' | 'count';

export interface PlanDrift {
  totalAmount: number;
  remainingAmount: number;
  paidFromState: number;       // total - remaining (what the row says)
  paidFromTxns: number;        // sum(linked transactions)
  drift: number;               // paidFromState - paidFromTxns; ~0 means consistent
  linkedTransactionsCount: number;
}

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

/** One row in a personalized installment schedule. Present only for
 *  custom plans; uniform plans use installment_amount + frequency. */
export interface InstallmentPaymentRecord {
  id: string;
  installment_payment_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  actual_amount: number | null;
  transaction_id: string | null;
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

// Supabase columns are nullable at the type level even though the DB
// defaults guarantee a value at runtime. Normalize a raw row into the
// non-null InstallmentPayment shape the app relies on.
const toInstallmentPayment = (row: any): InstallmentPayment => ({
  ...row,
  frequency: row.frequency as 'weekly' | 'monthly' | 'quarterly',
  payment_type: (row.payment_type as 'reimbursement' | 'payment') || 'payment',
  is_active: row.is_active ?? true,
  created_at: row.created_at ?? '',
  updated_at: row.updated_at ?? '',
});

export const useInstallmentPayments = () => {
  const { user } = useAuth();
  const [installmentPayments, setInstallmentPayments] = useState<InstallmentPayment[]>([]);
  // All personalized-schedule records for the current user, sorted per plan
  // by scheduled_date. Consumers that need to show variable amounts/dates
  // (calendar, projections) look up records by installment_payment_id.
  const [installmentRecords, setInstallmentRecords] = useState<InstallmentPaymentRecord[]>([]);
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
      const processedData: InstallmentPayment[] = (data || []).map(toInstallmentPayment);
      setInstallmentPayments(processedData);
    }
  };

  const fetchInstallmentRecords = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('installment_payment_records' as never)
      .select('id, installment_payment_id, scheduled_date, scheduled_amount, is_paid, paid_date, actual_amount, transaction_id')
      .eq('user_id', user.id)
      .order('scheduled_date', { ascending: true });
    if (error) {
      console.error('Error fetching installment records:', error);
      return;
    }
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      installment_payment_id: string;
      scheduled_date: string;
      scheduled_amount: number | string;
      is_paid: boolean;
      paid_date: string | null;
      actual_amount: number | string | null;
      transaction_id: string | null;
    }>;
    setInstallmentRecords(
      rows.map((r) => ({
        id: r.id,
        installment_payment_id: r.installment_payment_id,
        scheduled_date: r.scheduled_date,
        scheduled_amount: Number(r.scheduled_amount),
        is_paid: !!r.is_paid,
        paid_date: r.paid_date,
        actual_amount: r.actual_amount != null ? Number(r.actual_amount) : null,
        transaction_id: r.transaction_id,
      }))
    );
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
    /**
     * Optional explicit schedule. When supplied, each entry becomes one
     * row in installment_payment_records and the processor uses those
     * rows verbatim instead of generating occurrences from frequency.
     * Use this when the user defines a personalized schedule with
     * varying dates or amounts; omit for uniform plans (frequency-based).
     */
    schedule?: { date: string; amount: number }[];
  }) => {
    if (!user) return { error: new Error('User not authenticated') };

    const hasCustomSchedule = Array.isArray(data.schedule) && data.schedule.length > 0;
    // For custom schedules the plan-level installment_amount becomes a
    // sensible default (the first row); the recurring processor uses
    // the per-record amount when materializing each occurrence.
    const planInstallmentAmount = hasCustomSchedule
      ? Number(data.schedule![0].amount)
      : data.installment_amount;
    const planStartDate = hasCustomSchedule ? data.schedule![0].date : data.start_date;

    const { data: installmentData, error: installmentError } = await supabase
      .from('installment_payments')
      .insert({
        user_id: user.id,
        description: data.description,
        total_amount: data.total_amount,
        remaining_amount: data.total_amount,
        installment_amount: planInstallmentAmount,
        frequency: data.frequency,
        start_date: planStartDate,
        next_payment_date: planStartDate,
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

    // Persist the personalized schedule (one row per planned installment).
    // The recurring processor will read these and use their date+amount
    // instead of advancing by frequency.
    if (hasCustomSchedule) {
      const recordRows = data.schedule!.map((s) => ({
        installment_payment_id: installmentData.id,
        user_id: user.id,
        scheduled_date: s.date,
        scheduled_amount: Number(s.amount),
      }));
      const { error: recordsError } = await supabase
        // Cast to bypass the auto-generated types until the next pull.
        .from('installment_payment_records' as never)
        .insert(recordRows as never);
      if (recordsError) {
        console.error('Error creating installment records:', recordsError);
        await supabase.from('installment_payments').delete().eq('id', installmentData.id);
        return { error: recordsError };
      }
    }

    // Log creation in history
    await logHistoryChange(
      installmentData.id,
      'created',
      null,
      {
        total_amount: data.total_amount,
        installment_amount: planInstallmentAmount,
        frequency: data.frequency,
        payment_type: data.payment_type,
        custom_schedule: hasCustomSchedule,
        schedule_length: hasCustomSchedule ? data.schedule!.length : null,
      },
      `Création du paiement échelonné: ${data.description}`
    );

    const recurringFrequency = data.frequency === 'weekly' ? 'weekly' :
                               data.frequency === 'monthly' ? 'monthly' :
                               'quarterly';

    const descriptionSuffix = data.payment_type === 'reimbursement' ? 'Remboursement échelonné' : 'Paiement échelonné';

    const recurringType = 'expense';

    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: user.id,
        description: `${data.description} (${descriptionSuffix})`,
        amount: planInstallmentAmount,
        type: recurringType,
        recurrence_type: recurringFrequency,
        start_date: planStartDate,
        next_due_date: planStartDate,
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
    window.dispatchEvent(new CustomEvent('installment-updated'));
    repairStaleLinks(); // fire-and-forget after mutation
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

    const currentInstallment: InstallmentPayment = toInstallmentPayment(freshData);

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

    // If total_amount changes but the caller didn't specify a remaining_amount,
    // re-derive it from paid = oldTotal - oldRemaining. Callers that already
    // know the correct remaining (e.g. applyPlanAdjustment) pass it explicitly.
    if (dbUpdates.total_amount !== undefined && dbUpdates.remaining_amount === undefined) {
      const amountAlreadyPaid = currentInstallment.total_amount - currentInstallment.remaining_amount;
      const newRemaining = Math.max(0, (dbUpdates.total_amount as number) - amountAlreadyPaid);
      dbUpdates.remaining_amount = newRemaining;
      if (newRemaining <= 0) {
        dbUpdates.is_active = false;
      }
    } else if (
      dbUpdates.remaining_amount !== undefined &&
      (dbUpdates.remaining_amount as number) <= 0 &&
      dbUpdates.is_active === undefined
    ) {
      dbUpdates.is_active = false;
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
      type: 'expense' as const,
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
    window.dispatchEvent(new CustomEvent('installment-updated'));
    repairStaleLinks(); // fire-and-forget after mutation
    return { error: null };
  };

  // Recalculate installment payment based on linked transactions
  // remaining_amount = total_amount - sum(linked transactions)
  // installment_amount is adjusted so remaining_periods × new_amount = remaining_amount
  // Also repairs corrupted next_due_date on the linked recurring transaction
  const recalculateInstallmentPayment = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };

    // Fetch fresh data from DB to avoid stale React state.
    // - linked transactions get transaction_date so we can pair them with
    //   records in date order (custom-schedule reconciliation).
    // - records are the initial schedule (ground truth for custom plans).
    const [ipResult, txResult, recurringResult, recordsResult] = await Promise.all([
      supabase
        .from('installment_payments')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('transactions')
        .select('id, amount, type, transaction_date')
        .eq('installment_payment_id', id)
        .eq('user_id', user.id),
      supabase
        .from('recurring_transactions')
        .select('*')
        .eq('installment_payment_id', id)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('installment_payment_records' as never)
        .select('id, scheduled_date, scheduled_amount, is_paid, paid_date, actual_amount, transaction_id')
        .eq('installment_payment_id', id)
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true }),
    ]);

    if (ipResult.error || !ipResult.data) {
      return { error: ipResult.error || new Error('Installment payment not found') };
    }

    const currentInstallment: InstallmentPayment = {
      ...toInstallmentPayment(ipResult.data),
    };

    const { data: linkedTransactions, error: txError } = txResult;
    const { data: linkedRecurring } = recurringResult;

    if (txError) {
      console.error('Error fetching linked transactions:', txError);
      return { error: txError };
    }

    // Calculate total paid from linked transactions: total_amount - sum(linked transactions)
    const totalPaid = (linkedTransactions || []).reduce((sum, tx) => sum + Number(tx.amount), 0);

    // Calculate new remaining amount
    const newRemainingAmount = Math.max(0, currentInstallment.total_amount - totalPaid);
    const isComplete = newRemainingAmount <= 0;

    // Preserve the user-defined installment_amount — only set to 0 when fully paid
    let newInstallmentAmount = currentInstallment.installment_amount;
    if (isComplete) {
      newInstallmentAmount = 0;
    }

    const records = (recordsResult.data ?? []) as Array<{
      id: string;
      scheduled_date: string;
      scheduled_amount: number;
      is_paid: boolean;
      paid_date: string | null;
      actual_amount: number | null;
      transaction_id: string | null;
    }>;
    const hasCustomSchedule = records.length > 0;

    let correctedNextDueDate: string | null = null;

    // Custom-schedule plans drive their schedule from
    // installment_payment_records. Reconcile by pairing records 1:1 with
    // linked transactions in date order: the k-th paid record corresponds
    // to the k-th linked tx. This is robust to early/late payments and to
    // small amount drift, and it self-heals any orphaned "is_paid=true
    // with transaction_id=null" rows left behind by past deletes.
    if (hasCustomSchedule) {
      const sortedTxs = (linkedTransactions ?? [])
        .slice()
        .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

      const updates: Array<Promise<unknown>> = [];
      records.forEach((rec, idx) => {
        const tx = sortedTxs[idx];
        if (tx) {
          const nextActual = Number(tx.amount);
          const matches =
            rec.is_paid &&
            rec.transaction_id === tx.id &&
            Math.abs((rec.actual_amount ?? 0) - nextActual) < 0.005 &&
            rec.paid_date === tx.transaction_date;
          if (matches) return; // already consistent
          updates.push(
            supabase
              .from('installment_payment_records' as never)
              .update({
                is_paid: true,
                transaction_id: tx.id,
                actual_amount: nextActual,
                paid_date: tx.transaction_date,
              })
              .eq('id', rec.id)
              .eq('user_id', user.id)
          );
        } else {
          // No matching tx — record must be unpaid.
          if (!rec.is_paid && rec.transaction_id == null && rec.actual_amount == null && rec.paid_date == null) {
            return; // already clean
          }
          updates.push(
            supabase
              .from('installment_payment_records' as never)
              .update({
                is_paid: false,
                transaction_id: null,
                actual_amount: null,
                paid_date: null,
              })
              .eq('id', rec.id)
              .eq('user_id', user.id)
          );
        }
      });

      if (updates.length > 0) {
        const results = await Promise.all(updates);
        const failed = results.find((r) => (r as { error?: unknown })?.error);
        if (failed) {
          console.error('Error reconciling installment records:', (failed as { error: unknown }).error);
        }
      }

      // Next slot = first record without a matching tx; '9999-12-31' when
      // every slot is paid (mirrors the processor's sentinel).
      const firstUnpaidIdx = sortedTxs.length;
      correctedNextDueDate =
        firstUnpaidIdx < records.length ? records[firstUnpaidIdx].scheduled_date : '9999-12-31';

      if (linkedRecurring && correctedNextDueDate !== linkedRecurring.next_due_date) {
        await supabase
          .from('recurring_transactions')
          .update({ next_due_date: correctedNextDueDate, updated_at: new Date().toISOString() })
          .eq('id', linkedRecurring.id)
          .eq('user_id', user.id);
      }
    }

    // Repair corrupted next_due_date if needed (uniform-frequency plans).
    if (!hasCustomSchedule && linkedRecurring) {
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
      type: 'expense' as const,
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
    window.dispatchEvent(new CustomEvent('installment-updated'));
    repairStaleLinks(); // fire-and-forget after mutation

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

  const fetchLinkedTransactions = async (id: string) => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, amount, type, transaction_date, account_id')
      .eq('installment_payment_id', id)
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error fetching linked transactions:', error);
      return [];
    }

    return data || [];
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

    // Delete linked transactions first
    await supabase
      .from('transactions')
      .delete()
      .eq('installment_payment_id', id)
      .eq('user_id', user.id);

    // Delete linked recurring transaction
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
    window.dispatchEvent(new CustomEvent('installment-updated'));
    repairStaleLinks(); // fire-and-forget after mutation
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

      const expectedType = 'expense';
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

  // Detect orphaned transactions whose installment_payment_id points to
  // an installment that no longer exists (e.g. deleted before the cascade fix)
  const detectOrphanedTransactions = async () => {
    if (!user) return [];

    // Fetch all transactions that reference an installment payment
    const { data: txWithInstallment } = await supabase
      .from('transactions')
      .select('id, installment_payment_id, description, amount, type, transaction_date, account_id')
      .eq('user_id', user.id)
      .not('installment_payment_id', 'is', null);

    if (!txWithInstallment || txWithInstallment.length === 0) return [];

    // Fetch all existing installment payment IDs
    const { data: existingInstallments } = await supabase
      .from('installment_payments')
      .select('id')
      .eq('user_id', user.id);

    const existingIds = new Set((existingInstallments || []).map(ip => ip.id));

    // Find orphaned transactions
    return txWithInstallment.filter(
      tx => tx.installment_payment_id && !existingIds.has(tx.installment_payment_id)
    );
  };

  const deleteOrphanedTransactions = async (ids: string[]) => {
    if (!user || ids.length === 0) return { error: null };

    const { error } = await supabase
      .from('transactions')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) {
      console.error('[installment-cleanup] Error deleting orphaned transactions:', error);
      return { error };
    }

    return { error: null };
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchInstallmentPayments(), fetchInstallmentRecords()]);
      setLoading(false);
    };

    if (user) {
      loadData();

      let refetchTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedRefetch = () => {
        if (refetchTimer) clearTimeout(refetchTimer);
        refetchTimer = setTimeout(() => {
          refetchTimer = null;
          fetchInstallmentPayments();
          fetchInstallmentRecords();
        }, 250);
      };

      const channelId = `installment_payments_changes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const installmentPaymentsSubscription = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'installment_payments',
            filter: `user_id=eq.${user.id}`,
          },
          debouncedRefetch,
        )
        .subscribe();

      // Local synchronous notify path so every consumer instance refetches
      // immediately after a write done in this tab (realtime is the
      // cross-tab path; this is the same-tab fast path).
      const handleLocalUpdate = () => {
        fetchInstallmentPayments();
        fetchInstallmentRecords();
      };
      window.addEventListener('installment-updated', handleLocalUpdate);

      return () => {
        installmentPaymentsSubscription.unsubscribe();
        window.removeEventListener('installment-updated', handleLocalUpdate);
        if (refetchTimer) clearTimeout(refetchTimer);
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

  // Compute drift between the stored remaining_amount and the sum of linked
  // transactions. Used by the Ajuster UI to surface a banner when the plan
  // is out of sync (e.g. user paid 110€ when scheduled was 100€).
  const computePlanDrift = async (id: string): Promise<PlanDrift | null> => {
    if (!user) return null;

    const [ipResult, txResult] = await Promise.all([
      supabase
        .from('installment_payments')
        .select('total_amount, remaining_amount')
        .eq('id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('transactions')
        .select('amount')
        .eq('installment_payment_id', id)
        .eq('user_id', user.id),
    ]);

    if (ipResult.error || !ipResult.data) return null;

    const totalAmount = Number(ipResult.data.total_amount);
    const remainingAmount = Number(ipResult.data.remaining_amount);
    const paidFromState = roundCurrency(totalAmount - remainingAmount);
    const paidFromTxns = roundCurrency(
      (txResult.data || []).reduce((sum, tx) => sum + Number(tx.amount), 0)
    );

    return {
      totalAmount,
      remainingAmount,
      paidFromState,
      paidFromTxns,
      drift: roundCurrency(paidFromState - paidFromTxns),
      linkedTransactionsCount: (txResult.data || []).length,
    };
  };

  // High-level plan adjustment. The caller specifies a single field they
  // are modifying; the OTHER two are derived using these rules — the rule
  // is "keep the field the user didn't touch":
  //   - modifyField='total':  N stays at its current value, A is recomputed
  //                           so that paid + N*A lands exactly on T_new.
  //   - modifyField='amount': T stays, N = ceil((T - P) / A_new), with the
  //                           last installment absorbing any remainder.
  //   - modifyField='count':  T stays, A = (T - P) / N_new.
  //
  // In all three cases the typed value is honored exactly. Schedule math
  // handles rounding by letting the last installment differ slightly when
  // (T - P) doesn't divide cleanly.
  //
  // `reconcileFromTxns`: when true, P (paid) is recomputed from the sum of
  // linked transactions before solving — use this when the user has clicked
  // "Recalculate first" on a drift banner. When false, P is taken from the
  // stored row (total - remaining), trusting the form.
  const applyPlanAdjustment = async (
    id: string,
    args: {
      modifyField: PlanModifyField;
      total_amount?: number;
      installment_amount?: number;
      num_installments?: number;
      next_payment_date?: string;
      reconcileFromTxns?: boolean;
    }
  ) => {
    if (!user) return { error: new Error('User not authenticated') };

    const [ipResult, txResult] = await Promise.all([
      supabase
        .from('installment_payments')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('transactions')
        .select('amount')
        .eq('installment_payment_id', id)
        .eq('user_id', user.id),
    ]);

    if (ipResult.error || !ipResult.data) {
      return { error: ipResult.error || new Error('Installment payment not found') };
    }

    const row = ipResult.data;
    const paidFromState = roundCurrency(Number(row.total_amount) - Number(row.remaining_amount));
    const paidFromTxns = roundCurrency(
      (txResult.data || []).reduce((sum, tx) => sum + Number(tx.amount), 0)
    );
    const P = args.reconcileFromTxns ? paidFromTxns : paidFromState;

    let T = Number(row.total_amount);
    let A = Number(row.installment_amount);
    const currentRemaining = roundCurrency(T - P);
    const currentN = A > 0 ? Math.max(1, Math.ceil(currentRemaining / A)) : 1;

    switch (args.modifyField) {
      case 'total': {
        // User typed a new total; count stays; per-installment adjusts.
        if (args.total_amount === undefined) {
          return { error: new Error('total_amount is required when modifying total') };
        }
        T = roundCurrency(args.total_amount);
        const N = currentN;
        A = N > 0 ? roundCurrency(Math.max(0, T - P) / N) : 0;
        break;
      }
      case 'amount': {
        // User typed a new per-installment; total stays; count adjusts
        // (the last installment absorbs the rounding remainder).
        if (args.installment_amount === undefined) {
          return { error: new Error('installment_amount is required when modifying amount') };
        }
        A = roundCurrency(args.installment_amount);
        // T stays as-is.
        break;
      }
      case 'count': {
        // User typed a new count; total stays; per-installment adjusts.
        if (args.num_installments === undefined) {
          return { error: new Error('num_installments is required when modifying count') };
        }
        const N = Math.max(1, Math.floor(args.num_installments));
        A = N > 0 ? roundCurrency(Math.max(0, T - P) / N) : 0;
        break;
      }
    }

    const newRemaining = Math.max(0, roundCurrency(T - P));

    // Sanity: refuse to apply something patently broken
    if (T <= 0 || A < 0) {
      return { error: new Error('Plan values must be positive') };
    }
    if (T < P) {
      return {
        error: new Error(
          `New total (${T.toFixed(2)}) is below the amount already paid (${P.toFixed(2)})`
        ),
      };
    }

    return updateInstallmentPayment(id, {
      total_amount: T,
      installment_amount: A,
      remaining_amount: newRemaining,
      is_active: newRemaining > 0,
      ...(args.next_payment_date ? { next_payment_date: args.next_payment_date } : {}),
    });
  };

  // Linked transactions that entered the system after a given history
  // entry — used when undoing to show the user what happened "since" and
  // optionally clean up.
  const fetchTransactionsSinceEntry = async (entryId: string) => {
    if (!user) return { error: null, transactions: [] as Array<{ id: string; description: string; amount: number; type: string; transaction_date: string; created_at: string; account_id: string }> };

    const { data: entry, error: entryError } = await supabase
      .from('installment_payment_history' as any)
      .select('installment_payment_id, created_at')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single();

    if (entryError || !entry) {
      return { error: entryError || new Error('History entry not found'), transactions: [] };
    }

    const typed = entry as unknown as { installment_payment_id: string; created_at: string };

    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, amount, type, transaction_date, created_at, account_id')
      .eq('installment_payment_id', typed.installment_payment_id)
      .eq('user_id', user.id)
      .gte('created_at', typed.created_at)
      .order('created_at', { ascending: false });

    if (error) return { error, transactions: [] };
    return { error: null, transactions: data || [] };
  };

  // Revert a single history entry: applies the entry's old_values back to
  // the plan. updateInstallmentPayment logs a new history entry, so the
  // undo is itself undoable. When `deleteTransactionsAfter` is true,
  // linked transactions created after the entry are also deleted so the
  // plan's remaining/paid is consistent with the reverted state.
  // Returns an error for entries that can't be reverted (no old_values,
  // or the change_type doesn't carry one).
  const revertInstallmentHistoryEntry = async (
    entryId: string,
    options: { deleteTransactionsAfter?: boolean } = {}
  ) => {
    if (!user) return { error: new Error('User not authenticated'), deletedTransactionsCount: 0 };

    const { data: entry, error: fetchError } = await supabase
      .from('installment_payment_history' as any)
      .select('*')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !entry) {
      return { error: fetchError || new Error('History entry not found'), deletedTransactionsCount: 0 };
    }

    const typed = entry as unknown as InstallmentPaymentHistory;

    if (typed.change_type === 'created' || typed.change_type === 'deleted') {
      return { error: new Error('Cannot undo this kind of change'), deletedTransactionsCount: 0 };
    }

    const oldValues = typed.old_values;
    if (!oldValues || Object.keys(oldValues).length === 0) {
      return { error: new Error('This entry has no previous values to restore'), deletedTransactionsCount: 0 };
    }

    // Filter to fields updateInstallmentPayment knows about.
    const allowedFields: Array<keyof InstallmentPayment> = [
      'description', 'total_amount', 'installment_amount', 'frequency',
      'next_payment_date', 'account_id', 'category_id', 'payment_type',
      'is_active', 'remaining_amount', 'end_date',
    ];

    const updates: Partial<InstallmentPayment> = {};
    for (const field of allowedFields) {
      if (oldValues[field] !== undefined) {
        (updates as Record<string, unknown>)[field] = oldValues[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return { error: new Error('No revertible fields in this entry'), deletedTransactionsCount: 0 };
    }

    // Delete transactions-since first so the trigger that recalculates
    // account balance doesn't see a flipped plan state mid-flight. If
    // we asked for cleanup but the deletion fails, abort before touching
    // the plan — leaves the user in the original state, retryable.
    let deletedCount = 0;
    if (options.deleteTransactionsAfter) {
      const { transactions: toDelete, error: fetchTxError } = await fetchTransactionsSinceEntry(entryId);
      if (fetchTxError) {
        return { error: fetchTxError, deletedTransactionsCount: 0 };
      }
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('transactions')
          .delete()
          .in('id', toDelete.map((tx) => tx.id))
          .eq('user_id', user.id);
        if (deleteError) {
          return { error: deleteError, deletedTransactionsCount: 0 };
        }
        deletedCount = toDelete.length;
      }
    }

    // Apply the revert via updateInstallmentPayment with skipHistory=true so
    // it doesn't auto-log a new "revert" entry. Then drop the original
    // history row too, leaving the timeline clean — both the change AND
    // the undo disappear from the user's view.
    const { error: updateError } = await updateInstallmentPayment(
      typed.installment_payment_id,
      updates,
      /* skipHistory */ true
    );
    if (!updateError) {
      await supabase
        .from('installment_payment_history' as any)
        .delete()
        .eq('id', entryId)
        .eq('user_id', user.id);
    }
    return { error: updateError, deletedTransactionsCount: deletedCount };
  };

  return {
    installmentPayments,
    installmentRecords,
    loading,
    createInstallmentPayment,
    updateInstallmentPayment,
    deleteInstallmentPayment,
    completeInstallmentPayment,
    applyPlanAdjustment,
    computePlanDrift,
    recalculateInstallmentPayment,
    fetchPaymentHistory,
    deleteHistoryEntry,
    revertInstallmentHistoryEntry,
    fetchTransactionsSinceEntry,
    fetchLinkedTransactions,
    detectOrphanedTransactions,
    deleteOrphanedTransactions,
  };
};
