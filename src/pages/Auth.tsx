import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNext } from '@/lib/nextParam';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { z } from 'zod';

export default function Auth() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // A pending OAuth consent (or any deep link) is preserved through sign-in.
  const next = safeNext(location.search);
  const { toast } = useToast();

  const signInSchema = z.object({
    email: z.string().email(t('auth.validation.emailInvalid')).max(255, t('auth.validation.emailTooLong')),
    password: z.string().min(1, t('auth.validation.passwordRequired')),
  });

  const signUpSchema = z.object({
    fullName: z.string().trim().min(1, t('auth.validation.nameRequired')).max(100, t('auth.validation.nameTooLong')),
    email: z.string().email(t('auth.validation.emailInvalid')).max(255, t('auth.validation.emailTooLong')),
    password: z.string()
      .min(8, t('auth.validation.passwordMin'))
      .regex(/[A-Z]/, t('auth.validation.passwordUppercase'))
      .regex(/[a-z]/, t('auth.validation.passwordLowercase'))
      .regex(/[0-9]/, t('auth.validation.passwordDigit')),
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        const needsOnboarding = localStorage.getItem('budget-app-needs-onboarding');
        if (next) {
          navigate(next, { replace: true });
        } else if (needsOnboarding) {
          navigate('/onboarding');
        } else {
          navigate('/');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, next]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = signInSchema.safeParse({ email, password });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast({
          title: t('auth.validationError'),
          description: firstError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        toast({
          title: t('auth.signInError'),
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('auth.unexpectedError'),
        description: t('auth.unexpectedErrorDesc'),
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = signUpSchema.safeParse({ fullName, email, password });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast({
          title: t('auth.validationError'),
          description: firstError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}${next ?? '/'}`,
          data: {
            full_name: validation.data.fullName,
          },
        },
      });

      if (error) {
        toast({
          title: t('auth.signUpError'),
          description: error.message,
          variant: "destructive",
        });
      } else {
        localStorage.setItem('budget-app-needs-onboarding', 'true');
        toast({
          title: t('auth.checkEmail'),
          description: t('auth.checkEmailDesc'),
        });
      }
    } catch (error) {
      toast({
        title: t('auth.unexpectedError'),
        description: t('auth.unexpectedErrorDesc'),
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left — the form. The only column on small screens. */}
      <div className="grid place-items-center px-5 py-10 sm:px-8">
      <div className="w-full max-w-[380px]">
        {/* Brand mark */}
        <div className="ft-brand-mark !h-11 !w-11 !rounded-[15px] !text-[23px] mb-5">S</div>
        <div className="mb-6">
          <div className="ft-eyebrow mb-1.5">{t('auth.welcome')}</div>
          <h1 className="ft-page-title">{t('auth.welcomeSubtitle')}</h1>
        </div>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
            <TabsTrigger value="signin" className="text-xs sm:text-sm">{t('auth.signInTab')}</TabsTrigger>
            <TabsTrigger value="signup" className="text-xs sm:text-sm">{t('auth.signUpTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-3 sm:space-y-4 mt-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signin-email" className="text-xs sm:text-sm">{t('auth.email')}</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-9 sm:h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signin-password" className="text-xs sm:text-sm">{t('auth.password')}</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-9 sm:h-10 text-sm"
                  />
                </div>
                <Button type="submit" className="w-full h-9 sm:h-10 text-sm" disabled={loading}>
                  {loading ? t('auth.signingIn') : t('auth.signIn')}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-name" className="text-xs sm:text-sm">{t('auth.fullName')}</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder={t('auth.namePlaceholder')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-9 sm:h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-email" className="text-xs sm:text-sm">{t('auth.email')}</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-9 sm:h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-password" className="text-xs sm:text-sm">{t('auth.password')}</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder={t('auth.createPasswordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-9 sm:h-10 text-sm"
                  />
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {t('auth.passwordHint')}
                  </p>
                </div>
                <Button type="submit" className="w-full h-9 sm:h-10 text-sm" disabled={loading}>
                  {loading ? t('auth.signingUp') : t('auth.signUp')}
                </Button>
              </form>
            </TabsContent>
        </Tabs>
      </div>
      </div>

      {/* Right — a labelled product preview, so the empty sign-in screen shows
          what the app is for. Illustrative figures, never anyone's data;
          hidden below `lg` where the form should own the viewport. */}
      <aside
        aria-label={t('auth.previewEyebrow', { defaultValue: "What you'll see next" })}
        className="hidden lg:flex flex-col justify-center gap-5 px-14 bg-bg-sunk border-l border-line relative overflow-hidden"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(90% 70% at 80% 10%, hsl(var(--accent-wash)), transparent 60%)' }}
        />
        <div className="relative max-w-[460px] w-full flex flex-col gap-4">
          <div className="ft-eyebrow">
            {t('auth.previewEyebrow', { defaultValue: "What you'll see next" })}
          </div>

          <div className="ft-card p-5 shadow-sh-2">
            <div className="ft-eyebrow">{t('dashboard.totalNetWorth', { defaultValue: 'Total net worth' })}</div>
            <div className="ft-hero-value !text-[40px] mt-1.5" aria-hidden>
              12 480<span className="cents">,00 €</span>
            </div>
            <div className="flex items-end gap-[3px] h-14 mt-4" aria-hidden>
              {[38, 44, 41, 52, 49, 58, 55, 64, 61, 72, 78, 86].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[3px] bg-primary/25"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="ft-card p-[18px] shadow-sh-2">
            <div className="flex items-center justify-between mb-3">
              <b className="text-[13.5px]">{t('navigation.budget')}</b>
              <span className="ft-tag neg">2</span>
            </div>
            {[
              { label: t('auth.previewCatGroceries', { defaultValue: 'Groceries' }), pct: 90, color: 'hsl(var(--chart-1))' },
              { label: t('auth.previewCatDining', { defaultValue: 'Dining' }), pct: 125, color: 'hsl(var(--chart-3))' },
              { label: t('auth.previewCatTransport', { defaultValue: 'Transport' }), pct: 54, color: 'hsl(var(--chart-4))' },
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-1.5 mt-2.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: row.color }} />
                    {row.label}
                  </span>
                  <span className="font-mono text-fg-mute">{row.pct} %</span>
                </div>
                <div className="ft-progress-track !h-1">
                  <div
                    className="ft-progress-fill"
                    style={{
                      width: `${Math.min(100, row.pct)}%`,
                      background: row.pct > 100 ? 'hsl(var(--neg))' : row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-fg-dim">
            {t('auth.previewDisclaimer', { defaultValue: 'Illustrative figures — not real account data.' })}
          </p>
        </div>
      </aside>
    </div>
  );
}
