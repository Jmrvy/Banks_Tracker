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
  account: { name: string; bank: string };
  category: { id: string; name: string; color: string } | null;
  transfer_to_account_id?: string;
  transfer_to_account?: { name: string; bank: string };
  transfer_fee?: number;
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
  created_at: string;
  updated_at: string;
}

export function useFinancialData() {
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
    console.log('Fetching transactions for user:', user.id);
    
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
      console.log('Raw transaction data:', data);
      const processedTransactions = data.map(t => ({
        ...t,
        account: t.account || { name: 'Unknown', bank: 'unknown' },
        transfer_to_account: t.transfer_to_account || undefined
      })) as Transaction[];
      console.log('Processed transactions:', processedTransactions);
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
    console.log('Fetching recurring transactions for user:', user.id);
    
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
      console.log('Raw recurring transaction data:', data);
      const processedRecurring = data.map(rt => ({
        ...rt,
        account: rt.account || null,
        category: rt.category || null
      })) as RecurringTransaction[];
      console.log('Processed recurring transactions:', processedRecurring);
      setRecurringTransactions(processedRecurring);
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

  const createTransaction = async (transaction: Omit<Transaction, 'id' | 'account' | 'category'> & { account_id: string; category_id?: string; value_date?: string }) => {
    if (!user) return;
    console.log('Creating transaction:', transaction);
    
    // Si value_date n'est pas fournie, utiliser transaction_date
    const transactionData = {
      ...transaction,
      value_date: transaction.value_date || transaction.transaction_date,
      user_id: user.id
    };
    
    const { error } = await supabase
      .from('transactions')
      .insert([transactionData]);

    if (error) {
      console.error('Error creating transaction:', error);
    } else {
      console.log('Transaction created successfully, refetching data...');
      setTimeout(() => {
        fetchTransactions();
        fetchAccounts();
      }, 100);
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
    console.log('Creating transfer:', transfer);
    
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
      console.log('Transfer created successfully, refetching data...');
      setTimeout(() => {
        fetchTransactions();
        fetchAccounts();
      }, 100);
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
    
    // Calculate next due date based on recurrence type
    const startDate = new Date(recurring.start_date);
    let nextDueDate = new Date(startDate);
    
    switch (recurring.recurrence_type) {
      case 'weekly':
        nextDueDate.setDate(startDate.getDate() + 7);
        break;
      case 'monthly':
        nextDueDate.setMonth(startDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDueDate.setMonth(startDate.getMonth() + 3);
        break;
      case 'yearly':
        nextDueDate.setFullYear(startDate.getFullYear() + 1);
        break;
    }

    const { error } = await supabase
      .from('recurring_transactions')
      .insert({
        description: recurring.description,
        amount: recurring.amount,
        type: recurring.type,
        recurrence_type: recurring.recurrence_type,
        start_date: recurring.start_date,
        end_date: recurring.end_date,
        next_due_date: nextDueDate.toISOString().split('T')[0],
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
    let updatedData: any = {
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
        
        // Use midnight to avoid timezone drift
        const startDate = new Date(baseStart + 'T00:00:00');
        const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
        
        // Helper to add one interval
        const addInterval = (d: Date) => {
          const next = new Date(d);
          switch (recurrenceType) {
            case 'weekly':
              next.setDate(next.getDate() + 7);
              break;
            case 'monthly':
              next.setMonth(next.getMonth() + 1);
              break;
            case 'quarterly':
              next.setMonth(next.getMonth() + 3);
              break;
            case 'yearly':
              next.setFullYear(next.getFullYear() + 1);
              break;
          }
          return next;
        };
        
        // Start from the first due after the start date
        let nextDue = addInterval(startDate);
        
        // If that date is in the past, roll forward until strictly in the future (after today)
        while (nextDue <= today) {
          nextDue = addInterval(nextDue);
        }
        
        updatedData.next_due_date = nextDue.toISOString().split('T')[0];
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
  }) => {
    if (!user) return { error: { message: 'User not authenticated' } };
    
    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      setTimeout(() => {
        fetchTransactions();
        fetchAccounts();
      }, 100);
    }
    return { error };
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return { error: { message: 'User not authenticated' } };
    
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      setTimeout(() => {
        fetchTransactions();
        fetchAccounts();
      }, 100);
    }
    return { error };
  };

  const processDueRecurringTransactions = async () => {
    if (!user) return;
    
    // Use string comparison for dates to avoid timezone issues
    const todayString = new Date().toISOString().split('T')[0];
    
    console.log('Processing recurring transactions for date:', todayString);
    console.log('Total recurring transactions:', recurringTransactions.length);
    
    const dueTransactions = recurringTransactions.filter(rt => {
      if (!rt.is_active) return false;
      
      // Use string comparison for reliable date comparison
      const isDue = rt.next_due_date <= todayString;
      const isNotExpired = !rt.end_date || rt.end_date >= rt.next_due_date;
      
      console.log(`Checking ${rt.description}: due ${rt.next_due_date} vs today ${todayString} - isDue: ${isDue}, isNotExpired: ${isNotExpired}`);
      
      return isDue && isNotExpired;
    });

    console.log('Due transactions found:', dueTransactions.length);
    dueTransactions.forEach(rt => {
      console.log(`- ${rt.description}: due ${rt.next_due_date}, active: ${rt.is_active}`);
    });

    let processedCount = 0;

    for (const rt of dueTransactions) {
      try {
        // Check if end_date has passed
        if (rt.end_date && rt.end_date < todayString) {
          console.log(`Deactivating expired recurring transaction: ${rt.description}`);
          
          // Deactivate the recurring transaction
          await supabase
            .from('recurring_transactions')
            .update({ is_active: false })
            .eq('id', rt.id);
          
          continue;
        }

        // Process transactions using string dates to avoid timezone issues
        let currentDueDateString = rt.next_due_date;
        let occurrencesProcessed = 0;
        const maxOccurrences = 12; // Limit to prevent infinite loops

        // Process all missed occurrences up to today
        while (currentDueDateString <= todayString && occurrencesProcessed < maxOccurrences) {
          // Skip if this occurrence is after the end_date
          if (rt.end_date && currentDueDateString > rt.end_date) {
            break;
          }

          // Create the actual transaction for this occurrence
          await createTransaction({
            account_id: rt.account_id,
            category_id: rt.category_id,
            description: `${rt.description} (Récurrence automatique)`,
            amount: rt.amount,
            type: rt.type,
            transaction_date: currentDueDateString,
            value_date: currentDueDateString // Pour les récurrences, value_date = transaction_date
          });

          occurrencesProcessed++;

          // Calculate next occurrence using Date objects but convert back to string
          const previousDue = new Date(currentDueDateString + 'T00:00:00');
          const nextDue = new Date(previousDue);

          switch (rt.recurrence_type) {
            case 'weekly':
              nextDue.setDate(previousDue.getDate() + 7);
              break;
            case 'monthly':
              nextDue.setMonth(previousDue.getMonth() + 1);
              break;
            case 'quarterly':
              nextDue.setMonth(previousDue.getMonth() + 3);
              break;
            case 'yearly':
              nextDue.setFullYear(previousDue.getFullYear() + 1);
              break;
          }
          
          currentDueDateString = nextDue.toISOString().split('T')[0];
        }

        // Update the recurring transaction with the new next_due_date
        await supabase
          .from('recurring_transactions')
          .update({
            next_due_date: currentDueDateString,
            updated_at: new Date().toISOString()
          })
          .eq('id', rt.id);

        processedCount += occurrencesProcessed;
        console.log(`Processed ${occurrencesProcessed} occurrences for recurring transaction: ${rt.description}`);

      } catch (error) {
        console.error(`Error processing recurring transaction ${rt.id}:`, error);
      }
    }

    if (processedCount > 0) {
      console.log(`Processed ${processedCount} total recurring transactions`);
      // Refresh data after processing
      fetchRecurringTransactions();
      fetchTransactions();
      fetchAccounts();
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
        
        // Process due recurring transactions after loading data
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
          console.log('Account change detected:', payload);
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
          console.log('Transaction change detected:', payload);
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
          console.log('Category change detected:', payload);
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
          console.log('Recurring transaction change detected:', payload);
          fetchRecurringTransactions();
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions and intervals');
      clearInterval(recurringCheckInterval);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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
    processDueRecurringTransactions,
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
