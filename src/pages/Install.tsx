import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, Download, CheckCircle, Share } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Vérifier si l'app est déjà installée
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Détecter iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Capturer l'événement beforeinstallprompt (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-secondary/10">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Application installée !</CardTitle>
            <CardDescription>
              L'application est déjà installée sur votre appareil
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Ouvrir l'application
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-secondary/10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Smartphone className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Installer l'application</CardTitle>
          <CardDescription>
            Installez Finance Tracker sur votre appareil pour un accès rapide et une expérience optimale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Android/Chrome */}
          {!isIOS && deferredPrompt && (
            <div className="space-y-4">
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="mr-2 h-5 w-5" />
                Installer maintenant
              </Button>
            </div>
          )}

          {/* iOS */}
          {isIOS && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <p className="font-semibold text-sm">Pour installer sur iPhone :</p>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start">
                    <span className="font-bold mr-2">1.</span>
                    <span>Ouvrez cette page dans Safari</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-bold mr-2">2.</span>
                    <span className="flex items-center">
                      Appuyez sur le bouton <Share className="mx-1 h-4 w-4 inline" /> Partager
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-bold mr-2">3.</span>
                    <span>Sélectionnez "Sur l'écran d'accueil"</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-bold mr-2">4.</span>
                    <span>Appuyez sur "Ajouter"</span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Pas de support PWA détecté */}
          {!isIOS && !deferredPrompt && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pour installer l'application, utilisez un navigateur compatible comme Chrome, Edge ou Safari.
                </p>
              </div>
              <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                Continuer dans le navigateur
              </Button>
            </div>
          )}

          {/* Avantages */}
          <div className="border-t pt-4 space-y-2">
            <p className="font-semibold text-sm">Avantages de l'installation :</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="flex items-center">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                Accès rapide depuis l'écran d'accueil
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                Fonctionne hors ligne
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                Expérience plein écran
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                Mises à jour automatiques
              </li>
            </ul>
          </div>

          <Button onClick={() => navigate('/')} variant="ghost" className="w-full">
            Plus tard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
