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
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
          <CardTitle className="text-sm sm:text-base">{t('settings.preferences')}</CardTitle>
        </div>
        <CardDescription className="text-xs sm:text-sm hidden sm:block">
          {t('settings.customizeDisplay')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">

        <div className="flex items-center justify-between">
          <div>
            <Label>{t('settings.theme')}</Label>
            <p className="text-sm text-muted-foreground">{t('settings.themeDescription')}</p>
          </div>
          <ThemeToggle />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label>{t('settings.language')}</Label>
            <p className="text-sm text-muted-foreground">{t('settings.languageDescription')}</p>
          </div>
          <LanguageSelector />
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('settings.currency')}</Label>
              <Select
                value={preferences.currency}
                onValueChange={(value) => updatePreferences({ currency: value })}
              >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">Euro (€)</SelectItem>
                <SelectItem value="USD">Dollar ($)</SelectItem>
                <SelectItem value="GBP">Livre (£)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('settings.dateFormat')}</Label>
            <Select
              value={preferences.dateFormat}
              onValueChange={(value) => updatePreferences({ dateFormat: value })}
            >
              <SelectTrigger>
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

        <Separator />

        <div className="flex items-center justify-between">
          <div>
            <Label>{t('settings.enableNotifications')}</Label>
            <p className="text-sm text-muted-foreground">{t('settings.enableNotificationsDesc')}</p>
          </div>
          <Switch
            checked={preferences.enableNotifications}
            onCheckedChange={(checked) => updatePreferences({ enableNotifications: checked })}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>{t('settings.dateType')}</Label>
          <Select
            value={preferences.dateType}
            onValueChange={(value: 'accounting' | 'value') => updatePreferences({ dateType: value })}
          >
            <SelectTrigger>
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

        <Separator />

        {/* Account Aliases for Transfer Descriptions */}
        <div className="space-y-3">
          <div>
            <Label>{t('settings.accountAliases')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.accountAliasesDesc')}
            </p>
          </div>
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-muted-foreground min-w-[100px] sm:min-w-[140px] truncate">
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
                  className="h-8 sm:h-10 text-xs sm:text-sm flex-1"
                />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={savePreferences} className="w-full sm:w-auto">
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
};
