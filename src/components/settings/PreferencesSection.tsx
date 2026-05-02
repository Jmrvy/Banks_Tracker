import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useToast } from "@/hooks/use-toast";
import type { Account } from "@/hooks/useFinancialData";

interface UserPreferences {
  currency: string;
  dateFormat: string;
  dateType: 'accounting' | 'value';
  enableNotifications: boolean;
  accountAliases: Record<string, string>;
}

interface PreferencesSectionProps {
  accounts: Account[];
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

export const PreferencesSection = ({ accounts, preferences, updatePreferences }: PreferencesSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const savePreferences = () => {
    toast({
      title: t('settings.preferencesSaved'),
      description: t('settings.preferencesSavedDesc'),
    });
  };

  return (
    <div className="ft-card p-5 sm:p-6">
      <div className="ft-card-head">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/12 text-primary grid place-items-center">
              <Palette className="h-3.5 w-3.5" />
            </div>
            <h3 className="ft-card-title text-base">{t('settings.preferences')}</h3>
          </div>
          <p className="ft-card-sub mt-1">{t('settings.customizeDisplay')}</p>
        </div>
      </div>
      <div className="space-y-4 mt-4">

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('settings.theme')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.themeDescription')}</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="border-t border-line" />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('settings.language')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.languageDescription')}</p>
          </div>
          <LanguageSelector />
        </div>

        <div className="border-t border-line" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.currency')}</Label>
              <Select
                value={preferences.currency}
                onValueChange={(value) => updatePreferences({ currency: value })}
              >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">Euro (€)</SelectItem>
                <SelectItem value="USD">Dollar ($)</SelectItem>
                <SelectItem value="GBP">Livre (£)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('settings.dateFormat')}</Label>
            <Select
              value={preferences.dateFormat}
              onValueChange={(value) => updatePreferences({ dateFormat: value })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-line" />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('settings.enableNotifications')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.enableNotificationsDesc')}</p>
          </div>
          <Switch
            checked={preferences.enableNotifications}
            onCheckedChange={(checked) => updatePreferences({ enableNotifications: checked })}
          />
        </div>

        <div className="border-t border-line" />

        <div className="space-y-1.5">
          <Label className="text-xs">{t('settings.dateType')}</Label>
          <Select
            value={preferences.dateType}
            onValueChange={(value: 'accounting' | 'value') => updatePreferences({ dateType: value })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accounting">{t('settings.accountingDate')}</SelectItem>
              <SelectItem value="value">{t('settings.valueDate')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('settings.dateTypeDescription')}
          </p>
        </div>

        <div className="border-t border-line" />

        {/* Account Aliases for Transfer Descriptions */}
        <div className="space-y-2">
          <div>
            <Label className="text-sm">{t('settings.accountAliases')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.accountAliasesDesc')}
            </p>
          </div>
          <div className="space-y-2">
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
        </div>

        <Button onClick={savePreferences} size="sm" className="h-8 text-sm">
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
};
