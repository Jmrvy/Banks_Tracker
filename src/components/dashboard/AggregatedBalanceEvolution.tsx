import { useMemo, useState } from "react";
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
import { signedGlobalAmount } from "@/lib/reportsEngine";
import { parseLocalDate } from "@/lib/dateUtils";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { getCategoryIcon } from "@/lib/categoryIcons";

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
 * Global balance evolution — last N transactions with running balance, on
 * the shared `.ft-list-row` grammar so it reads as one list language with
 * the accounts card above it.
 */
export const AggregatedBalanceEvolution = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { accounts, transactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + a.balance, 0),
    [accounts]
  );

  // Last 10 transactions sorted most-recent first, with running balance after each
  const items = useMemo(() => {
    // Every row, including refunds: this walks real balances backward, and a
    // refund credit did land in the account. Dropping it while also undoing
    // expenses net of their refunds took the same money off twice and showed
    // balances that never existed.
    const sorted = [...transactions]
      .sort(
        (a, b) =>
          parseLocalDate(b.transaction_date).getTime() -
          parseLocalDate(a.transaction_date).getTime()
      )
      .slice(0, 10);

    if (sorted.length === 0) return [];

    let running = totalBalance;
    const out: { transaction: typeof sorted[number]; balanceAfter: number }[] = [];
    sorted.forEach((tx, idx) => {
      if (idx === 0) {
        out.push({ transaction: tx, balanceAfter: running });
      } else {
        // Undo the previous row exactly as the ledger applied it — gross,
        // no refund netting, fee included.
        const prev = sorted[idx - 1];
        running -= signedGlobalAmount(prev as any);
        out.push({ transaction: tx, balanceAfter: running });
      }
    });
    return out;
  }, [transactions, totalBalance]);

  if (items.length === 0) return null;

  return (
    <div className="ft-card-flush flex flex-col">
      <div className="ft-card-head">
        <div>
          <h3 className="ft-card-title">
            {t("dashboard.globalBalanceEvolution", { defaultValue: "Global balance evolution" })}
          </h3>
          <p className="ft-card-sub">
            {t("dashboard.lastNTransactionsBalance", {
              defaultValue: "Last {{n}} transactions · running balance",
              n: items.length,
            })}
          </p>
        </div>
        <Link
          to="/transactions"
          className="text-[12px] font-[550] text-fg-mute hover:text-foreground inline-flex items-center gap-1 flex-shrink-0 no-underline hover:no-underline"
        >
          {t("common.viewAll", { defaultValue: "View all" })}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex flex-col">
        {items.map(({ transaction: tx, balanceAfter }) => {
          const userIcon = getCategoryIcon(tx.category?.icon ?? null);
          const Icon = userIcon ?? pickIcon(tx.category?.name, tx.type);
          const tintColor = userIcon && tx.category ? tx.category.color : null;
          const positive = tx.type === "income";
          const date = parseLocalDate(tx.transaction_date);
          return (
            <button
              key={tx.id}
              type="button"
              onClick={() => setSelectedTransaction(tx)}
              className="ft-list-row tx"
            >
              <div
                className={`h-[34px] w-[34px] rounded-[11px] grid place-items-center flex-shrink-0 ${
                  tintColor ? "" : "bg-bg-subtle border border-line-soft text-fg-mute"
                }`}
                style={
                  tintColor
                    ? { background: `${tintColor}1F`, color: tintColor }
                    : undefined
                }
              >
                <Icon className="h-[17px] w-[17px]" />
              </div>
              <div className="min-w-0">
                <div className="ft-row-title truncate">{tx.description}</div>
                {/* One flat meta line joined by " · " — the category never
                    becomes a second tinted element beside the icon. */}
                <div className="ft-row-sub truncate">
                  {[
                    tx.category?.name ?? t("common.uncategorized", { defaultValue: "Uncategorized" }),
                    tx.account?.name,
                    format(date, "MMM d", { locale: dateLocale }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div
                  className={`ft-row-amt ${isPrivacyMode ? "ft-priv" : ""} ${
                    positive
                      ? "text-pos"
                      : tx.type === "transfer"
                      ? "text-primary"
                      : ""
                  }`}
                >
                  {positive ? "+" : tx.type === "transfer" ? "↔" : "−"}
                  {formatCurrency(Math.abs(tx.amount))}
                </div>
                <div className={`ft-row-amt sub ${isPrivacyMode ? "ft-priv" : ""}`}>
                  → {formatCurrency(balanceAfter)}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          open={!!selectedTransaction}
          onOpenChange={(open) => !open && setSelectedTransaction(null)}
        />
      )}
    </div>
  );
};
