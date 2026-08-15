import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';

interface CreateRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function CreateRefundModal({ open, onOpenChange, transaction }: CreateRefundModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { accounts, categories, createRefund } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    account_id: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    value_date: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);

  // Calculate remaining amount to refund (can be 0 if fully refunded)
  const remainingToRefund = transaction 
    ? Math.max(0, transaction.amount - (transaction.refunded_amount || 0))
    : 0;

  // Reset form when transaction changes
  const resetForm = () => {
    if (transaction) {
      // Default to remaining amount, or a small amount if fully refunded (for excess refunds)
      const defaultAmount = remainingToRefund > 0 ? remainingToRefund : 0;
      setFormData({
        amount: defaultAmount > 0 ? defaultAmount.toFixed(2) : '',
        description: `Remboursement: ${transaction.description}`,
        account_id: transaction.account_id,
        category_id: transaction.category?.id || '',
        transaction_date: new Date().toISOString().split('T')[0],
        value_date: new Date().toISOString().split('T')[0],
      });
    }
  };

  // Initialize form when modal opens
  useState(() => {
    if (open && transaction) {
      resetForm();
    }
  });

  // Reset when transaction or open state changes
  if (open && transaction && formData.description === '') {
    resetForm();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: t('common.invalidAmount'),
        description: t("common.enterValidAmount", { defaultValue: "Please enter a valid amount." }),
        variant: "destructive",
      });
      return;
    }

    if (!formData.account_id) {
      toast({
        title: t('common.accountRequired'),
        description: t("refund.selectAccount", { defaultValue: "Please select an account for the refund." }),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const result = await createRefund({
      original_transaction_id: transaction.id,
      amount,
      description: formData.description,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      transaction_date: formData.transaction_date,
      value_date: formData.value_date,
    });

    setLoading(false);

    if (result.error) {
      toast({
        title: t('common.error'),
        description: result.error.message || "Une erreur est survenue lors de la création du remboursement.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Remboursement créé",
        description: `Remboursement de ${formatCurrency(amount)} enregistré avec succès.`,
      });
      
      setFormData({
        amount: '',
        description: '',
        account_id: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0],
        value_date: new Date().toISOString().split('T')[0],
      });
      onOpenChange(false);
    }
  };

  if (!transaction) return null;

  // Check if amount exceeds remaining (for warning display)
  const enteredAmount = parseFloat(formData.amount) || 0;
  const exceedsRemaining = enteredAmount > remainingToRefund && remainingToRefund > 0;
  const excessAmount = Math.max(0, enteredAmount - remainingToRefund);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-line flex-shrink-0">
          <DialogTitle className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" />
            Créer un remboursement
          </DialogTitle>
          <DialogDescription className="text-xs text-fg-mute mt-0.5">
            Enregistrer un remboursement pour cette transaction
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
        {/* Original transaction info */}
        <div className="rounded-lg border border-line bg-bg-subtle p-3 space-y-2">
          <p className="text-sm font-medium">Transaction originale :</p>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground truncate max-w-[60%]">
              {transaction.description}
            </span>
            <span className="text-sm font-semibold font-mono tabular-nums text-neg">
              -{formatCurrency(transaction.amount)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              {format(parseLocalDate(transaction.transaction_date), 'dd MMMM yyyy', { locale: fr })}
            </span>
            {transaction.category && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: `color-mix(in oklab, ${transaction.category.color} 15%, transparent)`,
                  color: transaction.category.color,
                }}
              >
                <i
                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: transaction.category.color }}
                />
                {transaction.category.name}
              </span>
            )}
          </div>
          {(transaction.refunded_amount || 0) > 0 && (
            <div className="flex justify-between items-center text-xs pt-1 border-t border-line-soft">
              <span className="text-muted-foreground">Déjà remboursé :</span>
              <span className="text-pos font-medium font-mono tabular-nums">
                +{formatCurrency(transaction.refunded_amount || 0)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm pt-1 border-t border-line-soft">
            <span className="font-medium">Reste à rembourser :</span>
            <span className={`font-semibold font-mono tabular-nums ${remainingToRefund <= 0 ? 'text-muted-foreground' : 'text-primary'}`}>
              {formatCurrency(remainingToRefund)}
            </span>
          </div>
        </div>

        {/* Warning when amount exceeds remaining */}
        {exceedsRemaining && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warn/10 border border-warn/20">
            <AlertCircle className="h-5 w-5 text-warn flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warn">
              <p className="font-medium">Remboursement supérieur au reste dû</p>
              <p className="text-xs mt-1">
                L'intégralité sera liée à cette transaction. Elle deviendra négative
                de <span className="font-mono tabular-nums">{formatCurrency(excessAmount)}</span>, ce qui réduira d'autant sa catégorie.
              </p>
            </div>
          </div>
        )}

        <form id="refund-form" onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">{t('refund.amount', { defaultValue: 'Refund amount' })} *</Label>
            <AmountInput
              id="refund-amount"
              value={formData.amount}
              onChange={(value) => setFormData({ ...formData, amount: value })}
              placeholder="0.00"
              required
            />
            {remainingToRefund > 0 && (
              <p className="text-xs text-muted-foreground">
                Reste à rembourser : <span className="font-mono tabular-nums">{formatCurrency(remainingToRefund)}</span>
                <span className="ml-1">(vous pouvez dépasser ce montant)</span>
              </p>
            )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-description">Description *</Label>
              <Input
                id="refund-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Remboursement..."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-account">Compte de réception *</Label>
              <Select
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('common.selectAccount')} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-category">Catégorie</Label>
              <Select
                value={formData.category_id || "same-as-original"}
                onValueChange={(value) => setFormData({ ...formData, category_id: value === "same-as-original" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Même que l'original" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same-as-original">Même que l'original</SelectItem>
                  {/* A refund sits on the same side of the ledger as what it refunds. */}
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: cat.color }} 
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('refund.date', { defaultValue: 'Refund date' })}</Label>
                <DatePicker
                  date={formData.transaction_date ? new Date(formData.transaction_date) : undefined}
                  onDateChange={(date) => setFormData({ 
                    ...formData, 
                    transaction_date: date ? date.toISOString().split('T')[0] : '' 
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date de valeur</Label>
                <DatePicker
                  date={formData.value_date ? new Date(formData.value_date) : undefined}
                  onDateChange={(date) => setFormData({ 
                    ...formData, 
                    value_date: date ? date.toISOString().split('T')[0] : '' 
                  })}
                />
              </div>
            </div>

          </form>
        </div>

        <div className="flex gap-2 px-5 py-4 flex-shrink-0 border-t border-line">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                Annuler
              </Button>
              <Button type="submit" form="refund-form" disabled={loading} className="flex-1 h-9 text-xs sm:text-sm">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Créer le remboursement
                  </>
                )}
              </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
