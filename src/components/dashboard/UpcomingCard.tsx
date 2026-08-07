import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { parseLocalDate } from "@/lib/dateUtils";
import { getRecurringDisplayAmount, getRecurringEffectiveType } from "@/lib/recurringAmount";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

/** How far ahead the card looks. */
const HORIZON_DAYS = 7;
/** How many rows fit before the card starts eating the column. */
const MAX_ROWS = 6;

/**
 * What is about to leave the account, stated calmly.
 *
 * The dashboard's closing pair is "what is coming out" beside "what it is
 * all for" — this is the first half. Anything genuinely overdue also shows
 * here, tagged, so the list is a complete picture of the near term; the
 * alert band above keeps the *action* on those.
 */
export function UpcomingCard() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const navigate = useNavigate();
  const { recurringTransactions } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const todayLocal = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Same predicate the alert band applies: a plan whose installment or debt
  // has been settled is not "upcoming", it is finished.
  const rows = useMemo(() => {
    const horizon = new Date(todayLocal);
    horizon.setDate(todayLocal.getDate() + HORIZON_DAYS);

    const isStillActive = (rt: typeof recurringTransactions[number]) => {
      if (rt.installment_payment_id) {
        const ip = installmentPayments.find((p) => p.id === rt.installment_payment_id);
        if (!ip || !ip.is_active || ip.remaining_amount <= 0) return false;
      }
      if (rt.debt_id) {
        const debt = debts.find((d) => d.id === rt.debt_id);
        if (!debt || debt.status === "completed" || debt.remaining_amount <= 0) return false;
      }
      return true;
    };

    return recurringTransactions
      .filter((rt) => {
        if (!rt.is_active) return false;
        if (!isStillActive(rt)) return false;
        return parseLocalDate(rt.next_due_date) <= horizon;
      })
      .sort(
        (a, b) =>
          parseLocalDate(a.next_due_date).getTime() - parseLocalDate(b.next_due_date).getTime()
      )
      .map((rt) => {
        const due = parseLocalDate(rt.next_due_date);
        const amount = getRecurringDisplayAmount(
          rt,
          rt.next_due_date,
          installmentPayments,
          debts,
          scheduledPayments
        );
        const type = getRecurringEffectiveType(rt, installmentPayments);
        return {
          id: rt.id,
          due,
          late: due < todayLocal,
          name: resolveNamePlaceholders(rt.description, due),
          amount,
          signed: type === "income" ? amount : -amount,
        };
      });
  }, [recurringTransactions, installmentPayments, debts, scheduledPayments, todayLocal]);

  if (rows.length === 0) return null;

  const net = rows.reduce((s, r) => s + r.signed, 0);
  const visible = rows.slice(0, MAX_ROWS);

  return (
    <div className="ft-card-flush flex flex-col">
      <div className="ft-card-head">
        <div>
          <h3 className="ft-card-title">
            {t("dashboard.upcoming", { defaultValue: "Upcoming" })}
          </h3>
          <p className="ft-card-sub">
            {t("dashboard.nextNDays", {
              defaultValue: "Next {{count}} days",
              count: HORIZON_DAYS,
            })}
            {" · "}
            <span className={`font-mono ${isPrivacyMode ? "ft-priv" : ""}`}>
              {net >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(net))}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col">
        {visible.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => navigate("/recurring-transactions")}
            className="ft-list-row plain"
            style={{ paddingTop: 10, paddingBottom: 10 }}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span
                className={`font-mono text-[11px] w-[52px] flex-shrink-0 ${
                  row.late ? "text-neg" : "text-fg-dim"
                }`}
              >
                {format(row.due, "d MMM", { locale: dateLocale })}
              </span>
              <span className="text-[13px] font-[550] truncate">{row.name}</span>
              {row.late && (
                <span className="ft-tag neg flex-shrink-0">
                  {t("common.late", { defaultValue: "Late" })}
                </span>
              )}
            </span>
            <span
              className={`font-mono text-[13px] whitespace-nowrap ${
                row.signed >= 0 ? "text-pos" : ""
              } ${isPrivacyMode ? "ft-priv" : ""}`}
            >
              {row.signed >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(row.amount))}
            </span>
          </button>
        ))}
        {rows.length > visible.length && (
          <button
            type="button"
            onClick={() => navigate("/recurring-transactions")}
            className="ft-row-foot"
          >
            {t("dashboard.showNMore", {
              defaultValue: "Show {{count}} more",
              count: rows.length - visible.length,
            })}
          </button>
        )}
      </div>
    </div>
  );
}
