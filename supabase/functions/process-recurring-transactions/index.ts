import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { addWeeks, addMonths, addYears } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret for authentication
  const authHeader = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!authHeader || authHeader !== expectedSecret) {
    console.error("Unauthorized access attempt to process-recurring-transactions");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Safe date advancement using date-fns (avoids timezone bugs with setMonth)
    const advanceDate = (dateStr: string, recurrenceType: string): string => {
      // Parse as local date parts to avoid UTC shift
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      let next: Date;
      switch (recurrenceType) {
        case 'weekly': next = addWeeks(date, 1); break;
        case 'monthly': next = addMonths(date, 1); break;
        case 'quarterly': next = addMonths(date, 3); break;
        case 'yearly': next = addYears(date, 1); break;
        default: next = addMonths(date, 1);
      }
      const ny = next.getFullYear();
      const nm = String(next.getMonth() + 1).padStart(2, '0');
      const nd = String(next.getDate()).padStart(2, '0');
      return `${ny}-${nm}-${nd}`;
    };

    console.log('Starting recurring transactions processing...');

    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Find all active recurring transactions that are due today or overdue
    const { data: dueTransactions, error: fetchError } = await supabase
      .from('recurring_transactions')
      .select(`
        *,
        account:accounts(id, name, balance),
        category:categories(id, name)
      `)
      .eq('is_active', true)
      .lte('next_due_date', today);

    if (fetchError) {
      console.error('Error fetching due transactions:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${dueTransactions?.length || 0} due transactions`);

    let processedCount = 0;
    let errorCount = 0;
    const processedTransactions = [];

    for (const recurring of dueTransactions || []) {
      try {
        // Check if end_date has passed
        if (recurring.end_date && recurring.end_date < today) {
          console.log(`Deactivating expired recurring transaction: ${recurring.description}`);
          
          // Deactivate the recurring transaction
          await supabase
            .from('recurring_transactions')
            .update({ is_active: false })
            .eq('id', recurring.id);
          
          continue;
        }

        console.log(`Processing recurring transaction: ${recurring.description}`);

        // Resolve effective amount/type for debt- or installment-linked recurrings
        let effectiveAmount = Number(recurring.amount);
        let effectiveType = recurring.type;
        let scheduledPrincipal = 0;
        let scheduledInterest = 0;
        let matchingScheduledDebtPayment: any = null;
        let skipTransaction = false;

        if (recurring.installment_payment_id) {
          const { data: ipData } = await supabase
            .from('installment_payments')
            .select('*')
            .eq('id', recurring.installment_payment_id)
            .single();
          if (ipData) {
            effectiveType = ipData.payment_type === 'reimbursement' ? 'income' : 'expense';
            effectiveAmount = Number(ipData.installment_amount);
          }
        } else if (recurring.debt_id) {
          // Use the scheduled_debt_payment matching this month's amount + principal/interest split
          const monthKey = String(recurring.next_due_date).substring(0, 7);
          const { data: spData } = await supabase
            .from('scheduled_debt_payments')
            .select('*')
            .eq('debt_id', recurring.debt_id)
            .eq('user_id', recurring.user_id)
            .order('scheduled_date', { ascending: true });
          const scheduled = (spData || []).find(
            (sp: any) => String(sp.scheduled_date).substring(0, 7) === monthKey
          );
          if (scheduled) {
            if (scheduled.is_paid) {
              skipTransaction = true;
            } else {
              effectiveAmount = Number(scheduled.scheduled_amount);
              scheduledPrincipal = Number(scheduled.principal_amount) || 0;
              scheduledInterest = Number(scheduled.interest_amount) || 0;
              matchingScheduledDebtPayment = scheduled;
            }
          } else {
            const { data: debtData } = await supabase
              .from('debts')
              .select('payment_amount')
              .eq('id', recurring.debt_id)
              .single();
            if (debtData?.payment_amount) {
              effectiveAmount = Number(debtData.payment_amount);
            }
          }
        }

        // Deduplication: check if a transaction already exists for this recurring + date
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', recurring.user_id)
          .eq('account_id', recurring.account_id)
          .eq('transaction_date', recurring.next_due_date)
          .eq('amount', effectiveAmount)
          .ilike('description', `${recurring.description} (Récurrence automatique)`)
          .limit(1);

        if (existingTx && existingTx.length > 0) {
          console.log(`Skipping duplicate: transaction already exists for ${recurring.description} on ${recurring.next_due_date}`);
          const skipNextDate = advanceDate(recurring.next_due_date, recurring.recurrence_type);
          await supabase
            .from('recurring_transactions')
            .update({ next_due_date: skipNextDate })
            .eq('id', recurring.id);
          continue;
        }

        if (!skipTransaction) {
          // Create the actual transaction
          const { error: transactionError } = await supabase
            .from('transactions')
            .insert({
              description: `${recurring.description} (Récurrence automatique)`,
              amount: effectiveAmount,
              type: effectiveType,
              account_id: recurring.account_id,
              category_id: recurring.category_id,
              transaction_date: recurring.next_due_date,
              user_id: recurring.user_id,
              installment_payment_id: recurring.installment_payment_id || null,
              recurring_transaction_id: recurring.id,
            });

          if (transactionError) {
            console.error(`Error creating transaction for recurring ${recurring.id}:`, transactionError);
            errorCount++;
            continue;
          }

          // For debt-linked: mark scheduled payment as paid + record debt_payment
          if (recurring.debt_id && matchingScheduledDebtPayment) {
            await supabase
              .from('scheduled_debt_payments')
              .update({
                is_paid: true,
                paid_date: recurring.next_due_date,
                actual_amount: effectiveAmount,
              })
              .eq('id', matchingScheduledDebtPayment.id)
              .eq('user_id', recurring.user_id);

            await supabase
              .from('debt_payments')
              .insert({
                debt_id: recurring.debt_id,
                user_id: recurring.user_id,
                amount: effectiveAmount,
                principal_amount: scheduledPrincipal,
                interest_amount: scheduledInterest,
                payment_date: recurring.next_due_date,
                notes: `Récurrence automatique: ${recurring.description}`,
              });
          }
        }

        // Calculate next due date using date-fns (timezone-safe)
        const nextDueDateStr = advanceDate(recurring.next_due_date, recurring.recurrence_type);

        // Update the next due date
        const { error: updateError } = await supabase
          .from('recurring_transactions')
          .update({ next_due_date: nextDueDateStr })
          .eq('id', recurring.id);

        if (updateError) {
          console.error(`Error updating next due date for recurring ${recurring.id}:`, updateError);
          errorCount++;
          continue;
        }

        // If this recurring transaction is linked to an installment payment, update the remaining amount
        if (recurring.installment_payment_id && !skipTransaction) {
          console.log(`Updating installment payment ${recurring.installment_payment_id} for recurring ${recurring.id}`);

          // Get current installment payment
          const { data: installmentPayment, error: fetchInstallmentError } = await supabase
            .from('installment_payments')
            .select('remaining_amount, is_active')
            .eq('id', recurring.installment_payment_id)
            .single();

          if (fetchInstallmentError) {
            console.error(`Error fetching installment payment ${recurring.installment_payment_id}:`, fetchInstallmentError);
          } else if (installmentPayment) {
            // Calculate new remaining amount
            const newRemainingAmount = installmentPayment.remaining_amount - Math.abs(effectiveAmount);

            // Update installment payment (remaining amount + next_payment_date)
            const installmentUpdate: any = {
              remaining_amount: Math.max(0, newRemainingAmount),
              next_payment_date: nextDueDateStr,
            };

            // If fully paid, deactivate the installment payment
            if (newRemainingAmount <= 0) {
              installmentUpdate.is_active = false;
              console.log(`Installment payment ${recurring.installment_payment_id} is now fully paid`);
            }

            const { error: updateInstallmentError } = await supabase
              .from('installment_payments')
              .update(installmentUpdate)
              .eq('id', recurring.installment_payment_id);

            if (updateInstallmentError) {
              console.error(`Error updating installment payment ${recurring.installment_payment_id}:`, updateInstallmentError);
            } else {
              console.log(`Successfully updated installment payment ${recurring.installment_payment_id}, new remaining: ${Math.max(0, newRemainingAmount)}`);
            }
          }
        }

        // If debt-linked, recalculate debt.remaining_amount from the sum of principal_amount on debt_payments
        if (recurring.debt_id && !skipTransaction) {
          const { data: debtPaymentsData } = await supabase
            .from('debt_payments')
            .select('principal_amount')
            .eq('debt_id', recurring.debt_id)
            .eq('user_id', recurring.user_id);

          const { data: debtRow } = await supabase
            .from('debts')
            .select('total_amount')
            .eq('id', recurring.debt_id)
            .single();

          if (debtRow) {
            const totalPrincipalPaid = (debtPaymentsData || []).reduce(
              (sum: number, p: any) => sum + (Number(p.principal_amount) || 0),
              0
            );
            const newRemaining = Math.max(0, Number(debtRow.total_amount) - totalPrincipalPaid);
            const debtUpdate: any = { remaining_amount: newRemaining };
            if (newRemaining <= 0) debtUpdate.status = 'completed';
            await supabase
              .from('debts')
              .update(debtUpdate)
              .eq('id', recurring.debt_id);

            if (newRemaining <= 0) {
              await supabase
                .from('recurring_transactions')
                .update({ is_active: false })
                .eq('id', recurring.id);
            }
          }
        }

        processedCount++;
        processedTransactions.push({
          id: recurring.id,
          description: recurring.description,
          amount: recurring.amount,
          type: recurring.type,
          nextDueDate: nextDueDateStr
        });

        console.log(`Successfully processed recurring transaction: ${recurring.description}`);

      } catch (error) {
        console.error(`Error processing recurring transaction ${recurring.id}:`, error);
        errorCount++;
      }
    }

    const result = {
      success: true,
      message: `Processed ${processedCount} recurring transactions`,
      processedCount,
      errorCount,
      processedTransactions,
      processedAt: new Date().toISOString()
    };

    console.log('Recurring transactions processing completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
      status: 200,
    });

  } catch (error) {
    console.error('Error in process-recurring-transactions:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 500,
      }
    );
  }
});