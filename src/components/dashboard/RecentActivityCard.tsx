import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ArrowDownRight, ArrowRightLeft, ArrowUpRight } from "lucide-react";
import { useFinancialData, type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { getTxDate } from "@/lib/dateUtils";

/** The pack shows seven rows here — enough to recognise the week without
 *  turning the dashboard into the ledger. */
const MAX_ROWS = 7;

/**
 * The last few things that happened, as the other half of the dashboard's
 * closing pair: this is what already moved, beside what is about to.
 *
 * Deliberately not a second Transactions page — no filters, no selection,
 * no editing. Every row and the header link land on the real ledger, which
 * is where those belong.
 */
export function RecentActivityCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { transactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const rows = useMemo(() => {
    // Newest first on whichever date basis the user reads the app in, so a
    // row cannot sit here in a different order than on Transactions.
    return [...transactions]
      .sort((a, b) => getTxDate(b, preferences.dateType).getTime() - getTxDate(a, preferences.dateType).getTime())
      .slice(0, MAX_ROWS);
  }, [transactions, preferences.dateType]);

  if (rows.length === 0) return null;

  const signedAmount = (tx: Transaction) => {
    if (tx.type === "income") return tx.amount;
    if (tx.type === "transfer") return 0;
    return -tx.amount;
  };

  return (
    <div className="ft-card-flush flex flex-col">
      <div className="ft-card-head">
        <div className="min-w-0">
          <h3 className="ft-card-title">
            {t("dashboard.recentActivity", { defaultValue: "Recent activity" })}
          </h3>
          <p className="ft-card-sub">
            {t("dashboard.lastNTransactions", {
              defaultValue: "Last {{count}} transactions",
              count: rows.length,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/transactions")}
          className="inline-flex items-center gap-1 h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550] text-fg-mute hover:bg-bg-hover hover:text-foreground transition-colors flex-shrink-0"
        >
          {t("dashboard.history", { defaultValue: "History" })}
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-col">
        {rows.map((tx) => {
          const userIcon = getCategoryIcon(tx.category?.icon ?? null);
          const Fallback =
            tx.type === "income" ? ArrowDownRight : tx.type === "transfer" ? ArrowRightLeft : ArrowUpRight;
          const Icon = userIcon ?? Fallback;
          const tint = userIcon && tx.category ? tx.category.color : null;
          const signed = signedAmount(tx);
          // The row's second line is the pack's " · "-joined context: what
          // kind of spend, out of which account.
          const meta = [
            tx.category?.name ??
              (tx.type === "transfer"
                ? t("transactions.internalTransfer", { defaultValue: "Internal transfer" })
                : t("common.uncategorized", { defaultValue: "Uncategorized" })),
            tx.account?.name,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <button
              key={tx.id}
              type="button"
              onClick={() => navigate("/transactions")}
              className="ft-list-row plain grid-cols-[34px_minmax(0,1fr)_auto]"
              style={{ paddingTop: 10, paddingBottom: 10 }}
            >
              <span
                className={`h-[34px] w-[34px] rounded-[11px] grid place-items-center flex-shrink-0 ${
                  tint ? "" : "bg-bg-subtle text-fg-mute border border-line"
                }`}
                style={
                  tint
                    ? { background: `color-mix(in oklab, ${tint} 15%, transparent)`, color: tint }
                    : undefined
                }
              >
                <Icon className="h-4 w-4" />
              </span>

              <span className="min-w-0 text-left">
                <span className="ft-row-title block truncate">{tx.description}</span>
                <span className="block text-[11.5px] text-fg-dim truncate">{meta}</span>
              </span>

              <span
                className={`font-mono text-[13px] whitespace-nowrap self-center ${
                  signed > 0 ? "text-pos" : ""
                } ${isPrivacyMode ? "ft-priv" : ""}`}
              >
                {tx.type === "transfer" ? "↔" : signed > 0 ? "+" : "−"}
                {formatCurrency(Math.abs(tx.amount))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
