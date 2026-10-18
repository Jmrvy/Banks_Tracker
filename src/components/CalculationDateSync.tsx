import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";

/**
 * Calculations, emails, budget alerts and the MCP tools share one date.
 *
 * The calculation date lives in `userPreferences.dateType`. The server
 * column `notification_preferences.date_type` is what the scheduled jobs
 * and MCP read. A Notifications-only edit used to leave the column ahead
 * of the calculation date, and the next Preferences change was the only
 * thing that pulled it back. This reads the column and overwrites it
 * whenever it disagrees, so the calculation date wins on every signed-in
 * visit and on every change of that preference.
 */
export function CalculationDateSync() {
  const { user } = useAuth();
  const { preferences } = useUserPreferences();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const dateType = preferences.dateType;

    void (async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("date_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || error) return;
      const server = (data as { date_type?: string } | null)?.date_type;
      if (server === dateType) return;

      const { error: writeError } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: user.id, date_type: dateType }, { onConflict: "user_id" });
      if (cancelled || writeError) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [user, preferences.dateType]);

  return null;
}
