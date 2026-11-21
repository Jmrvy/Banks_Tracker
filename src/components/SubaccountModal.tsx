import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type Account } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useFxRates } from '@/hooks/useFxRates';
import { COMMON_CURRENCIES, formatInCurrency } from '@/lib/fx';

interface SubaccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The main account the subaccount hangs off. */
  parent: Account | null | undefined;
  /** Set to edit an existing subaccount. */
  subaccount?: Account | null;
}

const parse = (s: string) => {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const ERROR_KEYS: Record<string, string> = {
  currency_locked_once_used: 'subaccounts.errors.currencyLocked',
  invalid_currency: 'subaccounts.errors.invalidCurrency',
  invalid_initial_fx_rate: 'subaccounts.errors.invalidRate',
  parent_must_be_main_account: 'subaccounts.errors.parentMustBeMain',
};

/**
 * Creates or edits a currency subaccount: its currency, what it held when you
 * started tracking it (in that currency) and the rate that money cost you.
 * That opening rate is where the running average starts.
 */
export function SubaccountModal({ open, onOpenChange, parent, subaccount }: SubaccountModalProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { accounts, transactions, saveSubaccount } = useFinancialData();
  const { preferences } = useUserPreferences();
  const base = preferences.currency || 'EUR';
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB';
  const editing = !!subaccount;

  const taken = useMemo(
    () =>
      new Set(
        accounts
          .filter((a) => a.parent_account_id === parent?.id && a.id !== subaccount?.id)
          .map((a) => a.currency),
      ),
    [accounts, parent?.id, subaccount?.id],
  );
  const choices = COMMON_CURRENCIES.filter((c) => c !== base && !taken.has(c));

  const [currency, setCurrency] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [opening, setOpening] = useState('0');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrency(subaccount?.currency ?? choices[0] ?? '');
    setName(subaccount?.name ?? '');
    setNameTouched(!!subaccount);
    setOpening(String(subaccount?.initial_balance ?? 0));
    setRate(subaccount?.initial_fx_rate ? String(subaccount.initial_fx_rate) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subaccount?.id]);

  const { rates } = useFxRates(base, currency ? [currency] : []);
  const marketRate = currency ? rates[currency] : undefined;

  // Prefill today's rate once it is known, unless the user typed one.
  useEffect(() => {
    if (open && !rate && marketRate) setRate(String(Number(marketRate.toFixed(4))));
  }, [open, marketRate, rate]);

  const used = !!subaccount && transactions.some(
    (tx) => tx.account_id === subaccount.id || tx.transfer_to_account_id === subaccount.id,
  );
  const shownName = nameTouched ? name : currency;
  const openingN = parse(opening);
  const rateN = parse(rate);
  const valid = !!currency && /^[A-Z]{3}$/.test(currency) && Number.isFinite(openingN) && rateN > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parent || !valid) return;
    setSaving(true);
    const { error } = await saveSubaccount({
      id: subaccount?.id,
      parent_account_id: parent.id,
      name: shownName || currency,
      currency,
      initial_balance: openingN,
      initial_fx_rate: rateN,
    });
    setSaving(false);
    if (error) {
      const key = Object.keys(ERROR_KEYS).find((k) => error.message?.includes(k));
      const dup = error.message?.includes('accounts_parent_currency_uniq');
      toast({
        title: t('common.error'),
        description: dup
          ? t('subaccounts.errors.duplicate', { defaultValue: 'This account already has a subaccount in this currency.' })
          : key
            ? t(ERROR_KEYS[key])
            : error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: editing
        ? t('subaccounts.updated', { defaultValue: 'Subaccount updated' })
        : t('subaccounts.created', { defaultValue: 'Subaccount created' }),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <Coins className="h-5 w-5" />
            {editing
              ? t('subaccounts.editTitle', { defaultValue: 'Edit subaccount' })
              : t('subaccounts.newTitle', { defaultValue: 'New currency subaccount' })}
          </DialogTitle>
          <DialogDescription>
            {t('subaccounts.description', {
              defaultValue: 'Money held in another currency inside {{parent}}. Its balance counts in the account total, in {{base}}.',
              parent: parent?.name ?? '',
              base,
            })}
          </DialogDescription>
        </DialogHeader>

        <form id="subaccount-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-currency">{t('subaccounts.currency', { defaultValue: 'Currency' })} *</Label>
            <Select value={currency} onValueChange={(v) => { setCurrency(v); setRate(''); }} disabled={used}>
              <SelectTrigger id="sub-currency">
                <SelectValue placeholder={t('subaccounts.pickCurrency', { defaultValue: 'Pick a currency' })} />
              </SelectTrigger>
              <SelectContent>
                {(subaccount?.currency && !choices.includes(subaccount.currency) ? [subaccount.currency, ...choices] : choices).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {used && (
              <p className="text-xs text-muted-foreground">
                {t('subaccounts.currencyLockedHint', { defaultValue: 'The currency can no longer change once the subaccount has transactions.' })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-name">{t('accounts.accountName')}</Label>
            <Input
              id="sub-name"
              value={shownName}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
              placeholder={currency || 'GBP'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-opening">
              {t('subaccounts.openingBalance', { defaultValue: 'Opening balance ({{currency}})', currency: currency || '…' })}
            </Label>
            <AmountInput id="sub-opening" placeholder="0.00" value={opening} onChange={setOpening} />
            <p className="text-xs text-muted-foreground">
              {t('subaccounts.openingHint', { defaultValue: 'What it held before the first transaction you record, in its own currency.' })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-rate">
              {t('subaccounts.openingRate', { defaultValue: 'Opening rate: 1 {{currency}} = … {{base}}', currency: currency || '…', base })} *
            </Label>
            <AmountInput id="sub-rate" placeholder="1.0000" value={rate} onChange={setRate} />
            <p className="text-xs text-muted-foreground">
              {t('subaccounts.openingRateHint', { defaultValue: 'What that money cost you. Spending is counted in {{base}} at the average rate, starting from this one.', base })}
              {marketRate && (
                <>
                  {' '}
                  {t('fx.todayRate', { defaultValue: "Today's rate: {{rate}}", rate: `1 ${currency} = ${Number(marketRate.toFixed(4))} ${base}` })}{' '}
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setRate(String(Number(marketRate.toFixed(4))))}>
                    {t('fx.useIt', { defaultValue: 'use it' })}
                  </button>
                </>
              )}
            </p>
            {valid && openingN !== 0 && (
              <p className="text-xs text-muted-foreground">
                {t('subaccounts.openingValue', {
                  defaultValue: '{{native}} counts as {{value}}',
                  native: formatInCurrency(openingN, currency, locale),
                  value: formatInCurrency(openingN * rateN, base, locale),
                })}
              </p>
            )}
          </div>
        </form>

        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="h-9 text-xs sm:text-sm">
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saving || !valid || !parent} form="subaccount-form" className="h-9 text-xs sm:text-sm">
            {saving ? t('common.loading') : editing ? t('common.save', { defaultValue: 'Save' }) : t('subaccounts.create', { defaultValue: 'Create subaccount' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
