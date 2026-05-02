import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { AccountsSection } from "@/components/settings/AccountsSection";
import { CategoriesSection } from "@/components/settings/CategoriesSection";
import { BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { accounts, categories, refetch } = useFinancialData();
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

          <CategoriesSection
            categories={categories}
            refetch={refetch}
            formatCurrency={formatCurrency}
          />

          {/* Guide */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('settings.guideTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.guideSubtitle')}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReviewGuide}
                  className="text-xs sm:text-sm"
                >
                  {t('settings.reviewGuide')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sign Out */}
          <div className="pt-2">
            <Button
              variant="destructive"
              onClick={signOut}
              className="w-full h-10 text-sm"
            >
              {t('auth.signOut')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
