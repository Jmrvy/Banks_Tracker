import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User as AuthUser } from "@supabase/supabase-js";

interface ProfileSectionProps {
  user: AuthUser | null;
}

export const ProfileSection = ({ user }: ProfileSectionProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [profile, setProfile] = useState({
    fullName: user?.user_metadata?.full_name || "",
    email: user?.email || ""
  });
  const [updateLoading, setUpdateLoading] = useState(false);

  const updateProfile = async () => {
    setUpdateLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: profile.fullName }
      });

      if (error) throw error;

      toast({
        title: t('settings.profileUpdated'),
        description: t('settings.profileUpdatedDesc'),
      });
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: t('errors.updateError'),
        variant: "destructive"
      });
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <div className="ft-card">
      <div className="ft-card-head">
        <div>
          <div className="flex items-center gap-2">
            <div className="ft-kpi-icon acc">
              <User className="h-[15px] w-[15px]" />
            </div>
            <h3 className="ft-card-title text-base">{t('settings.profile')}</h3>
          </div>
          <p className="ft-card-sub mt-1">{t('settings.modifyInfo')}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="text-xs">{t('settings.fullName')}</Label>
          <Input
            id="fullName"
            value={profile.fullName}
            onChange={(e) => setProfile(prev => ({ ...prev, fullName: e.target.value }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">{t('settings.email')}</Label>
          <Input
            id="email"
            value={profile.email}
            disabled
            className="bg-bg-subtle h-9 text-sm"
          />
        </div>
      </div>
      <Button onClick={updateProfile} disabled={updateLoading} size="sm" className="mt-4 h-8 text-sm">
        {updateLoading ? t('settings.updating') : t('settings.updateProfile')}
      </Button>
    </div>
  );
};
