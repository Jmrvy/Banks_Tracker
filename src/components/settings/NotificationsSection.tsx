import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface NotificationsSectionProps {
  user: User | null;
}

export const NotificationsSection = ({ user }: NotificationsSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [notificationPrefs, setNotificationPrefs] = useState({
    budgetAlerts: true,
    monthlyReports: true
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
        setNotificationPrefs({
          budgetAlerts: data.budget_alerts,
          monthlyReports: data.monthly_reports
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
          monthly_reports: notificationPrefs.monthlyReports
        });

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

        <div className="space-y-3">
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

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t('settings.monthlyReports')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.monthlyReportsDesc')}</p>
            </div>
            <Switch
              checked={notificationPrefs.monthlyReports}
              onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, monthlyReports: checked }))}
            />
          </div>
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
