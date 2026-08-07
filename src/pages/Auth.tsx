import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNext } from '@/lib/nextParam';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { splitFormattedAmount } from '@/lib/currency';
import { z } from 'zod';

/* ── Shared field grammar (design: .field / .inp) ────────────────────────────
   12px semibold mute label over a flat 40px / 14px control, and the system's
   one focus treatment: the border turns accent with a flush 3px accent-soft
   halo — no detached, offset ring. */
const LABEL_CLS = 'text-[12px] font-semibold text-fg-mute';
const INPUT_CLS =
  'h-10 text-[14px] focus-visible:ring-[3px] focus-visible:ring-offset-0 ' +
  'focus-visible:ring-[hsl(var(--accent-soft))] focus-visible:border-[hsl(var(--primary))]';

/* Segmented control (design: .seg) mapped onto the Radix tab triggers. */
const SEG_TRIGGER_CLS =
  'rounded-sm px-[11px] py-[5px] text-[12px] font-[550] tabular-nums ' +
  'data-[state=active]:bg-bg-elev data-[state=active]:!shadow-sh-1';

/* ── Illustrative sparkline for the preview panel ────────────────────────────
   Same construction as the design's <Spark fill>: a polyline at a 1.6
   non-scaling stroke over a 22% → 0% vertical accent wash, drawn full-bleed
   with preserveAspectRatio="none". Fixed numbers, never anyone's data. */
