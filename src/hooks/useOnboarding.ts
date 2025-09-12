export function useOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const showWelcomeMessage = () => {
    if (user) {
      toast({
        title: "Bienvenue sur la gestion des comptes CB !",
        description: "Créez vos comptes et catégories depuis les menus.",
      });
    }
  };

  // Message de bienvenue simple au lieu de création automatique
  useEffect(() => {
    if (user) {
      const timer = setTimeout(showWelcomeMessage, 1000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  return { 
    isOnboarding: false, 
    createDefaultData: showWelcomeMessage 
  };
}
