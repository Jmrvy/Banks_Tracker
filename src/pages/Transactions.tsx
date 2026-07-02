import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { TransactionSearch, TransactionFilters } from "@/components/TransactionSearch";
import { TransactionHistory } from "@/components/TransactionHistory";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useToast } from "@/hooks/use-toast";

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
      return true;
    };
  }, [filters, preferences.dateType]);

  // Totals reflect the active filters so the header stays in sync
  const totals = useMemo(() => {
    const filtered = transactions.filter(matchesFilters);
    const stats = filtered.filter((tx) => tx.include_in_stats !== false);
    const income = stats
      .filter((tx) => tx.type === "income" && !tx.refund_of_transaction_id)
      .reduce((s, tx) => s + tx.amount, 0);
    const expenses = stats
      .filter((tx) => tx.type === "expense")
      .reduce((s, tx) => s + Math.max(0, tx.amount - (tx.refunded_amount || 0)), 0);
    return { count: filtered.length, income, expenses };
  }, [transactions, matchesFilters]);

  // CSV export of the currently-filtered set
  const handleExportCSV = () => {
    const filtered = transactions.filter((tx) => {
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
      // Date range uses the active date type — `filters.dateType` pins it
      // when the navigation specifies one (e.g. Budget → "view
      // transactions"); otherwise fall back to the global preference so
      // the export matches what the user sees on screen.
      const activeDateType = filters.dateType ?? preferences.dateType;
      const txDate = activeDateType === "value"
        ? (tx.value_date || tx.transaction_date)
        : tx.transaction_date;
      if (filters.dateFrom && txDate < filters.dateFrom) return false;
      if (filters.dateTo && txDate > filters.dateTo) return false;
      if (filters.amountMin && Math.abs(tx.amount) < parseFloat(filters.amountMin)) return false;
      if (filters.amountMax && Math.abs(tx.amount) > parseFloat(filters.amountMax)) return false;
      return true;
    });

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

        {/* Grouped transaction list */}
        <TransactionHistory filters={filters} />
      </div>

      <NewTransactionModal
        open={showNewTransactionModal}
        onOpenChange={setShowNewTransactionModal}
      />
    </div>
  );
};

export default Transactions;
