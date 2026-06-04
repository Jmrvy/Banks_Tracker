import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Bolt, Box, CreditCard, ShoppingBag } from "lucide-react";
import type { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import type { Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  addMonths,
  addWeeks,
  addQuarters,
  format,
  parseISO,
  startOfDay,
  differenceInDays,
} from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";

/** Personalized-schedule row — one per planned installment.
 *  Present only for custom plans; uniform plans don't have records. */
export interface InstallmentScheduleRecord {
  id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  actual_amount: number | null;
  transaction_id: string | null;
}

interface Props {
  plan: InstallmentPayment;
  accountName?: string | null;
  /**
   * Linked transactions for this plan — filtered from the global feed by
   * `installment_payment_id === plan.id`. When provided, schedule steps render
   * paid/next/upcoming status based on real transaction dates, and clicking
   * a paid step opens its detail.
   */
  linkedTransactions?: Transaction[];
  /**
   * Personalized schedule rows. When non-empty the timeline renders these
   * exact dates and amounts (variable per row) instead of regenerating a
   * uniform schedule from `installment_amount + frequency`.
   */
  scheduleRecords?: InstallmentScheduleRecord[];
  onTransactionClick?: (txn: Transaction) => void;
}

interface StepStatus {
  status: "paid" | "next" | "upcoming";
  date: Date;
  amount: number;
  transaction?: Transaction;
}

/**
 * Installment plan schedule timeline.
 * Data-aware: when `linkedTransactions` are passed in, each scheduled step is
 * matched to the real transaction nearest its expected date — so editing a
 * transaction (date or amount) updates the schedule reactively, the same way
 * the recurring calendar reflects executed transactions.
 */
export function InstallmentScheduleTimeline({
  plan,
  accountName,
  linkedTransactions,
  scheduleRecords,
  onTransactionClick,
}: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { formatCurrency } = useUserPreferences();

  // A plan has a personalized (custom) schedule when records are loaded
  // for it. Custom plans drive the timeline from records (variable dates
  // and amounts); uniform plans fall back to installment_amount + frequency.
  const sortedRecords = useMemo(
    () =>
      (scheduleRecords ?? [])
        .slice()
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [scheduleRecords]
  );
  const hasCustomSchedule = sortedRecords.length > 0;

  const totalSteps = useMemo(() => {
    if (hasCustomSchedule) return sortedRecords.length;
    if (plan.installment_amount <= 0) return 1;
    return Math.max(1, Math.ceil(plan.total_amount / plan.installment_amount));
  }, [hasCustomSchedule, sortedRecords.length, plan.total_amount, plan.installment_amount]);

  // Expected dates per step. For custom schedules each row supplies its own
  // date; otherwise generate them from start_date + frequency.
  const expectedDates = useMemo(() => {
    if (hasCustomSchedule) {
      return sortedRecords.map((r) => parseLocalDate(r.scheduled_date));
    }
    const start = parseISO(plan.start_date);
    return Array.from({ length: totalSteps }, (_, i) => {
      switch (plan.frequency) {
        case "weekly":
          return addWeeks(start, i);
        case "quarterly":
          return addQuarters(start, i);
        default:
          return addMonths(start, i);
      }
    });
  }, [hasCustomSchedule, sortedRecords, plan.start_date, plan.frequency, totalSteps]);

  // Per-step expected amount. Custom schedules vary by row; uniform plans
  // use the single installment_amount.
  const expectedAmounts = useMemo(() => {
    if (hasCustomSchedule) return sortedRecords.map((r) => r.scheduled_amount);
    return Array.from({ length: totalSteps }, () => plan.installment_amount);
  }, [hasCustomSchedule, sortedRecords, totalSteps, plan.installment_amount]);

  const today = startOfDay(new Date());

  // Match each step to a linked transaction:
  //  • Sort linked transactions by date
  //  • Walk steps in order, attaching the nearest unattached transaction to each
  const steps: StepStatus[] = useMemo(() => {
    const sortedTxns = (linkedTransactions ?? [])
      .slice()
      .sort(
        (a, b) =>
          parseLocalDate(a.transaction_date).getTime() -
          parseLocalDate(b.transaction_date).getTime()
      );
    const txnById = new Map(sortedTxns.map((t) => [t.id, t]));
    const used = new Set<string>();

    const result: StepStatus[] = expectedDates.map((expectedDate, i) => {
      const expectedAmount = expectedAmounts[i];

      // Custom schedule: trust the record. If the processor has marked it
      // paid and attached a transaction id, surface that transaction.
      if (hasCustomSchedule) {
        const record = sortedRecords[i];
        const recordTxn = record.transaction_id
          ? txnById.get(record.transaction_id)
          : undefined;
        if (recordTxn) used.add(recordTxn.id);
        return {
          status: record.is_paid ? "paid" : "upcoming",
          date: expectedDate,
          amount:
            recordTxn != null
              ? Math.abs(recordTxn.amount)
              : record.actual_amount ?? expectedAmount,
          transaction: recordTxn,
        };
      }

      // Uniform schedule: find the nearest unattached linked transaction
      // within ±21 days (covers late/early payments without crossing into
      // the next step's window).
      let bestTxn: Transaction | undefined;
      let bestDiff = Infinity;
      for (const tx of sortedTxns) {
        if (used.has(tx.id)) continue;
        const diff = Math.abs(
          differenceInDays(parseLocalDate(tx.transaction_date), expectedDate)
        );
        if (diff <= 21 && diff < bestDiff) {
          bestDiff = diff;
          bestTxn = tx;
        }
      }
      if (bestTxn) used.add(bestTxn.id);
      return {
        status: bestTxn ? "paid" : "upcoming",
        date: expectedDate,
        amount: bestTxn ? Math.abs(bestTxn.amount) : expectedAmount,
        transaction: bestTxn,
      };
    });

    // The first non-paid step is "next"
    const firstUnpaid = result.findIndex((s) => s.status === "upcoming");
    if (firstUnpaid >= 0) result[firstUnpaid].status = "next";

    // Fallback for uniform plans without linked transactions data: derive
    // paid count from total/remaining (legacy behavior). Custom schedules
    // already know their paid state from the records.
    if (!hasCustomSchedule && !linkedTransactions) {
      const paidCount =
        plan.installment_amount > 0
          ? Math.max(
              0,
              Math.min(
                totalSteps,
                Math.round(
                  (plan.total_amount - plan.remaining_amount) /
                    plan.installment_amount
                )
              )
            )
          : 0;
      return result.map((s, i) => ({
        ...s,
        status:
          i < paidCount ? "paid" : i === paidCount ? "next" : "upcoming",
      }));
    }

    return result;
  }, [
    expectedDates,
    expectedAmounts,
    hasCustomSchedule,
    sortedRecords,
    linkedTransactions,
    plan.installment_amount,
    plan.total_amount,
    plan.remaining_amount,
    totalSteps,
  ]);

  const paidSteps = steps.filter((s) => s.status === "paid").length;
  const nextStep = steps.find((s) => s.status === "next");
  const daysUntilNext = nextStep
    ? Math.max(0, Math.ceil((nextStep.date.getTime() - today.getTime()) / 86400000))
    : 0;

  const Icon = plan.payment_type === "reimbursement" ? CreditCard : Box;

  return (
    <div className="ft-card p-5 md:p-6 flex flex-col">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-primary/12 text-primary grid place-items-center flex-shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              {plan.payment_type === "reimbursement"
                ? t("installments.reimbursement", { defaultValue: "Reimbursement" })
                : t("installments.payment", { defaultValue: "Payment plan" })}
            </div>
            <h3 className="font-semibold text-lg md:text-xl tracking-tight mt-0.5">
              {plan.description}
            </h3>
            <div className="text-xs text-muted-foreground mt-1">
              {t("installments.startedOn", { defaultValue: "Plan started" })}{" "}
              {format(
                hasCustomSchedule
                  ? parseLocalDate(sortedRecords[0].scheduled_date)
                  : parseISO(plan.start_date),
                "PP",
                { locale: dateLocale }
              )}
              {accountName && (
                <>
                  {" · "}
                  {t("installments.paidFrom", { defaultValue: "paid from" })} {accountName}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="ft-tag pos">0% APR</span>
        </div>
      </div>

      {/* Big numbers row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 pt-5 mt-5 border-t border-line">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            {t("installments.remaining", { defaultValue: "Remaining" })}
          </div>
          <div className="font-mono text-2xl md:text-[26px] font-medium tracking-tight mt-1">
            {formatCurrency(plan.remaining_amount)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            {t("installments.paid", { defaultValue: "Paid" })}
          </div>
          <div className="font-mono text-2xl md:text-[26px] font-medium tracking-tight mt-1 text-pos">
            {formatCurrency(plan.total_amount - plan.remaining_amount)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            {t("installments.perInstallment", { defaultValue: "Per installment" })}
          </div>
          <div className="font-mono text-2xl md:text-[26px] font-medium tracking-tight mt-1">
            {hasCustomSchedule
              ? nextStep
                ? formatCurrency(nextStep.amount)
                : t("installments.variable", { defaultValue: "Variable" })
              : formatCurrency(plan.installment_amount)}
          </div>
          {hasCustomSchedule && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {t("installments.variableSchedule", { defaultValue: "Custom schedule" })}
            </div>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            {t("installments.nextCharge", { defaultValue: "Next charge" })}
          </div>
          <div className="font-mono text-base font-medium mt-1">
            {nextStep
              ? format(nextStep.date, "PP", { locale: dateLocale })
              : t("installments.complete", { defaultValue: "Complete" })}
          </div>
          {nextStep && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {t("installments.inDays", {
                defaultValue: "in {{n}} days",
                n: daysUntilNext,
              })}
            </div>
          )}
        </div>
      </div>

      {/* Schedule timeline */}
      <div className="pt-5 mt-5 border-t border-line flex-1 flex flex-col">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[13px] font-semibold">
              {t("installments.schedule", { defaultValue: "Payment schedule" })}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {paidSteps} {t("installments.of", { defaultValue: "of" })} {totalSteps}{" "}
              {t("installments.scheduledPaid", { defaultValue: "paid" })}
              {" · "}
              {totalSteps - paidSteps}{" "}
              {t("installments.remaining", { defaultValue: "remaining" })}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-pos" />
              {t("installments.paid", { defaultValue: "Paid" })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full bg-primary"
                style={{ boxShadow: "0 0 0 3px hsl(var(--primary) / 0.24)" }}
              />
              {t("installments.next", { defaultValue: "Next" })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border-[1.5px] border-line-strong bg-bg-elev" />
              {t("installments.upcoming", { defaultValue: "Upcoming" })}
            </span>
          </div>
        </div>

        {/* timeline */}
        <div className="relative pt-5 pb-2 overflow-x-auto">
          <div
            className="absolute left-1 right-1 top-[36px] h-0.5 bg-bg-subtle"
            aria-hidden
          />
          <div
            className="absolute left-1 top-[36px] h-0.5 bg-pos"
            style={{
              width:
                paidSteps === 0
                  ? "0"
                  : `calc(${
                      ((paidSteps - 0.5) / Math.max(1, totalSteps - 1)) * 100
                    }% - 4px)`,
              maxWidth: "calc(100% - 8px)",
              minWidth: 0,
            }}
            aria-hidden
          />
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `repeat(${totalSteps}, minmax(56px, 1fr))`,
              minWidth: totalSteps * 56,
            }}
          >
            {steps.map((step, i) => {
              const clickable = step.status === "paid" && step.transaction && onTransactionClick;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!clickable}
                  onClick={() =>
                    step.transaction && onTransactionClick?.(step.transaction)
                  }
                  className={`flex flex-col items-center gap-2 px-1 ${
                    clickable
                      ? "cursor-pointer hover:bg-bg-subtle/60 rounded-md transition-colors"
                      : "cursor-default"
                  }`}
                >
                  <div
                    className={`h-[18px] w-[18px] rounded-full grid place-items-center text-background relative z-10 ${
                      step.status === "paid"
                        ? "bg-pos"
                        : step.status === "next"
                        ? "bg-primary"
                        : "bg-bg-elev border-[1.5px] border-line-strong"
                    }`}
                    style={
                      step.status === "next"
                        ? { boxShadow: "0 0 0 4px hsl(var(--primary) / 0.22)" }
                        : undefined
                    }
                  >
                    {step.status === "paid" && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <div
                    className={`text-[10px] font-mono uppercase tracking-[0.05em] ${
                      step.status === "next"
                        ? "text-primary font-semibold"
                        : "text-muted-foreground font-medium"
                    }`}
                  >
                    {format(
                      step.transaction
                        ? parseLocalDate(step.transaction.transaction_date)
                        : step.date,
                      "d MMM",
                      { locale: dateLocale }
                    )}
                  </div>
                  <div
                    className={`text-[10px] font-mono ${
                      step.status === "upcoming"
                        ? "text-fg-dim"
                        : step.status === "paid"
                        ? "text-pos font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(step.amount)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress fill: based on actual paid count */}
        <div className="text-[11px] text-muted-foreground mt-3 -mt-2">
          {linkedTransactions
            ? t("installments.tipClickPaid", {
                defaultValue: "Click a paid step to view or edit the transaction",
              })
            : null}
        </div>

        {plan.remaining_amount > 0 && (
          <div className="mt-auto pt-4 px-4 py-3 rounded-lg bg-bg-subtle text-xs leading-relaxed">
            <div className="flex items-center gap-2 font-semibold">
              <Bolt className="h-3.5 w-3.5" />
              {t("installments.payToSettle", {
                defaultValue: "Pay {{amt}} now to settle",
                amt: formatCurrency(plan.remaining_amount),
              })}
            </div>
            <div className="text-muted-foreground mt-1">
              {t("installments.payToSettleHint", {
                defaultValue:
                  "0% APR — settling early just shifts cash; no interest savings on this plan.",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact installment plan summary card with segmented progress strip.
 * Used in the right rail of the Installments deep-dive layout for "other plans".
 */
export function InstallmentMiniCard({
  plan,
  accountName,
  onClick,
  active,
}: {
  plan: InstallmentPayment;
  accountName?: string | null;
  onClick?: () => void;
  active?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { formatCurrency } = useUserPreferences();

  const totalSteps =
    plan.installment_amount > 0
      ? Math.max(1, Math.ceil(plan.total_amount / plan.installment_amount))
      : 1;
  const paidSteps =
    plan.installment_amount > 0
      ? Math.max(
          0,
          Math.min(
            totalSteps,
            Math.round(
              (plan.total_amount - plan.remaining_amount) / plan.installment_amount
            )
          )
        )
      : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`ft-card p-4 text-left flex flex-col gap-2.5 transition-colors w-full ${
        active ? "border-primary" : "hover:border-line-strong"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/12 text-primary grid place-items-center flex-shrink-0">
            <ShoppingBag className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[13px] truncate">{plan.description}</div>
            <div className="text-[11.5px] text-muted-foreground mt-0.5">
              {accountName ?? plan.frequency} · 0% APR
            </div>
          </div>
        </div>
        <span className="ft-tag acc">
          {paidSteps}/{totalSteps}
        </span>
      </div>
      <div className="flex justify-between text-[11.5px]">
        <span className="text-muted-foreground">
          {t("installments.remaining", { defaultValue: "Remaining" })}
        </span>
        <span className="font-mono font-semibold">
          {formatCurrency(plan.remaining_amount)}
        </span>
      </div>
      {/* Segmented progress strip */}
      <div className="flex gap-1">
        {Array.from({ length: totalSteps }, (_, k) => (
          <div
            key={k}
            className="h-1 rounded-sm flex-1"
            style={{
              background:
                k < paidSteps
                  ? "hsl(var(--pos))"
                  : k === paidSteps
                  ? "hsl(var(--primary))"
                  : "hsl(var(--bg-subtle))",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between pt-2 border-t border-line text-[11.5px]">
        <span className="text-muted-foreground">
          {t("installments.next", { defaultValue: "Next" })}:{" "}
          {plan.next_payment_date
            ? format(parseISO(plan.next_payment_date), "PP", { locale: dateLocale })
            : "—"}
        </span>
        <span className="font-mono font-medium">
          {formatCurrency(plan.installment_amount)}/
          {plan.frequency === "weekly"
            ? t("installments.wk", { defaultValue: "wk" })
            : plan.frequency === "quarterly"
            ? t("installments.qtr", { defaultValue: "qtr" })
            : t("installments.mo", { defaultValue: "mo" })}
        </span>
      </div>
    </button>
  );
}
