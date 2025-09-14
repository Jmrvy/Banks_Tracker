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
  transaction_date: string;
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
  recurrence_type: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  is_active: boolean;
  account: { name: string; bank: string } | null;
  category: { id: string; name: string; color: string } | null; // ← Added id here
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
      .order('transaction_date', { ascending: false })
      .limit(50);

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
      .eq('is_active', true)
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

  const createTransaction = async (transaction: Omit<Transaction, 'id' | 'account' | 'category'> & { account_id: string; category_id?: string }) => {
    if (!user) return;
    console.log('Creating transaction:', transaction);
    
    const { error } = await supabase
      .from('transactions')
      .insert([{ ...transaction, user_id: user.id }]);

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
    recurrence_type: 'weekly' | 'monthly' | 'yearly';
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

  const updateRecurringTransaction = async (id: string, updates: Partial<Pick<RecurringTransaction, 'is_active' | 'description' | 'amount' | 'end_date'>>) => {
    if (!user) return;
    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
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
    
    const today = new Date().toISOString().split('T')[0];
    const dueTransactions = recurringTransactions.filter(rt => 
      rt.is_active && 
      rt.next_due_date <= today &&
      (!rt.end_date || rt.next_due_date <= rt.end_date)
    );

    for (const rt of dueTransactions) {
      // Create the actual transaction
      await createTransaction({
        account_id: rt.account_id,
        category_id: rt.category_id,
        description: `${rt.description} (Récurrent)`,
        amount: rt.amount,
        type: rt.type,
        transaction_date: rt.next_due_date
      });

      // Calculate next due date
      const currentDue = new Date(rt.next_due_date);
      let nextDue = new Date(currentDue);

      switch (rt.recurrence_type) {
        case 'daily':
          nextDue.setDate(currentDue.getDate() + 1);
          break;
        case 'weekly':
          nextDue.setDate(currentDue.getDate() + 7);
          break;
        case 'biweekly':
          nextDue.setDate(currentDue.getDate() + 14);
          break;
        case 'monthly':
          nextDue.setMonth(currentDue.getMonth() + 1);
          break;
        case 'quarterly':
          nextDue.setMonth(currentDue.getMonth() + 3);
          break;
        case 'yearly':
          nextDue.setFullYear(currentDue.getFullYear() + 1);
          break;
      }

      // Update the recurring transaction with new next_due_date
      await supabase
        .from('recurring_transactions')
        .update({
          next_due_date: nextDue.toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        })
        .eq('id', rt.id);
    }

    if (dueTransactions.length > 0) {
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
      } catch (error) {
        console.error('Error loading financial data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

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
      console.log('Cleaning up real-time subscriptions');
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
    }
  };
}
