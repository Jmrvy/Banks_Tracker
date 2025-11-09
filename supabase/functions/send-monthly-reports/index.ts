import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { startOfMonth, endOfMonth, subMonths, format } from "https://esm.sh/date-fns@3.6.0";
import { fr } from "https://esm.sh/date-fns@3.6.0/locale";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting monthly reports generation...");

    // Initialize Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get all users with monthly reports enabled
    const { data: usersWithNotifs, error: usersError } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, email')
      .eq('monthly_reports', true);

    if (usersError) {
      console.error("Error fetching notification preferences:", usersError);
      throw usersError;
    }

    console.log(`Found ${usersWithNotifs?.length || 0} users with monthly reports enabled`);

    // Calculate last month's period
    const now = new Date();
    const lastMonth = subMonths(now, 1);
    const monthStart = startOfMonth(lastMonth);
    const monthEnd = endOfMonth(lastMonth);
    const periodLabel = format(lastMonth, 'MMMM yyyy', { locale: fr });

    for (const userPref of usersWithNotifs || []) {
      try {
        // Get user's accounts
        const { data: accounts, error: accountsError } = await supabaseAdmin
          .from('accounts')
          .select('id, balance')
          .eq('user_id', userPref.user_id);

        if (accountsError) {
          console.error(`Error fetching accounts for user ${userPref.user_id}:`, accountsError);
          continue;
        }

        // Get transactions for last month (using accounting date)
        const { data: transactions, error: transactionsError } = await supabaseAdmin
          .from('transactions')
          .select('amount, type')
          .eq('user_id', userPref.user_id)
          .gte('transaction_date', monthStart.toISOString().split('T')[0])
          .lte('transaction_date', monthEnd.toISOString().split('T')[0]);

        if (transactionsError) {
          console.error(`Error fetching transactions for user ${userPref.user_id}:`, transactionsError);
          continue;
        }

        // Calculate totals
        const income = transactions
          ?.filter(t => t.type === 'income')
          .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        const expenses = transactions
          ?.filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

        const totalBalance = accounts?.reduce((sum, a) => sum + Number(a.balance), 0) || 0;

        console.log(`Sending monthly report to user ${userPref.user_id}`);

        // Call send-notification-email function
        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              'x-function-secret': Deno.env.get("FUNCTION_SECRET") || "",
            },
            body: JSON.stringify({
              userId: userPref.user_id,
              type: 'monthly_report',
              data: {
                period: periodLabel,
                income: income.toFixed(2),
                expenses: expenses.toFixed(2),
                balance: totalBalance.toFixed(2)
              }
            })
          }
        );

        if (!response.ok) {
          console.error(`Failed to send monthly report for user ${userPref.user_id}`);
        }
      } catch (error) {
        console.error(`Error processing user ${userPref.user_id}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({ message: "Monthly reports sent successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-monthly-reports function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
