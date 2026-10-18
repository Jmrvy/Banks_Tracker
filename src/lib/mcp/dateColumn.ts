import type { SupabaseClient } from "@supabase/supabase-js";

export type LedgerDateColumn = "transaction_date" | "value_date";

/** The column emails, alerts and MCP can see. Preferences live in
 *  localStorage, which a server call cannot read; notification_preferences
 *  is the copy that follows the calculation setting. */
export function ledgerDateColumnFrom(dateType: string | null | undefined): LedgerDateColumn {
  return dateType === "value" ? "value_date" : "transaction_date";
}

export async function ledgerDateColumn(supabase: SupabaseClient): Promise<LedgerDateColumn> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("date_type")
    .maybeSingle();
  if (error || !data) return "transaction_date";
  return ledgerDateColumnFrom(data.date_type);
}
