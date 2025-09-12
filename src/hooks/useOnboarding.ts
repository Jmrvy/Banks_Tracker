import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const defaultCategories = [
  { name: 'Courses', color: '#10B981', budget: 500 },
  { name: 'Transport', color: '#F59E0B', budget: 200 },
  { name: 'Restaurants', color: '#EF4444', budget: 300 },
  { name: 'Loisirs', color: '#8B5CF6', budget: 150 },
  { name: 'Shopping', color: '#EC4899', budget: 200 },
  { name: 'Factures', color: '#06B6D4', budget: 800 },
  { name: 'Santé', color: '#84CC16', budget: 150 },
  { name: 'Revenus', color: '#3B82F6', budget: null },
];

const defaultAccounts = [
  { name: 'Société Générale CB', bank: 'societe_generale' as const, account_type: 'checking' as const, balance: 1200 },
  { name: 'Revolut CB', bank: 'revolut' as const, account_type: 'checking' as const, balance: 800 },
  { name: 'Boursorama CB', bank: 'boursorama' as const, account_type: 'checking' as const, balance: 450 },
];

export function useOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const createDefaultData = async () => {
    if (!user) return;

    setIsOnboarding(true);

    try {
      // Check if user already has data
      const [{ data: existingAccounts }, { data: existingCategories }] = await Promise.all([
        supabase.from('accounts').select('name').eq('user_id', user.id),
        supabase.from('categories').select('name').eq('user_id', user.id)
      ]);

      const hasFrenchAccounts = existingAccounts?.some(acc => 
        acc.name === 'Société Générale CB' || 
        acc.name === 'Revolut CB' || 
        acc.name === 'Boursorama CB'
      );

      const existingCategoryNames = new Set(existingCategories?.map(cat => cat.name) || []);
      const hasAllDefaultCategories = defaultCategories.every(cat => existingCategoryNames.has(cat.name));

      if (hasFrenchAccounts && hasAllDefaultCategories) {
        setIsOnboarding(false);
        return; // User already has data
      }

      // Create only missing categories
      if (!hasAllDefaultCategories) {
        const missingCategories = defaultCategories.filter(cat => !existingCategoryNames.has(cat.name));
        
        if (missingCategories.length > 0) {
          const categoriesData = missingCategories.map(cat => ({
            ...cat,
            user_id: user.id,
          }));

          const { error: categoriesError } = await supabase
            .from('categories')
            .insert(categoriesData);

          if (categoriesError) throw categoriesError;
        }
      }

      // Create default accounts only if they don't exist
      if (!hasFrenchAccounts) {
        const accountsData = defaultAccounts.map(acc => ({
          ...acc,
          user_id: user.id,
        }));

        const { error: accountsError } = await supabase
          .from('accounts')
          .insert(accountsData);

        if (accountsError) throw accountsError;
      }

      // Show success message only if something was created
      if (!hasAllDefaultCategories || !hasFrenchAccounts) {
        toast({
          title: "Bienvenue sur FinanceTracker !",
          description: "Nous avons configuré vos comptes bancaires français.",
        });
      }

    } catch (error: any) {
      console.error('Onboarding error:', error);
      toast({
        title: "Erreur de configuration",
        description: "Il y a eu un problème lors de la configuration de votre compte. Vous pouvez créer des comptes manuellement.",
        variant: "destructive",
      });
    } finally {
      setIsOnboarding(false);
    }
  };

  // Run onboarding only once per user session
  useEffect(() => {
    if (user && !isOnboarding && !hasInitialized) {
      setHasInitialized(true);
      const timer = setTimeout(() => {
        createDefaultData();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user, hasInitialized]);

  return { isOnboarding, createDefaultData };
}