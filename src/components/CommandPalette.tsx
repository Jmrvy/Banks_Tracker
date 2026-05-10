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
import { useDateFnsLocale } from '@/hooks/useDateFnsLocale';
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
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Sparkles,
  Lightbulb,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import { parseQuery, normalise, type ParsedQuery, type PeriodKind } from '@/lib/searchQuery';
import { SearchResultModal } from '@/components/SearchResultModal';

/** Recent-transaction icon driven by transaction type so colorblind
 *  users get a directional cue alongside the colour. */
const recentIcon = (type: 'income' | 'expense' | 'transfer') => {
  if (type === 'income') return <ArrowDownLeft className="mr-2 h-4 w-4 text-pos" />;
  if (type === 'expense') return <ArrowUpRight className="mr-2 h-4 w-4 text-neg" />;
  return <ArrowRightLeft className="mr-2 h-4 w-4 text-info" />;
};

export const CommandPalette = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const uiLocale: 'fr' | 'en' = i18n.language === 'fr' ? 'fr' : 'en';

  // Pages map to i18n keys + bilingual keyword strings so the palette
  // is fully localized and still searchable in either language.
  const pages = [
    { key: 'home', name: t('navigation.home'), path: '/', icon: Home, keywords: 'accueil dashboard home' },
    { key: 'accounts', name: t('navigation.accounts'), path: '/accounts', icon: Wallet, keywords: 'comptes accounts banque bank' },
    { key: 'transactions', name: t('navigation.transactions'), path: '/transactions', icon: History, keywords: 'historique history depenses revenus expenses income' },
    { key: 'recurring', name: t('navigation.recurringTransactions'), path: '/recurring-transactions', icon: Receipt, keywords: 'recurrentes abonnements subscriptions recurring' },
    { key: 'installments', name: t('navigation.installmentPayments'), path: '/installment-payments', icon: CreditCard, keywords: 'echelonnes mensualites installments payments' },
    { key: 'debts', name: t('navigation.debts'), path: '/debts', icon: Scale, keywords: 'dettes prets emprunts loans' },
    { key: 'savings', name: t('navigation.savings'), path: '/savings', icon: PiggyBank, keywords: 'epargne objectifs goals savings' },
    { key: 'reports', name: t('navigation.analyse'), path: '/analyse', icon: BarChart3, keywords: 'rapports analyse analytics statistiques reports' },
    { key: 'settings', name: t('navigation.settings'), path: '/settings', icon: Settings, keywords: 'parametres preferences profil settings preferences' },
  ];

  // Quick-action create rows. Single-key shortcut hints (kbd) are
  // visual only — typing the letter goes into the cmdk input by
  // design, not into a hotkey listener. Selecting via ↵ navigates.
  const quickActions = [
    {
      key: 'new-transaction',
      name: t('dashboard.newTransaction', { defaultValue: 'New transaction' }),
      path: '/new-transaction',
      icon: Plus,
      shortcut: 'N',
      keywords: 'nouvelle transaction new add ajouter create creer',
    },
    {
      key: 'new-savings-goal',
      name: t('palette.newSavingsGoal', { defaultValue: 'New savings goal' }),
      path: '/savings',
      icon: PiggyBank,
      shortcut: 'G',
      keywords: 'nouvel objectif epargne savings goal',
    },
    {
      key: 'new-debt',
      name: t('palette.newDebt', { defaultValue: 'New debt or loan' }),
      path: '/debts',
      icon: Scale,
      shortcut: 'D',
      keywords: 'nouvelle dette pret loan debt',
    },
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

  // Recent searches (mobile design rec.): persist the last few
  // successful queries so empty-state shows what the user actually
  // searched for, not just generic suggestions. Stored verbatim in the
  // language the user typed — we never translate user input.
  const RECENTS_KEY = 'paletteRecents';
  const RECENTS_MAX = 5;
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENTS_MAX) : [];
    } catch {
      return [];
    }
  });

  const pushRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;
    setRecents((prev) => {
      const dedup = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENTS_MAX);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(dedup));
      } catch {
        // localStorage unavailable / quota — ignore, recents are best-effort.
      }
      return dedup;
    });
  }, []);

  const removeRecent = useCallback((q: string) => {
    setRecents((prev) => {
      const next = prev.filter((r) => r !== q);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch { /* noop */ }
      return next;
    });
  }, []);

  // When the user clicks the × on the period chip we override the
  // parser's resolved range with "all time". Reset whenever the input
  // changes, since a new query gets a fresh evaluation.
  const [periodOverride, setPeriodOverride] = useState<PeriodKind | null>(null);
  useEffect(() => {
    setPeriodOverride(null);
  }, [input]);

  // Result-sheet state: opened when the user activates the parsed-query
  // row. We snapshot *everything* the modal needs (query, both
  // transaction sets, matched names) at click time — closing the
  // palette clears `input`, which would otherwise re-derive the live
  // matched lists to empty and blank out the modal.
  const [resultOpen, setResultOpen] = useState(false);
  const [resultQuery, setResultQuery] = useState<ParsedQuery | null>(null);
  const [resultIncludeExcluded, setResultIncludeExcluded] = useState(false);
  const [resultTxs, setResultTxs] = useState<typeof transactions>([]);
  const [resultTxsAll, setResultTxsAll] = useState<typeof transactions>([]);
  const [resultCategoryNames, setResultCategoryNames] = useState<string[]>([]);
  const [resultAccountNames, setResultAccountNames] = useState<string[]>([]);

  // Reset input + override when the palette closes so the next open
  // starts fresh.
  useEffect(() => {
    if (!open) {
      setInput('');
      setPeriodOverride(null);
    }
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

  // Recent transactions: feeding more rows to cmdk lets its built-in
  // fuzzy filter find older charges (e.g. "netflix" from two months
  // ago) instead of being capped at 5. cmdk handles thousands fine.
  const recentTransactions = useMemo(() => {
    return transactions
      .slice()
      .sort((a, b) => parseLocalDate(b.transaction_date).getTime() - parseLocalDate(a.transaction_date).getTime())
      .slice(0, 200);
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
      locale: uiLocale,
    });
  }, [input, categories, accounts, uiLocale]);

  // The "effective" query merges the parser output with the user's
  // override. When the override is set to all_time, we widen the date
  // range to include everything regardless of what the parser thought.
  const effectiveQuery = useMemo<ParsedQuery | null>(() => {
    if (!parsed) return null;
    if (periodOverride !== 'all_time') return parsed;
    return {
      ...parsed,
      periodKind: 'all_time',
      periodWasDefault: false,
      periodLabelKey: 'search.period.allTime',
      periodLabelDefault: 'All time',
      dateRange: { start: new Date(1970, 0, 1), end: new Date(2999, 11, 31) },
    };
  }, [parsed, periodOverride]);

  // Shared predicate for both filter passes — the only difference
  // between them is whether out-of-stats transactions count.
  const matchPredicate = useCallback(
    (q: ParsedQuery, tx: typeof transactions[number]): boolean => {
      if (q.type && tx.type !== q.type) return false;
      if (q.categoryIds.length && !(tx.category && q.categoryIds.includes(tx.category.id))) return false;
      if (q.accountIds.length && !q.accountIds.includes(tx.account_id)) return false;
      // Free-text description filter — every token must appear in the
      // normalised description. Matches the rest of the parser's
      // case/accent folding so "uber" hits "Uber Eats" and "café"
      // hits "Cafe Loustic".
      if (q.descriptionTokens.length) {
        const desc = normalise(tx.description ?? '');
        for (const tok of q.descriptionTokens) {
          if (!desc.includes(tok)) return false;
        }
      }
      const d =
        preferences.dateType === 'value'
          ? parseLocalDate(tx.value_date || tx.transaction_date)
          : parseLocalDate(tx.transaction_date);
      if (d < q.dateRange.start || d > q.dateRange.end) return false;
      return true;
    },
    [preferences.dateType]
  );

  // Filter transactions for the effective query — used by the headline
  // figure in the pinned result row and by the result modal.
  const matched = useMemo(() => {
    if (!effectiveQuery?.hasSignal) return { txs: [], total: 0 };
    const txs = transactions.filter(
      (tx) => tx.include_in_stats && matchPredicate(effectiveQuery, tx)
    );
    const total = txs.reduce((acc, tx) => acc + Number(tx.amount), 0);
    return { txs, total };
  }, [effectiveQuery, transactions, matchPredicate]);

  // Same query but including out-of-stats transactions — handed to the
  // result modal so its "Include excluded" toggle can swap datasets
  // without re-filtering on every render.
  const matchedWithExcluded = useMemo(() => {
    if (!effectiveQuery?.hasSignal) return [];
    return transactions.filter((tx) => matchPredicate(effectiveQuery, tx));
  }, [effectiveQuery, transactions, matchPredicate]);

  const matchedCategoryNames = useMemo(
    () => effectiveQuery?.categoryIds.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean) as string[]
      ?? [],
    [effectiveQuery, categories]
  );
  const matchedAccountNames = useMemo(
    () => effectiveQuery?.accountIds.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean) as string[]
      ?? [],
    [effectiveQuery, accounts]
  );

  const openResult = useCallback(() => {
    if (!effectiveQuery?.hasSignal) return;
    // Snapshot live derivations into state. closePalette() clears
    // `input`, which re-runs the useMemo chain and would otherwise
    // hand the modal an empty transaction list.
    setResultQuery(effectiveQuery);
    setResultTxs(matched.txs);
    setResultTxsAll(matchedWithExcluded);
    setResultCategoryNames(matchedCategoryNames);
    setResultAccountNames(matchedAccountNames);
    setResultIncludeExcluded(false);
    setResultOpen(true);
    // Capture the typed query so it surfaces in next-session recents.
    pushRecent(input);
    closePalette();
  }, [
    effectiveQuery,
    matched.txs,
    matchedWithExcluded,
    matchedCategoryNames,
    matchedAccountNames,
    closePalette,
    pushRecent,
    input,
  ]);

  const handleOpenInTransactions = useCallback(() => {
    setResultOpen(false);
    navigate('/transactions');
  }, [navigate]);

  const periodLabel = effectiveQuery
    ? t(effectiveQuery.periodLabelKey, { defaultValue: effectiveQuery.periodLabelDefault })
    : '';
  const typeLabel = effectiveQuery?.type
    ? t(`search.type.${effectiveQuery.type}`, {
        defaultValue:
          effectiveQuery.type === 'income' ? 'Income' : effectiveQuery.type === 'expense' ? 'Expenses' : 'Transfers',
      })
    : t('search.type.all', { defaultValue: 'All transactions' });

  // Empty-state suggestions teach the parser's grammar in-context.
  // Selecting a suggestion fills the input so the user can iterate.
  const suggestions = useMemo(
    () => [
      { hint: t('palette.suggestion1', { defaultValue: 'expenses ytd' }), q: 'expenses ytd' },
      { hint: t('palette.suggestion2', { defaultValue: 'income last month' }), q: 'income last month' },
      {
        hint: t('palette.suggestion3', { defaultValue: 'expenses {{cat}} this month', cat: categories[0]?.name ?? 'rent' }),
        q: `expenses ${categories[0]?.name ?? 'rent'} this month`,
      },
      { hint: t('palette.suggestion4', { defaultValue: 'income 2025' }), q: 'income 2025' },
    ],
    [t, categories]
  );

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={input}
        onValueChange={setInput}
        placeholder={t('common.searchPalettePlaceholder', { defaultValue: 'Search pages, transactions, accounts, debts…' })}
      />

      {/* Diagnostic line: surfaces tokens the parser couldn't match so
          the user can see what was/wasn't understood. */}
      {parsed && parsed.unmatchedTokens.length > 0 && (
        <div className="px-4 py-1.5 border-b border-line bg-bg-subtle/50 text-[11px] text-muted-foreground">
          {t('palette.couldNotMatch', { defaultValue: "Couldn't match" })}:{' '}
          <span className="font-mono text-foreground">{parsed.unmatchedTokens.join(' ')}</span>
        </div>
      )}

      <CommandList>
        <CommandEmpty>
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('common.noResults', { defaultValue: 'No results found' })}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('common.tryAnotherSearchTerm', { defaultValue: 'Try a different search term' })}</p>
          </div>
        </CommandEmpty>

        {/* Empty-state: recents (user's own past queries) + suggestions
            (parser grammar examples). Both surfaces are hidden as soon
            as the user starts typing. */}
        {!input && recents.length > 0 && (
          <CommandGroup heading={t('palette.recents', { defaultValue: 'Recent' })}>
            {recents.map((q) => (
              <CommandItem
                key={`recent-${q}`}
                value={`__recent__ ${q}`}
                onSelect={() => setInput(q)}
              >
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono text-foreground truncate">{q}</span>
                <button
                  type="button"
                  aria-label={t('palette.removeRecent', { defaultValue: 'Remove from recents' })}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    removeRecent(q);
                  }}
                  className="ml-auto p-1 rounded hover:bg-bg-hover text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!input && (
          <CommandGroup heading={t('palette.tryGroup', { defaultValue: 'Try a query' })}>
            {suggestions.map((s) => (
              <CommandItem
                key={s.q}
                value={`__suggestion__ ${s.q}`}
                onSelect={() => setInput(s.q)}
              >
                <Lightbulb className="mr-2 h-4 w-4 text-warning" />
                <span className="text-sm font-mono text-foreground">{s.hint}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {t('palette.suggestionHint', { defaultValue: 'Insert' })}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {effectiveQuery?.hasSignal && (
          <>
            <CommandGroup heading={t('search.resultGroup', { defaultValue: 'Search result' })}>
              <CommandItem
                // Use the raw input as the cmdk value so it always matches
                // (cmdk filters items against the input — pinning by
                // matching against the input itself is the simplest path
                // that keeps the row visible regardless of what the user
                // typed).
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
                      effectiveQuery.type === 'income'
                        ? 'text-pos'
                        : effectiveQuery.type === 'expense'
                        ? 'text-neg'
                        : ''
                    }`}
                  >
                    {effectiveQuery.type === 'income' ? '+' : effectiveQuery.type === 'expense' ? '-' : ''}
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
                  {/* Description-token chips — distinct from category /
                      account chips because they're free-text filters
                      against the description column, not entity links. */}
                  {effectiveQuery.descriptionTokens.map((tok) => (
                    <span
                      key={`desc-${tok}`}
                      className="px-1.5 py-0.5 rounded bg-info/10 border border-info/30 text-info inline-flex items-center gap-1"
                    >
                      <Search className="h-2.5 w-2.5" />
                      {tok}
                    </span>
                  ))}
                  {/* Period chip — removable when the parser silently
                      defaulted to YTD, so the user can see and override
                      the auto-default. The × button click is captured
                      via stopPropagation so it doesn't activate the
                      surrounding row. */}
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-subtle border border-line"
                  >
                    {periodLabel}
                    {effectiveQuery.periodWasDefault && periodOverride !== 'all_time' && (
                      <button
                        type="button"
                        aria-label={t('palette.removePeriod', { defaultValue: 'Remove period filter' })}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setPeriodOverride('all_time');
                        }}
                        className="hover:text-foreground transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
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

        <CommandGroup heading={t('palette.pages', { defaultValue: 'Pages' })}>
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

        <CommandSeparator />
        <CommandGroup heading={t('palette.quickActions', { defaultValue: 'Quick actions' })}>
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <CommandItem
                key={qa.key}
                value={`${qa.name} ${qa.keywords}`}
                onSelect={() => handleSelect(qa.path)}
              >
                <Icon className="mr-2 h-4 w-4 text-primary" />
                <span>{qa.name}</span>
                <kbd className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded border border-line bg-card text-[10px] font-medium text-muted-foreground">
                  {qa.shortcut}
                </kbd>
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
                  value={`${account.name} ${account.bank} compte account`}
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
            <CommandGroup heading={t('palette.activeDebts', { defaultValue: 'Active debts' })}>
              {activeDebts.map((debt) => (
                <CommandItem
                  key={debt.id}
                  value={`${debt.description} ${debt.contact_name || ''} dette pret debt loan`}
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
                  value={`${goal.name} epargne objectif savings goal`}
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
                  value={`${tx.description} ${tx.amount} ${tx.account?.name || ''} ${tx.category?.name || ''} transaction`}
                  onSelect={() => handleSelect('/transactions')}
                >
                  {recentIcon(tx.type)}
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{tx.description}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseLocalDate(tx.transaction_date), 'd MMM', { locale: dateLocale })}
                      {tx.account && ` · ${tx.account.name}`}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      tx.type === 'income' ? 'text-pos' : tx.type === 'expense' ? 'text-neg' : 'text-muted-foreground'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {formatCurrency(tx.amount)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Keyboard footer — teaches the shortcuts without being a
          tutorial overlay. Stays present at the bottom of the dialog. */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-line text-[11px] text-muted-foreground bg-bg-subtle/40">
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded border border-line bg-card font-medium">↑</kbd>
          <kbd className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded border border-line bg-card font-medium">↓</kbd>
          {t('palette.kbdNavigate', { defaultValue: 'navigate' })}
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded border border-line bg-card font-medium">↵</kbd>
          {t('palette.kbdOpen', { defaultValue: 'open' })}
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center h-4 min-w-[20px] px-1 rounded border border-line bg-card font-medium">esc</kbd>
          {t('palette.kbdClose', { defaultValue: 'close' })}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center h-4 min-w-[20px] px-1 rounded border border-line bg-card font-medium">⌘K</kbd>
          {t('palette.kbdToggle', { defaultValue: 'toggle' })}
        </span>
      </div>
    </CommandDialog>
    <SearchResultModal
      open={resultOpen}
      onOpenChange={setResultOpen}
      query={resultQuery}
      transactions={resultIncludeExcluded ? resultTxsAll : resultTxs}
      matchedCategoryNames={resultCategoryNames}
      matchedAccountNames={resultAccountNames}
      onOpenTransactions={handleOpenInTransactions}
      includeExcluded={resultIncludeExcluded}
      onIncludeExcludedChange={setResultIncludeExcluded}
      excludedCount={resultTxsAll.length - resultTxs.length}
    />
    </>
  );
};
