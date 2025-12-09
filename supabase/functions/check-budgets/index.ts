import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { startOfMonth, endOfMonth } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret for authentication
  const authHeader = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!authHeader || authHeader !== expectedSecret) {
    console.error("Unauthorized access attempt to check-budgets");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    console.log("Starting budget check...");

    // Initialize Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get all users with budget alerts enabled
    const { data: usersWithNotifs, error: usersError } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id')
      .eq('budget_alerts', true);

    if (usersError) {
      console.error("Error fetching notification preferences:", usersError);
      throw usersError;
    }

    // Fetch emails from auth.users for each user
    const usersWithEmails = await Promise.all(
      (usersWithNotifs || []).map(async (pref) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(pref.user_id);
        return {
          user_id: pref.user_id,
          email: authUser?.user?.email || null
        };
      })
    );

    const validUsers = usersWithEmails.filter(u => u.email);

    console.log(`Found ${validUsers.length} users with budget alerts enabled`);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const currentMonth = monthStart.toISOString().split('T')[0]; // YYYY-MM-01 format

    for (const userPref of validUsers) {
      try {
        // Get user's categories with budgets
        const { data: categories, error: categoriesError } = await supabaseAdmin
          .from('categories')
          .select('id, name, budget, user_id')
          .eq('user_id', userPref.user_id)
          .not('budget', 'is', null);

        if (categoriesError || !categories || categories.length === 0) {
          continue;
        }

        // Check each category
        for (const category of categories) {
          // Check if alert was already sent for this category this month
          const { data: existingAlert } = await supabaseAdmin
            .from('notification_logs')
            .select('id')
            .eq('user_id', userPref.user_id)
            .eq('category_id', category.id)
            .eq('notification_type', 'budget_alert')
            .eq('alert_month', currentMonth)
            .eq('status', 'sent')
            .limit(1)
            .single();

          if (existingAlert) {
            console.log(`Budget alert already sent this month for user ${userPref.user_id}, category ${category.name}`);
            continue; // Skip this category, alert already sent
          }

          // Get total spent in this category this month (using accounting date)
          const { data: transactions, error: transactionsError } = await supabaseAdmin
            .from('transactions')
            .select('amount')
            .eq('user_id', userPref.user_id)
            .eq('category_id', category.id)
            .eq('type', 'expense')
            .gte('transaction_date', monthStart.toISOString().split('T')[0])
            .lte('transaction_date', monthEnd.toISOString().split('T')[0]);

          if (transactionsError) {
            console.error(`Error fetching transactions for category ${category.id}:`, transactionsError);
            continue;
          }

          const totalSpent = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
          const budget = Number(category.budget);

          // If budget is exceeded, send alert
          if (totalSpent > budget) {
            const overspent = totalSpent - budget;
            
            console.log(`Budget exceeded for user ${userPref.user_id}, category ${category.name}: ${totalSpent}€ / ${budget}€`);

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
                  type: 'budget_alert',
                  categoryId: category.id,
                  alertMonth: currentMonth,
                  data: {
                    categoryName: category.name,
                    budget: budget.toFixed(2),
                    spent: totalSpent.toFixed(2),
                    overspent: overspent.toFixed(2)
                  }
                })
              }
            );

            if (!response.ok) {
              console.error(`Failed to send notification for user ${userPref.user_id}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing user ${userPref.user_id}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({ message: "Budget check completed successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in check-budgets function:", error);
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
