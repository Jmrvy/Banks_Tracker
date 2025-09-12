import { useState } from 'react';

export function useOnboarding() {
  // Hook simplifié qui ne fait rien
  const [isOnboarding] = useState(false);
  
  const createDefaultData = async () => {
    // Fonction vide - ne fait plus rien
    console.log('Onboarding désactivé');
  };

  return { 
    isOnboarding, 
    createDefaultData 
  };
}
