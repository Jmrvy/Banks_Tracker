import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, MinusCircle, ArrowRightLeft, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useNavigate } from 'react-router-dom';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';
import { BANK_COLORS } from '@/lib/constants';

const NewTransaction = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { formatCurrency, preferences } = useUserPreferences();
  const { accounts, categories, transactions, createTransaction, createTransfer } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    to_account_id: '',
    category_id: '',
    offsets_category: false,
    transfer_fee: '',
    transaction_date: new Date().toISOString().split('T')[0],
    value_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Pour les transferts, la description n'est pas obligatoire
    const descriptionRequired = formData.type !== 'transfer';
    
    if ((descriptionRequired && !formData.description) || !formData.amount || !formData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'transfer' && !formData.to_account_id) {
      toast({
        title: t('common.destinationAccountRequired'),
        description: "Veuillez sélectionner un compte de destination pour le transfert.",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'transfer' && formData.offsets_category && !formData.category_id) {
      toast({
        title: t('common.validationError'),
        description: t('transactions.offsetsTransferNeedsCategory', {
          defaultValue: 'Pick the category this money comes back on.',
        }),
        variant: 'destructive',
      });
      return;
    }

    if (formData.type === 'transfer' && formData.account_id === formData.to_account_id) {
      toast({
        title: t('common.sameAccounts'),
        description: "Le compte source et le compte de destination doivent être différents.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      let error;
      
      if (formData.type === 'transfer') {
        const result = await createTransfer({
          description: formData.description || 'Transfert',
          amount: parseFloat(formData.amount),
          from_account_id: formData.account_id,
          to_account_id: formData.to_account_id,
          transfer_fee: formData.transfer_fee ? parseFloat(formData.transfer_fee) : 0,
          transaction_date: formData.transaction_date,
          value_date: formData.value_date,
          category_id: formData.offsets_category ? formData.category_id : null,
          offsets_category: formData.offsets_category && !!formData.category_id,
        });
        error = result?.error;
      } else {
        const result = await createTransaction({
          description: formData.description,
          amount: parseFloat(formData.amount),
          type: formData.type as 'income' | 'expense',
          account_id: formData.account_id,
          category_id: formData.category_id || undefined,
          transaction_date: formData.transaction_date,
          value_date: formData.value_date,
          include_in_stats: true,
          offsets_category: formData.type === 'income' && !!formData.category_id && formData.offsets_category,
        });
        error = result?.error;
      }

      if (error) {
        toast({
          title: t('transactions.createError'),
          description: error.message,
          variant: "destructive",
        });
      } else {
        const typeLabel = formData.type === 'income' ? 'Revenus' : 
                         formData.type === 'transfer' ? 'Transfert' : 'Dépense';
        toast({
          title: `${typeLabel} créé${formData.type === 'transfer' ? '' : 'e'}`,
          description: `${typeLabel} de ${formData.amount}€ ajouté${formData.type === 'transfer' ? '' : 'e'} avec succès.`,
        });
        
        setFormData({
          description: '',
          amount: '',
          type: 'expense',
          account_id: '',
          to_account_id: '',
          category_id: '',
          offsets_category: false,
          transfer_fee: '',
          transaction_date: new Date().toISOString().split('T')[0],
          value_date: new Date().toISOString().split('T')[0]
        });
        
        navigate('/');
      }
    } catch (err) {
      console.error("Transaction failed:", err);
      toast({
        title: t('common.unexpectedError'),
        description: "Une erreur inattendue s'est produite. Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // The serif currency mark beside the amount. Derived from the user's
  // currency preference rather than hardcoded, since EUR/USD/GBP are all
  // supported.
  const currencySymbol = useMemo(() => {
    try {
      return (
        // Locale follows the UI, not the euro. Pinned to fr-FR this rendered
        // "$US" / "£GB" beside the amount field for anyone not on euros.
        new Intl.NumberFormat(i18n.language === 'fr' ? 'fr-FR' : 'en-US', { style: 'currency', currency: preferences.currency })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value ?? ''
      );
    } catch {
      return '';
    }
  }, [preferences.currency]);

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedToAccount = accounts.find(acc => acc.id === formData.to_account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page max-w-[760px]">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.entry', { defaultValue: 'Entry' })}</div>
            <h1 className="ft-page-title">{t('newTransaction.title', { defaultValue: 'New transaction' })}</h1>
            <div className="ft-page-sub">{t('newTransaction.subtitle', { defaultValue: 'Add expense, income, or transfer' })}</div>
          </div>
        </div>

        <div className="ft-card p-[26px]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Transaction type — a segmented switch, not three buttons
                  competing with the submit action below. The segment hugs
                  its three labels rather than stretching the card. */}
              <div className="max-w-full overflow-x-auto no-scrollbar">
                <div className="ft-seg" role="group" aria-label={t('transactions.type', { defaultValue: 'Type' })}>
                  {([
                    { value: 'expense', label: t('common.expense', { defaultValue: 'Expense' }), Icon: MinusCircle },
                    { value: 'income', label: t('common.income', { defaultValue: 'Income' }), Icon: PlusCircle },
                    { value: 'transfer', label: t('common.transfers', { defaultValue: 'Transfer' }), Icon: ArrowRightLeft },
                  ] as const).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type: value }))}
                      aria-pressed={formData.type === value}
                      className={`inline-flex items-center justify-center gap-1.5 ${formData.type === value ? 'active' : ''}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* The amount is what the page is for, so it is the page's
                  largest element rather than one field among many. The mono
                  figure is paired with the serif currency mark, the same
                  pairing the hero uses. */}
              <div className="rounded-xl bg-bg-subtle border border-line-soft px-5 py-[22px]">
                <label htmlFor="amount" className="ft-eyebrow block text-center mb-2">
                  {t('common.amount', { defaultValue: 'Amount' })}
                </label>
                <div className="flex items-baseline justify-center gap-1.5">
                  <AmountInput
                    id="amount"
                    placeholder="0,00"
                    value={formData.amount}
                    onChange={(value) => setFormData(prev => ({ ...prev, amount: value }))}
                    required
                    style={{ width: `${Math.max(4, formData.amount.length || 4)}ch` }}
                    className={`h-auto w-auto border-none bg-transparent shadow-none text-right font-mono text-[38px] sm:text-[44px] md:text-[44px] font-medium tracking-[-0.04em] focus-visible:ring-0 px-0 ${
                      formData.type === 'income' ? 'text-pos' : ''
                    }`}
                  />
                  <span className="font-display text-[30px] leading-none text-fg-mute" aria-hidden>
                    {currencySymbol}
                  </span>
                </div>
              </div>

              {/* Description sits beside the accounting date — the design
                  pairs them in one equal two-column row. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="ft-field">
                  <label htmlFor="description">
                    {t('common.description', { defaultValue: 'Description' })}
                    {formData.type !== 'transfer' && ' *'}
                  </label>
                  <Input
                    id="description"
                    placeholder={t('newTransaction.descriptionPlaceholder', { defaultValue: 'e.g. Monoprix Bastille' })}
                    value={formData.description}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, description: val }));
                    }}
                    required={formData.type !== 'transfer'}
                    className="h-10 text-[14px]"
                  />
                </div>

                <div className="ft-field">
                  <label>{t('transactions.accountingDate', { defaultValue: 'Accounting date' })} *</label>
                  <DatePicker
                    date={formData.transaction_date ? new Date(formData.transaction_date) : undefined}
                    onDateChange={(date) => {
                      const newDate = date ? date.toISOString().split('T')[0] : '';
                      setFormData(prev => ({
                        ...prev,
                        transaction_date: newDate,
                        value_date: prev.value_date === prev.transaction_date ? newDate : prev.value_date
                      }));
                    }}
                    placeholder={t('common.selectAccountingDate', { defaultValue: 'Accounting date' })}
                  />
                </div>
              </div>

              {/* Account — a visible chip per account, so the choice costs
                  one tap and the colour coding is on screen. */}
              {/* The <Select> this replaced was addressable by htmlFor; a group
                  of chips is not, so the label names the group instead —
                  otherwise each chip is announced with no context. */}
              <div className="ft-field" role="group" aria-labelledby="new-tx-account-label">
                <label id="new-tx-account-label">{t('newTransaction.account', { defaultValue: 'Account' })} *</label>
                {accounts.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    {t('common.noAccountsAvailable', { defaultValue: 'No account available' })}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        aria-pressed={formData.account_id === account.id}
                        onClick={() => {
                          setFormData(prev => {
                            const fromAccount = accounts.find(acc => acc.id === account.id);
                            const toAccount = accounts.find(acc => acc.id === prev.to_account_id);
                            const aliases = preferences?.accountAliases || {};
                            const getAlias = (acc: any) => aliases[acc.id] || acc.name;
                            const autoDescription = prev.type === 'transfer' && fromAccount && toAccount
                              ? `Transfert ${getAlias(fromAccount)} → ${getAlias(toAccount)}`
                              : prev.description;
                            return { ...prev, account_id: account.id, description: autoDescription };
                          });
                        }}
                        className={`ft-chip ${formData.account_id === account.id ? 'active' : ''}`}
                      >
                        <i
                          className="dot"
                          style={{ background: BANK_COLORS[account.bank] ?? BANK_COLORS.other }}
                          aria-hidden
                        />
                        {account.name}
                      </button>
                    ))}
                  </div>
                )}
                {selectedAccount && (
                  <p className="text-[12px] text-fg-mute">
                    {t('common.balance', { defaultValue: 'Balance' })}: {formatCurrency(selectedAccount.balance)}
                  </p>
                )}
              </div>

              {/* Destination Account Selection (Transfer only) */}
              {formData.type === 'transfer' && (
                <div className="ft-field">
                  <label>
                    {t('newTransaction.destinationAccount', { defaultValue: 'Destination account' })} *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {accounts.filter(acc => acc.id !== formData.account_id).map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        aria-pressed={formData.to_account_id === account.id}
                        onClick={() => {
                          setFormData(prev => {
                            const toAccount = accounts.find(acc => acc.id === account.id);
                            const fromAccount = accounts.find(acc => acc.id === prev.account_id);
                            const aliases = preferences?.accountAliases || {};
                            const getAlias = (acc: any) => aliases[acc.id] || acc.name;
                            const autoDescription = fromAccount && toAccount
                              ? `Transfert ${getAlias(fromAccount)} → ${getAlias(toAccount)}`
                              : prev.description;
                            return { ...prev, to_account_id: account.id, description: autoDescription };
                          });
                        }}
                        className={`ft-chip ${formData.to_account_id === account.id ? 'active' : ''}`}
                      >
                        <i
                          className="dot"
                          style={{ background: BANK_COLORS[account.bank] ?? BANK_COLORS.other }}
                          aria-hidden
                        />
                        {account.name}
                      </button>
                    ))}
                  </div>
                  {selectedToAccount && (
                    <p className="text-[12px] text-fg-mute">
                      {t('common.balance', { defaultValue: 'Balance' })}: {formatCurrency(selectedToAccount.balance)}
                    </p>
                  )}
                </div>
              )}

              {/* Transfer Fee (Transfer only) */}
              {formData.type === 'transfer' && (
                <div className="ft-field">
                  <label htmlFor="transfer_fee">
                    {t('newTransaction.transferFee', { defaultValue: 'Transfer fee' })}
                    {' '}
                    <span className="font-normal">
                      ({t('common.optional', { defaultValue: 'optional' })})
                    </span>
                  </label>
                  <AmountInput
                    id="transfer_fee"
                    placeholder="0.00"
                    value={formData.transfer_fee}
                    onChange={(value) => setFormData(prev => ({ ...prev, transfer_fee: value }))}
                    className="h-10 text-[14px] md:text-[14px]"
                  />
                </div>
              )}

              {formData.type === 'transfer' && (
                <div className="ft-field">
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Switch
                      id="page-transfer-offsets"
                      checked={formData.offsets_category}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          offsets_category: checked,
                          category_id: checked ? prev.category_id : '',
                        }))
                      }
                    />
                    <div className="min-w-0">
                      <Label htmlFor="page-transfer-offsets" className="text-sm cursor-pointer">
                        {t('transactions.offsetsTransfer', { defaultValue: 'Put back on a category' })}
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formData.offsets_category
                          ? t('transactions.offsetsTransferOn', {
                              defaultValue:
                                'The amount reduces what this category cost. It is not income, and the transfer fee still counts.',
                            })
                          : t('transactions.offsetsTransferOff', {
                              defaultValue:
                                'This transfer leaves the budget as it is. Turn on only for money put back after it was taken out.',
                            })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Category — chips, so the colour that makes a category
                  recognisable is on screen instead of behind a menu.
                  On a transfer the chips appear only once the put-back
                  mark is on, because an unmarked transfer has no category. */}
              {(formData.type !== 'transfer' || formData.offsets_category) && (
                <div className="ft-field" role="group" aria-labelledby="new-tx-category-label">
                  <label id="new-tx-category-label">{t('common.category', { defaultValue: 'Category' })}</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={formData.category_id === category.id}
                        onClick={() =>
                          setFormData(prev => ({
                            ...prev,
                            category_id: prev.category_id === category.id ? '' : category.id,
                          }))
                        }
                        className={`ft-chip ${formData.category_id === category.id ? 'active' : ''}`}
                      >
                        <i className="dot" style={{ background: category.color }} aria-hidden />
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.type === 'income' && !!formData.category_id && (
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Switch
                    id="page-income-offsets"
                    checked={formData.offsets_category}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, offsets_category: checked }))
                    }
                  />
                  <div className="min-w-0">
                    <Label htmlFor="page-income-offsets" className="text-sm cursor-pointer">
                      {t('transactions.offsetsCategory', { defaultValue: 'Came back on this category' })}
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formData.offsets_category
                        ? t('transactions.offsetsCategoryOn', {
                            defaultValue: 'Reduces what this category cost instead of counting as income.',
                          })
                        : t('transactions.offsetsCategoryOff', {
                            defaultValue: 'Counts as income. Turn on for money coming back rather than coming in.',
                          })}
                    </p>
                  </div>
                </div>
              )}

              {/* Value date — the app tracks both conventions; the design
                  only has one, so the second gets its own band. */}
              <div className="ft-field">
                <label>{t('transactions.valueDate', { defaultValue: 'Value date' })} *</label>
                <DatePicker
                  date={formData.value_date ? new Date(formData.value_date) : undefined}
                  onDateChange={(date) => setFormData(prev => ({ ...prev, value_date: date ? date.toISOString().split('T')[0] : '' }))}
                  placeholder={t('common.selectValueDate', { defaultValue: 'Value date' })}
                />
              </div>

              {/* Actions — right-aligned at intrinsic width, so Cancel does
                  not carry the same weight as Save. */}
              <div className="flex justify-end gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  disabled={loading}
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button type="submit" disabled={loading}>
                  <Check className="h-[15px] w-[15px] mr-1.5" />
                  {loading
                    ? t('newTransaction.creating', { defaultValue: 'Creating…' })
                    : t('common.create', { defaultValue: 'Create' })}
                </Button>
              </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewTransaction;
