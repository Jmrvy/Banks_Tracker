import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";

/** dateType last written to notification_preferences from this browser. */
const SYNCED_KEY = "calculationDateTypeSynced";

/**
 * Calculations read `userPreferences.dateType` from localStorage. Emails,
 * budget alerts and the MCP tools read `notification_preferences.date_type`.
 * Those are allowed to diverge after a Notifications-only edit, but a change
 * in Preferences — and the first signed-in visit after this ships — copies
 * the calculation choice across so the two start from the same convention.
 */
export function CalculationDateSync() {
  const { user } = useAuth();
  const { preferences } = useUserPreferences();

  useEffect(() => {
    if (!user) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(SYNCED_KEY);
    } catch {
      return;
    }
    if (last === preferences.dateType) return;

    let cancelled = false;
    void supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, date_type: preferences.dateType }, { onConflict: "user_id" })
      .then(({ error }) => {
        if (cancelled || error) return;
        try {
          localStorage.setItem(SYNCED_KEY, preferences.dateType);
        } catch {
          /* the row is written; the next mount retries the flag */
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, preferences.dateType]);

  return null;
}
