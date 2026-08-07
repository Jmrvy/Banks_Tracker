import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { TransactionSearch, TransactionFilters } from "@/components/TransactionSearch";
import { TransactionHistory } from "@/components/TransactionHistory";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { computePeriodStats } from "@/lib/reportsEngine";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useToast } from "@/hooks/use-toast";
import { useTrace } from "@/contexts/TraceContext";
import { TraceMark } from "@/components/trace/TraceMark";

interface TransactionsLocationState {
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Date column the dateFrom/dateTo range should apply to. When provided
   *  (e.g. coming from Budget), pins the filter so the list matches the
   *  source page regardless of the user's current global preference. */
  dateType?: "accounting" | "value";
}

const Transactions = () => {
  const { t } = useTranslation();
  const { transactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { toast } = useToast();
  const { openDock } = useTrace();
  const location = useLocation();
  const navState = (location.state ?? {}) as TransactionsLocationState;
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false);
  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    searchText: "",
    type: "all",
    categoryId: navState.categoryId ?? "all",
    accountId: "all",
    dateFrom: navState.dateFrom ?? "",
    dateTo: navState.dateTo ?? "",
    amountMin: "",
    amountMax: "",
    refund: "all",
    dateType: navState.dateType,
  }));

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchText) count++;
    if (filters.type !== "all") count++;
    if (filters.categoryId !== "all") count++;
    if (filters.accountId !== "all") count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.amountMin) count++;
    if (filters.amountMax) count++;
    if (filters.refund && filters.refund !== "all") count++;
    return count;
  }, [filters]);

  // Filter predicate — shared by totals in the page head and CSV export
  const matchesFilters = useMemo(() => {
    return (tx: typeof transactions[number]) => {
      if (filters.searchText) {
        const q = filters.searchText.toLowerCase();
        if (
          !tx.description.toLowerCase().includes(q) &&
          !tx.category?.name.toLowerCase().includes(q) &&
          !tx.account?.name.toLowerCase().includes(q)
        )
          return false;
      }
      if (filters.type !== "all" && tx.type !== filters.type) return false;
      if (filters.categoryId !== "all" && tx.category?.id !== filters.categoryId) return false;
      if (
        filters.accountId !== "all" &&
        tx.account_id !== filters.accountId &&
        tx.transfer_to_account_id !== filters.accountId
      )
        return false;
      const activeDateType = filters.dateType ?? preferences.dateType;
      const txDate = activeDateType === "value"
        ? (tx.value_date || tx.transaction_date)
        : tx.transaction_date;
      if (filters.dateFrom && txDate < filters.dateFrom) return false;
      if (filters.dateTo && txDate > filters.dateTo) return false;
      if (filters.amountMin && Math.abs(tx.amount) < parseFloat(filters.amountMin)) return false;
      if (filters.amountMax && Math.abs(tx.amount) > parseFloat(filters.amountMax)) return false;
      if (filters.refund === "refunded" && !((tx.refunded_amount || 0) > 0)) return false;
      if (filters.refund === "is_refund" && !tx.refund_of_transaction_id) return false;
      return true;
    };
  }, [filters, preferences.dateType]);

  /**
   * Where the filtered spend actually goes, biggest first. Drives the
   * sidebar breakdown; each row doubles as a one-click category filter, so
   * the list and the breakdown always describe the same set.
   */
  const breakdown = useMemo(() => {
    const byCategory = new Map<string, { id: string; name: string; color: string; total: number }>();
    for (const tx of transactions.filter(matchesFilters)) {
      if (tx.type !== "expense" || tx.include_in_stats === false) continue;
      const net = Math.max(0, tx.amount - (tx.refunded_amount || 0));
      if (net <= 0) continue;
      const id = tx.category?.id ?? "__none";
      const existing = byCategory.get(id);
      if (existing) existing.total += net;
      else
        byCategory.set(id, {
          id,
          name: tx.category?.name ?? t("common.uncategorized", { defaultValue: "Uncategorized" }),
          color: tx.category?.color ?? "hsl(var(--fg-dim))",
          total: net,
        });
    }
    const rows = [...byCategory.values()].sort((a, b) => b.total - a.total);
    return { rows: rows.slice(0, 7), max: rows[0]?.total ?? 1 };
  }, [transactions, matchesFilters, t]);

  // Totals reflect the active filters so the header stays in sync
  const totals = useMemo(() => {
    const filtered = transactions.filter(matchesFilters);
    // The engine, so this header agrees with the Budget card a click away.
    // Hand-rolled, it counted special-budget rows and advance settlements as
    // spending and summed income gross — which is how a Loisirs filter read
    // 823,88 € here beside 588,88 € on the budget card for the same period.
    const s = computePeriodStats(filtered as any);
    return { count: filtered.length, income: s.income, expenses: s.expenses };
  }, [transactions, matchesFilters]);

  // CSV export of the currently-filtered set
  const handleExportCSV = () => {
    const filtered = transactions.filter(matchesFilters);


    if (filtered.length === 0) {
      toast({
        title: t("transactions.noResults", { defaultValue: "No results" }),
        description: t("transactions.noResultsHint", {
          defaultValue: "Adjust your filters and try again",
        }),
      });
      return;
    }

    const escape = (v: string | number | null | undefined) => {
      const s = (v ?? "").toString();
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "Date",
      "Value date",
      "Type",
      "Description",
      "Category",
      "Account",
      "Amount",
      "Refunded",
      "Transfer fee",
      "Include in stats",
    ];
    const rows = filtered.map((tx) =>
      [
        tx.transaction_date,
        tx.value_date || "",
        tx.type,
        tx.description,
        tx.category?.name || "",
        tx.account?.name || "",
        tx.amount,
        tx.refunded_amount || 0,
        tx.transfer_fee || 0,
        tx.include_in_stats ? "yes" : "no",
      ].map(escape).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: t("transactions.exported", { defaultValue: "Exported" }),
      description: t("transactions.exportedHint", {
        defaultValue: "{{n}} transactions exported to CSV",
        n: filtered.length,
      }),
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.transactions")}</div>
            <h1 className="ft-page-title">
              {t("transactions.allTransactions", { defaultValue: "All transactions" })}
            </h1>
            <div className="ft-page-sub flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="whitespace-nowrap">
                <span className="font-mono">{totals.count.toLocaleString()}</span>{" "}
                {t("transactions.transactions", { defaultValue: "transactions" })}
              </span>
              <span className="text-fg-dim">·</span>
              <span className="whitespace-nowrap">
                <span className="font-mono">{formatCurrency(totals.expenses)}</span>{" "}
                {t("transactions.inExpenses", { defaultValue: "in expenses" })}
              </span>
              <span className="text-fg-dim">·</span>
              <span className="whitespace-nowrap">
                <span className="font-mono">{formatCurrency(totals.income)}</span>{" "}
                {t("transactions.inIncome", { defaultValue: "in income" })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-8 px-3 gap-1.5"
              aria-label={t("transactions.exportCSV", { defaultValue: "Export CSV" })}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("transactions.exportCSV", { defaultValue: "Export CSV" })}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={() => setShowNewTransactionModal(true)}
              className="h-8 px-3 gap-1.5 font-semibold"
              aria-label={t("transactions.add", { defaultValue: "Add" })}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("transactions.add", { defaultValue: "Add" })}
              </span>
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div data-tour="tx-filters">
          <TransactionSearch
            filters={filters}
            onFiltersChange={setFilters}
            activeFiltersCount={activeFiltersCount}
          />
        </div>

        {/* The ledger, with what it adds up to alongside it. */}
        <div className="ft-g2s items-start">
          <TransactionHistory filters={filters} />

          <aside className="flex flex-col gap-[18px] min-w-0">
            {breakdown.rows.length > 0 && (
              <div className="ft-card">
                <div className="ft-card-head !mb-3">
                  <div>
                    <h3 className="ft-card-title">
                      {t("dashboard.distribution", { defaultValue: "Distribution" })}
                    </h3>
                    <div className="ft-card-sub">
                      {t("transactions.breakdownHint", {
                        defaultValue: "Tap a category to filter",
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col">
                  {breakdown.rows.map((row) => {
                    const active = filters.categoryId === row.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            categoryId: active || row.id === "__none" ? "all" : row.id,
                          }))
                        }
                        disabled={row.id === "__none"}
                        className="ft-catrow disabled:cursor-default"
                      >
                        <span className="flex items-center gap-2 text-[12.5px] font-[550] min-w-0">
                          <i className="ft-swatch" style={{ background: row.color }} />
                          <span className={`truncate ${active ? "text-accent-deep font-semibold" : ""}`}>
                            {row.name}
                          </span>
                        </span>
                        <span className="font-mono text-[12.5px] whitespace-nowrap">
                          {formatCurrency(row.total)}
                        </span>
                        <div className="col-span-2 ft-progress-track thin">
                          <div
                            className="ft-progress-fill"
                            style={{
                              width: `${(row.total / breakdown.max) * 100}%`,
                              background: row.color,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The copilot, offered where a "why is this so high?" question
                actually occurs — next to the numbers that prompt it. */}
            <button
              type="button"
              onClick={openDock}
              className="ft-card sunk flex items-start gap-3 text-left hover:border-line-strong transition-colors"
            >
              <div className="ft-kpi-icon acc">
                <TraceMark size="sm" plain />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-[650]">
                  {t("trace.askTrace", { defaultValue: "Ask Trace" })}
                </div>
                <div className="text-[12px] text-fg-mute mt-[3px]">
                  {t("trace.askAboutPage", { defaultValue: "Ask Trace about this page" })}
                </div>
              </div>
            </button>
          </aside>
        </div>
      </div>

      <NewTransactionModal
        open={showNewTransactionModal}
        onOpenChange={setShowNewTransactionModal}
      />
    </div>
  );
};

export default Transactions;
