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
  Wallet,
} from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAccountSeries } from "@/hooks/useAccountSeries";
import { AccountSparkline } from "@/components/AccountSparkline";
import { NewAccountModal } from "@/components/NewAccountModal";
import { AccountDetails } from "@/components/AccountDetails";
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
  const [hideBalances, setHideBalances] = useState(false);

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
            </div>
          </div>

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
                  className="ft-hero-value mt-3 leading-none break-words"
                  style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)" }}
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
                    style={{ fontSize: "clamp(0.875rem, 3.4vw, 1.125rem)" }}
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
                    style={{ fontSize: "clamp(0.875rem, 3.4vw, 1.125rem)" }}
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
                    style={{ fontSize: "clamp(0.875rem, 3.4vw, 1.125rem)" }}
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

        {/* Net-worth hero with composition breakdown */}
        <div className="ft-card relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(70% 80% at 100% 0%, hsl(var(--primary) / 0.10), transparent 60%)",
            }}
          />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5 sm:gap-6 lg:gap-9 p-5 sm:p-6 md:p-7">
            <div className="min-w-0">
              <div className="ft-hero-eyebrow">
                <span className="live" />
                {t("accounts.totalBalance", { defaultValue: "Total balance" })}
              </div>
              <div
                className="ft-hero-value mt-3 leading-none break-words"
                style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)" }}
              >
                {hideBalances ? "•••••" : formatCurrency(totalBalance)}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-xs text-muted-foreground">
                {Math.abs(change30dTotal) > 0.01 && (
                  <span className={`ft-delta ${change30dTotal >= 0 ? "up" : "down"} whitespace-nowrap`}>
                    {change30dTotal >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {fmtBal(Math.abs(change30dTotal))}
                  </span>
                )}
                <span className="whitespace-nowrap">{t("dashboard.past30Days", { defaultValue: "past 30 days" })}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:gap-4 justify-center min-w-0">
              {/* Stacked composition bar */}
              <div className="flex h-3.5 rounded-lg overflow-hidden border border-line bg-bg-subtle">
                <div
                  style={{ width: `${(checkingTotal / compositionTotal) * 100}%`, background: "hsl(var(--primary))" }}
                  title="Checking"
                />
                <div
                  style={{ width: `${(savingsTotal / compositionTotal) * 100}%`, background: "hsl(var(--info))", borderLeft: "2px solid hsl(var(--bg-elev))" }}
                  title="Savings"
                />
                <div
                  style={{ width: `${(investTotal / compositionTotal) * 100}%`, background: "hsl(var(--warning))", borderLeft: "2px solid hsl(var(--bg-elev))" }}
                  title="Investment"
                />
              </div>
              {/* Legend */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: t("accounts.checking", { defaultValue: "Checking" }), v: checkingTotal, color: "hsl(var(--primary))" },
                  { label: t("accounts.savings", { defaultValue: "Savings" }), v: savingsTotal, color: "hsl(var(--info))" },
                  { label: t("accounts.investment", { defaultValue: "Investment" }), v: investTotal, color: "hsl(var(--warning))" },
                ].map((seg) => (
                  <div key={seg.label} className="rounded-xl bg-bg-subtle border border-line p-2.5 sm:p-3 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground font-medium min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                      <span className="truncate">{seg.label}</span>
                    </div>
                    <div className="font-mono text-sm sm:text-base font-medium mt-1 truncate">{fmtBal(seg.v)}</div>
                    <div className="font-mono text-[10px] sm:text-[11px] text-fg-dim mt-0.5">
                      {((seg.v / compositionTotal) * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Account cards grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="ft-card-title">
              {t("accounts.yourAccounts", { defaultValue: "Your accounts" })}
            </h3>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {t("common.filter", { defaultValue: "Filter" })}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {accounts.map((account) => {
              const accent = BANK_COLORS[account.bank] || "hsl(var(--primary))";
              const series = seriesByAccount[account.id];
              const change = series?.change30d ?? 0;
              const flat = Math.abs(change) < 0.01;
              const up = change > 0;
              return (
                <button
                  key={account.id}
                  type="button"
                  className="ft-card p-4 md:p-5 text-left flex flex-col gap-3.5 hover:border-line-strong transition-all hover:shadow-md"
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-9 w-9 rounded-lg grid place-items-center text-white font-bold text-[11px] flex-shrink-0"
                      style={{ background: accent }}
                    >
                      {initialsOf(account.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate tracking-tight">
                        {account.name}
                      </div>
                      <div className="text-[11.5px] text-fg-dim truncate">
                        {getAccountTypeLabel(account.account_type, t)} · {getBankLabel(account.bank, t)}
                      </div>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="min-w-0">
                    <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-fg-dim">
                      {t("accounts.available", { defaultValue: "Available" })}
                    </div>
                    <div
                      className={`font-mono font-medium tracking-tight mt-0.5 truncate ${
                        account.balance < 0 ? "text-destructive" : ""
                      }`}
                      style={{ fontSize: "clamp(1.25rem, 4.4vw, 1.625rem)" }}
                    >
                      {fmtBal(account.balance)}
                    </div>
                  </div>

                  {/* Sparkline */}
                  {series && series.series.length > 1 && (
                    <div className="h-[42px]">
                      <AccountSparkline series={series.series} color={accent} height={42} />
                    </div>
                  )}

                  {/* Footer: delta + label */}
                  <div className="flex items-center gap-2 pt-3 border-t border-line text-xs min-w-0">
                    <span className={`ft-delta ${flat ? "flat" : up ? "up" : "down"} whitespace-nowrap truncate`}>
                      {flat ? "—" : up ? "↑" : "↓"} {flat ? t("accounts.noChange", { defaultValue: "no change" }) : fmtBal(Math.abs(change))}
                    </span>
                    <span className="text-fg-dim flex-shrink-0">30d</span>
                  </div>
                </button>
              );
            })}

            {/* Add card */}
            <button
              type="button"
              onClick={() => setShowNewAccountModal(true)}
              className="ft-card p-4 md:p-5 text-center flex flex-col items-center justify-center gap-2 border-dashed bg-bg-subtle text-fg-mute hover:text-foreground hover:border-primary transition-colors min-h-[200px]"
            >
              <div className="h-10 w-10 rounded-xl bg-bg-elev border border-line grid place-items-center">
                <Plus className="h-5 w-5" />
              </div>
              <div className="font-semibold text-sm text-foreground">
                {t("accounts.linkNewAccount", { defaultValue: "Link a new account" })}
              </div>
              <div className="text-[11.5px] text-fg-dim">
                {t("accounts.linkNewAccountHint", { defaultValue: "Bank, brokerage, or credit card" })}
              </div>
            </button>
          </div>
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
    </div>
  );
};

export default Accounts;
