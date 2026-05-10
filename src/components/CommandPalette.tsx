import { useEffect, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCommandPalette } from '@/contexts/CommandPaletteContext';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useDebts } from '@/hooks/useDebts';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import {
  Home,
  Wallet,
  History,
  Receipt,
  CreditCard,
  Scale,
  PiggyBank,
  BarChart3,
  Settings,
  Plus,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';
import { parseQuery, type ParsedQuery } from '@/lib/searchQuery';
import { SearchResultModal } from '@/components/SearchResultModal';

export const CommandPalette = () => {
  const { t } = useTranslation();

  const pages = [
    { name: t('dashboard.title'), path: '/', icon: Home, keywords: 'accueil dashboard home' },
    { name: 'Comptes', path: '/accounts', icon: Wallet, keywords: 'banque account' },
    { name: 'Transactions', path: '/transactions', icon: History, keywords: 'historique dépenses revenus' },
    { name: 'Nouvelle transaction', path: '/new-transaction', icon: Plus, keywords: 'ajouter créer' },
    { name: 'Transactions récurrentes', path: '/recurring-transactions', icon: Receipt, keywords: 'abonnements' },
    { name: 'Paiements échelonnés', path: '/installment-payments', icon: CreditCard, keywords: 'mensualités' },
    { name: 'Dettes & Prêts', path: '/debts', icon: Scale, keywords: 'emprunts loans' },
    { name: 'Épargne', path: '/savings', icon: PiggyBank, keywords: 'objectifs goals' },
    { name: 'Rapports', path: '/analyse', icon: BarChart3, keywords: 'analytics statistiques' },
    { name: 'Paramètres', path: '/settings', icon: Settings, keywords: 'préférences profil' },
  ];
  // Open/closed state lives in the global CommandPaletteContext so the
  // sidebar (and any future surface) can call `togglePalette()` directly
  // instead of dispatching a synthetic keyboard event.
  const { open, setOpen, togglePalette, closePalette } = useCommandPalette();
  const navigate = useNavigate();
  const { accounts, transactions, categories } = useFinancialData();
  const { debts } = useDebts();
  const { goals } = useSavingsGoals();
  const { formatCurrency, preferences } = useUserPreferences();

  // Live input value — drives both cmdk filtering and the structured
  // parser that powers the "Search result" pinned row.
  const [input, setInput] = useState('');

  // Result-sheet state: opened when the user activates the parsed-query
  // row. We snapshot the resolved query so closing the palette doesn't
  // strip the modal of its data.
  const [resultOpen, setResultOpen] = useState(false);
  const [resultQuery, setResultQuery] = useState<ParsedQuery | null>(null);

  // Reset input when the palette closes so the next open starts fresh.
  useEffect(() => {
    if (!open) setInput('');
  }, [open]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        togglePalette();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [togglePalette]);

  const handleSelect = useCallback((path: string) => {
    closePalette();
    navigate(path);
  }, [closePalette, navigate]);

  const recentTransactions = useMemo(() => {
    return transactions
      .slice()
      .sort((a, b) => parseLocalDate(b.transaction_date).getTime() - parseLocalDate(a.transaction_date).getTime())
      .slice(0, 5);
  }, [transactions]);

  const activeDebts = useMemo(() => {
    return debts.filter(d => d.status === 'active');
  }, [debts]);

  // Run the natural-language parser on every keystroke. Cheap on the
  // small in-memory dataset.
  const parsed = useMemo<ParsedQuery | null>(() => {
    if (!input.trim()) return null;
    return parseQuery(input, {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    });
  }, [input, categories, accounts]);

  // Filter transactions for the parsed query — used by the headline
  // figure in the pinned result row and by the result modal.
  const matched = useMemo(() => {
    if (!parsed?.hasSignal) return { txs: [], total: 0 };
    const dateOf = (tx: typeof transactions[number]) =>
      preferences.dateType === 'value'
        ? parseLocalDate(tx.value_date || tx.transaction_date)
        : parseLocalDate(tx.transaction_date);
    const txs = transactions.filter((tx) => {
      if (parsed.type && tx.type !== parsed.type) return false;
      if (parsed.categoryIds.length && !(tx.category && parsed.categoryIds.includes(tx.category.id)))
        return false;
      if (parsed.accountIds.length && !parsed.accountIds.includes(tx.account_id)) return false;
      const d = dateOf(tx);
      if (d < parsed.dateRange.start || d > parsed.dateRange.end) return false;
      // Excluded transactions don't belong in totals — they're explicitly out of stats.
      if (!tx.include_in_stats) return false;
      return true;
    });
    const total = txs.reduce((acc, tx) => acc + Number(tx.amount), 0);
    return { txs, total };
  }, [parsed, transactions, preferences.dateType]);

  const matchedCategoryNames = useMemo(
    () => parsed?.categoryIds.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean) as string[]
      ?? [],
    [parsed, categories]
  );
  const matchedAccountNames = useMemo(
    () => parsed?.accountIds.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean) as string[]
      ?? [],
    [parsed, accounts]
  );

  const openResult = useCallback(() => {
    if (!parsed?.hasSignal) return;
    setResultQuery(parsed);
    setResultOpen(true);
    closePalette();
  }, [parsed, closePalette]);

  const handleOpenInTransactions = useCallback(() => {
    setResultOpen(false);
    navigate('/transactions');
  }, [navigate]);

  const periodLabel = parsed
    ? t(parsed.periodLabelKey, { defaultValue: parsed.periodLabelDefault })
    : '';
  const typeLabel = parsed?.type
    ? t(`search.type.${parsed.type}`, {
        defaultValue:
          parsed.type === 'income' ? 'Income' : parsed.type === 'expense' ? 'Expenses' : 'Transfers',
      })
    : t('search.type.all', { defaultValue: 'All transactions' });

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={input}
        onValueChange={setInput}
        placeholder={t('common.searchPalettePlaceholder', { defaultValue: 'Search pages, transactions, accounts, debts…' })}
      />
      <CommandList>
        <CommandEmpty>
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('common.noResults', { defaultValue: 'No results found' })}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('common.tryAnotherSearchTerm', { defaultValue: 'Try a different search term' })}</p>
          </div>
        </CommandEmpty>

        {parsed?.hasSignal && (
          <>
            <CommandGroup heading={t('search.resultGroup', { defaultValue: 'Search result' })}>
              <CommandItem
                // Use the raw input as the cmdk value so it always matches
                // (cmdk filters items against the input — pinning by
                // matching against the input itself is the simplest path).
                value={input + ' __search_result__'}
                onSelect={openResult}
                className="flex-col items-stretch gap-1.5 py-3"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {typeLabel}
                    <span className="text-muted-foreground font-normal"> · </span>
                    <span className="text-muted-foreground font-normal">{periodLabel}</span>
                  </span>
                  <span
                    className={`ml-auto text-base font-semibold tabular-nums ${
                      parsed.type === 'income'
                        ? 'text-pos'
                        : parsed.type === 'expense'
                        ? 'text-neg'
                        : ''
                    }`}
                  >
                    {parsed.type === 'income' ? '+' : parsed.type === 'expense' ? '-' : ''}
                    {formatCurrency(Math.abs(matched.total))}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground pl-6 flex flex-wrap items-center gap-1.5">
                  {matchedCategoryNames.map((name) => (
                    <span key={`cat-${name}`} className="px-1.5 py-0.5 rounded bg-bg-subtle border border-line">
                      {name}
                    </span>
                  ))}
                  {matchedAccountNames.map((name) => (
                    <span key={`acc-${name}`} className="px-1.5 py-0.5 rounded bg-bg-subtle border border-line">
                      {name}
                    </span>
                  ))}
                  <span>
                    {t('search.transactionCount', {
                      count: matched.txs.length,
                      defaultValue: `${matched.txs.length} transaction${matched.txs.length === 1 ? '' : 's'}`,
                    })}
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Pages">
          {pages.map((page) => {
            const Icon = page.icon;
            return (
              <CommandItem
                key={page.path}
                value={`${page.name} ${page.keywords}`}
                onSelect={() => handleSelect(page.path)}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{page.name}</span>
                <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground" />
              </CommandItem>
            );
          })}
        </CommandGroup>

        {accounts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('navigation.accounts')}>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.name} ${account.bank} compte`}
                  onSelect={() => handleSelect('/accounts')}
                >
                  <Wallet className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{account.name}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(account.balance)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {activeDebts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Dettes actives">
              {activeDebts.map((debt) => (
                <CommandItem
                  key={debt.id}
                  value={`${debt.description} ${debt.contact_name || ''} dette prêt`}
                  onSelect={() => handleSelect('/debts')}
                >
                  <Scale className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{debt.description}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(debt.remaining_amount)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {goals && goals.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('savings.goalsTitle')}>
              {goals.map((goal) => (
                <CommandItem
                  key={goal.id}
                  value={`${goal.name} épargne objectif`}
                  onSelect={() => handleSelect('/savings')}
                >
                  <PiggyBank className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{goal.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {recentTransactions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('transactions.recent')}>
              {recentTransactions.map((tx) => (
                <CommandItem
                  key={tx.id}
                  value={`${tx.description} ${tx.amount} ${tx.account?.name || ''} transaction`}
                  onSelect={() => handleSelect('/transactions')}
                >
                  <History className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{tx.description}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseLocalDate(tx.transaction_date), 'dd MMM', { locale: fr })}
                      {tx.account && ` · ${tx.account.name}`}
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${tx.type === 'income' ? 'text-green-500' : tx.type === 'expense' ? 'text-red-500' : ''}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
    <SearchResultModal
      open={resultOpen}
      onOpenChange={setResultOpen}
      query={resultQuery}
      transactions={matched.txs}
      matchedCategoryNames={matchedCategoryNames}
      matchedAccountNames={matchedAccountNames}
      onOpenTransactions={handleOpenInTransactions}
    />
    </>
  );
};
