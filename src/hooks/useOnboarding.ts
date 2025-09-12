import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useOnboarding() {
  const { toast } = useToast();
  const [isOnboarding] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  
  const createDefaultData = async () => {
    // Message de bienvenue simple sans création de données
    if (!hasShownWelcome) {
      toast({
        title: "Bienvenue sur FinanceTracker !",
        description: "Commencez par créer vos comptes et catégories.",
      });
      setHasShownWelcome(true);
    }
  };

  // Affiche le message une seule fois au chargement
  useEffect(() => {
    if (!hasShownWelcome) {
      const timer = setTimeout(() => {
        createDefaultData();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [hasShownWelcome]);

  return { 
    isOnboarding, 
    createDefaultData 
  };
}
