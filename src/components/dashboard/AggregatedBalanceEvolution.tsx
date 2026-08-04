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
 * Global balance evolution — last N transactions with running balance,
 * styled like RecentActivityCard so the dashboard reads consistently.
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
      <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 md:py-5 border-b border-line">
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
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium flex-shrink-0"
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
              className="grid items-center gap-3 px-4 md:px-5 py-3 border-b border-line last:border-b-0 hover:bg-bg-subtle/60 transition-colors text-left"
              style={{ gridTemplateColumns: "32px minmax(0, 1fr) auto" }}
            >
              <div
                className={`h-8 w-8 rounded-lg grid place-items-center flex-shrink-0 ${
                  tintColor ? "" : "bg-bg-subtle border border-line text-muted-foreground"
                }`}
                style={
                  tintColor
                    ? { background: `${tintColor}1F`, color: tintColor }
                    : undefined
                }
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-[13px] truncate">{tx.description}</div>
                <div className="text-[11px] text-fg-dim truncate flex items-center gap-1.5">
                  {tx.category?.name && (
                    <span
                      className="ft-tag truncate max-w-[140px]"
                      style={{
                        background: `${tx.category.color}1f`,
                        color: tx.category.color,
                        borderColor: "transparent",
                      }}
                    >
                      <span
                        className="dot flex-shrink-0"
                        style={{ background: tx.category.color }}
                      />
                      <span className="truncate">{tx.category.name}</span>
                    </span>
                  )}
                  <span className="truncate">
                    {tx.account?.name} · {format(date, "MMM d", { locale: dateLocale })}
                  </span>
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div
                  className={`font-mono text-sm font-medium ${
                    isPrivacyMode ? "blur-md select-none" : ""
                  } ${
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
                <div
                  className={`font-mono text-[10.5px] mt-0.5 ${
                    isPrivacyMode ? "blur-md select-none" : "text-fg-dim"
                  }`}
                >
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
