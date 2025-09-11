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
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  transaction_date: string;
  account: { name: string; bank: string };
  category: { name: string; color: string } | null;
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

export function useFinancialData() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
        category:categories(name, color),
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
      // Force immediate refresh with a small delay to ensure DB is updated
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

    // Create the transfer transaction (debit from source account)
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
      // Force immediate refresh with a small delay to ensure DB is updated
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
          fetchCategories()
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
          // Add a small delay to ensure the DB has been fully updated
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
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions');
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // Use user.id instead of user to prevent unnecessary re-renders

  return {
    accounts,
    transactions,
    categories,
    loading,
    createAccount,
    createTransaction,
    createTransfer,
    createCategory,
    refetch: () => {
      fetchAccounts();
      fetchTransactions();
      fetchCategories();
    }
  };
}