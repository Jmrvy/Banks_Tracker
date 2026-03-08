import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Account {
  id: string;
  name: string;
  bank: 'chase' | 'bofa' | 'wells_fargo' | 'citi' | 'capital_one' | 'other' | 'societe_generale' | 'revolut' | 'boursorama' | 'bnp_paribas' | 'credit_agricole' | 'lcl' | 'caisse_epargne' | 'credit_mutuel';
  account_type: 'checking' | 'savings' | 'credit' | 'investment';
  balance: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  transaction_date: string; // Date comptable
  value_date: string; // Date de valeur
  include_in_stats: boolean; // Si la transaction doit être incluse dans les stats
  account: { name: string; bank: string };
  category: { id: string; name: string; color: string } | null;
  transfer_to_account_id?: string;
  transfer_to_account?: { name: string; bank: string };
  transfer_fee?: number;
  refund_of_transaction_id?: string | null; // Lien vers la transaction remboursée
  refunded_amount?: number; // Montant déjà remboursé
  refund_of_transaction?: Transaction | null; // Transaction originale remboursée
  installment_payment_id?: string | null; // Lien vers le paiement échelonné source
}

export interface Category {
  id: string;
  name: string;
  color: string;
  budget: number | null;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  recurrence_type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  is_active: boolean;
  account: { name: string; bank: string } | null;
  category: { id: string; name: string; color: string } | null;
  installment_payment_id: string | null; // Lien vers le paiement échelonné source
  created_at: string;
  updated_at: string;
}

