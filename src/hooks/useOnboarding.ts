import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const defaultCategories = [
];

const defaultAccounts = [

];

export function useOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const createDefaultData = async () => {
    if (!user) {
      console.log('❌ Aucun utilisateur connecté');
      return;
    }
    
    console.log('🚀 Démarrage onboarding pour:', user.id);
    setIsOnboarding(true);
    
    try {
      // **SOLUTION 1 : Vérification préalable systématique**
      console.log('🔍 Vérification des données existantes...');
      
      const { data: existingCategories, error: catError } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', user.id);

      const { data: existingAccounts, error: accError } = await supabase
        .from('accounts')
        .select('name') 
        .eq('user_id', user.id);

      if (catError) {
        console.error('❌ Impossible de vérifier les catégories:', catError);
        throw catError;
      }

      if (accError) {
        console.error('❌ Impossible de vérifier les comptes:', accError);
        throw accError;
      }

      // Créer des Sets pour une vérification rapide
      const existingCatNames = new Set((existingCategories || []).map(c => c.name));
      const existingAccNames = new Set((existingAccounts || []).map(a => a.name));

      console.log('📊 Données existantes:', {
        categories: Array.from(existingCatNames),
        accounts: Array.from(existingAccNames)
      });

      // **SOLUTION 2 : Insertion sélective une par une avec gestion d'erreur**
      let newCategoriesCount = 0;
      console.log('🔄 Création des catégories manquantes...');

      for (const category of defaultCategories) {
        if (!existingCatNames.has(category.name)) {
          try {
            const { error: insertError } = await supabase
              .from('categories')
              .insert({
                name: category.name,
                color: category.color,
                budget: category.budget,
                user_id: user.id,
              });

            if (insertError) {
              if (insertError.code === '23505') {
                console.log(`⚠️ Catégorie "${category.name}" existe déjà (race condition)`);
              } else {
                console.error(`❌ Erreur création catégorie "${category.name}":`, insertError);
                throw insertError;
              }
            } else {
              console.log(`✅ Catégorie créée: ${category.name}`);
              newCategoriesCount++;
            }
          } catch (error) {
            if (error.code === '23505') {
              console.log(`⚠️ Catégorie "${category.name}" créée par un autre processus`);
            } else {
              console.error(`❌ Erreur inattendue pour "${category.name}":`, error);
              throw error;
            }
          }
        } else {
          console.log(`ℹ️ Catégorie "${category.name}" existe déjà`);
        }
      }

      // **SOLUTION 3 : Même approche pour les comptes**
      let newAccountsCount = 0;
      console.log('🔄 Création des comptes manquants...');

      for (const account of defaultAccounts) {
        if (!existingAccNames.has(account.name)) {
          try {
            const { error: insertError } = await supabase
              .from('accounts')
              .insert({
                name: account.name,
                bank: account.bank,
                account_type: account.account_type,
                balance: account.balance,
                user_id: user.id,
              });

            if (insertError) {
              if (insertError.code === '23505') {
                console.log(`⚠️ Compte "${account.name}" existe déjà (race condition)`);
              } else {
                console.error(`❌ Erreur création compte "${account.name}":`, insertError);
                throw insertError;
              }
            } else {
              console.log(`✅ Compte créé: ${account.name}`);
              newAccountsCount++;
            }
          } catch (error) {
            if (error.code === '23505') {
              console.log(`⚠️ Compte "${account.name}" créé par un autre processus`);
            } else {
              console.error(`❌ Erreur inattendue pour "${account.name}":`, error);
              throw error;
            }
          }
        } else {
          console.log(`ℹ️ Compte "${account.name}" existe déjà`);
        }
      }

      // **Message de résultat**
      const totalCreated = newCategoriesCount + newAccountsCount;
      
      if (totalCreated > 0) {
        console.log(`🎉 Onboarding terminé : ${newCategoriesCount} catégories et ${newAccountsCount} comptes créés`);
        toast({
          title: "Bienvenue sur FinanceTracker !",
          description: `${newCategoriesCount} catégories et ${newAccountsCount} comptes ont été configurés.`,
        });
      } else {
        console.log('ℹ️ Aucune donnée à créer - utilisateur déjà configuré');
        toast({
          title: "Compte déjà configuré",
          description: "Vos données sont déjà en place !",
        });
      }

    } catch (error: any) {
      console.error('❌ Erreur lors de l\'onboarding:', error);
      
      // **SOLUTION 4 : Gestion gracieuse des erreurs**
      if (error.code === '23505') {
        // Cette erreur ne devrait plus arriver, mais au cas où...
        console.log('⚠️ Conflit de données détecté - configuration probablement réussie');
        toast({
          title: "Configuration complète",
          description: "Vos données ont été configurées avec succès.",
        });
      } else if (error.message?.includes('JWT') || error.message?.includes('auth')) {
        toast({
          title: "Problème d'authentification",
          description: "Veuillez vous reconnecter.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erreur de configuration",
          description: "Une erreur est survenue, mais vous pouvez utiliser l'application normalement.",
          variant: "destructive",
        });
      }
    } finally {
      setIsOnboarding(false);
    }
  };

  // **SOLUTION 5 : Protection contre les exécutions multiples**
  useEffect(() => {
    if (user && !isOnboarding && !hasInitialized) {
      console.log('🎯 Initialisation onboarding pour:', user.email);
      setHasInitialized(true);
      
      // Marqueur localStorage pour éviter les ré-exécutions
      const onboardingKey = `onboarding_${user.id}`;
      const lastOnboarding = localStorage.getItem(onboardingKey);
      const now = Date.now();
      
      // Ne relance l'onboarding que si ça fait plus d'1 heure
      if (!lastOnboarding || (now - parseInt(lastOnboarding)) > 3600000) {
        localStorage.setItem(onboardingKey, now.toString());
        
        const timer = setTimeout(() => {
          createDefaultData();
        }, 500);
        
        return () => clearTimeout(timer);
      } else {
        console.log('ℹ️ Onboarding récent détecté - ignoré');
        setIsOnboarding(false);
      }
    }
  }, [user, hasInitialized, isOnboarding]);

  return { isOnboarding, createDefaultData };
}
