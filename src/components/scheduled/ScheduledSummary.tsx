import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Repeat, CalendarClock, CreditCard, Banknote } from "lucide-react";
import { addDays, addMonths } from "date-fns";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { sumRecurringWindow } from "@/lib/projectMonthEndBalance";
import { parseLocalDate } from "@/lib/dateUtils";

/**
 * The Scheduled page's summary strip.
 *
 * Every figure here is a forward-looking window over the *same* occurrence
 * walk the month-end projection uses (`sumRecurringWindow`), so the strip and
 * the panels beneath it can never quote different numbers for the same
 * question. Windows are stated in the caption under each figure rather than
 * left implicit, because "per month" and "in 7 days" are only meaningful if
 * you know where the window starts.
 *
 * Definitions, so they can be checked by hand:
 *  - Recurring charges — expense-side occurrences in the next month from today.
 *  - Due in 7 days     — expense-side occurrences in the next 7 days, plus the
 *                        count of any already past their date and unpaid.
 *  - Plans in progress — sum of `installment_amount` over active plans; this is
 *                        the monthly instalment load, not the outstanding total.
 *  - Left after charges— income minus expense over the next month.
 */
export function ScheduledSummary() {
  const { t } = useTranslation();
  const { recurringTransactions } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const month = sumRecurringWindow(
      recurringTransactions,
      installmentPayments,
      debts,
      scheduledPayments,
      today,
      addMonths(today, 1)
    );
    const week = sumRecurringWindow(
      recurringTransactions,
      installmentPayments,
      debts,
      scheduledPayments,
      today,
      addDays(today, 7)
    );

    // A due date in the past that was never recorded. Counted, not summed —
    // and deliberately so: the walk above starts at today, so an overdue
    // instance's own amount appears in none of these totals (its *next*
    // occurrence does). Adding it to the 7-day figure would claim it is
    // still to come; leaving it uncounted entirely would hide it. The count
    // says it exists without moving a total that means something else.
    const overdue = recurringTransactions.filter((rt) => {
      if (!rt.is_active || !rt.next_due_date) return false;
      return parseLocalDate(rt.next_due_date) < today;
    }).length;

    const activePlans = installmentPayments.filter(
      (p) => p.is_active && p.remaining_amount > 0
    );
    const planMonthly = activePlans.reduce((s, p) => s + (p.installment_amount || 0), 0);

    return { month, week, overdue, planCount: activePlans.length, planMonthly };
  }, [recurringTransactions, installmentPayments, debts, scheduledPayments]);

  const money = (v: number) => (isPrivacyMode ? "•••••" : formatCurrency(v));

  const cards = [
    {
      key: "charges",
      icon: Repeat,
      tone: "neg",
      label: t("scheduled.kpiCharges", { defaultValue: "Recurring charges" }),
      value: money(stats.month.expense),
      foot: t("scheduled.kpiChargesFoot", {
        count: stats.month.rules,
        defaultValue: "{{count}} active · next 30 days",
      }),
    },
    {
      key: "week",
      icon: CalendarClock,
      tone: stats.overdue > 0 ? "warn" : "acc",
      label: t("scheduled.kpiWeek", { defaultValue: "Due in 7 days" }),
      value: money(stats.week.expense),
      foot:
        stats.overdue > 0
          ? t("scheduled.kpiWeekFootLate", {
              count: stats.week.occurrences,
              late: stats.overdue,
              defaultValue: "{{count}} due · {{late}} overdue",
            })
          : t("scheduled.kpiWeekFoot", {
              count: stats.week.occurrences,
              defaultValue: "{{count}} due",
            }),
    },
    {
      key: "plans",
      icon: CreditCard,
      tone: "acc",
      label: t("scheduled.kpiPlans", { defaultValue: "Plans in progress" }),
      value: money(stats.planMonthly),
      foot: t("scheduled.kpiPlansFoot", {
        count: stats.planCount,
        defaultValue: "{{count}} plans · per instalment",
      }),
    },
    {
      key: "left",
      icon: Banknote,
      tone: stats.month.net >= 0 ? "pos" : "neg",
      label: t("scheduled.kpiLeft", { defaultValue: "Left after charges" }),
      value: money(stats.month.net),
      foot: t("scheduled.kpiLeftFoot", {
        amount: formatCurrency(stats.month.income),
        defaultValue: "On {{amount}} scheduled in",
      }),
    },
  ];

  // Nothing scheduled at all — the strip would be four zeroes saying nothing.
  if (stats.month.occurrences === 0 && stats.planCount === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {cards.map((card) => (
        <div key={card.key} className="ft-kpi">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`ft-kpi-icon ${card.tone}`}>
              <card.icon className="h-[15px] w-[15px]" />
            </div>
            <span className="ft-kpi-label truncate">{card.label}</span>
          </div>
          <div className={`ft-kpi-value truncate ${isPrivacyMode ? "ft-priv" : ""}`}>
            {card.value}
          </div>
          <div className="ft-kpi-foot truncate">{card.foot}</div>
        </div>
      ))}
    </div>
  );
}
