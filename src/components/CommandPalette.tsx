import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  Search,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { accounts, transactions, categories } = useFinancialData();
  const { debts } = useDebts();
  const { goals } = useSavingsGoals();
  const { formatCurrency } = useUserPreferences();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const recentTransactions = useMemo(() => {
    return transactions
      .slice()
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 5);
  }, [transactions]);

  const activeDebts = useMemo(() => {
    return debts.filter(d => d.status === 'active');
  }, [debts]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Rechercher une page, transaction, compte, dette..." />
      <CommandList>
        <CommandEmpty>
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Aucun résultat trouvé</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Essayez un autre terme de recherche</p>
          </div>
        </CommandEmpty>

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
                      {format(new Date(tx.transaction_date), 'dd MMM', { locale: fr })}
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
  );
};
