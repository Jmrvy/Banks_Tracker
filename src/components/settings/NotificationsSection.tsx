import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

/** Sections the user can include in the email body. Mirrors the PDF
 *  wizard's PageId enum minus the items that don't read well in email
 *  (cover / contents / cashflow / full transactions ledger). */
type EmailSection = 'summary' | 'categories' | 'budgets' | 'accounts' | 'income' | 'recurring';
type Cadence = 'off' | 'weekly' | 'monthly' | 'quarterly';

const ALL_SECTIONS: EmailSection[] = ['summary', 'categories', 'budgets', 'accounts', 'income', 'recurring'];

interface NotificationsSectionProps {
  user: User | null;
}

export const NotificationsSection = ({ user }: NotificationsSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [notificationPrefs, setNotificationPrefs] = useState({
    budgetAlerts: true,
    cadence: 'monthly' as Cadence,
    sections: ['summary', 'categories', 'budgets', 'accounts', 'recurring'] as EmailSection[],
    attachPdf: true,
    topN: 6,
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [testBudgetLoading, setTestBudgetLoading] = useState(false);

  useEffect(() => {
    const loadNotificationPrefs = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        // The new columns may not be in the auto-generated types yet
        // (the migration ships in this same change). Read defensively.
        const row = data as Record<string, unknown>;
        const cadenceRaw = (row.monthly_report_cadence as Cadence | undefined)
          ?? (row.monthly_reports ? 'monthly' : 'off');
        const sectionsRaw = (row.monthly_report_sections as EmailSection[] | undefined)
          ?? ['summary', 'categories', 'budgets', 'accounts', 'recurring'];
        setNotificationPrefs({
          budgetAlerts: !!row.budget_alerts,
          cadence: (['off', 'weekly', 'monthly', 'quarterly'] as Cadence[]).includes(cadenceRaw)
            ? cadenceRaw
            : 'monthly',
          sections: Array.isArray(sectionsRaw)
            ? (sectionsRaw.filter((s) => ALL_SECTIONS.includes(s as EmailSection)) as EmailSection[])
            : ['summary', 'categories', 'budgets', 'accounts', 'recurring'],
          attachPdf: row.monthly_report_attach_pdf !== false,
          topN: Math.max(1, Math.min(20, Number(row.monthly_report_top_n) || 6)),
        });
      }
    };

    loadNotificationPrefs();
  }, [user]);

  const saveNotificationPreferences = async () => {
    if (!user) return;

    setNotifLoading(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          budget_alerts: notificationPrefs.budgetAlerts,
          // Keep the legacy boolean in sync so any code that hasn't
          // migrated yet still does the right thing.
          monthly_reports: notificationPrefs.cadence !== 'off',
          monthly_report_cadence: notificationPrefs.cadence,
          monthly_report_sections: notificationPrefs.sections,
          monthly_report_attach_pdf: notificationPrefs.attachPdf,
          monthly_report_top_n: notificationPrefs.topN,
        } as Record<string, unknown>);

      if (error) throw error;

      toast({
        title: t('settings.notificationsConfigured'),
        description: t('settings.notificationsConfiguredDesc'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.updateError'),
        variant: "destructive"
      });
    } finally {
      setNotifLoading(false);
    }
  };

  const testBudgetCheck = async () => {
    setTestBudgetLoading(true);
    try {
      const { error } = await supabase.functions.invoke('check-budgets');

      if (error) throw error;

      toast({
        title: t('settings.checkDone'),
        description: t('settings.checkDoneDesc'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('errors.generic'),
        variant: "destructive",
      });
    } finally {
      setTestBudgetLoading(false);
    }
  };

  const toggleSection = (s: EmailSection) => {
    setNotificationPrefs((prev) => ({
      ...prev,
      sections: prev.sections.includes(s)
        ? prev.sections.filter((x) => x !== s)
        : [...prev.sections, s],
    }));
  };

  const reportsOn = notificationPrefs.cadence !== 'off';

  return (
    <div className="ft-card p-5 sm:p-6">
      <div className="ft-card-head">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/12 text-primary grid place-items-center">
              <Bell className="h-3.5 w-3.5" />
            </div>
            <h3 className="ft-card-title text-base">{t('settings.emailNotifications')}</h3>
          </div>
          <p className="ft-card-sub mt-1">{t('settings.configureAlerts')}</p>
        </div>
      </div>
      <div className="space-y-4 mt-4">
        <div className="space-y-1.5">
          <Label htmlFor="notif-email" className="text-xs">{t('settings.notificationEmail')}</Label>
          <Input
            id="notif-email"
            type="email"
            value={user?.email || ""}
            disabled
            className="h-9 text-sm bg-bg-subtle"
          />
          <p className="text-xs text-muted-foreground">
            {t('settings.notificationEmailHint')}
          </p>
        </div>

        <div className="border-t border-line" />

        {/* Budget breach alerts (single toggle, unchanged) */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('settings.budgetAlerts')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.budgetAlertsDesc')}</p>
          </div>
          <Switch
            checked={notificationPrefs.budgetAlerts}
            onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, budgetAlerts: checked }))}
          />
        </div>

        <div className="border-t border-line" />

        {/* Monthly report — now four discrete controls instead of one toggle */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm">{t('settings.monthlyReports')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.monthlyReportsDesc')}</p>
          </div>

          {/* 1 — Cadence */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('settings.reportCadence', { defaultValue: 'Cadence' })}
            </Label>
            <Select
              value={notificationPrefs.cadence}
              onValueChange={(v: Cadence) => setNotificationPrefs((p) => ({ ...p, cadence: v }))}
            >
              <SelectTrigger className="h-9 text-sm w-full sm:w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t('settings.cadenceOff', { defaultValue: 'Off — never send' })}</SelectItem>
                <SelectItem value="weekly">{t('settings.cadenceWeekly', { defaultValue: 'Weekly · every Monday' })}</SelectItem>
                <SelectItem value="monthly">{t('settings.cadenceMonthly', { defaultValue: 'Monthly · 1st of each month' })}</SelectItem>
                <SelectItem value="quarterly">{t('settings.cadenceQuarterly', { defaultValue: 'Quarterly · 1st of Jan / Apr / Jul / Oct' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2 — Sections to include */}
          {reportsOn && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {t('settings.reportSections', { defaultValue: 'Included sections' })}
              </Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {ALL_SECTIONS.map((section) => (
                  <label
                    key={section}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={notificationPrefs.sections.includes(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <span>
                      {t(`settings.reportSection.${section}`, {
                        defaultValue:
                          section === 'summary' ? 'Executive summary'
                            : section === 'categories' ? 'Top categories'
                            : section === 'budgets' ? 'Budget breaches'
                            : section === 'accounts' ? 'Accounts'
                            : section === 'income' ? 'Income sources'
                            : 'Recurring',
                      })}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('settings.reportSectionsHint', {
                  defaultValue: 'Order in the email follows this list.',
                })}
              </p>
            </div>
          )}

          {/* 3 — PDF attachment */}
          {reportsOn && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-sm">
                  {t('settings.reportAttachPdf', { defaultValue: 'Attach full PDF report' })}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.reportAttachPdfHint', {
                    defaultValue: 'Adds the statement-style PDF to the email (1–3 pages depending on volume).',
                  })}
                </p>
              </div>
              <Switch
                checked={notificationPrefs.attachPdf}
                onCheckedChange={(checked) => setNotificationPrefs((p) => ({ ...p, attachPdf: checked }))}
              />
            </div>
          )}

          {/* 4 — Top-N category cap */}
          {reportsOn && notificationPrefs.sections.includes('categories') && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-sm">
                  {t('settings.reportTopN', { defaultValue: 'Top categories shown' })}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.reportTopNHint', {
                    defaultValue: 'Number of categories in the breakdown strip (1–20).',
                  })}
                </p>
              </div>
              <Input
                type="number"
                min={1}
                max={20}
                value={notificationPrefs.topN}
                onChange={(e) => {
                  const v = parseInt(e.target.value || '0', 10);
                  setNotificationPrefs((p) => ({
                    ...p,
                    topN: Math.max(1, Math.min(20, isNaN(v) ? 6 : v)),
                  }));
                }}
                className="h-9 w-20 text-sm tabular-nums"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={saveNotificationPreferences} disabled={notifLoading} size="sm" className="h-8 text-sm">
            {notifLoading ? t('settings.saving') : t('settings.saveNotifications')}
          </Button>
          <Button onClick={testBudgetCheck} disabled={testBudgetLoading} variant="outline" size="sm" className="h-8 text-sm">
            {testBudgetLoading ? t('settings.testing') : t('settings.testBudgetCheck')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.testBudgetHint')}
        </p>
      </div>
    </div>
  );
};
