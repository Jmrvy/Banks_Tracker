import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { accountSchema, validateForm } from '@/lib/validations';

interface NewAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const bankKeys = [
  'societe_generale',
  'revolut',
  'boursorama',
  'bnp_paribas',
  'credit_agricole',
  'lcl',
  'caisse_epargne',
  'credit_mutuel',
  'other',
] as const;

const accountTypeKeys = ['checking', 'savings', 'credit', 'investment'] as const;

export function NewAccountModal({ open, onOpenChange }: NewAccountModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { createAccount } = useFinancialData();
  
  const [formData, setFormData] = useState({
    name: '',
    bank: 'other' as const,
    account_type: 'checking' as const,
    balance: '0'
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data with zod schema
    const validation = validateForm(accountSchema, formData);
    
    if (!validation.success) {
      toast({
        title: t('common.error'),
        description: (validation as { success: false; error: string }).error,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const { error } = await createAccount({
      name: formData.name,
      bank: formData.bank,
      account_type: formData.account_type,
      balance: parseFloat(formData.balance) || 0,
    });

    if (error) {
      toast({
        title: t('errors.createError'),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('accounts.accountCreated'),
        description: t('accounts.accountCreatedDesc', { name: formData.name }),
      });
      
      // Reset form
      setFormData({
        name: '',
        bank: 'other',
        account_type: 'checking',
        balance: '0'
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <CreditCard className="h-5 w-5" />
            {t('accounts.newAccount')}
          </DialogTitle>
          <DialogDescription>
            {t('accounts.addAccountDescription')}
          </DialogDescription>
        </DialogHeader>

        <form id="new-account-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('accounts.accountName')} *</Label>
            <Input
              id="name"
              placeholder="ex: Compte Courant SG, Revolut Perso, CB Boursorama"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t('accounts.accountNameHint')}
            </p>
          </div>

          {/* Bank */}
          <div className="space-y-2">
            <Label htmlFor="bank">{t('accounts.bank')}</Label>
            <Select
              value={formData.bank}
              onValueChange={(value: any) => setFormData({ ...formData, bank: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('accounts.selectBank')} />
              </SelectTrigger>
              <SelectContent>
                {bankKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`accounts.banks.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label htmlFor="type">{t('accounts.accountType')}</Label>
            <Select
              value={formData.account_type}
              onValueChange={(value: any) => setFormData({ ...formData, account_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('accounts.selectType')} />
              </SelectTrigger>
              <SelectContent>
                {accountTypeKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`accounts.types.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Starting Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">{t('accounts.startingBalance')}</Label>
            <AmountInput
              id="balance"
              placeholder="0.00"
              value={formData.balance}
              onChange={(value) => setFormData({ ...formData, balance: value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('accounts.enterCurrentBalance')}
            </p>
          </div>
        </form>

        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-9 text-xs sm:text-sm"
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading} form="new-account-form" className="h-9 text-xs sm:text-sm">
            {loading ? t('common.loading') : t('accounts.createAccount')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}