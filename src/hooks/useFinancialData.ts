import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  type: 'income' | 'expense';
  transaction_date: string;
  account: { name: string; bank: string };
  category: { name: string; color: string } | null;
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

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        account:accounts(name, bank),
        category:categories(name, color)
      `)
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .limit(50);

    if (!error && data) {
      setTransactions(data as Transaction[]);
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

    const { error } = await supabase
      .from('transactions')
      .insert([{ ...transaction, user_id: user.id }]);

    if (!error) {
      fetchTransactions();
      fetchAccounts(); // Refresh accounts to update balances
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
    if (user) {
      Promise.all([
        fetchAccounts(),
        fetchTransactions(),
        fetchCategories()
      ]).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  return {
    accounts,
    transactions,
    categories,
    loading,
    createAccount,
    createTransaction,
    createCategory,
    refetch: () => {
      fetchAccounts();
      fetchTransactions();
      fetchCategories();
    }
  };
}