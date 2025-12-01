import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

        // Create the actual transaction
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            description: `${recurring.description} (Récurrence automatique)`,
            amount: recurring.amount,
            type: recurring.type,
            account_id: recurring.account_id,
            category_id: recurring.category_id,
            transaction_date: recurring.next_due_date,
            user_id: recurring.user_id
          });

        if (transactionError) {
          console.error(`Error creating transaction for recurring ${recurring.id}:`, transactionError);
          errorCount++;
          continue;
        }

        // Calculate next due date
        const currentDueDate = new Date(recurring.next_due_date);
        let nextDueDate = new Date(currentDueDate);

        switch (recurring.recurrence_type) {
          case 'weekly':
            nextDueDate.setDate(currentDueDate.getDate() + 7);
            break;
          case 'monthly':
            nextDueDate.setMonth(currentDueDate.getMonth() + 1);
            break;
          case 'quarterly':
            nextDueDate.setMonth(currentDueDate.getMonth() + 3);
            break;
          case 'yearly':
            nextDueDate.setFullYear(currentDueDate.getFullYear() + 1);
            break;
        }

        // Update the next due date
        const { error: updateError } = await supabase
          .from('recurring_transactions')
          .update({ 
            next_due_date: nextDueDate.toISOString().split('T')[0]
          })
          .eq('id', recurring.id);

        if (updateError) {
          console.error(`Error updating next due date for recurring ${recurring.id}:`, updateError);
          errorCount++;
          continue;
        }

        // If this recurring transaction is linked to an installment payment, update the remaining amount
        if (recurring.installment_payment_id) {
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
            const newRemainingAmount = installmentPayment.remaining_amount - Math.abs(recurring.amount);
            
            // Update installment payment
            const installmentUpdate: any = {
              remaining_amount: Math.max(0, newRemainingAmount)
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

        processedCount++;
        processedTransactions.push({
          id: recurring.id,
          description: recurring.description,
          amount: recurring.amount,
          type: recurring.type,
          nextDueDate: nextDueDate.toISOString().split('T')[0]
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