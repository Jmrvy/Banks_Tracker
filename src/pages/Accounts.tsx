import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, ArrowLeft } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePeriod } from "@/contexts/PeriodContext";
import { NewAccountModal } from "@/components/NewAccountModal";
import { AccountDetails } from "@/components/AccountDetails";
import { getBankLabel, getAccountTypeLabel } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";

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

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const selectedAccount = useMemo(() => {
    return accounts.find(acc => acc.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  if (loading) {
    return <LoadingSpinner text="Chargement..." />;
  }

  // If an account is selected, show its details
  if (selectedAccountId && selectedAccount) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-12">
        <div className="ft-page">
          {/* Header with back button */}
          <div className="ft-page-head">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedAccountId(null)}
                className="h-8 w-8 flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="ft-eyebrow">{getBankLabel(selectedAccount.bank, t)}</div>
                <h1 className="ft-page-title truncate">{selectedAccount.name}</h1>
                <div className="ft-page-sub">
                  {getAccountTypeLabel(selectedAccount.account_type, t)}
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="ft-eyebrow">{t('accounts.balance', { defaultValue: 'Balance' })}</p>
              <p className={`font-mono text-2xl md:text-3xl font-medium tracking-tight ${selectedAccount.balance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                {formatCurrency(selectedAccount.balance)}
              </p>
            </div>
          </div>

          {/* Account Details with Charts */}
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

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.accounts')}</div>
            <h1 className="ft-page-title">{t('accounts.allAccounts', { defaultValue: 'All accounts' })}</h1>
            <div className="ft-page-sub">
              {accounts.length} {t('accounts.linkedAccounts', { defaultValue: 'linked accounts' })}
              {' · '}
              <span className="font-mono">{formatCurrency(totalBalance)}</span> {t('accounts.totalBalance', { defaultValue: 'total balance' })}
            </div>
          </div>
          <Button
            onClick={() => setShowNewAccountModal(true)}
            size="sm"
            className="h-8 px-3 gap-1.5 font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('accounts.linkAccount', { defaultValue: 'Link account' })}</span>
          </Button>
        </div>

        {/* Balance tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <div className="rounded-2xl p-5 bg-bg-inverse text-background relative overflow-hidden">
            <div className="text-[11px] uppercase tracking-[0.08em] font-semibold opacity-70">
              {t('accounts.totalBalance', { defaultValue: 'Total balance' })}
            </div>
            <div className="font-mono text-3xl font-medium tracking-tight mt-2">
              {formatCurrency(totalBalance)}
            </div>
            <div className="text-xs opacity-80 mt-1">
              {t('accounts.acrossNAccounts', { defaultValue: 'Across {{n}} accounts', n: accounts.length })}
            </div>
          </div>
          <div className="ft-card p-5">
            <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              {t('accounts.checking', { defaultValue: 'Liquid (checking)' })}
            </div>
            <div className="font-mono text-3xl font-medium tracking-tight mt-2">
              {formatCurrency(
                accounts.filter((a) => a.account_type === 'checking').reduce((s, a) => s + a.balance, 0)
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {accounts.filter((a) => a.account_type === 'checking').length} {t('accounts.accounts', { defaultValue: 'accounts' })}
            </div>
          </div>
          <div className="ft-card p-5">
            <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              {t('accounts.savings', { defaultValue: 'Savings & invest.' })}
            </div>
            <div className="font-mono text-3xl font-medium tracking-tight mt-2">
              {formatCurrency(
                accounts.filter((a) => a.account_type !== 'checking').reduce((s, a) => s + a.balance, 0)
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {accounts.filter((a) => a.account_type !== 'checking').length} {t('accounts.accounts', { defaultValue: 'accounts' })}
            </div>
          </div>
        </div>

        {/* Accounts grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {accounts.map((account) => {
            const initials = account.name
              .split(' ')
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();
            return (
              <button
                key={account.id}
                type="button"
                className="ft-card p-5 text-left hover:border-line-strong transition-colors"
                onClick={() => setSelectedAccountId(account.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center font-bold text-xs flex-shrink-0">
                      {initials || 'A'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{account.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {getBankLabel(account.bank, t)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[11px] flex-shrink-0">
                    {getAccountTypeLabel(account.account_type, t)}
                  </Badge>
                </div>
                <div className="mt-4 pt-4 border-t border-line">
                  <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    {t('accounts.balance', { defaultValue: 'Balance' })}
                  </p>
                  <p
                    className={`font-mono text-2xl font-medium tracking-tight mt-1 ${
                      account.balance >= 0 ? 'text-foreground' : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(account.balance)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <NewAccountModal
        open={showNewAccountModal}
        onOpenChange={setShowNewAccountModal}
      />
    </div>
  );
};

export default Accounts;
