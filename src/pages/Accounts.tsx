import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Filter,
  MoreVertical,
  Trash2,
  Wallet,
  ArrowRightLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAccountSeries } from "@/hooks/useAccountSeries";
import { AccountSparkline } from "@/components/AccountSparkline";
import { CategoryIcon } from "@/components/CategoryIcon";
import { NewAccountModal } from "@/components/NewAccountModal";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { AccountDetails } from "@/components/AccountDetails";
import { DeleteAccountModal } from "@/components/DeleteAccountModal";
import { BANK_COLORS, getBankLabel, getAccountTypeLabel } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { parseLocalDate } from "@/lib/dateUtils";

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * How the page groups accounts, top to bottom: what you can spend now, what
 * you have put aside, what is tied up. Credit sits with checking — a card
 * balance is money already spent out of the same pot.
 */
const TYPE_GROUPS = [
  {
    key: "liquid",
    types: ["checking", "credit"] as const,
    swatch: "hsl(var(--chart-1))",
    labelKey: "accounts.checking",
    fallback: "Checking",
  },
  {
    key: "savings",
    types: ["savings"] as const,
    swatch: "hsl(var(--chart-2))",
    labelKey: "accounts.savings",
    fallback: "Savings",
  },
  {
    key: "invest",
    types: ["investment"] as const,
    swatch: "hsl(var(--chart-5))",
    labelKey: "accounts.investment",
    fallback: "Investment",
  },
] as const;

