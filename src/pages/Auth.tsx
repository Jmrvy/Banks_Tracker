import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
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
        if (needsOnboarding) {
          navigate('/onboarding');
        } else {
          navigate('/');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
          emailRedirectTo: `${window.location.origin}/`,
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-3 sm:p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold leading-tight">
            {t('auth.welcome')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm mt-1.5">
            {t('auth.welcomeSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
              <TabsTrigger value="signin" className="text-xs sm:text-sm">{t('auth.signInTab')}</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs sm:text-sm">{t('auth.signUpTab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
