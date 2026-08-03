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
        // Get user's date type preference
        const { data: notifPref } = await supabaseAdmin
          .from('notification_preferences')
          .select('date_type')
          .eq('user_id', userPref.user_id)
          .single();
        
        const dateType = notifPref?.date_type || 'accounting';
        const dateColumn = dateType === 'value' ? 'value_date' : 'transaction_date';

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

          // Get daily transactions for this category this month (for chart + total).
          // Pull `refunded_amount` so we can net it out — a fully-refunded
          // expense should not count toward the budget.
          //
          // `special_budget_id IS NULL`: transactions tagged to a special
          // (event/trip) budget live in their own envelope and are
          // deliberately excluded from category-budget aggregation
          // everywhere in the app — so a trip's restaurant bills must not
          // trip the monthly Restaurants alert. Mirror that here.
          const { data: transactions, error: transactionsError } = await supabaseAdmin
            .from('transactions')
            .select('amount, refunded_amount, transaction_date, value_date, description, recurring_transaction_id, installment_payment_id')
            .eq('user_id', userPref.user_id)
            .eq('category_id', category.id)
            .eq('type', 'expense')
            .eq('include_in_stats', true)
            .is('special_budget_id', null)
            .gte(dateColumn, monthStart.toISOString().split('T')[0])
            .lte(dateColumn, monthEnd.toISOString().split('T')[0])
            .order(dateColumn, { ascending: true });

          if (transactionsError) {
            console.error(`Error fetching transactions for category ${category.id}:`, transactionsError);
            continue;
          }

          // Net amount per transaction = original - refunded (clamped to 0).
          const netOf = (t: any) => Number(t.amount) - Number(t.refunded_amount || 0);

          let totalSpent = transactions?.reduce((sum, t) => sum + netOf(t), 0) || 0;

          // Income that says it came back on this category comes off the
          // total, the same way the budget page counts it. Alerting on a
          // figure the app does not show is how a user gets warned about a
          // breach their own screen says did not happen.
          //
          // Only rows carrying the flag: a category holds both directions, so
          // most income filed on one is earnings and netting it would let a
          // salary cancel a budget. Linked refunds are excluded because they
          // are already inside refunded_amount above.
          const { data: offsetTxs, error: offsetError } = await supabaseAdmin
            .from('transactions')
            .select('amount, repaid_amount')
            .eq('user_id', userPref.user_id)
            .eq('category_id', category.id)
            .eq('type', 'income')
            .eq('offsets_category', true)
            .eq('include_in_stats', true)
            .is('refund_of_transaction_id', null)
            .gte(dateColumn, monthStart.toISOString().split('T')[0])
            .lte(dateColumn, monthEnd.toISOString().split('T')[0]);

          if (offsetError) {
            console.error(`Error fetching offsetting income for category ${category.id}:`, offsetError);
            continue;
          }
          for (const t of offsetTxs ?? []) {
            totalSpent -= Number(t.amount) - Number((t as any).repaid_amount || 0);
          }

          const budget = Number(category.budget);

          // Build cumulative daily series for the SVG chart — uses net spend
          // so the breach plot mirrors the same total we alert on.
          const dailyData: { date: string; cumulative: number }[] = [];
          let cumulative = 0;
          for (const t of (transactions || [])) {
            cumulative += netOf(t);
            const txDate = dateType === 'value' ? (t.value_date || t.transaction_date) : t.transaction_date;
            const existing = dailyData.find(d => d.date === txDate);
            if (existing) {
              existing.cumulative = cumulative;
            } else {
              dailyData.push({ date: txDate, cumulative });
            }
          }

          // If budget is exceeded, send alert
          if (totalSpent > budget) {
            const overspent = totalSpent - budget;

            console.log(`Budget exceeded for user ${userPref.user_id}, category ${category.name}: ${totalSpent}€ / ${budget}€`);

            // Call send-notification-email — no ANON_KEY needed, uses function secret only
            const response = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
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
                    overspent: overspent.toFixed(2),
                    // Pace context for the new "day X of Y" treatment.
                    dayOfMonth: now.getDate(),
                    daysInMonth: monthEnd.getDate(),
                    // Locale-neutral: the email function formats the month
                    // in the recipient's language. (It used to arrive here
                    // pre-formatted as French, which leaked into English
                    // emails.)
                    monthIso: currentMonth,
                    transactionCount: (transactions || []).length,
                    dailyData,
                    // Top drivers — sort by *net* amount descending, take 5.
                    // Surface the *net* amount (after any partial refund) so the
                    // numbers in the email match the budget total above.
                    recentTransactions: [...(transactions || [])]
                      .sort((a, b) => netOf(b) - netOf(a))
                      .slice(0, 5)
                      .map(t => ({
                        date: dateType === 'value' ? ((t as any).value_date || t.transaction_date) : t.transaction_date,
                        description: t.description,
                        amount: netOf(t).toFixed(2),
                        // Recurring vs. one-off tag — helps the user scan
                        // drivers without opening each one. Set only when
                        // the transaction is linked to a recurring schedule
                        // or an installment plan (both behave as repeats).
                        // A stable key, not display copy: the email function
                        // translates it.
                        tag: ((t as any).recurring_transaction_id || (t as any).installment_payment_id) ? 'recurring' : undefined,
                      }))
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
