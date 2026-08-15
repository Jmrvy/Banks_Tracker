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
          <div className="ft-eyebrow mb-1">{t('install.eyebrow', { defaultValue: 'Installation' })}</div>
          <h1 className="ft-page-title text-xl sm:text-2xl">
            {t('install.installedTitle', { defaultValue: 'App installed' })}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 mb-5">
            {t('install.installedBody', {
              defaultValue: 'The app is already installed on this device.',
            })}
          </p>
          <Button onClick={() => navigate('/')} className="w-full h-10 font-semibold">
            {t('install.open', { defaultValue: 'Open the app' })}
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
          <div className="ft-eyebrow mb-1">{t('install.eyebrow', { defaultValue: 'Installation' })}</div>
          <h1 className="ft-page-title text-xl sm:text-2xl">
            {t('install.title', { defaultValue: 'Install the app' })}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t('install.subtitle', {
              defaultValue:
                'Install Banks Tracker on your device for quick access and a full-screen experience.',
            })}
          </p>
        </div>

        <div className="space-y-5 mt-6">
          {!isIOS && deferredPrompt && (
            <Button onClick={handleInstall} className="w-full h-11 font-semibold gap-2" size="lg">
              <Download className="h-4 w-4" />
              {t('install.now', { defaultValue: 'Install now' })}
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
                  {t('install.unsupported', {
                    defaultValue:
                      'To install the app, use a supported browser such as Chrome, Edge or Safari.',
                  })}
                </p>
              </div>
              <Button onClick={() => navigate('/')} variant="outline" className="w-full h-10">
                {t('install.continueInBrowser', { defaultValue: 'Continue in the browser' })}
              </Button>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <p className="ft-eyebrow mb-2">{t('install.benefits', { defaultValue: 'Benefits' })}</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {[
                ['install.benefitHome', 'Opens straight from the home screen'],
                ['install.benefitOffline', 'Works offline'],
                ['install.benefitFullscreen', 'Full-screen, no browser chrome'],
                ['install.benefitUpdates', 'Updates itself'],
              ].map(([key, fallback]) => (
                <li key={key} className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-pos flex-shrink-0" />
                  {t(key, { defaultValue: fallback })}
                </li>
              ))}
            </ul>
          </div>

          <Button onClick={() => navigate('/')} variant="ghost" className="w-full h-10">
            {t('install.later', { defaultValue: 'Later' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