export function useFinancialDataInternal() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setAccounts(data);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        account:accounts!transactions_account_id_fkey(name, bank),
        category:categories(id, name, color),
        transfer_to_account:accounts!transactions_transfer_to_account_id_fkey(name, bank)
      `)
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      return;
    }

    if (data) {
      const processedTransactions = data.map(t => ({
        ...t,
        transfer_to_account: t.transfer_to_account || undefined
      })) as Transaction[];
      setTransactions(processedTransactions);
    }
  };

  const fetchCategories = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (!error && data) {
      setCategories(data);
    }
  };

  // FIXED: Added 'id' to category select
  const fetchRecurringTransactions = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select(`
        *,
        account:accounts(name, bank),
        category:categories(id, name, color)
      `)
      .eq('user_id', user.id)
      .order('next_due_date', { ascending: true });

    if (error) {
      console.error('Error fetching recurring transactions:', error);
      return;
    }

    if (data) {
      const processedRecurring = data.map(rt => ({
        ...rt,
        account: rt.account || null,
        category: rt.category || null
      })) as RecurringTransaction[];
      setRecurringTransactions(processedRecurring);
      
      // Auto-deactivate expired recurring transactions
      await deactivateExpiredRecurringTransactions(processedRecurring);
    }
  };

  // Deactivate recurring transactions that have passed their end date
  const deactivateExpiredRecurringTransactions = async (transactions: RecurringTransaction[]) => {
    if (!user) return;
    
    const todayString = new Date().toISOString().split('T')[0];
    
    const expiredTransactions = transactions.filter(rt => 
      rt.is_active && rt.end_date && rt.end_date < todayString
    );

    if (expiredTransactions.length === 0) return;

    for (const rt of expiredTransactions) {
      
      const { error } = await supabase
        .from('recurring_transactions')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', rt.id)
        .eq('user_id', user.id);

      if (error) {
        console.error(`Error deactivating recurring transaction ${rt.id}:`, error);
      }
    }

    // Refetch to update UI with deactivated transactions
    if (expiredTransactions.length > 0) {
      const { data: updatedData } = await supabase
        .from('recurring_transactions')
        .select(`
          *,
          account:accounts(name, bank),
          category:categories(id, name, color)
        `)
        .eq('user_id', user.id)
        .order('next_due_date', { ascending: true });

      if (updatedData) {
        const processedRecurring = updatedData.map(rt => ({
          ...rt,
          account: rt.account || null,
          category: rt.category || null
        })) as RecurringTransaction[];
        setRecurringTransactions(processedRecurring);
      }
    }
  };

  const createAccount = async (account: Omit<Account, 'id' | 'created_at'>) => {
    if (!user) return;
    const { error } = await supabase
      .from('accounts')
      .insert([{ ...account, user_id: user.id }]);

    if (!error) {
      fetchAccounts();
    }
    return { error };
  };

  const createTransaction = async (transaction: Omit<Transaction, 'id' | 'account' | 'category'> & { account_id: string; category_id?: string; value_date?: string; include_in_stats?: boolean; installment_payment_id?: string | null }) => {
    if (!user) return;

    // Si value_date n'est pas fournie, utiliser transaction_date
    // Si include_in_stats n'est pas fourni, utiliser true par défaut
    const transactionData = {
      ...transaction,
      value_date: transaction.value_date || transaction.transaction_date,
      include_in_stats: transaction.include_in_stats ?? true,
      user_id: user.id
    };

    const { error } = await supabase
      .from('transactions')
      .insert([transactionData]);

    if (error) {
      console.error('Error creating transaction:', error);
    } else {
      await Promise.all([fetchTransactions(), fetchAccounts()]);
    }
    return { error };
  };

  const createTransfer = async (transfer: {
    description: string;
    amount: number;
    from_account_id: string;
    to_account_id: string;
    transfer_fee?: number;
    transaction_date: string;
    value_date?: string;
  }) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('transactions')
      .insert([{
        description: transfer.description,
        amount: transfer.amount,
        type: 'transfer',
        account_id: transfer.from_account_id,
        transfer_to_account_id: transfer.to_account_id,
        transfer_fee: transfer.transfer_fee || 0,
        transaction_date: transfer.transaction_date,
        value_date: transfer.value_date || transfer.transaction_date,
        user_id: user.id
      }]);

    if (error) {
      console.error('Error creating transfer:', error);
    } else {
      await Promise.all([fetchTransactions(), fetchAccounts()]);
    }
    return { error };
  };

  const createCategory = async (category: Omit<Category, 'id'>) => {
    if (!user) return;
    const { error } = await supabase
      .from('categories')
      .insert([{ ...category, user_id: user.id }]);

    if (!error) {
      fetchCategories();
    }
    return { error };
  };

  const createRecurringTransaction = async (recurring: {
    description: string;
    amount: number;
    type: 'income' | 'expense';
    account_id: string;
    category_id?: string;
    recurrence_type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    start_date: string;
    end_date?: string;
  }) => {
    if (!user) return { error: { message: 'User not authenticated' } };
    
    // Calculate next due date using safe date advancement
    const nextDueDateStr = safeAdvanceDate(recurring.start_date, recurring.recurrence_type);

    const { error } = await supabase
      .from('recurring_transactions')
      .insert({
        description: recurring.description,
        amount: recurring.amount,
        type: recurring.type,
        recurrence_type: recurring.recurrence_type,
        start_date: recurring.start_date,
        end_date: recurring.end_date,
        next_due_date: nextDueDateStr,
        is_active: true,
        account_id: recurring.account_id,
        category_id: recurring.category_id,
        user_id: user.id
      });

    if (!error) {
      fetchRecurringTransactions();
    }
    return { error };
  };

  const updateRecurringTransaction = async (id: string, updates: Partial<Pick<RecurringTransaction, 'is_active' | 'description' | 'amount' | 'end_date' | 'type' | 'account_id' | 'category_id' | 'recurrence_type' | 'start_date'>>) => {
    if (!user) return;
    
    // Recalculate next_due_date if start_date or recurrence_type is being updated
    let updatedData: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    if (updates.start_date || updates.recurrence_type) {
      // Get current transaction to have all needed data
      const { data: currentTransaction } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (currentTransaction) {
        const baseStart = updates.start_date || currentTransaction.start_date;
        const recurrenceType = updates.recurrence_type || currentTransaction.recurrence_type;

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Roll forward from start_date using safe advancement until we find a future date
        let nextDueStr = safeAdvanceDate(baseStart, recurrenceType);
        let iterations = 0;
        while (nextDueStr <= todayStr && iterations < 500) {
          nextDueStr = safeAdvanceDate(nextDueStr, recurrenceType);
          iterations++;
        }

        updatedData.next_due_date = nextDueStr;
      }
    }
    
    const { error } = await supabase
      .from('recurring_transactions')
      .update(updatedData)
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      fetchRecurringTransactions();
    }
    return { error };
  };

  const deleteRecurringTransaction = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      fetchRecurringTransactions();
    }
    return { error };
  };

  const updateTransaction = async (id: string, updates: {
    description?: string;
    amount?: number;
    type?: 'income' | 'expense' | 'transfer';
    account_id?: string;
    category_id?: string;
    transaction_date?: string;
    value_date?: string;
    transfer_to_account_id?: string;
    transfer_fee?: number;
    include_in_stats?: boolean;
  }) => {
    if (!user) return { error: { message: 'User not authenticated' } };

    // Get the original transaction to check if it's linked to an installment payment
    const originalTransaction = transactions.find(t => t.id === id);
    const originalAmount = originalTransaction?.amount || 0;

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      // If this transaction is linked to an installment payment and amount changed, update remaining_amount
      if (originalTransaction?.installment_payment_id && updates.amount !== undefined && updates.amount !== originalAmount) {
        const amountDifference = updates.amount - originalAmount;
        
        // Get current installment payment
        const { data: installmentPayment } = await supabase
          .from('installment_payments')
          .select('remaining_amount')
          .eq('id', originalTransaction.installment_payment_id)
          .single();
        
        if (installmentPayment) {
          // Adjust remaining amount: if transaction amount increased, decrease remaining (and vice versa)
          const newRemainingAmount = installmentPayment.remaining_amount - amountDifference;
          
          await supabase
            .from('installment_payments')
            .update({ remaining_amount: Math.max(0, newRemainingAmount) })
            .eq('id', originalTransaction.installment_payment_id);
        }
      }

      await Promise.all([fetchTransactions(), fetchAccounts()]);
    }
    return { error };
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return { error: { message: 'User not authenticated' } };
    
    // Get the transaction before deleting to check if it's linked to an installment payment
    const transactionToDelete = transactions.find(t => t.id === id);

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      // If this transaction was linked to an installment payment, add the amount back to remaining_amount
      if (transactionToDelete?.installment_payment_id) {
        const { data: installmentPayment } = await supabase
          .from('installment_payments')
          .select('remaining_amount, is_active')
          .eq('id', transactionToDelete.installment_payment_id)
          .single();
        
        if (installmentPayment) {
          const newRemainingAmount = installmentPayment.remaining_amount + transactionToDelete.amount;
          
          await supabase
            .from('installment_payments')
            .update({ 
              remaining_amount: newRemainingAmount,
              // Re-activate the installment if it was completed
              is_active: true
            })
            .eq('id', transactionToDelete.installment_payment_id);

          // Also re-activate the linked recurring transaction
          await supabase
            .from('recurring_transactions')
            .update({ is_active: true })
            .eq('installment_payment_id', transactionToDelete.installment_payment_id);
        }
      }

      await Promise.all([fetchTransactions(), fetchAccounts()]);
    }
    return { error };
  };

  // Execute a recurring transaction early (from the calendar)
  // Creates the actual transaction and advances next_due_date to the next occurrence
  const executeRecurringTransactionEarly = async (recurringId: string, executionDate: string) => {
    if (!user) return { error: { message: 'User not authenticated' } };

    const rt = recurringTransactions.find(r => r.id === recurringId);
    if (!rt) return { error: { message: 'Transaction récurrente introuvable' } };

    // For installment-linked recurring transactions, fetch the latest data
    // from the DB to avoid using stale React state values
    let transactionAmount = rt.amount;
    let transactionType = rt.type;
    if (rt.installment_payment_id) {
      const { data: ipData } = await supabase
        .from('installment_payments')
        .select('installment_amount, payment_type')
        .eq('id', rt.installment_payment_id)
        .single();
      if (ipData) {
        transactionAmount = ipData.installment_amount;
        transactionType = ipData.payment_type === 'reimbursement' ? 'income' : 'expense';
      }
    }

    // 1. Create the actual transaction
    const { error: txError } = await supabase
      .from('transactions')
      .insert([{
        account_id: rt.account_id,
        category_id: rt.category_id,
        description: rt.description,
        amount: transactionAmount,
        type: transactionType,
        transaction_date: executionDate,
        value_date: executionDate,
        include_in_stats: true,
        installment_payment_id: rt.installment_payment_id,
        user_id: user.id
      }]);

    if (txError) {
      console.error('Error creating early transaction:', txError);
      return { error: txError };
    }

    // 2. Calculate next occurrence date using safe date math
    const [y, m, d] = rt.next_due_date.split('-').map(Number);
    const currentDue = new Date(y, m - 1, d);
    let nextDue: Date;

    const cy = currentDue.getFullYear(), cm = currentDue.getMonth(), cd = currentDue.getDate();
    switch (rt.recurrence_type) {
      case 'weekly':
        nextDue = new Date(cy, cm, cd + 7);
        break;
      case 'monthly': {
        const next = new Date(cy, cm + 1, cd);
        nextDue = next.getMonth() !== (cm + 1) % 12 ? new Date(cy, cm + 2, 0) : next;
        break;
      }
      case 'quarterly': {
        const next = new Date(cy, cm + 3, cd);
        nextDue = next.getMonth() !== (cm + 3) % 12 ? new Date(cy, cm + 4, 0) : next;
        break;
      }
      case 'yearly':
        nextDue = new Date(cy + 1, cm, cd);
        break;
      default:
        nextDue = new Date(cy, cm + 1, cd);
    }

    const nextDueStr = `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`;

    // 3. Check if end_date is passed — deactivate if so
    const shouldDeactivate = rt.end_date && nextDueStr > rt.end_date;

    const updatePayload: Record<string, unknown> = {
      next_due_date: nextDueStr,
      updated_at: new Date().toISOString(),
    };
    if (shouldDeactivate) {
      updatePayload.is_active = false;
    }

    const { error: updateError } = await supabase
      .from('recurring_transactions')
      .update(updatePayload)
      .eq('id', recurringId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error advancing next_due_date:', updateError);
      return { error: updateError };
    }

    // 4. Handle installment payment if linked
    if (rt.installment_payment_id) {
      const { data: installment } = await supabase
        .from('installment_payments')
        .select('*')
        .eq('id', rt.installment_payment_id)
        .single();

      if (installment) {
        // Recalculate remaining_amount from actual linked transactions
        const { data: linkedTxs } = await supabase
          .from('transactions')
          .select('amount')
          .eq('installment_payment_id', rt.installment_payment_id)
          .eq('user_id', user.id);

        const totalPaid = (linkedTxs || []).reduce((sum: number, tx: { amount: number }) => sum + Number(tx.amount), 0);
        const newRemaining = Math.max(0, installment.total_amount - totalPaid);

        const installmentUpdate: Record<string, unknown> = {
          remaining_amount: newRemaining,
          next_payment_date: nextDueStr,
        };

        if (newRemaining <= 0) {
          installmentUpdate.is_active = false;
        }

        await supabase
          .from('installment_payments')
          .update(installmentUpdate)
          .eq('id', rt.installment_payment_id);

        // Deactivate recurring if installment is fully paid
        if (newRemaining <= 0) {
          await supabase
            .from('recurring_transactions')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', recurringId)
            .eq('user_id', user.id);
        }
      }
    }

    // 5. Refresh all data
    await Promise.all([fetchTransactions(), fetchAccounts(), fetchRecurringTransactions()]);

    return { error: null, nextDueDate: nextDueStr };
  };

  // Safe date advancement helper (avoids setMonth rollover bugs like Jan 31 → Mar 3)
  const safeAdvanceDate = (dateStr: string, recurrenceType: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const cy = date.getFullYear(), cm = date.getMonth(), cd = date.getDate();
    let next: Date;
    switch (recurrenceType) {
      case 'weekly':
        next = new Date(cy, cm, cd + 7); break;
      case 'monthly': {
        const n = new Date(cy, cm + 1, cd);
        next = n.getMonth() !== (cm + 1) % 12 ? new Date(cy, cm + 2, 0) : n; break;
      }
      case 'quarterly': {
        const n = new Date(cy, cm + 3, cd);
        next = n.getMonth() !== (cm + 3) % 12 ? new Date(cy, cm + 4, 0) : n; break;
      }
      case 'yearly':
        next = new Date(cy + 1, cm, cd); break;
      default:
        next = new Date(cy, cm + 1, cd);
    }
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  };

  // Repair corrupted next_due_date values caused by the old setMonth() bug.
  // Fetches data directly from DB to avoid stale React state.
  // Also recalculates installment payment remaining_amount and installment_amount.
  const repairCorruptedNextDueDates = async () => {
    if (!user) return;

    // Fetch directly from DB to avoid stale React state
    const { data: activeRecurring, error: fetchErr } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (fetchErr || !activeRecurring || activeRecurring.length === 0) return;

    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let repaired = 0;

    for (const rt of activeRecurring) {
      const [sy, sm, sd] = rt.start_date.split('-').map(Number);
      const startDate = new Date(sy, sm - 1, sd);

      const addInterval = (d: Date): Date => {
        const cy = d.getFullYear(), cm = d.getMonth(), cd = d.getDate();
        switch (rt.recurrence_type) {
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

      // Walk from start_date through the series until we pass the stored next_due_date
      const [ny, nm, nd] = rt.next_due_date.split('-').map(Number);
      const storedNextDue = new Date(ny, nm - 1, nd);

      let occurrence = new Date(startDate);
      let prevOccurrence = occurrence;
      let iterations = 0;
      while (occurrence < storedNextDue && iterations < 500) {
        prevOccurrence = occurrence;
        occurrence = addInterval(occurrence);
        iterations++;
      }

      // If exact match → already correct; otherwise use the previous valid occurrence
      const correctDate = occurrence.getTime() === storedNextDue.getTime()
        ? occurrence
        : prevOccurrence;
      const correctDateStr = fmtDate(correctDate);

      // Fix next_due_date if corrupted
      if (correctDateStr !== rt.next_due_date) {
        await supabase
          .from('recurring_transactions')
          .update({ next_due_date: correctDateStr, updated_at: new Date().toISOString() })
          .eq('id', rt.id)
          .eq('user_id', user.id);
        repaired++;
      }

      // Sync installment payment: next_payment_date + remaining_amount + installment_amount
      if (rt.installment_payment_id) {
        const { data: installment } = await supabase
          .from('installment_payments')
          .select('*')
          .eq('id', rt.installment_payment_id)
          .single();

        if (installment) {
          // Recalculate remaining_amount from actual linked transactions
          const { data: linkedTxs } = await supabase
            .from('transactions')
            .select('amount')
            .eq('installment_payment_id', rt.installment_payment_id)
            .eq('user_id', user.id);

          const totalPaid = (linkedTxs || []).reduce((sum: number, tx: { amount: number }) => sum + Number(tx.amount), 0);
          const correctRemaining = Math.max(0, installment.total_amount - totalPaid);

          const installmentUpdate: Record<string, unknown> = {
            next_payment_date: correctDateStr,
            remaining_amount: correctRemaining,
          };

          if (correctRemaining <= 0) {
            installmentUpdate.is_active = false;
            await supabase
              .from('recurring_transactions')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', rt.id)
              .eq('user_id', user.id);
          }

          await supabase
            .from('installment_payments')
            .update(installmentUpdate)
            .eq('id', rt.installment_payment_id);

          repaired++;
        }
      }
    }

    if (repaired > 0) {
      await fetchRecurringTransactions();
    }
  };

  const processDueRecurringTransactions = async () => {
    if (!user) return;

    // Fetch directly from DB to avoid stale React state
    const { data: freshRecurring, error: fetchErr } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (fetchErr || !freshRecurring) return;

    // Use local date to avoid UTC timezone issues
    const now = new Date();
    const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const dueTransactions = freshRecurring.filter(rt => {
      const isDue = rt.next_due_date <= todayString;
      const isNotExpired = !rt.end_date || rt.end_date >= rt.next_due_date;
      return isDue && isNotExpired;
    });

    let processedCount = 0;

    for (const rt of dueTransactions) {
      try {
        // Check if end_date has passed
        if (rt.end_date && rt.end_date < todayString) {
          await supabase
            .from('recurring_transactions')
            .update({ is_active: false })
            .eq('id', rt.id);
          continue;
        }

        // For installment-linked recurring, fetch correct type from installment
        let txType = rt.type;
        let txAmount = rt.amount;
        if (rt.installment_payment_id) {
          const { data: ipData } = await supabase
            .from('installment_payments')
            .select('installment_amount, payment_type')
            .eq('id', rt.installment_payment_id)
            .single();
          if (ipData) {
            txType = ipData.payment_type === 'reimbursement' ? 'income' : 'expense';
            txAmount = ipData.installment_amount;
          }
        }

        let currentDueDateString = rt.next_due_date;
        let occurrencesProcessed = 0;
        const maxOccurrences = 12;

        while (currentDueDateString <= todayString && occurrencesProcessed < maxOccurrences) {
          if (rt.end_date && currentDueDateString > rt.end_date) break;

          // Insert transaction directly to avoid per-insert refetches
          const { error: txError } = await supabase
            .from('transactions')
            .insert([{
              account_id: rt.account_id,
              category_id: rt.category_id,
              description: `${rt.description} (Récurrence automatique)`,
              amount: txAmount,
              type: txType,
              transaction_date: currentDueDateString,
              value_date: currentDueDateString,
              include_in_stats: true,
              installment_payment_id: rt.installment_payment_id,
              user_id: user.id
            }]);

          if (txError) {
            console.error(`Error creating transaction for ${rt.id}:`, txError);
            break;
          }

          occurrencesProcessed++;
          currentDueDateString = safeAdvanceDate(currentDueDateString, rt.recurrence_type);
        }

        // Update the recurring transaction with the new next_due_date
        await supabase
          .from('recurring_transactions')
          .update({
            next_due_date: currentDueDateString,
            updated_at: new Date().toISOString()
          })
          .eq('id', rt.id);

        // Update installment payment if linked
        if (rt.installment_payment_id && occurrencesProcessed > 0) {
          const { data: installment } = await supabase
            .from('installment_payments')
            .select('*')
            .eq('id', rt.installment_payment_id)
            .single();

          if (installment) {
            // Recalculate remaining_amount from actual linked transactions
            const { data: linkedTxs } = await supabase
              .from('transactions')
              .select('amount')
              .eq('installment_payment_id', rt.installment_payment_id)
              .eq('user_id', user.id);

            const totalPaid = (linkedTxs || []).reduce((sum: number, tx: { amount: number }) => sum + Number(tx.amount), 0);
            const newRemaining = Math.max(0, installment.total_amount - totalPaid);

            const installmentUpdate: Record<string, unknown> = {
              remaining_amount: newRemaining,
              next_payment_date: currentDueDateString,
            };

            if (newRemaining <= 0) {
              installmentUpdate.is_active = false;
              await supabase
                .from('recurring_transactions')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', rt.id)
                .eq('user_id', user.id);
            }

            await supabase
              .from('installment_payments')
              .update(installmentUpdate)
              .eq('id', rt.installment_payment_id);
          }
        }

        processedCount += occurrencesProcessed;

      } catch (error) {
        console.error(`Error processing recurring transaction ${rt.id}:`, error);
      }
    }

    if (processedCount > 0) {
      // Refresh all data after processing
      await Promise.all([
        fetchRecurringTransactions(),
        fetchTransactions(),
        fetchAccounts()
      ]);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        await Promise.all([
          fetchAccounts(),
          fetchTransactions(),
          fetchCategories(),
          fetchRecurringTransactions()
        ]);
        
        // Repair corrupted next_due_date values (from old setMonth bug), then process due ones
        await repairCorruptedNextDueDates();
        await processDueRecurringTransactions();
      } catch (error) {
        console.error('Error loading financial data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Set up periodic check for due recurring transactions (every 6 hours)
    const recurringCheckInterval = setInterval(async () => {
      if (user) {
        await processDueRecurringTransactions();
      }
    }, 6 * 60 * 60 * 1000); // Check every 6 hours

    // Set up real-time subscriptions
    const channel = supabase
      .channel('financial-data-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          
          fetchAccounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions', 
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          
          setTimeout(() => {
            fetchTransactions();
            fetchAccounts();
          }, 200);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          
          fetchCategories();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recurring_transactions',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          
          fetchRecurringTransactions();
        }
      )
      .subscribe();

    // Listen for cross-hook installment→recurring sync events
    const handleInstallmentSync = () => {
      fetchRecurringTransactions();
    };
    window.addEventListener('installment-recurring-updated', handleInstallmentSync);

    return () => {

      clearInterval(recurringCheckInterval);
      supabase.removeChannel(channel);
      window.removeEventListener('installment-recurring-updated', handleInstallmentSync);
    };
  }, [user?.id]);

  // Create a refund for an existing transaction
  // Supports refund amounts > remaining to refund - excess is created as standalone income
  const createRefund = async (refund: {
    original_transaction_id: string;
    amount: number;
    description: string;
    account_id: string;
    transaction_date: string;
    value_date?: string;
    category_id?: string;
  }) => {
    if (!user) return { error: { message: 'User not authenticated' } };
    
    // Get the original transaction to validate
    const { data: originalTransaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', refund.original_transaction_id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (fetchError || !originalTransaction) {
      return { error: { message: 'Transaction originale non trouvée' } };
    }
    
    const currentRefunded = originalTransaction.refunded_amount || 0;
    const remainingToRefund = originalTransaction.amount - currentRefunded;
    
    // Calculate how much goes to linked refund vs excess
    const linkedRefundAmount = Math.min(refund.amount, remainingToRefund);
    const excessAmount = Math.max(0, refund.amount - remainingToRefund);
    
    // Create the linked refund transaction (as income, excluded from stats)
    if (linkedRefundAmount > 0) {
      const { error: refundError } = await supabase
        .from('transactions')
        .insert([{
          description: refund.description,
          amount: linkedRefundAmount,
          type: 'income',
          account_id: refund.account_id,
          category_id: refund.category_id || originalTransaction.category_id,
          transaction_date: refund.transaction_date,
          value_date: refund.value_date || refund.transaction_date,
          refund_of_transaction_id: refund.original_transaction_id,
          include_in_stats: false, // Refunds are excluded from stats - net amount is calculated from original
          user_id: user.id
        }]);
      
      if (refundError) {
        console.error('Error creating linked refund:', refundError);
        return { error: refundError };
      }
      
      // Update the original transaction's refunded_amount
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
          refunded_amount: currentRefunded + linkedRefundAmount 
        })
        .eq('id', refund.original_transaction_id)
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('Error updating refunded amount:', updateError);
        return { error: updateError };
      }
    }
    
    // Create excess refund as standalone income (included in stats as it's a real gain)
    if (excessAmount > 0) {
      const { error: excessError } = await supabase
        .from('transactions')
        .insert([{
          description: `${refund.description} (Excédent)`,
          amount: excessAmount,
          type: 'income',
          account_id: refund.account_id,
          category_id: refund.category_id || originalTransaction.category_id,
          transaction_date: refund.transaction_date,
          value_date: refund.value_date || refund.transaction_date,
          refund_of_transaction_id: null, // Not linked - it's excess
          include_in_stats: true, // Excess is real income
          user_id: user.id
        }]);
      
      if (excessError) {
        console.error('Error creating excess refund:', excessError);
        return { error: excessError };
      }
    }
    
    await Promise.all([fetchTransactions(), fetchAccounts()]);

    return { error: null, linkedAmount: linkedRefundAmount, excessAmount };
  };

  return {
    accounts,
    transactions,
    categories,
    recurringTransactions,
    loading,
    createAccount,
    createTransaction,
    createTransfer,
    createCategory,
    createRecurringTransaction,
    updateRecurringTransaction,
    deleteRecurringTransaction,
    updateTransaction,
    deleteTransaction,
    createRefund,
    processDueRecurringTransactions,
    executeRecurringTransactionEarly,
    fetchRecurringTransactions,
    refetch: () => {
      fetchAccounts();
      fetchTransactions();
      fetchCategories();
      fetchRecurringTransactions();
    },
    manualProcessRecurring: processDueRecurringTransactions
  };
}
