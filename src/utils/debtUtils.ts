import { supabase } from '@/integrations/supabase/client';

export const recalculateDebtRemaining = async (debtId: string, userId: string) => {
  const { data: allDebtPayments } = await supabase
    .from('debt_payments')
    .select('principal_amount')
    .eq('debt_id', debtId)
    .eq('user_id', userId);

  const { data: debtData } = await supabase
    .from('debts')
    .select('total_amount, status')
    .eq('id', debtId)
    .single();

  if (!debtData) return null;

  const totalPrincipalPaid = (allDebtPayments || []).reduce(
    (sum: number, dp: { principal_amount: number }) => sum + Number(dp.principal_amount), 0
  );
  const newRemaining = Math.max(0, debtData.total_amount - totalPrincipalPaid);

  const updates: Record<string, unknown> = { remaining_amount: newRemaining };
  if (newRemaining <= 0 && debtData.status !== 'completed') {
    updates.status = 'completed';
  } else if (newRemaining > 0 && debtData.status === 'completed') {
    updates.status = 'active';
  }

  await supabase
    .from('debts')
    .update(updates)
    .eq('id', debtId)
    .eq('user_id', userId);

  return { newRemaining, status: updates.status as string | undefined };
};
