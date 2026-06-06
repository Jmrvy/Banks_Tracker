import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type SpecialBudgetStatus = 'planned' | 'active' | 'closed';

export interface SpecialBudget {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  total_budget: number;
  start_date: string | null;
  end_date: string | null;
  status: SpecialBudgetStatus;
  savings_goal_id: string | null;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

const toSpecialBudget = (row: Record<string, unknown>): SpecialBudget => ({
  id: row.id as string,
  user_id: row.user_id as string,
  name: row.name as string,
  description: (row.description as string | null) ?? null,
  total_budget: Number(row.total_budget),
  start_date: (row.start_date as string | null) ?? null,
  end_date: (row.end_date as string | null) ?? null,
  status: ((row.status as string) ?? 'active') as SpecialBudgetStatus,
  savings_goal_id: (row.savings_goal_id as string | null) ?? null,
  color: (row.color as string | null) ?? null,
  icon: (row.icon as string | null) ?? null,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
});

export const useSpecialBudgets = () => {
  const { user } = useAuth();
  const [specialBudgets, setSpecialBudgets] = useState<SpecialBudget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSpecialBudgets = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('special_budgets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching special budgets:', error);
      return;
    }
    setSpecialBudgets((data ?? []).map((r) => toSpecialBudget(r as Record<string, unknown>)));
  }, [user]);

  const createSpecialBudget = async (data: {
    name: string;
    description?: string | null;
    total_budget: number;
    start_date?: string | null;
    end_date?: string | null;
    status?: SpecialBudgetStatus;
    savings_goal_id?: string | null;
    color?: string | null;
    icon?: string | null;
  }) => {
    if (!user) return { error: new Error('User not authenticated'), data: null };
    const { data: row, error } = await supabase
      .from('special_budgets')
      .insert({
        user_id: user.id,
        name: data.name,
        description: data.description ?? null,
        total_budget: data.total_budget,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        status: data.status ?? 'active',
        savings_goal_id: data.savings_goal_id ?? null,
        color: data.color ?? null,
        icon: data.icon ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error('Error creating special budget:', error);
      return { error, data: null };
    }
    const created = toSpecialBudget(row as Record<string, unknown>);
    setSpecialBudgets((prev) => [created, ...prev]);
    return { error: null, data: created };
  };

  const updateSpecialBudget = async (
    id: string,
    updates: Partial<{
      name: string;
      description: string | null;
      total_budget: number;
      start_date: string | null;
      end_date: string | null;
      status: SpecialBudgetStatus;
      savings_goal_id: string | null;
      color: string | null;
      icon: string | null;
    }>
  ) => {
    if (!user) return { error: new Error('User not authenticated') };
    const { data: row, error } = await supabase
      .from('special_budgets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      console.error('Error updating special budget:', error);
      return { error };
    }
    const updated = toSpecialBudget(row as Record<string, unknown>);
    setSpecialBudgets((prev) => prev.map((b) => (b.id === id ? updated : b)));
    return { error: null };
  };

  const deleteSpecialBudget = async (id: string) => {
    if (!user) return { error: new Error('User not authenticated') };
    const { error } = await supabase
      .from('special_budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('Error deleting special budget:', error);
      return { error };
    }
    setSpecialBudgets((prev) => prev.filter((b) => b.id !== id));
    return { error: null };
  };

  /** Link or unlink transactions to a special budget in bulk. Pass
   *  `specialBudgetId = null` to unlink. */
  const linkTransactions = async (transactionIds: string[], specialBudgetId: string | null) => {
    if (!user) return { error: new Error('User not authenticated') };
    if (transactionIds.length === 0) return { error: null };
    const { error } = await supabase
      .from('transactions')
      .update({ special_budget_id: specialBudgetId })
      .in('id', transactionIds)
      .eq('user_id', user.id);
    if (error) {
      console.error('Error linking transactions to special budget:', error);
      return { error };
    }
    return { error: null };
  };

  useEffect(() => {
    if (!user) {
      setSpecialBudgets([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      await fetchSpecialBudgets();
      if (!cancelled) setLoading(false);
    })();

    const channelId = `special_budgets_changes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const subscription = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'special_budgets',
          filter: `user_id=eq.${user.id}`,
        },
        fetchSpecialBudgets
      )
      .subscribe();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [user, fetchSpecialBudgets]);

  return {
    specialBudgets,
    loading,
    createSpecialBudget,
    updateSpecialBudget,
    deleteSpecialBudget,
    linkTransactions,
    refetch: fetchSpecialBudgets,
  };
};
