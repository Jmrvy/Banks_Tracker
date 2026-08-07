import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { LanguageSelector } from "@/components/LanguageSelector";
import { SettingsRow, SETTINGS_CONTROL } from "@/components/settings/SettingsRow";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Account } from "@/hooks/useFinancialData";

interface UserPreferences {
  currency: string;
  dateFormat: string;
  dateType: 'accounting' | 'value';
  enableNotifications: boolean;
  accountAliases: Record<string, string>;
  quickPreviewOnLogin: boolean;
}

interface PreferencesSectionProps {
  accounts: Account[];
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

export const PreferencesSection = ({ accounts, preferences, updatePreferences }: PreferencesSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  // Three-way, matching the design's segmented theme control — the icon
  // toggle showed no current state and had no system option.
  const themeOptions = [
    { value: "light" as const, label: t("settings.themeLight", { defaultValue: "Light" }) },
    { value: "dark" as const, label: t("settings.themeDark", { defaultValue: "Dark" }) },
    { value: "system" as const, label: t("settings.themeSystem", { defaultValue: "System" }) },
  ];

  const savePreferences = () => {
    toast({
      title: t('settings.preferencesSaved'),
      description: t('settings.preferencesSavedDesc'),
    });
  };

  return (
    <div className="ft-card">
      <div className="ft-card-head">
        <div>
          <div className="flex items-center gap-2">
            <div className="ft-kpi-icon acc">
              <Palette className="h-[15px] w-[15px]" />
            </div>
            <h3 className="ft-card-title text-base">{t('settings.preferences')}</h3>
          </div>
          <p className="ft-card-sub mt-1">{t('settings.customizeDisplay')}</p>
        </div>
      </div>
      {/* One rhythm for the whole card: each row owns its soft top rule, so
          there are no filler separators and the head is ruled off too. */}
      <div className="flex flex-col gap-1">

        <SettingsRow label={t('settings.theme')} hint={t('settings.themeDescription')}>
          <div className="ft-seg" role="group" aria-label={t('settings.theme')}>
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={theme === opt.value}
                className={cn(theme === opt.value && 'active')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow label={t('settings.language')} hint={t('settings.languageDescription')}>
          {/* LanguageSelector owns its own trigger; size it to the system's
              190×34 control box from here. */}
          <div className="[&>button]:w-[190px] [&>button]:h-[34px] [&>button]:text-[13px]">
            <LanguageSelector />
          </div>
        </SettingsRow>

        <SettingsRow
          label={t('settings.currency')}
          hint={t('settings.currencyDesc', { defaultValue: 'Used everywhere in the app.' })}
        >
          <Select
            value={preferences.currency}
            onValueChange={(value) => updatePreferences({ currency: value })}
          >
            <SelectTrigger className={SETTINGS_CONTROL}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">Euro (€)</SelectItem>
              <SelectItem value="USD">Dollar ($)</SelectItem>
              <SelectItem value="GBP">Livre (£)</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label={t('settings.dateFormat')}
          hint={t('settings.dateFormatDesc', { defaultValue: 'How dates are shown in lists.' })}
        >
          <Select
            value={preferences.dateFormat}
            onValueChange={(value) => updatePreferences({ dateFormat: value })}
          >
            <SelectTrigger className={SETTINGS_CONTROL}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label={t('settings.enableNotifications')}
          hint={t('settings.enableNotificationsDesc')}
        >
          <Switch
            checked={preferences.enableNotifications}
            onCheckedChange={(checked) => updatePreferences({ enableNotifications: checked })}
          />
        </SettingsRow>

        <SettingsRow
          label={t('settings.quickPreviewOnLogin', { defaultValue: 'Show Quick Preview on login' })}
          hint={t('settings.quickPreviewOnLoginDesc', {
            defaultValue: "Greet you with the splash overview each session — disabled by default so the dashboard opens directly.",
          })}
        >
          <Switch
            checked={preferences.quickPreviewOnLogin}
            onCheckedChange={(checked) => updatePreferences({ quickPreviewOnLogin: checked })}
          />
        </SettingsRow>

        <SettingsRow label={t('settings.dateType')} hint={t('settings.dateTypeDescription')}>
          <Select
            value={preferences.dateType}
            onValueChange={(value: 'accounting' | 'value') => updatePreferences({ dateType: value })}
          >
            <SelectTrigger className={SETTINGS_CONTROL}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accounting">{t('settings.accountingDate')}</SelectItem>
              <SelectItem value="value">{t('settings.valueDate')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        {/* Account Aliases for Transfer Descriptions */}
        <SettingsRow
          label={t('settings.accountAliases')}
          hint={t('settings.accountAliasesDesc')}
          stack
        >
          <div className="flex flex-col gap-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground min-w-[120px] truncate">
                  {account.name}
                </span>
                <span className="text-muted-foreground">→</span>
                <Input
                  value={preferences.accountAliases[account.id] || ''}
                  onChange={(e) => {
                    const newAliases = { ...preferences.accountAliases };
                    if (e.target.value) {
                      newAliases[account.id] = e.target.value;
                    } else {
                      delete newAliases[account.id];
                    }
                    updatePreferences({ accountAliases: newAliases });
                  }}
                  placeholder={account.name}
                  className="h-8 text-sm flex-1"
                />
              </div>
            ))}
          </div>
        </SettingsRow>

        <Button onClick={savePreferences} size="sm" className="h-8 text-sm self-start mt-3">
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};
