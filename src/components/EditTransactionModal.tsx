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
import { useSpecialBudgets } from '@/hooks/useSpecialBudgets';
import { DatePicker } from '@/components/ui/date-picker';
import { transactionSchemaWithTransfer, validateForm } from '@/lib/validations';
import { parseLocalDate } from '@/lib/dateUtils';
import { useForeignLeg } from '@/hooks/useForeignLeg';
import { ForeignLegFields } from '@/components/ForeignLegFields';
import { accountDisplayName, foreignMode, withSubaccountsNested } from '@/lib/fx';

interface EditTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function EditTransactionModal({ open, onOpenChange, transaction }: EditTransactionModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { accounts: rawAccounts, categories, updateTransaction } = useFinancialData();
  const accounts = withSubaccountsNested(rawAccounts);
  const { specialBudgets } = useSpecialBudgets();
  const activeSpecialBudgets = specialBudgets.filter((b) => b.status !== 'closed');

  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    category_id: '',
    special_budget_id: '',
    transaction_date: '',
    value_date: '',
    transfer_to_account_id: '',
    transfer_fee: '',
    include_in_stats: true,
    offsets_category: false
  });
  const [loading, setLoading] = useState(false);

  // Update form data when transaction changes
  useEffect(() => {
    if (transaction) {
      // The amount field is in the SOURCE account's currency: a subaccount
      // spend or a conversion out of one is edited in that currency.
      const mode = foreignMode(
        transaction.type,
        rawAccounts.find((a) => a.id === transaction.account_id),
        transaction.type === 'transfer'
          ? rawAccounts.find((a) => a.id === transaction.transfer_to_account_id)
          : null,
      );
      const typed =
        (mode === 'spend' || mode === 'convert_out') && transaction.foreign_amount != null
          ? Math.abs(Number(transaction.foreign_amount))
          : Math.abs(transaction.amount);
      setFormData({
        description: transaction.description,
        amount: typed.toString(),
        type: transaction.type,
        account_id: transaction.account_id,
        category_id: transaction.category?.id || '',
        special_budget_id: transaction.special_budget_id ?? '',
        transaction_date: transaction.transaction_date,
        value_date: transaction.value_date || transaction.transaction_date,
        transfer_to_account_id: transaction.transfer_to_account_id || '',
        transfer_fee: transaction.transfer_fee?.toString() || '',
        include_in_stats: transaction.include_in_stats ?? true,
        offsets_category: transaction.offsets_category ?? false
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction]);

  /** A saved subaccount spend keeps the rate it was valued at: editing the
   *  description must not revalue it at today's average. */
  const sameAccounts =
    !!transaction &&
    formData.account_id === transaction.account_id &&
    formData.type === transaction.type;
  const savedSpendRate =
    sameAccounts && transaction.foreign_amount && Number(transaction.foreign_amount) > 0
      ? Math.abs(transaction.amount) / Number(transaction.foreign_amount)
      : null;

  const fx = useForeignLeg({
    spendRate: savedSpendRate,
    type: formData.type,
    source: rawAccounts.find((a) => a.id === formData.account_id),
    dest: formData.type === 'transfer' ? rawAccounts.find((a) => a.id === formData.transfer_to_account_id) : null,
    entered: formData.amount,
    seed: transaction
      ? {
          type: transaction.type,
          account_id: transaction.account_id,
          to_account_id: transaction.transfer_to_account_id,
          // The other side of a conversion, as saved.
          receivedText:
            transaction.foreign_amount == null
              ? ''
              : String(
                  foreignMode(
                    transaction.type,
                    rawAccounts.find((a) => a.id === transaction.account_id),
                    rawAccounts.find((a) => a.id === transaction.transfer_to_account_id),
                  ) === 'convert_out'
                    ? Math.abs(transaction.amount)
                    : Number(transaction.foreign_amount),
                ),
        }
      : null,
  });

  const legs = fx.legs;

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      type: 'expense',
      account_id: '',
      category_id: '',
      special_budget_id: '',
      transaction_date: '',
      value_date: '',
      transfer_to_account_id: '',
      transfer_fee: '',
      include_in_stats: true,
      offsets_category: false
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

    if (formData.type === 'transfer' && formData.offsets_category && !formData.category_id) {
      toast({
        title: t('common.validationError'),
        description: t('transactions.offsetsTransferNeedsCategory', {
          defaultValue: 'Pick the category this money comes back on.',
        }),
        variant: "destructive",
      });
      return;
    }

    if (fx.blocked) return;

    setLoading(true);

    const originalAmount = transaction.amount;
    const newAmount = legs.amount;
    const amountChanged = newAmount !== originalAmount;
    const hasInstallmentPayment = !!transaction.installment_payment_id;

    const updates = {
      description: formData.description || (formData.type === 'transfer' ? 'Transfert' : ''),
      amount: newAmount,
      foreign_amount: legs.foreign_amount,
      type: formData.type,
      account_id: formData.account_id,
      category_id: formData.type === 'transfer'
        ? (formData.offsets_category ? formData.category_id || null : null)
        : (formData.category_id || null),
      special_budget_id: formData.type === 'expense' ? (formData.special_budget_id || null) : null,
      transaction_date: formData.transaction_date,
      value_date: formData.value_date,
      include_in_stats: formData.include_in_stats,
      // Income on a category, or a transfer marked as money put back. A
      // linked refund already nets through its expense. Clearing the mark
      // on a transfer also clears the category, so an unmarked transfer
      // does not keep a category it cannot use. The DB normalises this too.
      offsets_category:
        !!formData.category_id &&
        !transaction.refund_of_transaction_id &&
        formData.offsets_category &&
        (formData.type === 'income' || formData.type === 'transfer'),
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
        disabled: fx.blocked,
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
            <Label htmlFor="amount">
              Montant{fx.mode === 'spend' || fx.mode === 'convert_out' ? ` (${fx.enteredCurrency})` : ''} *
            </Label>
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
                    <span className={account.parent_account_id ? 'pl-3' : ''}>{accountDisplayName(account, rawAccounts)}</span>
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
                        <span className={account.parent_account_id ? 'pl-3' : ''}>{accountDisplayName(account, rawAccounts)}</span>
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

          <ForeignLegFields fx={fx} idPrefix="edit-tx-fx" />

          {formData.type === 'transfer' && (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                id="transfer-offsets-category"
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
                <Label htmlFor="transfer-offsets-category" className="text-sm cursor-pointer">
                  {t('transactions.offsetsTransfer', {
                    defaultValue: 'Put back on a category',
                  })}
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
          )}

          {(formData.type !== 'transfer' || formData.offsets_category) && (
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

          {/* Which side of the ledger this income lands on.
              A category holds both directions, so most income filed on one is
              earnings that merely shares its name with the spending beside it
              — a salary is not a discount on anything. This says otherwise for
              the money that genuinely came back: a gambling payout against its
              stakes, a reimbursement with no single expense to point at.
              Hidden on a linked refund, which already nets through the expense
              it refunds and would otherwise take the money off twice. */}
          {formData.type === 'income'
            && !!formData.category_id
            && !transaction?.refund_of_transaction_id && (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Switch
                id="offsets-category"
                checked={formData.offsets_category}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, offsets_category: checked }))
                }
              />
              <div className="min-w-0">
                <Label htmlFor="offsets-category" className="text-sm cursor-pointer">
                  {t('transactions.offsetsCategory', {
                    defaultValue: 'Came back on this category',
                  })}
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formData.offsets_category
                    ? t('transactions.offsetsCategoryOn', {
                        defaultValue:
                          'Reduces what this category cost instead of counting as income.',
                      })
                    : t('transactions.offsetsCategoryOff', {
                        defaultValue:
                          'Counts as income. Turn on for money coming back rather than coming in.',
                      })}
                </p>
              </div>
            </div>
          )}

          {/* Special budget link (expenses only). */}
          {formData.type === 'expense' && activeSpecialBudgets.length > 0 && (
            <div className="space-y-2">
              <Label>{t('specialBudgets.linkLabel', { defaultValue: 'Special budget' })}</Label>
              <Select
                value={formData.special_budget_id || 'none'}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    special_budget_id: value === 'none' ? '' : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('specialBudgets.noLink', { defaultValue: 'None' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t('specialBudgets.noLink', { defaultValue: 'None' })}
                  </SelectItem>
                  {activeSpecialBudgets.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: b.color ?? '#3B82F6' }}
                        />
                        {b.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.special_budget_id && (
                <p className="text-[11px] text-muted-foreground">
                  {t('specialBudgets.linkHint', {
                    defaultValue:
                      "This transaction will count toward the special budget instead of its category's monthly budget.",
                  })}
                </p>
              )}
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