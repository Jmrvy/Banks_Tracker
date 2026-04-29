import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { useInstallmentPayments, InstallmentPayment } from '@/hooks/useInstallmentPayments';
import { AdjustInstallmentPlanModal } from '@/components/AdjustInstallmentPlanModal';
import { supabase } from '@/integrations/supabase/client';

interface EditTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function EditTransactionModal({ open, onOpenChange, transaction }: EditTransactionModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { accounts, categories, updateTransaction } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  
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
  
  // State for adjustment modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustmentData, setAdjustmentData] = useState<{
    payment: InstallmentPayment;
    paymentAmount: number;
    newRemainingAmount: number;
  } | null>(null);

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
      
      // If amount changed and transaction is linked to an installment payment, show adjustment modal
      if (amountChanged && hasInstallmentPayment && transaction.installment_payment_id) {
        // Fetch the updated installment payment to get current remaining amount
        const { data: updatedInstallment } = await supabase
          .from('installment_payments')
          .select('*')
          .eq('id', transaction.installment_payment_id)
          .single();
        
        if (updatedInstallment) {
          const installmentPayment = installmentPayments.find(ip => ip.id === transaction.installment_payment_id) || updatedInstallment as InstallmentPayment;
          const amountDifference = newAmount - originalAmount;
          
          setAdjustmentData({
            payment: {
              ...installmentPayment,
              remaining_amount: updatedInstallment.remaining_amount
            },
            paymentAmount: amountDifference,
            newRemainingAmount: updatedInstallment.remaining_amount
          });
          
          resetForm();
          onOpenChange(false);
          setShowAdjustModal(true);
        } else {
          resetForm();
          onOpenChange(false);
        }
      } else {
        resetForm();
        onOpenChange(false);
      }
      
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Modifier la transaction</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
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
                <SelectItem value="expense">Dépense</SelectItem>
                <SelectItem value="income">Revenu</SelectItem>
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
                <Label>Vers le compte *</Label>
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
              date={formData.transaction_date ? new Date(formData.transaction_date) : undefined}
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
              date={formData.value_date ? new Date(formData.value_date) : undefined}
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
        </div>

          <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs sm:text-sm"
            >
              Annuler
            </Button>
            <Button type="submit" form="edit-transaction-form" disabled={loading} className="h-9 text-xs sm:text-sm">
              {loading ? 'Modification...' : 'Modifier'}
            </Button>
          </div>
      </DialogContent>
      
      {/* Adjustment Modal for Installment Payments */}
      {adjustmentData && (
        <AdjustInstallmentPlanModal
          open={showAdjustModal}
          onOpenChange={setShowAdjustModal}
          installmentPayment={adjustmentData.payment}
          paymentAmount={adjustmentData.paymentAmount}
          newRemainingAmount={adjustmentData.newRemainingAmount}
        />
      )}
    </Dialog>
  );
}