import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useOnboarding() {
  const { toast } = useToast();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const createDefaultData = async () => {
    // Plus de création automatique - juste une simulation d'initialisation
    setIsOnboarding(true);
    
    try {
      console.log('🚀 Initialisation de l\'application...');
      
      // Simulation d'une courte initialisation (sans accès base de données)
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Message de bienvenue optionnel (vous pouvez le commenter si vous ne le voulez pas)
      toast({
        title: "Bienvenue sur FinanceTracker !",
        description: "Créez vos premiers comptes et catégories pour commencer.",
      });
      
      console.log('✅ Application initialisée');
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation:', error);
      
      toast({
        title: "Application prête",
        description: "Vous pouvez commencer à utiliser l'application.",
      });
    } finally {
      setIsOnboarding(false);
    }
  };

  // Démarre l'initialisation une seule fois
  useEffect(() => {
    if (!hasInitialized) {
      console.log('🎯 Démarrage de l\'initialisation...');
      setHasInitialized(true);
      
      const timer = setTimeout(() => {
        createDefaultData();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [hasInitialized]);

  return { isOnboarding, createDefaultData };
}
