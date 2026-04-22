import React, { useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';


// Query keys for React Query cache
const QUERY_KEYS = {
  accounts: (userId: string) => ['accounts', userId] as const,
  transactions: (userId: string) => ['transactions', userId] as const,
  categories: (userId: string) => ['categories', userId] as const,
  recurringTransactions: (userId: string) => ['recurringTransactions', userId] as const,
};

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
  recurring_transaction_id?: string | null; // Lien vers la transaction récurrente source
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
  debt_id: string | null; // Lien vers la dette source
  created_at: string;
  updated_at: string;
}

function useFinancialDataInternal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // React Query: accounts
  const accountsQuery = useQuery({
    queryKey: QUERY_KEYS.accounts(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Account[];
    },
    enabled: !!user,
  });

  // React Query: transactions
  const transactionsQuery = useQuery({
    queryKey: QUERY_KEYS.transactions(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!transactions_account_id_fkey(name, bank),
          category:categories(id, name, color),
          transfer_to_account:accounts!transactions_transfer_to_account_id_fkey(name, bank)
        `)
        .eq('user_id', user!.id)
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(t => ({
        ...t,
        transfer_to_account: t.transfer_to_account || undefined,
      })) as Transaction[];
    },
    enabled: !!user,
  });

  // React Query: categories
  const categoriesQuery = useQuery({
    queryKey: QUERY_KEYS.categories(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: !!user,
  });

  const accounts = accountsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  // Convenience invalidation helpers (replace old fetch* callbacks)
  const fetchAccounts = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts(user.id) });
  }, [user, queryClient]);

  const fetchTransactions = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactions(user.id) });
  }, [user, queryClient]);

  const fetchCategories = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories(user.id) });
  }, [user, queryClient]);

  // React Query: recurring transactions
  const recurringQuery = useQuery({
    queryKey: QUERY_KEYS.recurringTransactions(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select(`
          *,
          account:accounts(name, bank),
          category:categories(id, name, color)
        `)
        .eq('user_id', user!.id)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      const processed = (data ?? []).map(rt => ({
        ...rt,
        account: rt.account || null,
        category: rt.category || null,
      })) as RecurringTransaction[];
      // Auto-deactivate expired recurring transactions in background
      deactivateExpiredRecurringTransactions(processed);
      return processed;
    },
    enabled: !!user,
  });

  const recurringTransactions = recurringQuery.data ?? [];
  const loading = !user ? false : (accountsQuery.isLoading || transactionsQuery.isLoading || categoriesQuery.isLoading || recurringQuery.isLoading);

  const fetchRecurringTransactions = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.recurringTransactions(user.id) });
  }, [user, queryClient]);

  // Deactivate recurring transactions that have passed their end date
  const deactivateExpiredRecurringTransactions = async (txns: RecurringTransaction[]) => {
    if (!user) return;

    const todayString = new Date().toISOString().split('T')[0];

    const expiredTransactions = txns.filter(rt =>
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

    // Refetch via React Query invalidation
    if (expiredTransactions.length > 0) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.recurringTransactions(user.id) });
    }
  };

  const createAccount = async (account: Omit<Account, 'id' | 'created_at'>) => {
    if (!user) return;
    const { error } = await supabase
      .from('accounts')
      .insert([{ ...account, initial_balance: account.balance, user_id: user.id }]);

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
      fetchTransactions(); fetchAccounts();
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
      fetchTransactions(); fetchAccounts();
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

      fetchTransactions(); fetchAccounts();
    }
    return { error };
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return { error: { message: 'User not authenticated' } };

    // Get the transaction before deleting to check linked refunds/installments
    const transactionToDelete = transactions.find(t => t.id === id);

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      // If this transaction is a refund, decrement refunded_amount on the original transaction
      if (transactionToDelete?.refund_of_transaction_id) {
        const { data: originalTransaction } = await supabase
          .from('transactions')
          .select('refunded_amount')
          .eq('id', transactionToDelete.refund_of_transaction_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (originalTransaction) {
          const currentRefunded = originalTransaction.refunded_amount || 0;
          const newRefunded = Math.max(0, currentRefunded - Number(transactionToDelete.amount));

          await supabase
            .from('transactions')
            .update({ refunded_amount: newRefunded })
            .eq('id', transactionToDelete.refund_of_transaction_id)
            .eq('user_id', user.id);
        }
      }

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

      // If this transaction was linked to a debt recurring transaction, reverse the debt payment
      if (transactionToDelete?.recurring_transaction_id) {
        const linkedRT = recurringTransactions.find(r => r.id === transactionToDelete.recurring_transaction_id);
        if (linkedRT?.debt_id) {
          const txDate = transactionToDelete.transaction_date;
          const txAmount = Number(transactionToDelete.amount);

          // Find and delete the matching debt_payment (DB trigger auto-adjusts remaining_amount)
          const { data: matchingDebtPayment } = await supabase
            .from('debt_payments')
            .select('id, amount')
            .eq('debt_id', linkedRT.debt_id)
            .eq('user_id', user.id)
            .eq('payment_date', txDate)
            .then(res => {
              if (!res.data) return res;
              const match = res.data.find(dp => Math.abs(Number(dp.amount) - txAmount) < 0.01);
              return { ...res, data: match || null };
            });

          if (matchingDebtPayment) {
            await supabase
              .from('debt_payments')
              .delete()
              .eq('id', matchingDebtPayment.id)
              .eq('user_id', user.id);
          }

          // Reset the matching scheduled_debt_payment back to unpaid
          const monthKey = txDate.substring(0, 7);
          const { data: scheduledForMonth } = await supabase
            .from('scheduled_debt_payments')
            .select('id')
            .eq('debt_id', linkedRT.debt_id)
            .eq('user_id', user.id)
            .eq('is_paid', true)
            .like('scheduled_date', `${monthKey}%`)
            .limit(1)
            .maybeSingle();

          if (scheduledForMonth) {
            await supabase
              .from('scheduled_debt_payments')
              .update({ is_paid: false, paid_date: null, actual_amount: null })
              .eq('id', scheduledForMonth.id)
              .eq('user_id', user.id);
          }

          // Recalculate remaining_amount from all debt_payments (DB trigger may handle this,
          // but we recalculate to be safe and consistent with executeRecurringTransactionEarly)
          const { data: allDebtPayments } = await supabase
            .from('debt_payments')
            .select('amount')
            .eq('debt_id', linkedRT.debt_id)
            .eq('user_id', user.id);

          const { data: debtData } = await supabase
            .from('debts')
            .select('total_amount, status')
            .eq('id', linkedRT.debt_id)
            .single();

          if (debtData) {
            const totalPaid = (allDebtPayments || []).reduce((sum: number, dp: { amount: number }) => sum + Number(dp.amount), 0);
            const newRemaining = Math.max(0, debtData.total_amount - totalPaid);
            const debtUpdate: Record<string, unknown> = { remaining_amount: newRemaining };
            if (debtData.status === 'completed' && newRemaining > 0) {
              debtUpdate.status = 'active';
            }
            await supabase
              .from('debts')
              .update(debtUpdate)
              .eq('id', linkedRT.debt_id)
              .eq('user_id', user.id);
          }

          // Re-activate the recurring transaction if it was completed
          await supabase
            .from('recurring_transactions')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', linkedRT.id)
            .eq('user_id', user.id);
        }
      }

      fetchTransactions(); fetchAccounts(); fetchRecurringTransactions();
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

    // For debt-linked recurring transactions, use the scheduled amount for this date
    if (rt.debt_id) {
      const { data: scheduledPayment } = await supabase
        .from('scheduled_debt_payments')
        .select('scheduled_amount')
        .eq('debt_id', rt.debt_id)
        .eq('user_id', user.id)
        .neq('is_paid', true)
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (scheduledPayment) {
        transactionAmount = scheduledPayment.scheduled_amount;
      } else {
        // Fallback to debt's payment_amount
        const { data: debtData } = await supabase
          .from('debts')
          .select('payment_amount')
          .eq('id', rt.debt_id)
          .maybeSingle();
        if (debtData?.payment_amount) {
          transactionAmount = debtData.payment_amount;
        }
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
        recurring_transaction_id: recurringId,
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

    // 4b. Handle debt payment if linked
    if (rt.debt_id) {
      // Mark the next unpaid scheduled payment as paid
      const { data: nextScheduled } = await supabase
        .from('scheduled_debt_payments')
        .select('id')
        .eq('debt_id', rt.debt_id)
        .eq('user_id', user.id)
        .neq('is_paid', true)
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextScheduled) {
        await supabase
          .from('scheduled_debt_payments')
          .update({
            is_paid: true,
            paid_date: executionDate,
            actual_amount: transactionAmount,
          })
          .eq('id', nextScheduled.id)
          .eq('user_id', user.id);
      }

      // Record debt payment
      await supabase
        .from('debt_payments')
        .insert({
          debt_id: rt.debt_id,
          user_id: user.id,
          amount: transactionAmount,
          payment_date: executionDate,
          notes: `Échéance récurrente: ${rt.description}`,
        });

      // Recalculate remaining_amount from all debt_payments (mirrors installment pattern)
      const { data: allDebtPayments } = await supabase
        .from('debt_payments')
        .select('amount')
        .eq('debt_id', rt.debt_id)
        .eq('user_id', user.id);

      const { data: debtData } = await supabase
        .from('debts')
        .select('total_amount')
        .eq('id', rt.debt_id)
        .single();

      if (debtData) {
        const totalPaid = (allDebtPayments || []).reduce((sum: number, dp: { amount: number }) => sum + Number(dp.amount), 0);
        const newRemaining = Math.max(0, debtData.total_amount - totalPaid);
        const debtUpdate: Record<string, unknown> = { remaining_amount: newRemaining };
        if (newRemaining <= 0) {
          debtUpdate.status = 'completed';
        }
        await supabase
          .from('debts')
          .update(debtUpdate)
          .eq('id', rt.debt_id)
          .eq('user_id', user.id);

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
    fetchTransactions(); fetchAccounts(); fetchRecurringTransactions();

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

  // Session guard: only run repair once per browser session
  const repairRanRef = React.useRef(false);

  // Repair corrupted data via Supabase Edge Function (server-side).
  // Falls back to no-op if the function is unavailable.
  const repairCorruptedNextDueDates = async () => {
    if (!user) return;
    if (repairRanRef.current) return;
    repairRanRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke('repair-recurring');
      if (error) {
        console.warn('[repair] Edge function error, skipping:', error.message);
        return;
      }
      if (data?.repaired > 0) {
        fetchRecurringTransactions();
      }
    } catch (err) {
      console.warn('[repair] Edge function unavailable, skipping');
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
        // Fetch full installment data once (reused later for remaining_amount update)
        let txType = rt.type;
        let txAmount = rt.amount;
        let installmentData: any = null;
        if (rt.installment_payment_id) {
          const { data: ipData } = await supabase
            .from('installment_payments')
            .select('*')
            .eq('id', rt.installment_payment_id)
            .single();
          installmentData = ipData;
          if (ipData) {
            txType = ipData.payment_type === 'reimbursement' ? 'income' : 'expense';
            txAmount = ipData.installment_amount;
          }
        }

        // For debt-linked recurring, fetch scheduled payments to check which are already paid
        let debtScheduledPayments: any[] = [];
        if (rt.debt_id) {
          const { data: spData } = await supabase
            .from('scheduled_debt_payments')
            .select('*')
            .eq('debt_id', rt.debt_id)
            .eq('user_id', user.id)
            .order('scheduled_date', { ascending: true });
          debtScheduledPayments = spData || [];

          // Use next unpaid scheduled amount if available
          const nextUnpaid = debtScheduledPayments.find(sp => !sp.is_paid);
          if (nextUnpaid) {
            txAmount = nextUnpaid.scheduled_amount;
          } else {
            // Fallback to debt payment_amount
            const { data: debtData } = await supabase
              .from('debts')
              .select('payment_amount')
              .eq('id', rt.debt_id)
              .single();
            if (debtData?.payment_amount) {
              txAmount = debtData.payment_amount;
            }
          }
        }

        let currentDueDateString = rt.next_due_date;
        let occurrencesProcessed = 0;
        const maxOccurrences = 12;

        while (currentDueDateString <= todayString && occurrencesProcessed < maxOccurrences) {
          if (rt.end_date && currentDueDateString > rt.end_date) break;

          // For debt-linked recurring, check if this occurrence was already paid
          // via the debt schedule (confirm button or link modal)
          let skipTransaction = false;
          let occurrenceAmount = txAmount;
          if (rt.debt_id && debtScheduledPayments.length > 0) {
            const monthKey = currentDueDateString.substring(0, 7);
            const matchingScheduled = debtScheduledPayments.find(sp => sp.scheduled_date.substring(0, 7) === monthKey);
            if (matchingScheduled) {
              if (matchingScheduled.is_paid) {
                // Already paid - skip creating transaction, just advance
                skipTransaction = true;
              } else {
                occurrenceAmount = matchingScheduled.scheduled_amount;
              }
            }
          }

          if (!skipTransaction) {
            // Insert transaction directly to avoid per-insert refetches
            const { error: txError } = await supabase
              .from('transactions')
              .insert([{
                account_id: rt.account_id,
                category_id: rt.category_id,
                description: `${rt.description} (Récurrence automatique)`,
                amount: occurrenceAmount,
                type: txType,
                transaction_date: currentDueDateString,
                value_date: currentDueDateString,
                include_in_stats: true,
                installment_payment_id: rt.installment_payment_id,
                recurring_transaction_id: rt.id,
                user_id: user.id
              }]);

            if (txError) {
              console.error(`Error creating transaction for ${rt.id}:`, txError);
              break;
            }

            // For debt-linked: mark scheduled payment as paid + record debt payment
            if (rt.debt_id) {
              const monthKey = currentDueDateString.substring(0, 7);
              const matchingScheduled = debtScheduledPayments.find(sp => sp.scheduled_date.substring(0, 7) === monthKey && !sp.is_paid);
              if (matchingScheduled) {
                await supabase
                  .from('scheduled_debt_payments')
                  .update({ is_paid: true, paid_date: currentDueDateString, actual_amount: occurrenceAmount })
                  .eq('id', matchingScheduled.id)
                  .eq('user_id', user.id);
                // Mark it locally so we don't match it again
                matchingScheduled.is_paid = true;
              }

              await supabase
                .from('debt_payments')
                .insert({
                  debt_id: rt.debt_id,
                  user_id: user.id,
                  amount: occurrenceAmount,
                  payment_date: currentDueDateString,
                  notes: `Récurrence automatique: ${rt.description}`,
                });
            }
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

        // Update installment payment if linked (reuse already-fetched installmentData)
        if (rt.installment_payment_id && occurrencesProcessed > 0) {
          const installment = installmentData;

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

        // Update debt remaining_amount if linked
        if (rt.debt_id && occurrencesProcessed > 0) {
          // Recalculate from all debt_payments
          const { data: allDebtPayments } = await supabase
            .from('debt_payments')
            .select('amount')
            .eq('debt_id', rt.debt_id)
            .eq('user_id', user.id);

          const { data: debtData } = await supabase
            .from('debts')
            .select('total_amount')
            .eq('id', rt.debt_id)
            .single();

          if (debtData) {
            const totalPaid = (allDebtPayments || []).reduce((sum: number, dp: { amount: number }) => sum + Number(dp.amount), 0);
            const newRemaining = Math.max(0, debtData.total_amount - totalPaid);
            const debtUpdate: Record<string, unknown> = { remaining_amount: newRemaining };

            if (newRemaining <= 0) {
              debtUpdate.status = 'completed';
              await supabase
                .from('recurring_transactions')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', rt.id)
                .eq('user_id', user.id);
            }

            await supabase
              .from('debts')
              .update(debtUpdate)
              .eq('id', rt.debt_id)
              .eq('user_id', user.id);
          }
        }

        processedCount += occurrencesProcessed;

      } catch (error) {
        console.error(`Error processing recurring transaction ${rt.id}:`, error);
      }
    }

    if (processedCount > 0) {
      // Invalidate all relevant caches
      fetchRecurringTransactions();
      fetchTransactions();
      fetchAccounts();
    }
  };

  // Kick off background repairs once queries have loaded
  const initialRepairDone = React.useRef(false);
  useEffect(() => {
    if (!user || loading || initialRepairDone.current) return;
    initialRepairDone.current = true;
    repairCorruptedNextDueDates().then(() => processDueRecurringTransactions());
  }, [user, loading]);

  // Realtime subscriptions (recurring processing only runs at launch via initialRepairDone above)
  useEffect(() => {
    if (!user) return;

    // Set up real-time subscriptions — invalidate React Query cache
    const channel = supabase
      .channel('financial-data-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${user.id}` },
        () => fetchAccounts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` },
        () => setTimeout(() => { fetchTransactions(); fetchAccounts(); }, 200)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${user.id}` },
        () => fetchCategories()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recurring_transactions', filter: `user_id=eq.${user.id}` },
        () => fetchRecurringTransactions()
      )
      .subscribe();

    // Listen for cross-hook installment→recurring sync events
    const handleInstallmentSync = () => fetchRecurringTransactions();
    window.addEventListener('installment-recurring-updated', handleInstallmentSync);

    return () => {
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
    
    fetchTransactions(); fetchAccounts();

    return { error: null, linkedAmount: linkedRefundAmount, excessAmount };
  };

  const refetch = useCallback(() => {
    fetchAccounts();
    fetchTransactions();
    fetchCategories();
    fetchRecurringTransactions();
  }, [fetchAccounts, fetchTransactions, fetchCategories, fetchRecurringTransactions]);

  return useMemo(() => ({
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
    refetch,
    manualProcessRecurring: processDueRecurringTransactions
  }), [accounts, transactions, categories, recurringTransactions, loading,
    fetchAccounts, fetchTransactions, fetchCategories, fetchRecurringTransactions, refetch]);
}

type FinancialDataType = ReturnType<typeof useFinancialDataInternal>;

const FinancialDataContext = createContext<FinancialDataType | null>(null);

export function FinancialDataProvider({ children }: { children: React.ReactNode }) {
  const value = useFinancialDataInternal();
  return React.createElement(FinancialDataContext.Provider, { value }, children);
}

export function useFinancialData(): FinancialDataType {
  const context = useContext(FinancialDataContext);
  if (!context) {
    throw new Error('useFinancialData must be used within FinancialDataProvider');
  }
  return context;
}
