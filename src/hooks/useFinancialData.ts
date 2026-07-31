import React, { useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CategoryKind } from '@/lib/categoryKind';
import { useAuth } from '@/contexts/AuthContext';
import { recalculateDebtRemaining } from '@/utils/debtUtils';
import { resolveNamePlaceholders } from '@/utils/namePlaceholders';
import { parseLocalDate } from '@/lib/dateUtils';


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
  category: { id: string; name: string; color: string; icon?: string | null } | null;
  transfer_to_account_id?: string;
  transfer_to_account?: { name: string; bank: string };
  transfer_fee?: number;
  refund_of_transaction_id?: string | null; // Lien vers la transaction remboursée
  refunded_amount?: number; // Montant déjà remboursé
  refund_of_transaction?: Transaction | null; // Transaction originale remboursée
  installment_payment_id?: string | null; // Lien vers le paiement échelonné source
  recurring_transaction_id?: string | null; // Lien vers la transaction récurrente source
  /** When set, this transaction belongs to a special event budget (e.g.
   *  a trip) and is excluded from its category's monthly/period budget
   *  spend. It still contributes to global totals and to the special
   *  budget's category breakdown. */
  special_budget_id?: string | null;
  /** True when this row is a forecast/projection synthesised at report
   *  generation time (not persisted). Renderers branch on this for the
   *  subtle "· forecast" marker. */
  isProjection?: boolean;
  /** Where the projection came from (only set when isProjection). */
  projectedSource?: 'recurring' | 'debt' | 'installment';
}

export interface Category {
  id: string;
  name: string;
  color: string;
  /** Expense categories only — a ceiling on outgoings has no income analogue. */
  budget: number | null;
  icon: string | null;
  kind: CategoryKind;
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
  category: { id: string; name: string; color: string; icon?: string | null } | null;
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
          category:categories(id, name, color, icon),
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
          category:categories(id, name, color, icon)
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

  const getAccountDeletionImpact = async (accountId: string) => {
    if (!user) return { error: new Error('Not authenticated') as Error, impact: null };
    const { data, error } = await supabase.rpc(
      'get_account_deletion_impact' as never,
      { p_account_id: accountId } as never
    );
    if (error) return { error, impact: null };
    const impact = data as {
      error?: string;
      account_name?: string;
      transactions?: number;
      inbound_transfers?: number;
      recurring?: number;
      installments?: number;
      installment_history?: number;
    } | null;
    if (impact?.error) {
      return { error: new Error(impact.error), impact: null };
    }
    return { error: null, impact };
  };

  const deleteAccount = async (accountId: string) => {
    if (!user) return { error: new Error('Not authenticated') as Error };
    const { error } = await supabase.rpc(
      'delete_account_cascade' as never,
      { p_account_id: accountId } as never
    );
    if (error) return { error };
    // Refresh everything that could have been touched by the cascade.
    refetch();
    return { error: null };
  };

