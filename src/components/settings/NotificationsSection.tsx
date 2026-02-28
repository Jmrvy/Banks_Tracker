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
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          <CardTitle className="text-sm sm:text-base">{t('settings.emailNotifications')}</CardTitle>
        </div>
        <CardDescription className="text-xs sm:text-sm hidden sm:block">
          {t('settings.configureAlerts')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="notif-email" className="text-xs sm:text-sm">{t('settings.notificationEmail')}</Label>
          <Input
            id="notif-email"
            type="email"
            value={user?.email || ""}
            disabled
            className="h-8 sm:h-10 text-xs sm:text-sm bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            {t('settings.notificationEmailHint')}
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs sm:text-sm">{t('settings.budgetAlerts')}</Label>
              <p className="text-xs text-muted-foreground">{t('settings.budgetAlertsDesc')}</p>
            </div>
            <Switch
              checked={notificationPrefs.budgetAlerts}
              onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, budgetAlerts: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs sm:text-sm">{t('settings.monthlyReports')}</Label>
              <p className="text-xs text-muted-foreground">{t('settings.monthlyReportsDesc')}</p>
            </div>
            <Switch
              checked={notificationPrefs.monthlyReports}
              onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, monthlyReports: checked }))}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={saveNotificationPreferences}
            disabled={notifLoading}
            className="w-full sm:w-auto"
          >
            {notifLoading ? t('settings.saving') : t('settings.saveNotifications')}
          </Button>
          <Button
            onClick={testBudgetCheck}
            disabled={testBudgetLoading}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {testBudgetLoading ? t('settings.testing') : t('settings.testBudgetCheck')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.testBudgetHint')}
        </p>
      </CardContent>
    </Card>
  );
};