const SPARK_H = 54;
const SPARK_VALUES = [38, 44, 41, 52, 49, 58, 55, 64, 61, 72, 78, 86];
const SPARK_PATH = (() => {
  const min = Math.min(...SPARK_VALUES);
  const max = Math.max(...SPARK_VALUES);
  const range = max - min || 1;
  return SPARK_VALUES.map((v, i) => {
    const x = (i / (SPARK_VALUES.length - 1)) * 100;
    const y = 2 + (1 - (v - min) / range) * (SPARK_H - 4);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
})();

export default function Auth() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // A pending OAuth consent (or any deep link) is preserved through sign-in.
  const next = safeNext(location.search);
  const { toast } = useToast();

  // Preview-panel formatting only. No user preferences exist before sign-in,
  // so these are locale-aware but fixed-currency illustrations.
  const previewMoney = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }),
    [i18n.language],
  );
  const previewMoneyRound = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
    [i18n.language],
  );
  const previewNetWorth = splitFormattedAmount(previewMoney.format(12480));

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
    <div className="min-h-screen grid wide:grid-cols-2 bg-background">
      {/* Left — the form. The only column on small screens. */}
      <div className="grid place-items-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[380px] flex flex-col gap-[18px]">
          {/* Brand mark → headline → lede. The welcome sentence IS the title. */}
          <div>
            <div className="ft-brand-mark !h-11 !w-11 !rounded-[15px] !text-[23px] mb-[18px]">S</div>
            <h1 className="ft-page-title text-[30px] sm:text-[36px] leading-[1.05] tracking-[-0.015em]">
              {t('auth.welcome')}
            </h1>
            <p className="text-[14px] text-fg-mute mt-[9px] max-w-[46ch]">
              {t('auth.welcomeLede', {
                defaultValue: 'Your accounts, budgets and upcoming payments in one place.',
              })}
            </p>
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'signin' | 'signup')}
            className="flex flex-col gap-[18px]"
          >
            <TabsList className="inline-flex h-auto w-auto self-start gap-0.5 rounded-md p-[3px]">
              <TabsTrigger value="signin" className={SEG_TRIGGER_CLS}>{t('auth.signInTab')}</TabsTrigger>
              <TabsTrigger value="signup" className={SEG_TRIGGER_CLS}>{t('auth.signUpTab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-0">
              <form onSubmit={handleSignIn} className="flex flex-col gap-[18px]">
                <div className="flex flex-col gap-[14px]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signin-email" className={LABEL_CLS}>{t('auth.email')}</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signin-password" className={LABEL_CLS}>{t('auth.password')}</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder={t('auth.passwordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-[46px] rounded-lg text-[14.5px] font-[650]"
                  disabled={loading}
                >
                  {loading ? t('auth.signingIn') : t('auth.signIn')}
                </Button>
                {/* Meta row — the column's closing beat (design: .spread, 12.5px) */}
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-fg-mute">{t('auth.noAccount')}</span>
                  <button
                    type="button"
                    onClick={() => setTab('signup')}
                    className="inline-flex items-center gap-1 font-semibold text-fg-dim transition-colors hover:text-foreground"
                  >
                    {t('auth.signUpTab')}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-0">
              <form onSubmit={handleSignUp} className="flex flex-col gap-[18px]">
                <div className="flex flex-col gap-[14px]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-name" className={LABEL_CLS}>{t('auth.fullName')}</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder={t('auth.namePlaceholder')}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-email" className={LABEL_CLS}>{t('auth.email')}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="signup-password" className={LABEL_CLS}>{t('auth.password')}</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder={t('auth.createPasswordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className={INPUT_CLS}
                    />
                    <p className="text-[11.5px] text-fg-dim">
                      {t('auth.passwordHint')}
                    </p>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-[46px] rounded-lg text-[14.5px] font-[650]"
                  disabled={loading}
                >
                  {loading ? t('auth.signingUp') : t('auth.signUp')}
                </Button>
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-fg-mute">{t('auth.hasAccount')}</span>
                  <button
                    type="button"
                    onClick={() => setTab('signin')}
                    className="inline-flex items-center gap-1 font-semibold text-fg-dim transition-colors hover:text-foreground"
                  >
                    {t('auth.signInTab')}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right — a labelled product preview, so the empty sign-in screen shows
          what the app is for. Illustrative figures, never anyone's data;
          hidden below the 1180px collapse width where the form should own the viewport. */}
      <aside
        aria-label={t('auth.previewEyebrow', { defaultValue: "What you'll see next" })}
        className="hidden wide:flex flex-col justify-center gap-[22px] px-14 bg-bg-sunk border-l border-line relative overflow-hidden"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(90% 70% at 80% 10%, hsl(var(--accent-wash)), transparent 60%)' }}
        />
        <div className="relative max-w-[460px] w-full flex flex-col gap-[18px]">
          <div className="ft-eyebrow">
            {t('auth.previewEyebrow', { defaultValue: "What you'll see next" })}
          </div>

          <div className="ft-card shadow-sh-2">
            <div className="ft-eyebrow">{t('dashboard.totalNetWorth', { defaultValue: 'Total net worth' })}</div>
            <div className="ft-hero-value !text-[40px] !leading-none mt-1.5" aria-hidden>
              {previewNetWorth.head}
              <span className="cents">{previewNetWorth.tail}</span>
            </div>
            <div className="-mx-1 mt-3.5" aria-hidden>
              <svg
                viewBox={`0 0 100 ${SPARK_H}`}
                preserveAspectRatio="none"
                focusable="false"
                className="block w-full"
                style={{ height: SPARK_H }}
              >
                <defs>
                  <linearGradient id="ft-auth-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
                    <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${SPARK_PATH} L100 ${SPARK_H} L0 ${SPARK_H} Z`} fill="url(#ft-auth-spark)" />
                <path
                  d={SPARK_PATH}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          <div className="ft-card p-[18px] shadow-sh-2">
            <div className="flex items-center justify-between gap-3 mb-[11px]">
              <b className="text-[13.5px]">{t('navigation.budget')}</b>
              <span className="ft-tag neg">
                {t('auth.previewOverBudget', { n: 2, defaultValue: '{{n}} over budget' })}
              </span>
            </div>
            {[
              { label: t('auth.previewCatGroceries', { defaultValue: 'Groceries' }), pct: 90, amount: 385, color: 'hsl(var(--chart-1))' },
              { label: t('auth.previewCatDining', { defaultValue: 'Dining' }), pct: 125, amount: 250, color: 'hsl(var(--chart-3))' },
              { label: t('auth.previewCatTransport', { defaultValue: 'Transport' }), pct: 54, amount: 95, color: 'hsl(var(--chart-4))' },
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-[5px] mt-[9px]">
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="flex items-center gap-[7px]">
                    <i className="ft-swatch" style={{ background: row.color }} />
                    {row.label}
                  </span>
                  <span className="ft-num">{previewMoneyRound.format(row.amount)}</span>
                </div>
                <div className="ft-progress-track thin">
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