  const createTransaction = async (transaction: Omit<Transaction, 'id' | 'account' | 'category'> & { account_id: string; category_id?: string; value_date?: string; include_in_stats?: boolean; installment_payment_id?: string | null; special_budget_id?: string | null }) => {
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

    // Safeguard: plan-linked recurring rows (installment plan or debt) are
    // driven by their parent; direct edits silently desync. Refuse the
    // update and surface a clear error so callers route the user to the
    // parent instead.
    const { data: linkCheck } = await supabase
      .from('recurring_transactions')
      .select('installment_payment_id, debt_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (linkCheck?.installment_payment_id) {
      return {
        error: {
          message: 'linked_to_installment',
          installment_payment_id: linkCheck.installment_payment_id as string,
        } as Error & { installment_payment_id?: string },
      };
    }
    if (linkCheck?.debt_id) {
      return {
        error: {
          message: 'linked_to_debt',
          debt_id: linkCheck.debt_id as string,
        } as Error & { debt_id?: string },
      };
    }

    // Recalculate next_due_date if start_date or recurrence_type is being updated
    let updatedData: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    if (updates.start_date || updates.recurrence_type) {
      // Get current transaction to have all needed data
      const { data: currentTransaction, error: fetchCurrentErr } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchCurrentErr) console.error('Error fetching current recurring transaction:', fetchCurrentErr);
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

  // Preview the linked transactions that delete-cascade would remove. Used
  // by the delete-recurring confirmation dialog so the user can see what
  // will be touched, opt into the cascade, and see the per-account
  // balance delta before committing. Includes transfer fields so the
  // dialog can compute the effect on both legs of any transfer rows.
  const getRecurringDeletionImpact = async (id: string) => {
    if (!user) return {
      error: new Error('Not authenticated') as Error,
      transactions: [] as Array<{
        id: string; description: string; amount: number; transaction_date: string;
        account_id: string; type: string;
        transfer_to_account_id: string | null; transfer_fee: number | null;
      }>,
    };

    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, amount, transaction_date, account_id, type, transfer_to_account_id, transfer_fee')
      .eq('recurring_transaction_id', id)
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) return { error, transactions: [] };
    return { error: null, transactions: data || [] };
  };

