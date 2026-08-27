import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Eye,
  EyeOff,
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
import { parseLocalDate, getTxDate } from "@/lib/dateUtils";

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
  const { formatCurrency, preferences } = useUserPreferences();
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

  // Liquidity buckets. Two things were wrong here and they compounded:
  //
  //  * every account was floored with Math.max(0, …), so a card sitting at
  //    −491,25 € counted as zero and the panel reported more cash than the
  //    accounts hold. The bucket figures are money, not bar widths — clamping
  //    belongs at the point we draw a bar, which is what the widths below do.
  //  * `credit` was bucketed with `investment` under "up to 5 days /
  //    brokerage". A card is spending access, not something you liquidate;
  //    HeroNetWorth already groups it with checking as "liquid", and these two
  //    surfaces have to agree.
  const sumBalances = (types: readonly string[]) =>
    accounts.filter((a) => types.includes(a.account_type)).reduce((s, a) => s + a.balance, 0);

  const checkingTotal = sumBalances(["checking", "credit"]);
  const savingsTotal = sumBalances(["savings"]);
  const investTotal = sumBalances(["investment"]);
  // Bars can only be drawn from the positive part; a bucket in the red shows
  // its real figure beside an empty track rather than a negative width.
  const compositionScale =
    Math.max(0, checkingTotal) + Math.max(0, savingsTotal) + Math.max(0, investTotal) || 1;
  const barPct = (v: number) => `${Math.min(100, (Math.max(0, v) / compositionScale) * 100)}%`;

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
  const previewChangePct = previewSeries?.changePct ?? 0;
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
      // Honour the accounting/value date preference, the same way the
      // detail tiles and charts below do — otherwise the hero strip and the
      // period cards disagree for any transaction whose two dates straddle
      // the period boundary.
      const d = getTxDate(tx, preferences.dateType);
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
              className="ft-glyph !h-12 !w-12 !rounded-[16px] !text-[14px]"
              style={{
                background: `color-mix(in oklab, ${accent} 15%, transparent)`,
                color: accent,
              }}
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
                aria-label={
                  hideBalances
                    ? t("common.showAmounts", { defaultValue: "Show amounts" })
                    : t("common.hideAmounts", { defaultValue: "Hide amounts" })
                }
              >
                {hideBalances ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={t("common.moreActions", { defaultValue: "More actions" })}
                  >
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
          <div className="ft-card p-0 relative overflow-hidden">
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
                <div className="ft-hero-value mt-3 break-words">
                  {hideBalances ? "•••••" : formatCurrency(selectedAccount.balance)}
                </div>
                {/* The chip carries the percentage only; the absolute figure
                    sits beside it in mute text, the way the system does it. */}
                <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1 mt-3 text-[12.5px] text-muted-foreground">
                  {accountSeries && (
                    <span className={`ft-delta ${change30d >= 0 ? "up" : "down"} whitespace-nowrap`}>
                      {change30d >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {changePct > 0 ? "+" : ""}
                      {changePct.toFixed(1)} %
                    </span>
                  )}
                  <span className="whitespace-nowrap">
                    {fmtBal(change30d, { sign: true })}{" "}
                    {t("dashboard.past30Days", { defaultValue: "past 30 days" })}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 md:gap-[18px] md:border-l md:border-line md:pl-6 self-center min-w-0">
                <div className="ft-hero-stat min-w-0">
                  <span className="ft-eyebrow truncate">
                    {t("common.income", { defaultValue: "Income" })}
                  </span>
                  <span className="ft-hero-stat-value text-pos truncate">
                    +{fmtBal(periodIncome)}
                  </span>
                </div>
                <div className="ft-hero-stat min-w-0">
                  <span className="ft-eyebrow truncate">
                    {t("common.expenses", { defaultValue: "Spent" })}
                  </span>
                  <span className="ft-hero-stat-value text-destructive truncate">
                    −{fmtBal(periodExpense)}
                  </span>
                </div>
                <div className="ft-hero-stat min-w-0">
                  <span className="ft-eyebrow truncate">
                    {t("dashboard.net", { defaultValue: "Net" })}
                  </span>
                  <span
                    className={`ft-hero-stat-value truncate ${periodNet >= 0 ? "text-pos" : "text-destructive"}`}
                  >
                    {fmtBal(periodNet, { sign: true })}
                  </span>
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
              aria-label={
                hideBalances
                  ? t("common.showAmounts", { defaultValue: "Show amounts" })
                  : t("common.hideAmounts", { defaultValue: "Hide amounts" })
              }
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
              aria-label={t("accounts.linkAccount", { defaultValue: "Link account" })}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("accounts.linkAccount", { defaultValue: "Link account" })}
              </span>
            </Button>
          </div>
        </div>

        {/* Three shapes of money, before any individual account. */}
        <div className="ft-g3">
          {TYPE_GROUPS.map((group) => {
            const list = accounts.filter((a) => (group.types as readonly string[]).includes(a.account_type));
            const total = list.reduce((s, a) => s + a.balance, 0);
            return (
              <div key={group.key} className="ft-card p-5">
                <div className="flex items-center gap-2">
                  <i className="ft-swatch !h-2.5 !w-2.5" style={{ background: group.swatch }} />
                  <span className="ft-kpi-label truncate">{t(group.labelKey, { defaultValue: group.fallback })}</span>
                </div>
                <div className="font-mono text-[27px] font-medium tracking-[-0.03em] mt-2.5 mb-1 truncate">
                  {fmtBal(total)}
                </div>
                <div className="text-[12px] text-fg-dim truncate">
                  {t("accounts.nAccounts", { count: list.length, defaultValue: "{{count}} accounts" })}
                  {compositionScale > 0 &&
                    ` · ${((Math.max(0, total) / compositionScale) * 100).toFixed(0)} %`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grouped lists on the left, the highlighted account on the right —
            picking a row is a cheap preview, not a navigation. */}
        <div className="ft-g2 items-start">
          <div className="flex flex-col gap-[18px] min-w-0">
            {TYPE_GROUPS.map((group) => {
              const list = accounts.filter((a) => (group.types as readonly string[]).includes(a.account_type));
              if (list.length === 0) return null;
              const total = list.reduce((s, a) => s + a.balance, 0);
              return (
                <div key={group.key} className="ft-card-flush">
                  <div className="ft-card-head">
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
                      const changePct = series?.changePct ?? 0;
                      const flat = Math.abs(change) < 0.01;
                      const active = previewAccountId === account.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => setPreviewAccountId(account.id)}
                          onDoubleClick={() => setSelectedAccountId(account.id)}
                          aria-pressed={active}
                          /* Four tracks only where the sparkline cell is
                             actually rendered — a `display:none` grid item is
                             not placed, so declaring it below `sm` dropped the
                             balance into the 96px chart column. */
                          className="ft-list-row text-left w-full grid-cols-[38px_minmax(0,1fr)_auto] sm:grid-cols-[38px_minmax(0,1fr)_96px_auto]"
                          style={{ background: active ? "hsl(var(--accent-wash))" : undefined }}
                        >
                          <div
                            className="ft-glyph"
                            style={{
                              background: `color-mix(in oklab, ${accent} 15%, transparent)`,
                              color: accent,
                            }}
                          >
                            {initialsOf(account.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="ft-row-title truncate">{account.name}</div>
                            <div className="ft-row-sub truncate">
                              {getBankLabel(account.bank, t)} · {getAccountTypeLabel(account.account_type, t)}
                            </div>
                          </div>
                          <div className="h-[30px] hidden sm:block">
                            {series && series.series.length > 1 && (
                              <AccountSparkline series={series.series} color={accent} height={30} fill={false} />
                            )}
                          </div>
                          <div>
                            <div className={`ft-row-amt ${account.balance < 0 ? "text-destructive" : ""}`}>
                              {fmtBal(account.balance)}
                            </div>
                            {!flat && (
                              <div className="ft-row-amt sub mt-0.5">
                                <span className={`ft-delta ${change > 0 ? "up" : "down"}`}>
                                  {change > 0 ? (
                                    <ArrowUp className="h-3 w-3" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3" />
                                  )}
                                  {changePct > 0 ? "+" : ""}
                                  {changePct.toFixed(1)} %
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
            <div className="flex flex-col gap-[18px] min-w-0">
              <div className="ft-card">
                <div className="ft-card-head !mb-4 flex-nowrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="ft-glyph !h-[42px] !w-[42px] !rounded-[14px] !text-[13px]"
                      style={{
                        background: `color-mix(in oklab, ${previewAccent} 15%, transparent)`,
                        color: previewAccent,
                      }}
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
                  {/* Per-account overflow, the way the pack's preview head has
                      it — the same actions the full detail view offers. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-[29px] w-[29px] flex-shrink-0 rounded-[9px]"
                        aria-label={t("common.moreActions", { defaultValue: "More actions" })}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px]">
                      <DropdownMenuItem onSelect={() => setSelectedAccountId(previewAccount.id)}>
                        {t("accounts.openAccount", { defaultValue: "Open account" })}
                      </DropdownMenuItem>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className={`font-mono text-[32px] font-medium tracking-[-0.03em] truncate ${previewAccount.balance < 0 ? "text-destructive" : ""}`}>
                  {fmtBal(previewAccount.balance)}
                </div>
                {Math.abs(previewChange) > 0.01 && (
                  <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1 mt-[7px]">
                    <span className={`ft-delta ${previewChange > 0 ? "up" : "down"}`}>
                      {previewChange > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {previewChangePct > 0 ? "+" : ""}
                      {previewChangePct.toFixed(1)} %
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {fmtBal(previewChange, { sign: true })}{" "}
                      {t("dashboard.past30Days", { defaultValue: "past 30 days" })}
                    </span>
                  </div>
                )}
                {previewSeries && previewSeries.series.length > 1 && (
                  <div className="mt-4 h-[78px]">
                    <AccountSparkline series={previewSeries.series} color={previewAccent} height={78} fill />
                  </div>
                )}
                {/* The pack's action row: two 29px text buttons, then a
                    29px icon slot — not three full-height buttons. */}
                <div className="flex items-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-[29px] px-2.5 gap-1.5 rounded-[9px] text-[12px] font-[550]"
                    onClick={() => setShowNewTransactionModal(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("common.add", { defaultValue: "Add" })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-[29px] px-2.5 gap-1.5 rounded-[9px] text-[12px] font-[550]"
                    onClick={() => setShowTransferModal(true)}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {t("common.transfers", { defaultValue: "Transfer" })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-[29px] w-[29px] p-0 rounded-[9px] flex-shrink-0"
                    aria-label={t("accounts.openAccount", { defaultValue: "Open account" })}
                    title={t("accounts.openAccount", { defaultValue: "Open account" })}
                    onClick={() => setSelectedAccountId(previewAccount.id)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="ft-card-flush">
                <div className="ft-card-head">
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
                    <div key={tx.id} className="ft-list-row tx">
                      {tx.category ? (
                        <CategoryIcon icon={tx.category.icon} color={tx.category.color} size={34} />
                      ) : (
                        <div className="ft-glyph sq">
                          {tx.type === "transfer" ? (
                            <ArrowRightLeft className="h-4 w-4" />
                          ) : (
                            <Wallet className="h-4 w-4" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="ft-row-title truncate">{tx.description}</div>
                        <div className="ft-row-sub truncate">
                          {tx.category?.name ??
                            (tx.type === "transfer"
                              ? t("transactions.transfer", { defaultValue: "Transfer" })
                              : t("common.uncategorized", { defaultValue: "Uncategorized" }))}
                        </div>
                      </div>
                      <div className={`ft-row-amt ${tx.type === "income" ? "text-pos" : ""}`}>
                        {tx.type === "income" ? "+" : "−"}
                        {formatCurrency(tx.amount)}
                      </div>
                    </div>
                  ))}
                  {previewTransactions.length === 0 && (
                    <div className="ft-empty">
                      <div className="ft-empty-title">
                        {t("transactions.noTransactions", { defaultValue: "No transactions" })}
                      </div>
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
        {/* Gated on having accounts, not on a positive total — someone whose
            balances net out to zero or below still needs to see where they sit. */}
        {accounts.length > 0 && (
          <div className="ft-card">
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
                      style={{ width: barPct(row.v), background: row.color }}
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
                <div className="ft-progress-track tall !overflow-visible mt-3">
                  <div
                    className="ft-progress-fill"
                    style={{
                      width: `${Math.min(100, (efMonths / efTargetMonths) * 100)}%`,
                      background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--pos)))",
                    }}
                  />
                  <div className="ft-progress-mark" style={{ left: "100%", transform: "translateX(-1px)" }}>
                    <div className="absolute top-4 left-0 -translate-x-1/2 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                      {efTargetMonths}
                      {t("accounts.monthsShort", { defaultValue: "mo" })}
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
      {previewAccount && (
        <DeleteAccountModal
          open={showDeleteModal}
          onOpenChange={setShowDeleteModal}
          account={previewAccount}
          onDeleted={() => setPreviewAccountId(null)}
        />
      )}
    </div>
  );
};

export default Accounts;
