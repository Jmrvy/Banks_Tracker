import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { AccountsSection } from "@/components/settings/AccountsSection";
import { CategoriesSection } from "@/components/settings/CategoriesSection";

const Settings = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { accounts, categories, refetch } = useFinancialData();
  const { preferences, updatePreferences, formatCurrency } = useUserPreferences();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="mb-2">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">{t('settings.title')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('navigation.manageProfile')}
          </p>
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
