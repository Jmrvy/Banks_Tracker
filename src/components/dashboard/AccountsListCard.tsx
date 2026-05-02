import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, ArrowRight } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { getBankLabel, getAccountTypeLabel } from "@/lib/constants";

const BANK_COLORS: Record<string, string> = {
  societe_generale: "#E60028",
  revolut: "#0066FF",
  boursorama: "#0099CC",
  bnp_paribas: "#0F1419",
  credit_agricole: "#009E60",
  lcl: "#005CB9",
  caisse_epargne: "#E2001A",
  credit_mutuel: "#0072BC",
  chase: "#117ACA",
  bofa: "#012169",
  wells_fargo: "#D71E28",
  citi: "#003B70",
  capital_one: "#004977",
  other: "#1E1E1E",
};

/**
 * Compact accounts list — used on the dashboard two-up alongside RecentActivity.
 * Modeled on the deck design's Accounts card.
 */
export function AccountsListCard() {
  const { t } = useTranslation();
  const { accounts } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const sorted = [...accounts]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 6);

  return (
    <div className="ft-card-flush flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
        <div>
          <h3 className="ft-card-title">{t("navigation.accounts")}</h3>
          <p className="ft-card-sub">
            {accounts.length} {t("dashboard.linked", { defaultValue: "linked" })}
            {" · "}
            <span className="font-mono">{formatCurrency(total)}</span>{" "}
            {t("dashboard.total", { defaultValue: "total" })}
          </p>
        </div>
        <Link
          to="/accounts"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          <Plus className="h-3 w-3" />
          {t("accounts.linkAccount", { defaultValue: "Link" })}
        </Link>
      </div>

      <div className="flex flex-col">
        {sorted.map((account) => {
          const initials = account.name
            .split(" ")
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const bg = BANK_COLORS[account.bank] || "#1E1E1E";
          return (
            <Link
              key={account.id}
              to="/accounts"
              state={{ selectedAccountId: account.id }}
              className="ft-list-row hover:bg-bg-subtle/60"
              style={{ gridTemplateColumns: "36px 1fr auto" }}
            >
              <div
                className="h-9 w-9 rounded-lg grid place-items-center text-white font-bold text-[11px] tracking-tight"
                style={{ background: bg }}
              >
                {initials || "A"}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-[13.5px] truncate">{account.name}</div>
                <div className="text-[11.5px] text-fg-dim truncate">
                  {getAccountTypeLabel(account.account_type, t)} · {getBankLabel(account.bank, t)}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono text-sm font-medium ${
                    isPrivacyMode ? "blur-md select-none" : ""
                  } ${account.balance < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(account.balance)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="px-5 py-2 border-t border-line">
        <Link
          to="/accounts"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          {t("common.viewAll", { defaultValue: "View all" })}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