  const deleteRecurringTransaction = async (
    id: string,
    options: { deleteLinkedTransactions?: boolean } = {}
  ) => {
    if (!user) return;

    // Safeguard: plan-linked recurring rows are owned by their parent.
    // Deleting them out from under the plan strands it with no schedule.
    const { data: linkCheck } = await supabase
      .from('recurring_transactions')
      .select('installment_payment_id, debt_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (linkCheck?.installment_payment_id) {
      return {
        error: {
          message: 'linked_to_installment',
          installment_payment_id: linkCheck.installment_payment_id as string,
        } as Error & { installment_payment_id?: string },
      };
    }
    if (linkCheck?.debt_id) {
      return {
        error: {
          message: 'linked_to_debt',
          debt_id: linkCheck.debt_id as string,
        } as Error & { debt_id?: string },
      };
    }

    // Optionally cascade-delete the transactions this schedule generated.
    // If it fails, abort before touching the schedule so the user can
    // retry from a known state.
    let deletedCount = 0;
    if (options.deleteLinkedTransactions) {
      const { data: linked, error: fetchError } = await supabase
        .from('transactions')
        .select('id')
        .eq('recurring_transaction_id', id)
        .eq('user_id', user.id);

      if (fetchError) {
        return { error: fetchError };
      }

      if (linked && linked.length > 0) {
        const { error: deleteError } = await supabase
          .from('transactions')
          .delete()
          .in('id', linked.map((t) => t.id))
          .eq('user_id', user.id);
        if (deleteError) {
          return { error: deleteError };
        }
        deletedCount = linked.length;
      }
    }

    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      fetchRecurringTransactions();
      if (deletedCount > 0) {
        // Linked transactions were removed; refresh the global feed +
        // account balances (the trigger updates accounts on each delete).
        fetchTransactions();
        fetchAccounts();
      }
    }
    return { error, deletedTransactionsCount: deletedCount };
  };

  const updateTransaction = async (id: string, updates: {
    description?: string;
    amount?: number;
    type?: 'income' | 'expense' | 'transfer';
    account_id?: string;
    category_id?: string;
    special_budget_id?: string | null;
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
      // If this transaction IS a refund and its amount changed, recompute
      // the original transaction's refunded_amount from the authoritative
      // sum of all linked refunds in DB. This avoids any drift caused by
      // stale local state or partial updates.
      if (
        originalTransaction?.refund_of_transaction_id &&
        updates.amount !== undefined
      ) {
        const originalId = originalTransaction.refund_of_transaction_id;
        const { data: allRefunds, error: refSumErr } = await supabase
          .from('transactions')
          .select('amount')
          .eq('refund_of_transaction_id', originalId)
          .eq('user_id', user.id);
        if (refSumErr) console.error('Error fetching refunds for sync:', refSumErr);
        const newRefunded = (allRefunds || []).reduce(
          (s, r) => s + Number(r.amount || 0),
          0
        );
        await supabase
          .from('transactions')
          .update({ refunded_amount: Math.round(newRefunded * 100) / 100 })
          .eq('id', originalId)
          .eq('user_id', user.id);
      }

      // If this transaction is linked to an installment payment and amount changed, update remaining_amount
      if (originalTransaction?.installment_payment_id && updates.amount !== undefined && updates.amount !== originalAmount) {
        const amountDifference = updates.amount - originalAmount;

        // Get current installment payment
        const { data: installmentPayment, error: ipErr } = await supabase
          .from('installment_payments')
          .select('remaining_amount')
          .eq('id', originalTransaction.installment_payment_id)
          .single();

        if (ipErr) console.error('Error fetching installment payment:', ipErr);
        if (installmentPayment) {
          const newRemainingAmount = installmentPayment.remaining_amount - amountDifference;

          await supabase
            .from('installment_payments')
            .update({ remaining_amount: Math.max(0, newRemainingAmount) })
            .eq('id', originalTransaction.installment_payment_id);
        }
      }

      // If this transaction is linked to a debt via recurring transaction and amount changed, update the debt_payment
      if (originalTransaction?.recurring_transaction_id && updates.amount !== undefined && updates.amount !== originalAmount) {
        const linkedRT = recurringTransactions.find(r => r.id === originalTransaction.recurring_transaction_id);
        if (linkedRT?.debt_id) {
          const txDate = originalTransaction.transaction_date;

          // Find the matching debt_payment by date and original amount
          const { data: debtPaymentsOnDate, error: dpErr } = await supabase
            .from('debt_payments')
            .select('id, amount, principal_amount, interest_amount')
            .eq('debt_id', linkedRT.debt_id)
            .eq('user_id', user.id)
            .eq('payment_date', txDate);

          if (dpErr) console.error('Error fetching debt payments on date:', dpErr);
          const matchingPayment = (debtPaymentsOnDate || []).find(
            dp => Math.abs(Number(dp.amount) - originalAmount) < 0.01
          );

          if (matchingPayment) {
            // Scale principal/interest proportionally if the total amount changed
            const ratio = originalAmount > 0 ? updates.amount / originalAmount : 1;
            const newPrincipal = Math.round(Number(matchingPayment.principal_amount) * ratio * 100) / 100;
            const newInterest = Math.round((updates.amount - newPrincipal) * 100) / 100;

            await supabase
              .from('debt_payments')
              .update({
                amount: updates.amount,
                principal_amount: newPrincipal,
                interest_amount: Math.max(0, newInterest),
              })
              .eq('id', matchingPayment.id)
              .eq('user_id', user.id);

            // Also update the scheduled_debt_payment actual_amount
            const monthKey = txDate.substring(0, 7);
            await supabase
              .from('scheduled_debt_payments')
              .update({ actual_amount: updates.amount })
              .eq('debt_id', linkedRT.debt_id)
              .eq('user_id', user.id)
              .eq('is_paid', true)
              .like('scheduled_date', `${monthKey}%`);

            await recalculateDebtRemaining(linkedRT.debt_id, user.id);
          }
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
        const { data: originalTransaction, error: refundErr } = await supabase
          .from('transactions')
          .select('refunded_amount')
          .eq('id', transactionToDelete.refund_of_transaction_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (refundErr) console.error('Error fetching original transaction for refund reversal:', refundErr);
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
        const planId = transactionToDelete.installment_payment_id;

        const { data: installmentPayment, error: ipDelErr } = await supabase
          .from('installment_payments')
          .select('remaining_amount, is_active')
          .eq('id', planId)
          .single();

        if (ipDelErr) console.error('Error fetching installment payment for reversal:', ipDelErr);
        if (installmentPayment) {
          const newRemainingAmount = installmentPayment.remaining_amount + transactionToDelete.amount;

          await supabase
            .from('installment_payments')
            .update({
              remaining_amount: newRemainingAmount,
              // Re-activate the installment if it was completed
              is_active: true
            })
            .eq('id', planId);

          // Also re-activate the linked recurring transaction
          await supabase
            .from('recurring_transactions')
            .update({ is_active: true })
            .eq('installment_payment_id', planId);

          // Custom-schedule plans materialise via installment_payment_records.
          // The FK trigger has already set transaction_id=NULL, but is_paid /
          // paid_date / actual_amount stay stale, leaving the slot rendered as
          // "paid with no transaction". Reset the slot so the schedule timeline
          // and calendar reflect "redue / overdue" immediately. Best-effort —
          // a failure here logs but doesn't block the rest of the flow.
          const { data: resetRecords, error: recordResetErr } = await supabase
            .from('installment_payment_records')
            .update({
              is_paid: false,
              paid_date: null,
              actual_amount: null,
              transaction_id: null,
            })
            .eq('installment_payment_id', planId)
            .eq('user_id', user.id)
            // Match either the now-orphaned row (transaction_id already nulled
            // by the FK trigger) or a row that still carries the deleted id,
            // and only those whose actual_amount matches the deleted tx (so we
            // don't unwind unrelated slots in the same plan).
            .or(`transaction_id.is.null,transaction_id.eq.${id}`)
            .eq('is_paid', true)
            .eq('actual_amount', transactionToDelete.amount)
            .select('id, scheduled_date');

          if (recordResetErr) {
            console.error('Error resetting installment record after tx delete:', recordResetErr);
          }

          // Recompute the plan's next_payment_date from the earliest unpaid
          // record after the reset above. Mirror it onto the linked recurring
          // transaction so the calendar/processor agree on the next slot.
          if (resetRecords && resetRecords.length > 0) {
            const { data: nextRec } = await supabase
              .from('installment_payment_records')
              .select('scheduled_date')
              .eq('installment_payment_id', planId)
              .eq('user_id', user.id)
              .eq('is_paid', false)
              .order('scheduled_date', { ascending: true })
              .limit(1)
              .maybeSingle();

            const nextDate =
              (nextRec as { scheduled_date?: string } | null)?.scheduled_date ?? null;
            if (nextDate) {
              await supabase
                .from('installment_payments')
                .update({ next_payment_date: nextDate })
                .eq('id', planId);
              await supabase
                .from('recurring_transactions')
                .update({ next_due_date: nextDate, is_active: true })
                .eq('installment_payment_id', planId);
            }
          } else {
            // Uniform plan (no records) — the processor advances
            // next_payment_date each time it materialises a slot. After a
            // delete we recompute it from the surviving linked tx count and
            // the recurring's start_date + frequency. Robust whether the
            // user deleted the latest tx or an earlier one.
            const { data: rec } = await supabase
              .from('recurring_transactions')
              .select('id, start_date, recurrence_type')
              .eq('installment_payment_id', planId)
              .eq('user_id', user.id)
              .maybeSingle();

            const { data: remainingTxs } = await supabase
              .from('transactions')
              .select('id')
              .eq('installment_payment_id', planId)
              .eq('user_id', user.id);

            if (rec && rec.start_date) {
              const paidCount = (remainingTxs ?? []).length;
              const [sy, sm, sd] = rec.start_date.split('-').map(Number);
              const nextDateObj = new Date(sy, sm - 1, sd);
              // Walk forward `paidCount` frequency steps to find the next
              // unpaid slot. Matches the processor's advance step exactly.
              for (let i = 0; i < paidCount; i++) {
                switch (rec.recurrence_type) {
                  case 'weekly':
                    nextDateObj.setDate(nextDateObj.getDate() + 7);
                    break;
                  case 'quarterly': {
                    const m = nextDateObj.getMonth() + 3;
                    nextDateObj.setMonth(m);
                    break;
                  }
                  case 'yearly':
                    nextDateObj.setFullYear(nextDateObj.getFullYear() + 1);
                    break;
                  case 'monthly':
                  default:
                    nextDateObj.setMonth(nextDateObj.getMonth() + 1);
                }
              }
              const yyyy = nextDateObj.getFullYear();
              const mm = String(nextDateObj.getMonth() + 1).padStart(2, '0');
              const dd = String(nextDateObj.getDate()).padStart(2, '0');
              const nextDate = `${yyyy}-${mm}-${dd}`;

              await supabase
                .from('installment_payments')
                .update({ next_payment_date: nextDate })
                .eq('id', planId);
              await supabase
                .from('recurring_transactions')
                .update({ next_due_date: nextDate, is_active: true })
                .eq('id', rec.id);
            }
          }
        }
      }

      // If this transaction was linked to a debt recurring transaction, reverse the debt payment
      if (transactionToDelete?.recurring_transaction_id) {
        const linkedRT = recurringTransactions.find(r => r.id === transactionToDelete.recurring_transaction_id);
        if (linkedRT?.debt_id) {
          const txDate = transactionToDelete.transaction_date;
          const txAmount = Number(transactionToDelete.amount);

          // Find and delete the matching debt_payment
          const { data: debtPaymentsOnDate, error: dpDelErr } = await supabase
            .from('debt_payments')
            .select('id, amount')
            .eq('debt_id', linkedRT.debt_id)
            .eq('user_id', user.id)
            .eq('payment_date', txDate);

          if (dpDelErr) console.error('Error fetching debt payments for reversal:', dpDelErr);
          const matchingDebtPayment = (debtPaymentsOnDate || []).find(
            dp => Math.abs(Number(dp.amount) - txAmount) < 0.01
          ) || null;

          if (matchingDebtPayment) {
            await supabase
              .from('debt_payments')
              .delete()
              .eq('id', matchingDebtPayment.id)
              .eq('user_id', user.id);
          }

          // Reset the matching scheduled_debt_payment back to unpaid
          const monthKey = txDate.substring(0, 7);
          const { data: scheduledForMonth, error: spErr } = await supabase
            .from('scheduled_debt_payments')
            .select('id')
            .eq('debt_id', linkedRT.debt_id)
            .eq('user_id', user.id)
            .eq('is_paid', true)
            .like('scheduled_date', `${monthKey}%`)
            .limit(1)
            .maybeSingle();

          if (spErr) console.error('Error fetching scheduled payment for reversal:', spErr);
          if (scheduledForMonth) {
            await supabase
              .from('scheduled_debt_payments')
              .update({ is_paid: false, paid_date: null, actual_amount: null })
              .eq('id', scheduledForMonth.id)
              .eq('user_id', user.id);
          }

          await recalculateDebtRemaining(linkedRT.debt_id, user.id);

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
      const { data: ipData, error: ipFetchErr } = await supabase
        .from('installment_payments')
        .select('installment_amount, payment_type')
        .eq('id', rt.installment_payment_id)
        .single();
      if (ipFetchErr) console.error('Error fetching installment for early execution:', ipFetchErr);
      if (ipData) {
        transactionAmount = ipData.installment_amount;
        transactionType = ipData.payment_type === 'reimbursement' ? 'expense' : rt.type;
      }
    }

    // For debt-linked recurring transactions, use the scheduled amount for this date
    let debtScheduledPrincipal = 0;
    let debtScheduledInterest = 0;
    if (rt.debt_id) {
      const { data: scheduledPayment, error: spFetchErr } = await supabase
        .from('scheduled_debt_payments')
        .select('scheduled_amount, principal_amount, interest_amount')
        .eq('debt_id', rt.debt_id)
        .eq('user_id', user.id)
        .neq('is_paid', true)
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (spFetchErr) console.error('Error fetching scheduled payment for early execution:', spFetchErr);
      if (scheduledPayment) {
        transactionAmount = scheduledPayment.scheduled_amount;
        debtScheduledPrincipal = scheduledPayment.principal_amount || 0;
        debtScheduledInterest = scheduledPayment.interest_amount || 0;
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
        description: resolveNamePlaceholders(rt.description, parseLocalDate(executionDate)),
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
        .select('id, total_amount, remaining_amount')
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

      // Record debt payment with capital/interest split
      await supabase
        .from('debt_payments')
        .insert({
          debt_id: rt.debt_id,
          user_id: user.id,
          amount: transactionAmount,
          principal_amount: debtScheduledPrincipal,
          interest_amount: debtScheduledInterest,
          payment_date: executionDate,
          notes: `Échéance récurrente: ${rt.description}`,
        });

      const result = await recalculateDebtRemaining(rt.debt_id, user.id);
      if (result && result.newRemaining <= 0) {
        await supabase
          .from('recurring_transactions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', recurringId)
          .eq('user_id', user.id);
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

    // Batch-fetch all installments, scheduled_debt_payments, and debts upfront.
    // Avoids N+1 queries inside the dueTransactions loop.
    const installmentIds = [...new Set(dueTransactions.map(rt => rt.installment_payment_id).filter((id): id is string => Boolean(id)))];
    const debtIds = [...new Set(dueTransactions.map(rt => rt.debt_id).filter((id): id is string => Boolean(id)))];

    const installmentMap = new Map<string, { total_amount: number; installment_amount: number; remaining_amount: number; payment_type: string; is_active: boolean }>();
    if (installmentIds.length > 0) {
      const { data } = await supabase
        .from('installment_payments')
        .select('id, total_amount, installment_amount, remaining_amount, payment_type, is_active')
        .in('id', installmentIds);
      for (const ip of data || [])
        installmentMap.set(ip.id, {
          ...ip,
          payment_type: ip.payment_type ?? 'payment',
          is_active: ip.is_active ?? true,
        });
    }

    const debtPaymentsMap = new Map<string, { id: string; scheduled_date: string; scheduled_amount: number; principal_amount: number; interest_amount: number; is_paid: boolean | null }[]>();
    const debtAmountMap = new Map<string, number>();
    if (debtIds.length > 0) {
      const [schedResp, debtResp] = await Promise.all([
        supabase
          .from('scheduled_debt_payments')
          .select('id, debt_id, scheduled_date, scheduled_amount, principal_amount, interest_amount, is_paid')
          .in('debt_id', debtIds)
          .eq('user_id', user.id)
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('debts')
          .select('id, payment_amount')
          .in('id', debtIds),
      ]);
      for (const sp of schedResp.data || []) {
        const arr = debtPaymentsMap.get(sp.debt_id) || [];
        arr.push(sp);
        debtPaymentsMap.set(sp.debt_id, arr);
      }
      for (const d of debtResp.data || []) {
        if (d.payment_amount) debtAmountMap.set(d.id, d.payment_amount);
      }
    }

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

        // Resolve installment data from batched map
        let txType = rt.type;
        let txAmount = rt.amount;
        let installmentData: { total_amount: number; installment_amount: number; remaining_amount: number; payment_type: string; is_active: boolean } | null = null;
        if (rt.installment_payment_id) {
          installmentData = installmentMap.get(rt.installment_payment_id) || null;
          if (installmentData) {
            txType = installmentData.payment_type === 'reimbursement' ? 'expense' : rt.type;
            txAmount = installmentData.installment_amount;
          }
        }

        // Resolve debt scheduled payments from batched map
        let debtScheduledPayments: { id: string; scheduled_date: string; scheduled_amount: number; principal_amount: number; interest_amount: number; is_paid: boolean | null }[] = [];
        if (rt.debt_id) {
          debtScheduledPayments = debtPaymentsMap.get(rt.debt_id) || [];
          const nextUnpaid = debtScheduledPayments.find(sp => !sp.is_paid);
          if (nextUnpaid) {
            txAmount = nextUnpaid.scheduled_amount;
          } else {
            const paymentAmount = debtAmountMap.get(rt.debt_id);
            if (paymentAmount) txAmount = paymentAmount;
          }
        }

        let currentDueDateString = rt.next_due_date;
        let occurrencesProcessed = 0;
        const maxOccurrences = 12;

        while (currentDueDateString <= todayString && occurrencesProcessed < maxOccurrences) {
          if (rt.end_date && currentDueDateString > rt.end_date) break;

          // Deduplication: skip if transaction already exists for this recurring + date
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('recurring_transaction_id', rt.id)
            .eq('transaction_date', currentDueDateString)
            .limit(1);

          if (existingTx && existingTx.length > 0) {
            occurrencesProcessed++;
            currentDueDateString = safeAdvanceDate(currentDueDateString, rt.recurrence_type);
            continue;
          }

          // For debt-linked recurring, check if this occurrence was already paid
          // via the debt schedule (confirm button or link modal)
          let skipTransaction = false;
          let occurrenceAmount = txAmount;
          if (rt.debt_id && debtScheduledPayments.length > 0) {
            const monthKey = currentDueDateString.substring(0, 7);
            const matchingScheduled = debtScheduledPayments.find(sp => sp.scheduled_date.substring(0, 7) === monthKey);
            if (matchingScheduled) {
              if (matchingScheduled.is_paid) {
                skipTransaction = true;
              } else {
                occurrenceAmount = matchingScheduled.scheduled_amount;
              }
            }
          }

          if (!skipTransaction) {
            const { error: txError } = await supabase
              .from('transactions')
              .insert([{
                account_id: rt.account_id,
                category_id: rt.category_id,
                description: `${resolveNamePlaceholders(rt.description, parseLocalDate(currentDueDateString))} (Récurrence automatique)`,
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
              let scheduledPrincipal = 0;
              let scheduledInterest = 0;
              if (matchingScheduled) {
                scheduledPrincipal = matchingScheduled.principal_amount || 0;
                scheduledInterest = matchingScheduled.interest_amount || 0;
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
                  principal_amount: scheduledPrincipal,
                  interest_amount: scheduledInterest,
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
          const result = await recalculateDebtRemaining(rt.debt_id, user.id);
          if (result && result.newRemaining <= 0) {
            await supabase
              .from('recurring_transactions')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', rt.id)
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

    // Debounce rapid successive realtime events so that bulk inserts (e.g. recurring
    // processing creating many transactions) trigger only one refetch burst.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const debounce = (key: string, fn: () => void, ms = 250) => {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        fn();
      }, ms));
    };

    // Unique per hook instance — see the note in useDebts. A fixed topic
    // makes `supabase.channel()` hand back the channel an earlier mount
    // already joined, and this hook has fifty-two consumers.
    const channelId = `financial_data_changes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${user.id}` },
        () => debounce('accounts', fetchAccounts),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` },
        () => debounce('transactions', () => { fetchTransactions(); fetchAccounts(); }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${user.id}` },
        () => debounce('categories', fetchCategories),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recurring_transactions', filter: `user_id=eq.${user.id}` },
        () => debounce('recurring', fetchRecurringTransactions),
      )
      .subscribe();

    const handleInstallmentSync = () => debounce('recurring', fetchRecurringTransactions);
    window.addEventListener('installment-recurring-updated', handleInstallmentSync);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('installment-recurring-updated', handleInstallmentSync);
      timers.forEach(t => clearTimeout(t));
      timers.clear();
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
    deleteAccount,
    getAccountDeletionImpact,
    createTransaction,
    createTransfer,
    createCategory,
    createRecurringTransaction,
    updateRecurringTransaction,
    deleteRecurringTransaction,
    getRecurringDeletionImpact,
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
