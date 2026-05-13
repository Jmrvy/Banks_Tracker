import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addMonths, addQuarters, addWeeks, format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { AlertTriangle, Calculator, Lock, RefreshCw, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AmountInput } from '@/components/ui/amount-input';
import { useToast } from '@/hooks/use-toast';
import { roundCurrency } from '@/lib/currency';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import {
  useInstallmentPayments,
  InstallmentPayment,
  PlanDrift,
  PlanLockField,
} from '@/hooks/useInstallmentPayments';

interface Props {
  plan: InstallmentPayment;
}

const addInterval = (d: Date, freq: InstallmentPayment['frequency']): Date => {
  switch (freq) {
    case 'weekly':
      return addWeeks(d, 1);
    case 'quarterly':
      return addQuarters(d, 1);
    default:
      return addMonths(d, 1);
  }
};

export function AdjustPlanForm({ plan }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { applyPlanAdjustment, computePlanDrift, recalculateInstallmentPayment } =
    useInstallmentPayments();

  const [lockField, setLockField] = useState<PlanLockField>('amount');
  const [totalStr, setTotalStr] = useState(plan.total_amount.toString());
  const [amountStr, setAmountStr] = useState(plan.installment_amount.toString());
  const [countStr, setCountStr] = useState(
    plan.installment_amount > 0
      ? Math.max(1, Math.ceil(plan.remaining_amount / plan.installment_amount)).toString()
      : '1'
  );

  const [drift, setDrift] = useState<PlanDrift | null>(null);
  const [reconcileFirst, setReconcileFirst] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTotalStr(plan.total_amount.toString());
    setAmountStr(plan.installment_amount.toString());
    setCountStr(
      plan.installment_amount > 0
        ? Math.max(1, Math.ceil(plan.remaining_amount / plan.installment_amount)).toString()
        : '1'
    );
  }, [plan.id, plan.total_amount, plan.installment_amount, plan.remaining_amount]);

  useEffect(() => {
    let cancelled = false;
    computePlanDrift(plan.id).then((d) => {
      if (!cancelled) setDrift(d);
    });
    return () => {
      cancelled = true;
    };
  }, [plan.id, plan.total_amount, plan.remaining_amount, plan.installment_amount]);

  // Preview the constraint solver in-form so the user sees what will happen.
  const preview = useMemo(() => {
    const T = parseFloat(totalStr) || 0;
    const A = parseFloat(amountStr) || 0;
    const N = Math.max(1, Math.floor(parseFloat(countStr) || 0));
    const paid = reconcileFirst && drift ? drift.paidFromTxns : roundCurrency(
      plan.total_amount - plan.remaining_amount
    );

    let resolvedT = T;
    let resolvedA = A;
    let resolvedN = N;

    switch (lockField) {
      case 'total':
        resolvedT = T;
        if (A > 0) resolvedN = Math.max(1, Math.ceil((T - paid) / A));
        resolvedA = resolvedN > 0 ? roundCurrency((T - paid) / resolvedN) : 0;
        break;
      case 'amount':
        resolvedA = A;
        if (A > 0) resolvedN = Math.max(1, Math.ceil((T - paid) / A));
        resolvedT = roundCurrency(paid + resolvedN * A);
        break;
      case 'count':
        resolvedN = N;
        if (N > 0) resolvedA = roundCurrency((T - paid) / N);
        resolvedT = roundCurrency(paid + N * resolvedA);
        break;
    }

    const remaining = Math.max(0, roundCurrency(resolvedT - paid));
    const evenInstallment = resolvedN > 0 ? roundCurrency(remaining / resolvedN) : 0;
    const lastInstallment = roundCurrency(remaining - evenInstallment * (resolvedN - 1));
    const installmentsDiffer = Math.abs(lastInstallment - evenInstallment) > 0.01;

    // Project end date by walking the schedule from next_payment_date
    let endDate: Date | null = null;
    if (resolvedN > 0 && plan.next_payment_date) {
      let cur = parseISO(plan.next_payment_date);
      for (let i = 1; i < resolvedN; i++) cur = addInterval(cur, plan.frequency);
      endDate = cur;
    }

    return {
      paid,
      total: resolvedT,
      amount: evenInstallment,
      lastAmount: lastInstallment,
      installmentsDiffer,
      count: resolvedN,
      remaining,
      endDate,
    };
  }, [
    totalStr,
    amountStr,
    countStr,
    lockField,
    reconcileFirst,
    drift,
    plan.total_amount,
    plan.remaining_amount,
    plan.next_payment_date,
    plan.frequency,
  ]);

  const driftSignificant = drift && Math.abs(drift.drift) > 0.01;

  const handleRecalculate = async () => {
    setSubmitting(true);
    const { error, result } = await recalculateInstallmentPayment(plan.id);
    setSubmitting(false);
    if (error) {
      toast({
        title: t('common.error'),
        description: t('installments.cannotRecalc'),
        variant: 'destructive',
      });
      return;
    }
    if (result) {
      toast({
        title: t('installments.recalcDone', { defaultValue: 'Recalculation applied' }),
        description: `${result.linkedTransactionsCount} tx · ${formatCurrency(
          result.newRemainingAmount
        )} restant`,
      });
    }
    setReconcileFirst(false);
  };

  const handleApply = async () => {
    setSubmitting(true);
    const payload: Parameters<typeof applyPlanAdjustment>[1] = {
      lockField,
      reconcileFromTxns: reconcileFirst,
    };
    if (lockField !== 'total') payload.total_amount = parseFloat(totalStr) || plan.total_amount;
    if (lockField !== 'amount') payload.installment_amount = parseFloat(amountStr) || plan.installment_amount;
    if (lockField !== 'count') {
      const n = Math.max(1, Math.floor(parseFloat(countStr) || 0));
      payload.num_installments = n;
    }
    // For the locked field, send the form value too so the solver has the
    // user's intent rather than the stale row.
    if (lockField === 'total') payload.total_amount = parseFloat(totalStr) || plan.total_amount;
    if (lockField === 'amount') payload.installment_amount = parseFloat(amountStr) || plan.installment_amount;
    if (lockField === 'count') {
      const n = Math.max(1, Math.floor(parseFloat(countStr) || 0));
      payload.num_installments = n;
    }

    const { error } = await applyPlanAdjustment(plan.id, payload);
    setSubmitting(false);

    if (error) {
      toast({
        title: t('installments.planAdjustError', { defaultValue: 'Cannot adjust plan' }),
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: t('installments.planAdjusted', { defaultValue: 'Plan updated' }),
      description: t('installments.planAdjustedDesc', {
        defaultValue: 'Schedule and recurring transaction synced.',
      }),
    });
    setReconcileFirst(false);
  };

  return (
    <div className="space-y-4">
      {/* Drift banner */}
      {driftSignificant && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-xs sm:text-sm font-semibold">
                  {t('installments.driftTitle', { defaultValue: 'Plan and transactions disagree' })}
                </p>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                  {t('installments.driftDetail', {
                    defaultValue:
                      'The schedule says {{state}} paid; linked transactions sum to {{txns}}. Difference: {{drift}}.',
                    state: formatCurrency(drift!.paidFromState),
                    txns: formatCurrency(drift!.paidFromTxns),
                    drift: formatCurrency(Math.abs(drift!.drift)),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] sm:text-xs gap-1.5"
                  disabled={submitting}
                  onClick={handleRecalculate}
                >
                  <RefreshCw className="h-3 w-3" />
                  {t('installments.recalcFirst', { defaultValue: 'Recalculate first' })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={reconcileFirst ? 'default' : 'outline'}
                  className="h-7 text-[11px] sm:text-xs gap-1.5"
                  onClick={() => setReconcileFirst((v) => !v)}
                >
                  <Wand2 className="h-3 w-3" />
                  {reconcileFirst
                    ? t('installments.usingTxns', { defaultValue: 'Using transactions as paid' })
                    : t('installments.applyAnyway', { defaultValue: 'Apply anyway' })}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock toggle */}
      <div className="space-y-2">
        <Label className="text-xs sm:text-sm flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          {t('installments.lockField', { defaultValue: 'Keep this field fixed' })}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(['total', 'amount', 'count'] as PlanLockField[]).map((f) => (
            <Button
              key={f}
              type="button"
              variant={lockField === f ? 'default' : 'outline'}
              size="sm"
              className="h-9 text-[11px] sm:text-xs"
              onClick={() => setLockField(f)}
            >
              {f === 'total'
                ? t('installments.total', { defaultValue: 'Total' })
                : f === 'amount'
                ? t('installments.perInstallment', { defaultValue: 'Per installment' })
                : t('installments.installmentsLeft', { defaultValue: 'Installments left' })}
            </Button>
          ))}
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          {lockField === 'total' &&
            t('installments.lockTotalHint', {
              defaultValue:
                'Total stays at the chosen value; per-installment and count adjust to fit.',
            })}
          {lockField === 'amount' &&
            t('installments.lockAmountHint', {
              defaultValue:
                'Per-installment stays fixed; total and count adjust to fit.',
            })}
          {lockField === 'count' &&
            t('installments.lockCountHint', {
              defaultValue:
                'Number of installments left stays fixed; per-installment splits the remainder.',
            })}
        </p>
      </div>

      {/* Three fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] sm:text-xs">
            {t('installments.total', { defaultValue: 'Total' })}
            {lockField === 'total' && (
              <span className="ml-1 text-primary">
                <Lock className="inline h-2.5 w-2.5" />
              </span>
            )}
          </Label>
          <AmountInput
            placeholder="0.00"
            value={totalStr}
            onChange={setTotalStr}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] sm:text-xs">
            {t('installments.perInstallment', { defaultValue: 'Per installment' })}
            {lockField === 'amount' && (
              <span className="ml-1 text-primary">
                <Lock className="inline h-2.5 w-2.5" />
              </span>
            )}
          </Label>
          <AmountInput
            placeholder="0.00"
            value={amountStr}
            onChange={setAmountStr}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] sm:text-xs">
            {t('installments.installmentsLeft', { defaultValue: 'Installments left' })}
            {lockField === 'count' && (
              <span className="ml-1 text-primary">
                <Lock className="inline h-2.5 w-2.5" />
              </span>
            )}
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={countStr}
            onChange={(e) => setCountStr(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs sm:text-sm font-semibold">
            {t('installments.preview', { defaultValue: 'Preview' })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t('installments.paidSoFar', { defaultValue: 'Paid so far' })}
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(preview.paid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t('installments.newRemaining', { defaultValue: 'New remaining' })}
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(preview.remaining)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t('installments.newTotal', { defaultValue: 'New total' })}
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(preview.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t('installments.installmentsLeft', { defaultValue: 'Installments left' })}
            </span>
            <span className="font-medium tabular-nums">{preview.count}</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-muted-foreground">
              {t('installments.perInstallment', { defaultValue: 'Per installment' })}
            </span>
            <span className="font-medium tabular-nums">
              {formatCurrency(preview.amount)}
              {preview.installmentsDiffer && (
                <span className="text-muted-foreground">
                  {' '}
                  · {t('installments.lastIs', { defaultValue: 'last' })}{' '}
                  {formatCurrency(preview.lastAmount)}
                </span>
              )}
            </span>
          </div>
          {preview.endDate && (
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">
                {t('installments.endsOn', { defaultValue: 'Ends on' })}
              </span>
              <span className="font-medium">
                {format(preview.endDate, 'PP', { locale: dateLocale })}
              </span>
            </div>
          )}
        </div>
      </div>

      <Button
        type="button"
        onClick={handleApply}
        disabled={submitting || preview.total <= 0 || preview.amount <= 0}
        className="w-full h-10 text-sm"
      >
        {submitting
          ? t('common.saving', { defaultValue: 'Saving…' })
          : t('installments.applyChanges', { defaultValue: 'Apply changes' })}
      </Button>
    </div>
  );
}
