import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { AccountsSection } from "@/components/settings/AccountsSection";
import { BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { accounts, refetch } = useFinancialData();
  const { preferences, updatePreferences, formatCurrency } = useUserPreferences();
  const navigate = useNavigate();

  const handleReviewGuide = () => {
    // Temporarily clear the done flag so onboarding renders, then navigate
    localStorage.removeItem('budget-app-onboarding-done');
    localStorage.setItem('budget-app-needs-onboarding', 'true');
    navigate('/onboarding');
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">

        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.settings')}</div>
            <h1 className="ft-page-title">{t('settings.title')}</h1>
            <div className="ft-page-sub">{t('navigation.manageProfile')}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:gap-4">
          <ProfileSection user={user} />

          <PreferencesSection
            accounts={accounts}
            preferences={preferences}
            updatePreferences={updatePreferences}
          />

          {preferences.enableNotifications && (
            <NotificationsSection user={user} />
          )}

          <AccountsSection
            accounts={accounts}
            refetch={refetch}
            formatCurrency={formatCurrency}
          />

          {/* Guide */}
          <div className="ft-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/12 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{t('settings.guideTitle')}</p>
                  <p className="text-xs text-muted-foreground truncate">{t('settings.guideSubtitle')}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleReviewGuide} className="h-8 text-xs flex-shrink-0">
                {t('settings.reviewGuide')}
              </Button>
            </div>
          </div>

          {/* Sign out */}
          <div className="ft-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="ft-card-title">{t('settings.signOutSection', { defaultValue: 'Sign out' })}</h3>
                <p className="ft-card-sub mt-0.5">{t('settings.signOutSectionDesc', { defaultValue: 'Sign out of your account' })}</p>
              </div>
              <Button variant="outline" onClick={signOut} size="sm" className="h-8 text-sm border-destructive/40 text-destructive hover:bg-destructive/10">
                {t('auth.signOut')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
