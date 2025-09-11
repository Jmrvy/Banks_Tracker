import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const defaultCategories = [
  { name: 'Groceries', color: '#10B981', budget: 500 },
  { name: 'Gas & Transportation', color: '#F59E0B', budget: 200 },
  { name: 'Dining Out', color: '#EF4444', budget: 300 },
  { name: 'Entertainment', color: '#8B5CF6', budget: 150 },
  { name: 'Shopping', color: '#EC4899', budget: 200 },
  { name: 'Bills & Utilities', color: '#06B6D4', budget: 800 },
  { name: 'Healthcare', color: '#84CC16', budget: 150 },
  { name: 'Income', color: '#3B82F6', budget: null },
];

const defaultAccounts = [
  { name: 'Main Checking', bank: 'other' as const, account_type: 'checking' as const, balance: 1000 },
  { name: 'Savings Account', bank: 'other' as const, account_type: 'savings' as const, balance: 5000 },
];

export function useOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOnboarding, setIsOnboarding] = useState(false);

  const createDefaultData = async () => {
    if (!user) return;

    setIsOnboarding(true);

    try {
      // Check if user already has accounts
      const { data: existingAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (existingAccounts && existingAccounts.length > 0) {
        setIsOnboarding(false);
        return; // User already has data
      }

      // Create default categories
      const categoriesData = defaultCategories.map(cat => ({
        ...cat,
        user_id: user.id,
      }));

      const { error: categoriesError } = await supabase
        .from('categories')
        .insert(categoriesData);

      if (categoriesError) throw categoriesError;

      // Create default accounts
      const accountsData = defaultAccounts.map(acc => ({
        ...acc,
        user_id: user.id,
      }));

      const { error: accountsError } = await supabase
        .from('accounts')
        .insert(accountsData);

      if (accountsError) throw accountsError;

      toast({
        title: "Welcome to FinanceTracker!",
        description: "We've set up some default accounts and categories to get you started.",
      });

    } catch (error: any) {
      console.error('Onboarding error:', error);
      toast({
        title: "Setup Error",
        description: "There was an issue setting up your account. You can create accounts manually.",
        variant: "destructive",
      });
    } finally {
      setIsOnboarding(false);
    }
  };

  useEffect(() => {
    if (user && !isOnboarding) {
      // Small delay to let other components initialize
      const timer = setTimeout(() => {
        createDefaultData();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user]);

  return { isOnboarding, createDefaultData };
}