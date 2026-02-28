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
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 sm:h-5 sm:w-5" />
          <CardTitle className="text-sm sm:text-base">{t('settings.profile')}</CardTitle>
        </div>
        <CardDescription className="text-xs sm:text-sm hidden sm:block">
          {t('settings.modifyInfo')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="fullName" className="text-xs sm:text-sm">{t('settings.fullName')}</Label>
            <Input
              id="fullName"
              value={profile.fullName}
              onChange={(e) => setProfile(prev => ({ ...prev, fullName: e.target.value }))}
              className="h-8 sm:h-10 text-xs sm:text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="email" className="text-xs sm:text-sm">{t('settings.email')}</Label>
            <Input
              id="email"
              value={profile.email}
              disabled
              className="bg-muted h-8 sm:h-10 text-xs sm:text-sm"
            />
          </div>
        </div>
        <Button onClick={updateProfile} disabled={updateLoading} className="w-full sm:w-auto h-8 sm:h-10 text-xs sm:text-sm">
          {updateLoading ? t('settings.updating') : t('settings.updateProfile')}
        </Button>
      </CardContent>
    </Card>
  );
};
