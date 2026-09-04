import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { addWeeks, addMonths, addYears, format } from "https://esm.sh/date-fns@3.6.0";
import { fr } from "https://esm.sh/date-fns@3.6.0/locale";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function resolveNamePlaceholders(template: string, date: Date): string {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const month = capitalize(format(date, 'MMMM', { locale: fr }));
  return template
    .replace(/\{MOIS\}/gi, month)
    .replace(/\{MONTH\}/gi, month)
    .replace(/\{MM\}/g, format(date, 'MM'))
    .replace(/\{ANNEE\}/gi, format(date, 'yyyy'))
    .replace(/\{YEAR\}/gi, format(date, 'yyyy'))
    .replace(/\{YY\}/g, format(date, 'yy'))
    .replace(/\{JOUR\}/gi, format(date, 'dd'))
    .replace(/\{DAY\}/gi, format(date, 'dd'));
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
          await supabase
            .from('recurring_transactions')
            .update({ is_active: false })
            .eq('id', recurring.id);
          continue;
        }

        console.log(`Processing recurring transaction: ${recurring.description}`);

        // Resolve effective amount/type for installment-linked
        let effectiveAmount = Number(recurring.amount);
        let effectiveType = recurring.type;
        let installmentRecords: any[] = [];

        if (recurring.installment_payment_id) {
          const { data: ipData } = await supabase
            .from('installment_payments')
            .select('*')
            .eq('id', recurring.installment_payment_id)
            .single();
          if (ipData) {
            effectiveType = 'expense';
            effectiveAmount = Number(ipData.installment_amount);
          }
          // Personalized schedule: when records exist they override the
          // uniform installment_amount + frequency loop. Each unpaid
          // record is materialized at its own scheduled_date + amount.
          const { data: ipRecords } = await supabase
            .from('installment_payment_records')
            .select('*')
            .eq('installment_payment_id', recurring.installment_payment_id)
            .eq('user_id', recurring.user_id)
            .order('scheduled_date', { ascending: true });
          installmentRecords = ipRecords || [];
        }

        // Fetch debt scheduled payments once (used for all occurrences)
        let debtScheduledPayments: any[] = [];
        let debtPaymentAmount = 0;
        if (recurring.debt_id) {
          const { data: spData } = await supabase
            .from('scheduled_debt_payments')
            .select('*')
            .eq('debt_id', recurring.debt_id)
            .eq('user_id', recurring.user_id)
            .order('scheduled_date', { ascending: true });
          debtScheduledPayments = spData || [];

          const { data: debtData } = await supabase
            .from('debts')
            .select('payment_amount')
            .eq('id', recurring.debt_id)
            .single();
          if (debtData?.payment_amount) debtPaymentAmount = Number(debtData.payment_amount);
        }

        // Multi-occurrence catch-up loop: process all overdue occurrences.
        //
        // Two iteration modes:
        //   - Records mode (custom schedule): walk installment_payment_records
        //     in order; each unpaid record on/before today is materialized
        //     at its own scheduled_date + scheduled_amount.
        //   - Frequency mode (uniform plan, or no plan at all): advance
        //     currentDueDate by recurrence_type each step.
        const useRecords = installmentRecords.length > 0;
        let currentDueDate = recurring.next_due_date;
        let recordIdx = 0;
        let occurrencesProcessed = 0;
        const maxOccurrences = 12;

        while (occurrencesProcessed < maxOccurrences) {
          // Resolve this iteration's date + base amount.
          let iterDate: string;
          let iterAmount = effectiveAmount;
          let matchingRecord: any = null;

          if (useRecords) {
            // Skip records already paid (e.g. processed in a prior run).
            while (recordIdx < installmentRecords.length && installmentRecords[recordIdx].is_paid) {
              recordIdx++;
            }
            if (recordIdx >= installmentRecords.length) break;
            const rec = installmentRecords[recordIdx];
            if (String(rec.scheduled_date) > today) break;
            iterDate = String(rec.scheduled_date);
            iterAmount = Number(rec.scheduled_amount);
            matchingRecord = rec;
          } else {
            if (currentDueDate > today) break;
            if (recurring.end_date && currentDueDate > recurring.end_date) break;
            iterDate = currentDueDate;
          }

          // Deduplication: skip if the occurrence was already materialised.
          //
          // A generated row carries transaction_date = value_date = its
          // occurrence date. Matching on transaction_date alone breaks as
          // soon as the user re-dates a past occurrence forward: an August
          // row moved to an accounting date of 2 September made the run
          // believe the September occurrence already existed, so it was
          // never created and next_due_date still advanced. Requiring BOTH
          // dates to equal the occurrence date identifies the untouched
          // generated row and nothing else.
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('user_id', recurring.user_id)
            .eq('recurring_transaction_id', recurring.id)
            .eq('transaction_date', iterDate)
            .eq('value_date', iterDate)
            .limit(1);


          if (existingTx && existingTx.length > 0) {
            occurrencesProcessed++;
            if (useRecords) {
              // Mark the record paid even though the tx already exists
              // (keeps the records' is_paid flag aligned with reality).
              if (matchingRecord && !matchingRecord.is_paid) {
                await supabase
                  .from('installment_payment_records')
                  .update({ is_paid: true, paid_date: iterDate, transaction_id: existingTx[0].id })
                  .eq('id', matchingRecord.id)
                  .eq('user_id', recurring.user_id);
                matchingRecord.is_paid = true;
              }
              recordIdx++;
            } else {
              currentDueDate = advanceDate(currentDueDate, recurring.recurrence_type);
            }
            continue;
          }

          // Resolve debt-linked amount per occurrence (debt linkage only
          // applies in frequency mode; debt-linked plans don't use
          // installment records).
          let occurrenceAmount = iterAmount;
          let skipTransaction = false;
          let scheduledPrincipal = 0;
          let scheduledInterest = 0;
          let matchingScheduledDebtPayment: any = null;

          if (!useRecords && recurring.debt_id && debtScheduledPayments.length > 0) {
            const monthKey = iterDate.substring(0, 7);
            const scheduled = debtScheduledPayments.find(
              (sp: any) => String(sp.scheduled_date).substring(0, 7) === monthKey
            );
            if (scheduled) {
              if (scheduled.is_paid) {
                skipTransaction = true;
              } else {
                occurrenceAmount = Number(scheduled.scheduled_amount);
                scheduledPrincipal = Number(scheduled.principal_amount) || 0;
                scheduledInterest = Number(scheduled.interest_amount) || 0;
                matchingScheduledDebtPayment = scheduled;
              }
            } else if (debtPaymentAmount > 0) {
              occurrenceAmount = debtPaymentAmount;
            }
          }

          if (!skipTransaction) {
            const { data: newTx, error: transactionError } = await supabase
              .from('transactions')
              .insert({
                description: `${resolveNamePlaceholders(recurring.description, new Date(iterDate + 'T12:00:00'))} (Récurrence automatique)`,
                amount: occurrenceAmount,
                type: effectiveType,
                account_id: recurring.account_id,
                category_id: recurring.category_id,
                transaction_date: iterDate,
                value_date: iterDate,
                user_id: recurring.user_id,
                installment_payment_id: recurring.installment_payment_id || null,
                recurring_transaction_id: recurring.id,
              })
              .select('id')
              .single();

            if (transactionError) {
              console.error(`Error creating transaction for recurring ${recurring.id} on ${iterDate}:`, transactionError);
              errorCount++;
              break;
            }

            // Mark the installment record as paid + link the transaction.
            if (matchingRecord) {
              await supabase
                .from('installment_payment_records')
                .update({
                  is_paid: true,
                  paid_date: iterDate,
                  actual_amount: occurrenceAmount,
                  transaction_id: newTx?.id ?? null,
                })
                .eq('id', matchingRecord.id)
                .eq('user_id', recurring.user_id);
              matchingRecord.is_paid = true;
            }

            // For debt-linked: mark scheduled payment as paid + record debt_payment
            if (recurring.debt_id && matchingScheduledDebtPayment) {
              await supabase
                .from('scheduled_debt_payments')
                .update({
                  is_paid: true,
                  paid_date: iterDate,
                  actual_amount: occurrenceAmount,
                })
                .eq('id', matchingScheduledDebtPayment.id)
                .eq('user_id', recurring.user_id);
              matchingScheduledDebtPayment.is_paid = true;

              await supabase
                .from('debt_payments')
                .insert({
                  debt_id: recurring.debt_id,
                  user_id: recurring.user_id,
                  amount: occurrenceAmount,
                  principal_amount: scheduledPrincipal,
                  interest_amount: scheduledInterest,
                  payment_date: iterDate,
                  notes: `Récurrence automatique: ${recurring.description}`,
                });
            }
          }

          occurrencesProcessed++;
          if (useRecords) {
            recordIdx++;
          } else {
            currentDueDate = advanceDate(currentDueDate, recurring.recurrence_type);
          }
        }

        // For records-mode plans, the next due date is the next unpaid
        // record's scheduled_date (or far-future when the schedule is
        // fully consumed).
        if (useRecords) {
          const nextUnpaid = installmentRecords.find((r: any) => !r.is_paid);
          currentDueDate = nextUnpaid ? String(nextUnpaid.scheduled_date) : '9999-12-31';
        }

        // Update next_due_date to the next unprocessed occurrence
        const { error: updateError } = await supabase
          .from('recurring_transactions')
          .update({ next_due_date: currentDueDate })
          .eq('id', recurring.id);

        if (updateError) {
          console.error(`Error updating next due date for recurring ${recurring.id}:`, updateError);
          errorCount++;
          continue;
        }

        // Update installment payment remaining amount + deactivate if fully paid
        if (recurring.installment_payment_id && occurrencesProcessed > 0) {
          const { data: installmentPayment, error: fetchInstallmentError } = await supabase
            .from('installment_payments')
            .select('remaining_amount, total_amount, is_active')
            .eq('id', recurring.installment_payment_id)
            .single();

          if (fetchInstallmentError) {
            console.error(`Error fetching installment payment ${recurring.installment_payment_id}:`, fetchInstallmentError);
          } else if (installmentPayment) {
            // Recalculate from actual linked transactions
            const { data: linkedTxs } = await supabase
              .from('transactions')
              .select('amount')
              .eq('installment_payment_id', recurring.installment_payment_id)
              .eq('user_id', recurring.user_id);

            const totalPaid = (linkedTxs || []).reduce(
              (sum: number, tx: any) => sum + Number(tx.amount), 0
            );
            const newRemaining = Math.max(0, Number(installmentPayment.total_amount) - totalPaid);

            const installmentUpdate: any = {
              remaining_amount: newRemaining,
              next_payment_date: currentDueDate,
            };

            if (newRemaining <= 0) {
              installmentUpdate.is_active = false;
              console.log(`Installment payment ${recurring.installment_payment_id} is now fully paid`);
              // H6: Deactivate the recurring transaction when installment is fully paid
              await supabase
                .from('recurring_transactions')
                .update({ is_active: false })
                .eq('id', recurring.id);
            }

            await supabase
              .from('installment_payments')
              .update(installmentUpdate)
              .eq('id', recurring.installment_payment_id);
          }
        }

        // Recalculate debt remaining if linked
        if (recurring.debt_id && occurrencesProcessed > 0) {
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

        processedCount += occurrencesProcessed;
        if (occurrencesProcessed > 0) {
          processedTransactions.push({
            id: recurring.id,
            description: recurring.description,
            amount: recurring.amount,
            type: recurring.type,
            occurrences: occurrencesProcessed,
            nextDueDate: currentDueDate,
          });
        }

        console.log(`Successfully processed ${occurrencesProcessed} occurrence(s) for: ${recurring.description}`);

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