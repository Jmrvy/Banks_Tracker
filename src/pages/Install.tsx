import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Smartphone, Download, CheckCircle, Share } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Install() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

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
      <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: 'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%)' }}
        />
        <div className="ft-card w-full max-w-md p-6 sm:p-8 relative text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-pos/12 grid place-items-center">
            <CheckCircle className="w-7 h-7 text-pos" />
          </div>
          <div className="ft-eyebrow mb-1">Installation</div>
          <h1 className="ft-page-title text-xl sm:text-2xl">Application installée</h1>
          <p className="text-sm text-muted-foreground mt-2 mb-5">
            L'application est déjà installée sur votre appareil
          </p>
          <Button onClick={() => navigate('/')} className="w-full h-10 font-semibold">
            Ouvrir l'application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%)' }}
      />
      <div className="ft-card w-full max-w-md p-6 sm:p-8 relative">
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/12 grid place-items-center">
            <Smartphone className="w-7 h-7 text-primary" />
          </div>
          <div className="ft-eyebrow mb-1">Installation</div>
          <h1 className="ft-page-title text-xl sm:text-2xl">Installer l'application</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Installez Spending Tracker sur votre appareil pour un accès rapide et une expérience optimale
          </p>
        </div>

        <div className="space-y-5 mt-6">
          {!isIOS && deferredPrompt && (
            <Button onClick={handleInstall} className="w-full h-11 font-semibold gap-2" size="lg">
              <Download className="h-4 w-4" />
              Installer maintenant
            </Button>
          )}

          {isIOS && (
            <div className="rounded-lg border border-line bg-bg-subtle p-4 space-y-3">
              <p className="font-semibold text-sm">
                {t('install.iosTitle', { defaultValue: 'To install on iPhone:' })}
              </p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-foreground">1.</span>
                  <span>{t('install.iosStep1', { defaultValue: 'Open this page in Safari' })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-foreground">2.</span>
                  <span className="flex items-center">
                    {t('install.iosStep2Prefix', { defaultValue: 'Tap the' })}
                    <Share className="mx-1 h-4 w-4 inline" />
                    {t('install.iosStep2Suffix', { defaultValue: 'Share button' })}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-foreground">3.</span>
                  <span>{t('install.iosStep3', { defaultValue: 'Select "Add to Home Screen"' })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-foreground">4.</span>
                  <span>{t('install.iosStep4', { defaultValue: 'Tap "Add"' })}</span>
                </li>
              </ol>
            </div>
          )}

          {!isIOS && !deferredPrompt && (
            <div className="space-y-3">
              <div className="rounded-lg border border-line bg-bg-subtle p-4">
                <p className="text-sm text-muted-foreground">
                  Pour installer l'application, utilisez un navigateur compatible comme Chrome, Edge ou Safari.
                </p>
              </div>
              <Button onClick={() => navigate('/')} variant="outline" className="w-full h-10">
                Continuer dans le navigateur
              </Button>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <p className="ft-eyebrow mb-2">Avantages</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-pos flex-shrink-0" />
                Accès rapide depuis l'écran d'accueil
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-pos flex-shrink-0" />
                Fonctionne hors ligne
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-pos flex-shrink-0" />
                Expérience plein écran
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-pos flex-shrink-0" />
                Mises à jour automatiques
              </li>
            </ul>
          </div>

          <Button onClick={() => navigate('/')} variant="ghost" className="w-full h-10">
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  );
}
