import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, Calendar, Receipt, Search, Tag, Wallet } from "lucide-react";

import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetHeader,
  DetailSheetTitle,
} from "@/components/ui/detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useDateFnsLocale } from "@/hooks/useDateFnsLocale";
import type { Transaction } from "@/hooks/useFinancialData";
import { parseLocalDate } from "@/lib/dateUtils";
import type { ParsedQuery } from "@/lib/searchQuery";

interface SearchResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: ParsedQuery | null;
  /** Already-filtered transactions matching the query. */
  transactions: Transaction[];
  /** Names for matched filter chips. */
  matchedCategoryNames: string[];
  matchedAccountNames: string[];
  /** Optional: open the full Transactions page with the same filters. */
  onOpenTransactions?: () => void;
  /** When true, the parent is feeding rows that include
   *  `include_in_stats === false`. The toggle below lets the user flip this. */
  includeExcluded?: boolean;
  onIncludeExcludedChange?: (next: boolean) => void;
  /** Number of transactions that would be added by enabling the toggle. */
  excludedCount?: number;
}

const typeIcon = (type: Transaction["type"]) => {
  if (type === "income") return <ArrowDownRight className="w-3.5 h-3.5 text-pos" />;
  if (type === "expense") return <ArrowUpRight className="w-3.5 h-3.5 text-neg" />;
  return <ArrowRightLeft className="w-3.5 h-3.5 text-info" />;
};

export function SearchResultModal({
  open,
  onOpenChange,
  query,
  transactions,
  matchedCategoryNames,
  matchedAccountNames,
  onOpenTransactions,
  includeExcluded,
  onIncludeExcludedChange,
  excludedCount = 0,
}: SearchResultModalProps) {
  const { t } = useTranslation();
  const { formatCurrency } = useUserPreferences();
  const dateLocale = useDateFnsLocale();

  const totals = useMemo(() => {
    const sum = transactions.reduce((acc, tx) => acc + Number(tx.amount), 0);
    return { sum, count: transactions.length };
  }, [transactions]);

  const breakdown = useMemo(() => {
    if (!query || query.type === "transfer") return [];
    const map = new Map<string, { name: string; color: string; total: number; count: number }>();
    for (const tx of transactions) {
      const key = tx.category?.id ?? "__none__";
      const name = tx.category?.name ?? t("transactions.uncategorized", { defaultValue: "Uncategorized" });
      const color = tx.category?.color ?? "var(--muted-foreground)";
      const entry = map.get(key) ?? { name, color, total: 0, count: 0 };
      entry.total += Number(tx.amount);
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [transactions, query, t]);

  if (!query) return null;

  const periodLabel = t(query.periodLabelKey, { defaultValue: query.periodLabelDefault });
  const typeLabel = query.type
    ? t(`search.type.${query.type}`, {
        defaultValue:
          query.type === "income" ? "Income" : query.type === "expense" ? "Expenses" : "Transfers",
      })
    : t("search.type.all", { defaultValue: "All transactions" });

  const totalColor =
    query.type === "income"
      ? "text-pos"
      : query.type === "expense"
      ? "text-neg"
      : "text-foreground";

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange}>
      <DetailSheetHeader>
        <DetailSheetTitle>
          <Receipt className="w-5 h-5 text-primary" />
          {typeLabel}
          <span className="text-muted-foreground font-normal">·</span>
          <span className="font-normal text-muted-foreground">{periodLabel}</span>
        </DetailSheetTitle>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {matchedCategoryNames.map((name) => (
            <Badge key={`cat-${name}`} variant="secondary" className="text-xs">
              <Tag className="w-3 h-3 mr-1" />
              {name}
            </Badge>
          ))}
          {matchedAccountNames.map((name) => (
            <Badge key={`acc-${name}`} variant="secondary" className="text-xs">
              <Wallet className="w-3 h-3 mr-1" />
              {name}
            </Badge>
          ))}
          {query.descriptionTokens.map((tok) => (
            <Badge
              key={`desc-${tok}`}
              variant="outline"
              className="text-xs bg-info/10 text-info border-info/30"
            >
              <Search className="w-3 h-3 mr-1" />
              {tok}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">
            <Calendar className="w-3 h-3 mr-1" />
            {format(query.dateRange.start, "d MMM yyyy", { locale: dateLocale })}
            {" – "}
            {format(query.dateRange.end, "d MMM yyyy", { locale: dateLocale })}
          </Badge>
        </div>
      </DetailSheetHeader>

      <DetailSheetBody>
        {/* Headline figure */}
        <div className="text-center py-5 bg-bg-subtle border border-line rounded-2xl">
          <p className={`text-3xl font-bold tabular-nums ${totalColor}`}>
            {query.type === "income" ? "+" : query.type === "expense" ? "-" : ""}
            {formatCurrency(Math.abs(totals.sum))}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            {t("search.transactionCount", {
              count: totals.count,
              defaultValue: `${totals.count} transaction${totals.count === 1 ? "" : "s"}`,
            })}
          </p>
        </div>

        {/* Power-user diagnostic: include rows that are explicitly
            excluded from stats (e.g. internal transfers tagged out).
            Hidden when there's nothing to add. */}
        {onIncludeExcludedChange && excludedCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-line bg-bg-subtle/30">
            <div className="min-w-0">
              <Label className="text-xs">
                {t("search.includeExcluded", {
                  defaultValue: "Include excluded transactions",
                })}
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("search.includeExcludedHint", {
                  count: excludedCount,
                  defaultValue: `+${excludedCount} excluded from stats`,
                })}
              </p>
            </div>
            <Switch
              checked={!!includeExcluded}
              onCheckedChange={onIncludeExcludedChange}
            />
          </div>
        )}

        {/* Category breakdown — only when we have non-transfer rows */}
        {breakdown.length > 1 && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {t("search.breakdown", { defaultValue: "Breakdown by category" })}
            </p>
            <div className="space-y-1.5">
              {breakdown.map((row) => {
                const pct = totals.sum ? (row.total / totals.sum) * 100 : 0;
                return (
                  <div
                    key={row.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-subtle/50 border border-line"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="text-sm flex-1 truncate">{row.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatCurrency(row.total)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transaction list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {t("search.matchingTransactions", { defaultValue: "Matching transactions" })}
            </p>
            {onOpenTransactions && transactions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onOpenTransactions}
              >
                {t("search.openInTransactions", { defaultValue: "Open in Transactions" })}
              </Button>
            )}
          </div>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("search.noResults", { defaultValue: "No transactions match this query." })}
            </p>
          ) : (
            <div className="space-y-1.5">
              {transactions.slice(0, 50).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card hover:bg-bg-subtle/40 transition-colors"
                >
                  {typeIcon(tx.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {format(parseLocalDate(tx.transaction_date), "d MMM yyyy", {
                        locale: dateLocale,
                      })}
                      {tx.account?.name ? ` · ${tx.account.name}` : ""}
                      {tx.category?.name ? ` · ${tx.category.name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                      tx.type === "income"
                        ? "text-pos"
                        : tx.type === "expense"
                        ? "text-neg"
                        : ""
                    }`}
                  >
                    {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                    {formatCurrency(Math.abs(Number(tx.amount)))}
                  </span>
                </div>
              ))}
              {transactions.length > 50 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  {t("search.truncated", {
                    count: transactions.length - 50,
                    defaultValue: `+${transactions.length - 50} more — open in Transactions to see all`,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </DetailSheetBody>
    </DetailSheet>
  );
}
