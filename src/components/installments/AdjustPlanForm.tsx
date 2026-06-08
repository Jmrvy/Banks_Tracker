import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addMonths, addQuarters, addWeeks, format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { AlertTriangle, Calculator, Lock, Pencil, RefreshCw, Wand2 } from 'lucide-react';

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
  PlanModifyField,
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

  // Single source of truth: which field is the user modifying right now.
  // The other two are auto-derived using fixed rules (see `applyPlanAdjustment`).
  const [modifyField, setModifyField] = useState<PlanModifyField>('total');

  // The editable field's typed value. The other two display computed previews.
  const [totalStr, setTotalStr] = useState(plan.total_amount.toString());
  const [amountStr, setAmountStr] = useState(plan.installment_amount.toString());
  const initialCount =
    plan.installment_amount > 0
      ? Math.max(1, Math.ceil(plan.remaining_amount / plan.installment_amount))
      : 1;
  const [countStr, setCountStr] = useState(initialCount.toString());

  const [drift, setDrift] = useState<PlanDrift | null>(null);
  const [reconcileFirst, setReconcileFirst] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reseed inputs from the current plan whenever:
  //  - the underlying plan changes (e.g. after Apply succeeds and the
  //    hook refetches), OR
  //  - the user switches modify mode — so the editable field always
  //    starts from the live plan state (notably: count always defaults
  //    to the remaining occurrences of the current plan, not whatever
  //    the user may have typed in a previous mode visit).
  useEffect(() => {
    setTotalStr(plan.total_amount.toString());
    setAmountStr(plan.installment_amount.toString());
    setCountStr(
      plan.installment_amount > 0
        ? Math.max(1, Math.ceil(plan.remaining_amount / plan.installment_amount)).toString()
        : '1'
    );
  }, [modifyField, plan.id, plan.total_amount, plan.installment_amount, plan.remaining_amount]);

  useEffect(() => {
    let cancelled = false;
    computePlanDrift(plan.id).then((d) => {
      if (!cancelled) setDrift(d);
    });
    return () => {
      cancelled = true;
    };
  }, [plan.id, plan.total_amount, plan.remaining_amount, plan.installment_amount]);

  // Derived preview using the same rules as `applyPlanAdjustment`:
  // keep the field the user didn't touch.
  //   modifyField='total'  → N stays; A = (T_new - P) / N
  //   modifyField='amount' → T stays; N = ceil((T - P) / A_new), last installment absorbs
  //   modifyField='count'  → T stays; A = (T - P) / N_new
  const preview = useMemo(() => {
    const paid = reconcileFirst && drift ? drift.paidFromTxns : roundCurrency(
      plan.total_amount - plan.remaining_amount
    );

    // Anchor values from the current plan state.
    const baseT = Number(plan.total_amount) || 0;
    const baseA = Number(plan.installment_amount) || 0;
    const baseN =
      baseA > 0
        ? Math.max(1, Math.ceil(Math.max(0, baseT - paid) / baseA))
        : 1;

    let T = baseT;
    let A = baseA;
    let N = baseN;

    if (modifyField === 'total') {
      T = parseFloat(totalStr) || 0;
      // N stays at the current value; A flexes.
      N = baseN;
      A = N > 0 ? roundCurrency(Math.max(0, T - paid) / N) : 0;
    } else if (modifyField === 'amount') {
      A = parseFloat(amountStr) || 0;
      // T stays; N flexes (rounded up, last installment absorbs remainder).
      N = A > 0 ? Math.max(1, Math.ceil(Math.max(0, T - paid) / A)) : 1;
    } else {
      N = Math.max(1, Math.floor(parseFloat(countStr) || 0));
      // T stays; A flexes.
      A = N > 0 ? roundCurrency(Math.max(0, T - paid) / N) : 0;
    }

    const remaining = Math.max(0, roundCurrency(T - paid));
    // For 'amount' mode the typed A doesn't divide T-P evenly, so the
    // last installment is the residual. For 'total' / 'count' modes A is
    // recomputed to divide cleanly, so 'last installment' == A modulo
    // 1-cent rounding.
    const lastInstallment =
      N > 0
        ? roundCurrency(Math.max(0, remaining - A * Math.max(0, N - 1)))
        : 0;
    const installmentsDiffer = N > 1 && Math.abs(lastInstallment - A) > 0.01;

    // Project the schedule end date by walking from next_payment_date.
    let endDate: Date | null = null;
    if (N > 0 && plan.next_payment_date) {
      let cur = parseISO(plan.next_payment_date);
      for (let i = 1; i < N; i++) cur = addInterval(cur, plan.frequency);
      endDate = cur;
    }

    return {
      paid,
      total: T,
      amount: A,
      lastAmount: lastInstallment,
      installmentsDiffer,
      count: N,
      remaining,
      endDate,
    };
  }, [
    totalStr,
    amountStr,
    countStr,
    modifyField,
    reconcileFirst,
    drift,
    plan.total_amount,
    plan.installment_amount,
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
      modifyField,
      reconcileFromTxns: reconcileFirst,
    };
    if (modifyField === 'total') {
      payload.total_amount = parseFloat(totalStr) || plan.total_amount;
    } else if (modifyField === 'amount') {
      payload.installment_amount = parseFloat(amountStr) || plan.installment_amount;
    } else {
      payload.num_installments = Math.max(1, Math.floor(parseFloat(countStr) || 0));
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

  // Render helpers — helper text reflects the "keep the field the user
  // didn't touch" rules in applyPlanAdjustment.
  const fieldConfig: Array<{
    key: PlanModifyField;
    label: string;
    helper: string;
  }> = [
    {
      key: 'total',
      label: t('installments.total', { defaultValue: 'Total' }),
      helper: t('installments.modifyTotalHint', {
        defaultValue: 'Count stays the same; per-installment adjusts.',
      }),
    },
    {
      key: 'amount',
      label: t('installments.perInstallment', { defaultValue: 'Per installment' }),
      helper: t('installments.modifyAmountHint', {
        defaultValue: 'Total stays the same; count adjusts.',
      }),
    },
    {
      key: 'count',
      label: t('installments.installmentsLeft', { defaultValue: 'Installments left' }),
      helper: t('installments.modifyCountHint', {
        defaultValue: 'Total stays the same; per-installment adjusts.',
      }),
    },
  ];
  const activeConfig = fieldConfig.find((c) => c.key === modifyField)!;

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

      {/* Reconcile from transactions — always available. Pairs each schedule
          slot with the matching linked transaction (date order) and resets
          orphaned slots so the plan, records, and recurring next-due all
          agree. Useful after manual deletes/edits or when nothing else fits. */}
      <div className="rounded-lg border border-line bg-bg-subtle/40 px-3 py-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            {t('installments.reconcileTitle', { defaultValue: 'Reconcile from transactions' })}
          </div>
          <p className="text-[10.5px] sm:text-xs text-muted-foreground mt-1">
            {t('installments.reconcileHint', {
              defaultValue:
                'Rebuild the schedule against the linked transactions: paid slots, next-due date, and remaining amount.',
            })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px] sm:text-xs gap-1.5 flex-shrink-0"
          disabled={submitting}
          onClick={handleRecalculate}
        >
          <RefreshCw className="h-3 w-3" />
          {t('installments.recalc', { defaultValue: 'Recalculate' })}
        </Button>
      </div>

      {/* Modify-field picker */}
      <div className="space-y-2">
        <Label className="text-xs sm:text-sm flex items-center gap-1.5">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          {t('installments.modifyWhich', { defaultValue: 'Which field do you want to modify?' })}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {fieldConfig.map((c) => (
            <Button
              key={c.key}
              type="button"
              variant={modifyField === c.key ? 'default' : 'outline'}
              size="sm"
              className="h-9 text-[11px] sm:text-xs"
              onClick={() => setModifyField(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground">{activeConfig.helper}</p>
      </div>

      {/* Three fields — only the one matching modifyField is editable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FieldBlock
          label={t('installments.total', { defaultValue: 'Total' })}
          editable={modifyField === 'total'}
          tooltip={t('installments.fieldLocked', { defaultValue: 'Locked: auto-computed.' })}
        >
          {modifyField === 'total' ? (
            <AmountInput
              placeholder="0.00"
              value={totalStr}
              onChange={setTotalStr}
              className="h-9 text-sm"
              autoFocus
            />
          ) : (
            <ReadOnlyValue value={formatCurrency(preview.total)} />
          )}
        </FieldBlock>
        <FieldBlock
          label={t('installments.perInstallment', { defaultValue: 'Per installment' })}
          editable={modifyField === 'amount'}
          tooltip={t('installments.fieldLocked', { defaultValue: 'Locked: auto-computed.' })}
        >
          {modifyField === 'amount' ? (
            <AmountInput
              placeholder="0.00"
              value={amountStr}
              onChange={setAmountStr}
              className="h-9 text-sm"
              autoFocus
            />
          ) : (
            <ReadOnlyValue value={formatCurrency(preview.amount)} />
          )}
        </FieldBlock>
        <FieldBlock
          label={t('installments.installmentsLeft', { defaultValue: 'Installments left' })}
          editable={modifyField === 'count'}
          tooltip={t('installments.fieldLocked', { defaultValue: 'Locked: auto-computed.' })}
        >
          {modifyField === 'count' ? (
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              value={countStr}
              onChange={(e) => setCountStr(e.target.value)}
              className="h-9 text-sm"
              autoFocus
            />
          ) : (
            <ReadOnlyValue value={String(preview.count)} />
          )}
        </FieldBlock>
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

function FieldBlock({
  label,
  editable,
  tooltip,
  children,
}: {
  label: string;
  editable: boolean;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        className="text-[11px] sm:text-xs flex items-center gap-1"
        title={editable ? undefined : tooltip}
      >
        {label}
        {!editable && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
      </Label>
      {children}
    </div>
  );
}

function ReadOnlyValue({ value }: { value: string }) {
  return (
    <div className="h-9 px-3 flex items-center text-sm font-mono tabular-nums rounded-md border border-input bg-muted/40 text-muted-foreground">
      {value}
    </div>
  );
}
