import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, MinusCircle, ArrowRightLeft, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useNavigate } from 'react-router-dom';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';

const NewTransaction = () => {
  const { t } = useTranslation();
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

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedToAccount = accounts.find(acc => acc.id === formData.to_account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page max-w-2xl">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.transactions')}</div>
            <h1 className="ft-page-title">{t('newTransaction.title', { defaultValue: 'New transaction' })}</h1>
            <div className="ft-page-sub">{t('newTransaction.subtitle', { defaultValue: 'Add expense, income, or transfer' })}</div>
          </div>
        </div>

        <div className="ft-card p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              {/* Transaction type — a segmented switch, not three buttons
                  competing with the submit action below. */}
              <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                <div className="ft-seg w-full" role="group" aria-label={t('transactions.type', { defaultValue: 'Type' })}>
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
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 ${formData.type === value ? 'active' : ''}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* The amount is what the page is for, so it is the page's
                  largest element rather than one field among many. */}
              <div className="rounded-xl bg-bg-subtle border border-line-soft px-4 py-5 sm:py-6">
                <label htmlFor="amount" className="ft-eyebrow block text-center mb-2">
                  {t('common.amount', { defaultValue: 'Amount' })}
                </label>
                <AmountInput
                  id="amount"
                  placeholder="0,00"
                  value={formData.amount}
                  onChange={(value) => setFormData(prev => ({ ...prev, amount: value }))}
                  required
                  className={`h-auto border-none bg-transparent shadow-none text-center font-mono text-[38px] sm:text-[44px] font-medium tracking-[-0.04em] focus-visible:ring-0 px-0 ${
                    formData.type === 'income' ? 'text-pos' : ''
                  }`}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="description" className="text-xs sm:text-sm">
                  Description {formData.type !== 'transfer' && '*'}
                </Label>
                <Textarea
                  id="description"
                  placeholder={formData.type === 'transfer' ? "Description (optionnelle)..." : "Description..."}
                  value={formData.description}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, description: val }));
                  }}
                  required={formData.type !== 'transfer'}
                  className="min-h-[60px] sm:min-h-[80px] text-xs sm:text-sm"
                />
              </div>

              {/* Account Selection */}
              <div className="space-y-2">
                <Label htmlFor="account">Compte *</Label>
              <Select 
                  value={formData.account_id} 
                  onValueChange={(value) => {
                    setFormData(prev => {
                      const fromAccount = accounts.find(acc => acc.id === value);
                      const toAccount = accounts.find(acc => acc.id === prev.to_account_id);
                      const aliases = preferences?.accountAliases || {};
                      const getAlias = (acc: any) => aliases[acc.id] || acc.name;
                      const autoDescription = prev.type === 'transfer' && fromAccount && toAccount 
                        ? `Transfert ${getAlias(fromAccount)} → ${getAlias(toAccount)}`
                        : prev.description;
                      return { ...prev, account_id: value, description: autoDescription };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.length === 0 ? (
                      <SelectItem value="no-accounts" disabled>
                        Aucun compte disponible
                      </SelectItem>
                    ) : (
                      accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{account.name}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {account.bank.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedAccount && (
                  <div className="text-sm text-muted-foreground">
                    Solde actuel: {formatCurrency(selectedAccount.balance)}
                  </div>
                )}
              </div>

              {/* Destination Account Selection (Transfer only) */}
              {formData.type === 'transfer' && (
                <div className="space-y-2">
                  <Label htmlFor="to_account">Compte de destination *</Label>
                  <Select 
                    value={formData.to_account_id} 
                    onValueChange={(value) => {
                      setFormData(prev => {
                        const toAccount = accounts.find(acc => acc.id === value);
                        const fromAccount = accounts.find(acc => acc.id === prev.account_id);
                        const aliases = preferences?.accountAliases || {};
                        const getAlias = (acc: any) => aliases[acc.id] || acc.name;
                        const autoDescription = fromAccount && toAccount 
                          ? `Transfert ${getAlias(fromAccount)} → ${getAlias(toAccount)}`
                          : prev.description;
                        return { ...prev, to_account_id: value, description: autoDescription };
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner le compte de destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter(acc => acc.id !== formData.account_id).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{account.name}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {account.bank.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedToAccount && (
                    <div className="text-sm text-muted-foreground">
                      Solde actuel: {formatCurrency(selectedToAccount.balance)}
                    </div>
                  )}
                </div>
              )}

              {/* Transfer Fee (Transfer only) */}
              {formData.type === 'transfer' && (
                <div className="space-y-2">
                  <Label htmlFor="transfer_fee">Frais de transfert (optionnel)</Label>
                  <AmountInput
                    id="transfer_fee"
                    placeholder="0.00"
                    value={formData.transfer_fee}
                    onChange={(value) => setFormData(prev => ({ ...prev, transfer_fee: value }))}
                  />
                </div>
              )}

              {/* Category Selection (Not for transfers) */}
              {formData.type !== 'transfer' && (
                <div className="space-y-2">
                  <Label htmlFor="category">Catégorie</Label>
                  <Select 
                    value={formData.category_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('common.selectCategoryOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Transaction Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Date Comptable *</Label>
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
                    placeholder="Date comptable"
                  />
                </div>
                
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Date Valeur *</Label>
                  <DatePicker
                    date={formData.value_date ? new Date(formData.value_date) : undefined}
                    onDateChange={(date) => setFormData(prev => ({ ...prev, value_date: date ? date.toISOString().split('T')[0] : '' }))}
                    placeholder="Date valeur"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  disabled={loading}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? 'Création...' : 'Créer'}
                </Button>
              </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewTransaction;
