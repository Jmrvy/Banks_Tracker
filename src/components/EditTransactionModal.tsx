import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FormScaffold } from '@/components/ui/form-scaffold';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { DatePicker } from '@/components/ui/date-picker';
import { transactionSchemaWithTransfer, validateForm } from '@/lib/validations';
import { parseLocalDate } from '@/lib/dateUtils';

interface EditTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function EditTransactionModal({ open, onOpenChange, transaction }: EditTransactionModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { accounts, categories, updateTransaction } = useFinancialData();

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    category_id: '',
    transaction_date: '',
    value_date: '',
    transfer_to_account_id: '',
    transfer_fee: '',
    include_in_stats: true
  });
  const [loading, setLoading] = useState(false);

  // Update form data when transaction changes
  useEffect(() => {
    if (transaction) {
      setFormData({
        description: transaction.description,
        amount: Math.abs(transaction.amount).toString(),
        type: transaction.type,
        account_id: transaction.account_id,
        category_id: transaction.category?.id || '',
        transaction_date: transaction.transaction_date,
        value_date: transaction.value_date || transaction.transaction_date,
        transfer_to_account_id: transaction.transfer_to_account_id || '',
        transfer_fee: transaction.transfer_fee?.toString() || '',
        include_in_stats: transaction.include_in_stats ?? true
      });
    }
  }, [transaction]);

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      type: 'expense',
      account_id: '',
      category_id: '',
      transaction_date: '',
      value_date: '',
      transfer_to_account_id: '',
      transfer_fee: '',
      include_in_stats: true
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    
    // Validate form data with zod schema
    const validation = validateForm(transactionSchemaWithTransfer, {
      ...formData,
      to_account_id: formData.transfer_to_account_id || undefined,
    });
    
    if (!validation.success) {
      toast({
        title: t('common.validationError'),
        description: (validation as { success: false; error: string }).error,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const originalAmount = transaction.amount;
    const newAmount = parseFloat(formData.amount);
    const amountChanged = newAmount !== originalAmount;
    const hasInstallmentPayment = !!transaction.installment_payment_id;

    const updates = {
      description: formData.description || (formData.type === 'transfer' ? 'Transfert' : ''),
      amount: newAmount,
      type: formData.type,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      transaction_date: formData.transaction_date,
      value_date: formData.value_date,
      include_in_stats: formData.include_in_stats,
      ...(formData.type === 'transfer' && {
        transfer_to_account_id: formData.transfer_to_account_id,
        transfer_fee: formData.transfer_fee ? parseFloat(formData.transfer_fee) : 0
      })
    };

    const { error } = await updateTransaction(transaction.id, updates);

    if (error) {
      toast({
        title: t('common.error'),
        description: error.message || t('transactions.updateError'),
        variant: "destructive",
      });
      setLoading(false);
    } else {
      toast({
        title: t('common.success'),
        description: t('transactions.updateSuccess'),
      });

      resetForm();
      onOpenChange(false);
      setLoading(false);

      // If amount changed on a transaction linked to an installment plan, the
      // plan is now drifted (paid_from_txns != stored remaining). Send the
      // user to the plan's Adjust tab — the drift banner will surface and
      // they can choose to reconcile or restructure with the constraint solver.
      if (amountChanged && hasInstallmentPayment && transaction.installment_payment_id) {
        navigate(`/installment-payments/${transaction.installment_payment_id}?tab=adjust`);
      }
    }
  };

  return (
    <FormScaffold
      open={open}
      onOpenChange={onOpenChange}
      title={t('transactions.editTransaction', { defaultValue: 'Edit transaction' })}
      cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
      submit={{
        formId: 'edit-transaction-form',
        label: t('common.update', { defaultValue: 'Update' }),
        pendingLabel: t('common.updating', { defaultValue: 'Updating...' }),
        pending: loading,
      }}
    >
        <form id="edit-transaction-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              Description {formData.type !== 'transfer' && '*'}
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder={formData.type === 'transfer' ? "Description (optionnelle)" : "Ex: Courses Carrefour"}
              required={formData.type !== 'transfer'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Montant *</Label>
            <AmountInput
              id="amount"
              value={formData.amount}
              onChange={(value) => setFormData(prev => ({ ...prev, amount: value }))}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">{t('transactions.expense')}</SelectItem>
                <SelectItem value="income">{t('transactions.income')}</SelectItem>
                <SelectItem value="transfer">{t('transactions.transfer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Compte *</Label>
            <Select
              value={formData.account_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, account_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('common.selectAccount')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'transfer' && (
            <>
              <div className="space-y-2">
                <Label>{t('transactions.toAccount', { defaultValue: 'To account' })} *</Label>
                <Select
                  value={formData.transfer_to_account_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, transfer_to_account_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(account => account.id !== formData.account_id).map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frais de virement</Label>
                <AmountInput
                  value={formData.transfer_fee}
                  onChange={(value) => setFormData(prev => ({ ...prev, transfer_fee: value }))}
                  placeholder="0.00"
                />
              </div>
            </>
          )}

          {formData.type !== 'transfer' && (
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('common.selectCategory')} />
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

          <div className="space-y-2">
            <Label>Date Comptable *</Label>
            <DatePicker
              date={formData.transaction_date ? parseLocalDate(formData.transaction_date) : undefined}
              onDateChange={(date) => {
                const newDate = date ? date.toISOString().split('T')[0] : '';
                setFormData(prev => ({
                  ...prev,
                  transaction_date: newDate,
                  // Mettre à jour value_date seulement si elle est égale à l'ancienne transaction_date
                  value_date: prev.value_date === prev.transaction_date ? newDate : prev.value_date
                }));
              }}
              placeholder={t('common.selectAccountingDate')}
            />
          </div>

          <div className="space-y-2">
            <Label>Date Valeur *</Label>
            <DatePicker
              date={formData.value_date ? parseLocalDate(formData.value_date) : undefined}
              onDateChange={(date) => setFormData(prev => ({ ...prev, value_date: date ? date.toISOString().split('T')[0] : '' }))}
              placeholder={t('common.selectValueDate')}
            />
            <p className="text-xs text-muted-foreground">
              Date effective de la transaction
            </p>
          </div>

          {/* Include in Stats Toggle */}
          <div className="flex items-center justify-between space-x-2 p-4 border border-border rounded-lg bg-accent/30">
            <div className="space-y-0.5">
              <Label htmlFor="include_in_stats" className="text-sm font-medium">
                Inclure dans les statistiques
              </Label>
              <p className="text-xs text-muted-foreground">
                Si désactivé, cette transaction n'apparaîtra pas dans les calculs de revenus/dépenses
              </p>
            </div>
            <Switch
              id="include_in_stats"
              checked={formData.include_in_stats}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, include_in_stats: checked }))}
            />
          </div>

        </form>
    </FormScaffold>
  );
}