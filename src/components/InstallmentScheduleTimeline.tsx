import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Bolt, Box, CreditCard, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { addMonths, addWeeks, addQuarters, format, parseISO, isBefore, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface Props {
  plan: InstallmentPayment;
  accountName?: string | null;
}

/**
 * Featured installment plan detail card with 12-step schedule timeline.
 * Modeled on the deck design's InstallmentsDeepSlide featured plan card.
 */
export function InstallmentScheduleTimeline({ plan, accountName }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { formatCurrency } = useUserPreferences();

  const totalSteps = useMemo(() => {
    if (plan.installment_amount <= 0) return 1;
    return Math.max(1, Math.ceil(plan.total_amount / plan.installment_amount));
  }, [plan.total_amount, plan.installment_amount]);

  const paidSteps = useMemo(() => {
    if (plan.installment_amount <= 0) return 0;
    return Math.max(
      0,
      Math.min(
        totalSteps,
        Math.round((plan.total_amount - plan.remaining_amount) / plan.installment_amount)
      )
    );
  }, [plan.total_amount, plan.remaining_amount, plan.installment_amount, totalSteps]);

  const stepDates = useMemo(() => {
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
  }, [plan.start_date, plan.frequency, totalSteps]);

  const today = startOfDay(new Date());

  const nextDate = stepDates[paidSteps];
  const daysUntilNext = nextDate
    ? Math.max(0, Math.ceil((nextDate.getTime() - today.getTime()) / 86400000))
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
              {format(parseISO(plan.start_date), "PP", { locale: dateLocale })}
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
            {formatCurrency(plan.installment_amount)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            {t("installments.nextCharge", { defaultValue: "Next charge" })}
          </div>
          <div className="font-mono text-base font-medium mt-1">
            {nextDate
              ? format(nextDate, "PP", { locale: dateLocale })
              : t("installments.complete", { defaultValue: "Complete" })}
          </div>
          {nextDate && (
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
              width: `calc(${
                ((paidSteps - 1) / Math.max(1, totalSteps - 1)) * 100
              }% - 8px)`,
              maxWidth: "calc(100% - 8px)",
              minWidth: 0,
            }}
            aria-hidden
          />
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `repeat(${totalSteps}, minmax(48px, 1fr))`,
              minWidth: totalSteps * 48,
            }}
          >
            {Array.from({ length: totalSteps }, (_, i) => {
              const status =
                i < paidSteps ? "paid" : i === paidSteps ? "next" : "upcoming";
              const date = stepDates[i];
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    className={`h-[18px] w-[18px] rounded-full grid place-items-center text-background relative z-10 ${
                      status === "paid"
                        ? "bg-pos"
                        : status === "next"
                        ? "bg-primary"
                        : "bg-bg-elev border-[1.5px] border-line-strong"
                    }`}
                    style={
                      status === "next"
                        ? { boxShadow: "0 0 0 4px hsl(var(--primary) / 0.22)" }
                        : undefined
                    }
                  >
                    {status === "paid" && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <div
                    className={`text-[10px] font-mono uppercase tracking-[0.05em] ${
                      status === "next"
                        ? "text-primary font-semibold"
                        : "text-muted-foreground font-medium"
                    }`}
                  >
                    {format(date, "MMM", { locale: dateLocale })}
                  </div>
                  <div
                    className={`text-[10px] font-mono ${
                      status === "upcoming" ? "text-fg-dim" : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(plan.installment_amount)}
                  </div>
                </div>
              );
            })}
          </div>
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
