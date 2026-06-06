import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useFinancialData } from '@/hooks/useFinancialData';
import {
  useSpecialBudgets,
  type SpecialBudget,
} from '@/hooks/useSpecialBudgets';
import { useToast } from '@/hooks/use-toast';
import { parseLocalDate } from '@/lib/dateUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  budget: SpecialBudget;
}

/** Pick transactions to link to a special budget. Defaults to suggesting
 *  candidates inside the budget's date range that aren't yet tagged. */
export const LinkTransactionsToSpecialBudget = ({ isOpen, onClose, budget }: Props) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { formatCurrency } = useUserPreferences();
  const { transactions } = useFinancialData();
  const { linkTransactions } = useSpecialBudgets();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [onlyInRange, setOnlyInRange] = useState(!!(budget.start_date || budget.end_date));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions
      .filter((tx) => {
        // Skip already-linked to another special budget; but allow this
        // budget's own tx (so the modal stays useful as a multi-select).
        if (tx.special_budget_id && tx.special_budget_id !== budget.id) return false;
        if (tx.type !== 'expense') return false;
        if (onlyInRange) {
          const d = parseLocalDate(tx.transaction_date);
          if (budget.start_date && d < parseLocalDate(budget.start_date)) return false;
          if (budget.end_date && d > parseLocalDate(budget.end_date)) return false;
        }
        if (q) {
          const hay = `${tx.description} ${tx.category?.name ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          parseLocalDate(b.transaction_date).getTime() -
          parseLocalDate(a.transaction_date).getTime()
      )
      .slice(0, 200);
  }, [transactions, search, onlyInRange, budget]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      onClose();
      return;
    }
    const { error } = await linkTransactions([...selected], budget.id);
    if (error) {
      toast({ title: t('common.error'), description: (error as Error).message, variant: 'destructive' });
      return;
    }
    toast({
      title: t('specialBudgets.linked', {
        defaultValue: '{{n}} transactions linked',
        n: selected.size,
      }),
    });
    setSelected(new Set());
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 flex-shrink-0 border-b border-line">
          <DialogTitle className="text-sm sm:text-lg">
            {t('specialBudgets.linkTitle', { defaultValue: 'Link transactions' })}{' '}
            <span className="text-muted-foreground">→ {budget.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pt-3 sm:px-6 sm:pt-4 flex-shrink-0 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search', { defaultValue: 'Search…' })}
              className="pl-8 h-8 text-xs"
            />
          </div>
          {(budget.start_date || budget.end_date) && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={onlyInRange}
                onCheckedChange={(c) => setOnlyInRange(!!c)}
              />
              {t('specialBudgets.onlyInRange', { defaultValue: 'Only show transactions inside the budget date range' })}
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3 pt-3 sm:px-6 sm:pb-4">
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              {t('specialBudgets.noCandidates', { defaultValue: 'No matching transactions.' })}
            </p>
          ) : (
            <div className="border border-line rounded-lg divide-y divide-line">
              {candidates.map((tx) => {
                const isAlreadyLinked = tx.special_budget_id === budget.id;
                const isChecked = selected.has(tx.id) || isAlreadyLinked;
                return (
                  <label
                    key={tx.id}
                    className={`px-3 py-2 flex items-center gap-3 cursor-pointer hover:bg-bg-subtle/60 ${isAlreadyLinked ? 'opacity-70' : ''}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={isAlreadyLinked}
                      onCheckedChange={() => !isAlreadyLinked && toggle(tx.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate flex items-center gap-1.5">
                        {tx.description}
                        {isAlreadyLinked && (
                          <Badge variant="secondary" className="text-[9px]">
                            {t('specialBudgets.alreadyLinked', { defaultValue: 'linked' })}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(parseLocalDate(tx.transaction_date), 'PP', { locale: dateLocale })}
                        {tx.category && <> · {tx.category.name}</>}
                      </div>
                    </div>
                    <div className="font-mono text-xs flex-shrink-0">
                      {formatCurrency(tx.amount)}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-t border-line flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {t('specialBudgets.selectedCount', {
              defaultValue: '{{n}} selected',
              n: selected.size,
            })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button onClick={handleSubmit} disabled={selected.size === 0}>
              {t('specialBudgets.linkSelected', { defaultValue: 'Link selected' })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
