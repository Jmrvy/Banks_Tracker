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
      .select('user_id, email')
      .eq('budget_alerts', true);

    if (usersError) {
      console.error("Error fetching notification preferences:", usersError);
      throw usersError;
    }

    console.log(`Found ${usersWithNotifs?.length || 0} users with budget alerts enabled`);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    for (const userPref of usersWithNotifs || []) {
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