const Accounts = () => {
  const { accounts, transactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { dateRange, periodLabel } = usePeriod();
  const { t } = useTranslation();
  const location = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    (location.state as any)?.selectedAccountId || null
  );
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const seriesByAccount = useAccountSeries(accounts, transactions, 90);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const change30dTotal = accounts.reduce(
    (sum, acc) => sum + (seriesByAccount[acc.id]?.change30d ?? 0),
    0
  );

  const checkingTotal = accounts
    .filter((a) => a.account_type === "checking")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
  const savingsTotal = accounts
    .filter((a) => a.account_type === "savings")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
  const investTotal = accounts
    .filter((a) => a.account_type === "investment" || a.account_type === "credit")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
  const compositionTotal = checkingTotal + savingsTotal + investTotal || 1;

  // Average monthly expenses for emergency-fund coverage
  const avgMonthlyExpenses = useMemo(() => {
    if (transactions.length === 0) return 0;
    const today = new Date();
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const recent = transactions.filter((t) => {
      if (t.type !== "expense" || t.include_in_stats === false) return false;
      const d = parseLocalDate(t.transaction_date);
      return d >= sixMonthsAgo && d <= today;
    });
    const total = recent.reduce((s, t) => s + Math.max(0, t.amount - (t.refunded_amount || 0)), 0);
    return total / 6;
  }, [transactions]);
  const efMonths = avgMonthlyExpenses > 0 ? savingsTotal / avgMonthlyExpenses : 0;
  const efTargetMonths = 6;

  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  // The account shown in the overview's right-hand panel. Distinct from
  // `selectedAccountId`, which swaps the page for the full detail view —
  // this one only ever changes what the preview is looking at.
  const [previewAccountId, setPreviewAccountId] = useState<string | null>(null);
  const previewAccount = useMemo(
    () => accounts.find((a) => a.id === previewAccountId) ?? accounts[0],
    [accounts, previewAccountId]
  );
  const previewAccent = previewAccount
    ? BANK_COLORS[previewAccount.bank] || "hsl(var(--primary))"
    : "hsl(var(--primary))";
  const previewSeries = previewAccount ? seriesByAccount[previewAccount.id] : undefined;
  const previewChange = previewSeries?.change30d ?? 0;
  const previewTransactions = useMemo(() => {
    if (!previewAccount) return [];
    return transactions.filter(
      (tx) =>
        tx.account_id === previewAccount.id || tx.transfer_to_account_id === previewAccount.id
    );
  }, [transactions, previewAccount]);

  const fmtBal = (v: number, opts?: { sign?: boolean }) =>
    hideBalances ? "•••••" : (opts?.sign && v >= 0 ? "+" : "") + formatCurrency(v);

  if (loading) {
    return <LoadingSpinner text="Chargement..." />;
  }

  // ============= ACCOUNT DETAIL VIEW =============
  if (selectedAccountId && selectedAccount) {
    const accent = BANK_COLORS[selectedAccount.bank] || "hsl(var(--primary))";
    const accountSeries = seriesByAccount[selectedAccountId];
    const change30d = accountSeries?.change30d ?? 0;
    const changePct = accountSeries?.changePct ?? 0;

    // Mini stats for the period
    const periodTxns = transactions.filter((tx) => {
      if (tx.account_id !== selectedAccountId && tx.transfer_to_account_id !== selectedAccountId) return false;
      const d = parseLocalDate(tx.transaction_date);
      return d >= dateRange.start && d <= dateRange.end;
    });
    const periodIncome = periodTxns
      .filter((t) => t.include_in_stats !== false && (t.type === "income" || (t.type === "transfer" && t.transfer_to_account_id === selectedAccountId)))
      .reduce((s, t) => s + t.amount, 0);
    const periodExpense = periodTxns
      .filter((t) => t.include_in_stats !== false && (t.type === "expense" || (t.type === "transfer" && t.account_id === selectedAccountId)))
      .reduce((s, t) => s + (t.type === "transfer" ? t.amount + (t.transfer_fee || 0) : Math.max(0, t.amount - (t.refunded_amount || 0))), 0);
    const periodNet = periodIncome - periodExpense;

    return (
      <div className="min-h-screen bg-background pb-20 md:pb-12">
        <div className="ft-page">
          {/* Detail header */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedAccountId(null)}
              className="h-8 w-8 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div
              className="h-12 w-12 rounded-xl grid place-items-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: accent }}
            >
              {initialsOf(selectedAccount.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="ft-eyebrow">{getBankLabel(selectedAccount.bank, t)}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="ft-page-title text-2xl">{selectedAccount.name}</h1>
                <span className="ft-tag">{getAccountTypeLabel(selectedAccount.account_type, t)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHideBalances(!hideBalances)}
                className="h-8 w-8 p-0"
              >
                {hideBalances ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[240px]">
                  <DropdownMenuItem
                    disabled={accounts.length <= 1}
                    className="text-destructive focus:text-destructive data-[disabled]:text-muted-foreground"
                    onSelect={(e) => {
                      e.preventDefault();
                      if (accounts.length <= 1) return;
                      setShowDeleteModal(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    {t("accounts.delete", { defaultValue: "Delete account" })}
                  </DropdownMenuItem>
                  {accounts.length <= 1 && (
                    <div className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground leading-snug">
                      {t("accounts.cannotDeleteLast", {
                        defaultValue: "You must keep at least one account.",
                      })}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <DeleteAccountModal
            open={showDeleteModal}
            onOpenChange={setShowDeleteModal}
            account={selectedAccount}
            onDeleted={() => setSelectedAccountId(null)}
          />

          {/* Mini-stats hero strip */}
          <div className="ft-card relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{ background: `radial-gradient(60% 80% at 0% 0%, ${accent}22, transparent 60%)` }}
            />
            <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 md:gap-6 p-5 md:p-6">
              <div className="min-w-0">
                <div className="ft-hero-eyebrow">
                  <span className="live" />
                  {t("accounts.availableBalance", { defaultValue: "Available balance" })}
                </div>
                <div
                  className="ft-hero-value mt-3 break-words"
                 
                >
                  {hideBalances ? "•••••" : formatCurrency(selectedAccount.balance)}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-xs text-muted-foreground">
                  {accountSeries && (
                    <span className={`ft-delta ${change30d >= 0 ? "up" : "down"} whitespace-nowrap`}>
                      {change30d >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtBal(Math.abs(change30d))}
                      <span className="opacity-70 ml-1">({changePct.toFixed(1)}%)</span>
                    </span>
                  )}
                  <span className="whitespace-nowrap">{t("dashboard.past30Days", { defaultValue: "past 30 days" })}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 md:gap-5 md:border-l md:border-line md:pl-6 self-center min-w-0">
                <div className="min-w-0">
                  <div className="text-[10.5px] sm:text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground truncate">
                    {t("common.income", { defaultValue: "Income" })}
                  </div>
                  <div
                    className="font-mono font-medium tracking-tight mt-1 text-pos truncate"
                   
                  >
                    +{fmtBal(periodIncome)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10.5px] sm:text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground truncate">
                    {t("common.expenses", { defaultValue: "Spent" })}
                  </div>
                  <div
                    className="font-mono font-medium tracking-tight mt-1 text-destructive truncate"
                   
                  >
                    −{fmtBal(periodExpense)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10.5px] sm:text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground truncate">
                    {t("dashboard.net", { defaultValue: "Net" })}
                  </div>
                  <div
                    className={`font-mono font-medium tracking-tight mt-1 truncate ${periodNet >= 0 ? "text-pos" : "text-destructive"}`}
                   
                  >
                    {fmtBal(periodNet, { sign: true })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Existing rich detail (charts, transaction list, calendar) */}
          <AccountDetails
            accountId={selectedAccountId}
            transactions={transactions}
            balance={selectedAccount.balance}
            startDate={dateRange.start}
            endDate={dateRange.end}
            periodLabel={periodLabel}
          />
        </div>
      </div>
    );
  }

  // ============= ACCOUNTS OVERVIEW =============
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t("navigation.accounts")}</div>
            <h1 className="ft-page-title">{t("accounts.allAccounts", { defaultValue: "All accounts" })}</h1>
            <div className="ft-page-sub">
              {accounts.length} {t("accounts.linkedAccounts", { defaultValue: "linked accounts" })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHideBalances(!hideBalances)}
              className="h-8 px-3 gap-1.5"
            >
              {hideBalances ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">
                {hideBalances
                  ? t("common.show", { defaultValue: "Show" })
                  : t("common.hide", { defaultValue: "Hide" })}
              </span>
            </Button>
            <Button
              data-tour="accounts-add"
              onClick={() => setShowNewAccountModal(true)}
              size="sm"
              className="h-8 px-3 gap-1.5 font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("accounts.linkAccount", { defaultValue: "Link account" })}
              </span>
            </Button>
          </div>
        </div>

        {/* Three shapes of money, before any individual account. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {TYPE_GROUPS.map((group) => {
            const list = accounts.filter((a) => (group.types as readonly string[]).includes(a.account_type));
            const total = list.reduce((s, a) => s + a.balance, 0);
            return (
              <div key={group.key} className="ft-card p-4 md:p-5">
                <div className="flex items-center gap-2">
                  <i className="h-2.5 w-2.5 rounded-[3px] flex-shrink-0" style={{ background: group.swatch }} />
                  <span className="ft-kpi-label truncate">{t(group.labelKey, { defaultValue: group.fallback })}</span>
                </div>
                <div className="font-mono text-[26px] font-medium tracking-[-0.03em] mt-2.5 mb-1 truncate">
                  {fmtBal(total)}
                </div>
                <div className="text-xs text-fg-dim truncate">
                  {t("accounts.nAccounts", { count: list.length, defaultValue: "{{count}} accounts" })}
                  {compositionTotal > 0 && ` · ${((Math.max(0, total) / compositionTotal) * 100).toFixed(0)} %`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grouped lists on the left, the highlighted account on the right —
            picking a row is a cheap preview, not a navigation. */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 md:gap-5 items-start">
          <div className="flex flex-col gap-4 md:gap-5 min-w-0">
            {TYPE_GROUPS.map((group) => {
              const list = accounts.filter((a) => (group.types as readonly string[]).includes(a.account_type));
              if (list.length === 0) return null;
              const total = list.reduce((s, a) => s + a.balance, 0);
              return (
                <div key={group.key} className="ft-card-flush">
                  <div className="ft-card-head px-5 pt-5 pb-0">
                    <div>
                      <h3 className="ft-card-title">{t(group.labelKey, { defaultValue: group.fallback })}</h3>
                      <div className="ft-card-sub">
                        {t("accounts.nAccounts", { count: list.length, defaultValue: "{{count}} accounts" })} · {fmtBal(total)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    {list.map((account) => {
                      const accent = BANK_COLORS[account.bank] || "hsl(var(--primary))";
                      const series = seriesByAccount[account.id];
                      const change = series?.change30d ?? 0;
                      const flat = Math.abs(change) < 0.01;
                      const active = previewAccountId === account.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => setPreviewAccountId(account.id)}
                          onDoubleClick={() => setSelectedAccountId(account.id)}
                          aria-pressed={active}
                          className="ft-list-row text-left w-full"
                          style={{
                            gridTemplateColumns: "38px minmax(0,1fr) 84px auto",
                            background: active ? "hsl(var(--accent-wash))" : undefined,
                          }}
                        >
                          <div className="ft-glyph" style={{ background: `${accent}1F`, color: accent }}>
                            {initialsOf(account.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-[13.5px] truncate">{account.name}</div>
                            <div className="text-[11.5px] text-fg-dim truncate">
                              {getBankLabel(account.bank, t)} · {getAccountTypeLabel(account.account_type, t)}
                            </div>
                          </div>
                          <div className="h-[30px] hidden sm:block">
                            {series && series.series.length > 1 && (
                              <AccountSparkline series={series.series} color={accent} height={30} fill={false} />
                            )}
                          </div>
                          <div className="text-right">
                            <div className={`font-mono text-sm font-medium ${account.balance < 0 ? "text-destructive" : ""}`}>
                              {fmtBal(account.balance)}
                            </div>
                            {!flat && (
                              <div className="mt-0.5">
                                <span className={`ft-delta ${change > 0 ? "up" : "down"}`}>
                                  {change > 0 ? "↑" : "↓"} {fmtBal(Math.abs(change))}
                                </span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setShowNewAccountModal(true)}
              className="ft-card p-5 flex items-center justify-center gap-2.5 border-dashed bg-bg-subtle text-fg-mute hover:text-foreground hover:border-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="font-semibold text-[13px]">
                {t("accounts.linkNewAccount", { defaultValue: "Link a new account" })}
              </span>
            </button>
          </div>

          {/* Preview panel */}
          {previewAccount && (
            <div className="flex flex-col gap-4 md:gap-5 min-w-0">
              <div className="ft-card p-5">
                <div className="ft-card-head !mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="ft-glyph !h-[42px] !w-[42px] !rounded-[14px] !text-[13px]"
                      style={{ background: `${previewAccent}1F`, color: previewAccent }}
                    >
                      {initialsOf(previewAccount.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="ft-card-title truncate">{previewAccount.name}</h3>
                      <div className="ft-card-sub truncate">
                        {getBankLabel(previewAccount.bank, t)} · {getAccountTypeLabel(previewAccount.account_type, t)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={`font-mono text-[32px] font-medium tracking-[-0.03em] truncate ${previewAccount.balance < 0 ? "text-destructive" : ""}`}>
                  {fmtBal(previewAccount.balance)}
                </div>
                {Math.abs(previewChange) > 0.01 && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`ft-delta ${previewChange > 0 ? "up" : "down"}`}>
                      {previewChange > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtBal(Math.abs(previewChange))}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {t("dashboard.past30Days", { defaultValue: "past 30 days" })}
                    </span>
                  </div>
                )}
                {previewSeries && previewSeries.series.length > 1 && (
                  <div className="mt-4 h-[78px]">
                    <AccountSparkline series={previewSeries.series} color={previewAccent} height={78} fill />
                  </div>
                )}
                {/* The pack's action row: the two things you do to an
                    account, then the account itself. */}
                <div className="flex items-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 gap-1.5"
                    onClick={() => setShowNewTransactionModal(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("common.add", { defaultValue: "Add" })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 gap-1.5"
                    onClick={() => setShowTransferModal(true)}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {t("common.transfers", { defaultValue: "Transfer" })}
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 gap-1.5 font-semibold"
                    onClick={() => setSelectedAccountId(previewAccount.id)}
                  >
                    {t("accounts.openAccount", { defaultValue: "Open account" })}
                  </Button>
                </div>
              </div>

              <div className="ft-card-flush">
                <div className="ft-card-head px-5 pt-5 pb-0">
                  <div>
                    <h3 className="ft-card-title">{t("transactions.recent", { defaultValue: "Recent" })}</h3>
                    <div className="ft-card-sub">
                      {t("transactions.nOnThisAccount", {
                        count: previewTransactions.length,
                        defaultValue: "{{count}} on this account",
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col">
                  {previewTransactions.slice(0, 6).map((tx) => (
                    <div
                      key={tx.id}
                      className="ft-list-row"
                      style={{ gridTemplateColumns: "34px minmax(0,1fr) auto" }}
                    >
                      {tx.category ? (
                        <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={34} />
                      ) : (
                        <div className="ft-glyph sq">
                          {tx.type === "transfer" ? <ArrowLeft className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-[13px] truncate">{tx.description}</div>
                        <div className="text-[11.5px] text-fg-dim truncate">
                          {tx.category?.name ??
                            (tx.type === "transfer"
                              ? t("transactions.transfer", { defaultValue: "Transfer" })
                              : t("common.uncategorized", { defaultValue: "Uncategorized" }))}
                        </div>
                      </div>
                      <div className={`font-mono text-[13.5px] font-medium ${tx.type === "income" ? "text-pos" : ""}`}>
                        {tx.type === "income" ? "+" : "−"}
                        {formatCurrency(tx.amount)}
                      </div>
                    </div>
                  ))}
                  {previewTransactions.length === 0 && (
                    <div className="px-5 py-9 text-center text-[13px] text-fg-dim">
                      {t("transactions.noTransactions", { defaultValue: "No transactions" })}
                    </div>
                  )}
                </div>
                {previewTransactions.length > 6 && (
                  <button
                    type="button"
                    className="ft-row-foot"
                    onClick={() => setSelectedAccountId(previewAccount.id)}
                  >
                    {t("transactions.seeAllN", {
                      count: previewTransactions.length,
                      defaultValue: "See all {{count}}",
                    })}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cash on hand panel */}
        {compositionTotal > 0 && (
          <div className="ft-card p-5 md:p-6">
            <div className="ft-card-head">
              <div>
                <h3 className="ft-card-title">
                  {t("accounts.cashOnHand", { defaultValue: "Cash on hand" })}
                </h3>
                <p className="ft-card-sub">
                  {t("accounts.cashOnHandSub", { defaultValue: "Liquidity by access speed" })}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3.5">
              {[
                {
                  label: t("accounts.instant", { defaultValue: "Instant" }),
                  meta: t("accounts.instantHint", { defaultValue: "Checking & spending" }),
                  v: checkingTotal,
                  color: "hsl(var(--pos))",
                },
                {
                  label: t("accounts.oneTwoDays", { defaultValue: "1–2 days" }),
                  meta: t("accounts.savingsAccounts", { defaultValue: "Savings accounts" }),
                  v: savingsTotal,
                  color: "hsl(var(--info))",
                },
                {
                  label: t("accounts.upToFiveDays", { defaultValue: "Up to 5 days" }),
                  meta: t("accounts.brokerageHint", { defaultValue: "Brokerage / sale required" }),
                  v: investTotal,
                  color: "hsl(var(--warning))",
                },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-medium min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                    <span className="truncate">{row.label}</span>
                  </div>
                  <div className="font-mono text-[13px] font-medium whitespace-nowrap">{fmtBal(row.v)}</div>
                  <div className="col-span-2 ft-progress-track">
                    <div
                      className="ft-progress-fill"
                      style={{ width: `${(row.v / compositionTotal) * 100}%`, background: row.color }}
                    />
                  </div>
                  <div className="col-span-2 text-[11px] text-fg-dim truncate">{row.meta}</div>
                </div>
              ))}
            </div>

            {/* Emergency fund coverage */}
            {avgMonthlyExpenses > 0 && (
              <div className="mt-5 pt-4 border-t border-line">
                <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-dim">
                  {t("accounts.emergencyFundCoverage", {
                    defaultValue: "Emergency fund coverage",
                  })}
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-mono text-2xl font-medium tracking-tight">
                    {efMonths.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("accounts.monthsOfExpenses", {
                      defaultValue: "months of expenses",
                    })}
                  </span>
                </div>
                <div className="relative h-2 mt-3 rounded-full bg-bg-subtle overflow-visible">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (efMonths / efTargetMonths) * 100)}%`,
                      background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--pos)))",
                    }}
                  />
                  <div
                    className="absolute -top-1 w-0.5 h-4 bg-foreground rounded-sm"
                    style={{ left: "100%", transform: "translateX(-1px)" }}
                  >
                    <div className="absolute top-5 left-0 -translate-x-1/2 text-[10px] font-mono text-muted-foreground">
                      {efTargetMonths}mo
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <NewAccountModal open={showNewAccountModal} onOpenChange={setShowNewAccountModal} />
      <NewTransactionModal
        open={showNewTransactionModal}
        onOpenChange={setShowNewTransactionModal}
      />
      <NewTransactionModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        defaultType="transfer"
      />
    </div>
  );
};

export default Accounts;
