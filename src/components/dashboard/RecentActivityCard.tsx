import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShoppingBag,
  Utensils,
  Car,
  Home as HomeIcon,
  Heart,
  Music,
  Package,
  Zap,
  Banknote,
  ArrowLeftRight,
  Receipt,
} from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { parseLocalDate } from "@/lib/dateUtils";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

const CATEGORY_ICONS: Record<string, typeof ShoppingBag> = {
  groceries: ShoppingBag,
  restaurants: Utensils,
  food: Utensils,
  transport: Car,
  housing: HomeIcon,
  health: Heart,
  music: Music,
  subscriptions: Music,
  energy: Zap,
  utilities: Zap,
};

function pickIcon(categoryName: string | undefined, type: string) {
  if (type === "income") return Banknote;
  if (type === "transfer") return ArrowLeftRight;
  if (!categoryName) return Receipt;
  const key = categoryName.toLowerCase();
  for (const [k, Icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return Package;
}

/**
 * Recent activity card — compact, single-column txn rows.
 * Used in the dashboard two-up alongside Accounts.
 */
export function RecentActivityCard() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { transactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const items = useMemo(() => {
    return [...transactions]
      .filter((tx) => !tx.refund_of_transaction_id)
      .sort(
        (a, b) =>
          parseLocalDate(b.transaction_date).getTime() -
          parseLocalDate(a.transaction_date).getTime()
      )
      .slice(0, 6);
  }, [transactions]);

  return (
    <div className="ft-card-flush flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
        <div>
          <h3 className="ft-card-title">
            {t("dashboard.recentActivity", { defaultValue: "Recent activity" })}
          </h3>
          <p className="ft-card-sub">
            {t("dashboard.lastNTransactions", {
              defaultValue: "Last {{n}} transactions",
              n: items.length,
            })}
          </p>
        </div>
        <Link
          to="/transactions"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          {t("common.viewAll", { defaultValue: "View all" })}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex flex-col">
        {items.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("dashboard.noTransactions", { defaultValue: "No transactions yet" })}
          </div>
        )}
        {items.map((txn) => {
          const Icon = pickIcon(txn.category?.name, txn.type);
          const positive = txn.type === "income";
          const date = parseLocalDate(txn.transaction_date);
          return (
            <div
              key={txn.id}
              className="ft-list-row"
              style={{ gridTemplateColumns: "36px 1fr auto" }}
            >
              <div className="h-8 w-8 rounded-lg bg-bg-subtle border border-line text-muted-foreground grid place-items-center">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-[13px] truncate">
                  {txn.description}
                </div>
                <div className="text-[11px] text-fg-dim truncate">
                  {txn.category?.name && (
                    <>
                      <span className="ft-tag mr-1.5" style={{ color: txn.category.color }}>
                        <span
                          className="dot"
                          style={{ background: txn.category.color }}
                        />
                        {txn.category.name}
                      </span>
                    </>
                  )}
                  {txn.account?.name} · {format(date, "MMM d", { locale: dateLocale })}
                </div>
              </div>
              <div
                className={`font-mono text-sm font-medium ${
                  isPrivacyMode ? "blur-md select-none" : ""
                } ${positive ? "text-pos" : "text-foreground"}`}
              >
                {positive ? "+" : "−"}
                {formatCurrency(Math.abs(txn.amount))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
