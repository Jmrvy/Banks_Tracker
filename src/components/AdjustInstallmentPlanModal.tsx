import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments, InstallmentPayment } from '@/hooks/useInstallmentPayments';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Calculator } from 'lucide-react';

interface AdjustInstallmentPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentPayment: InstallmentPayment;
  paymentAmount: number;
  newRemainingAmount: number;
}

type AdjustmentType = 'keep_current' | 'reduce_amount' | 'reduce_count' | 'custom';

export const AdjustInstallmentPlanModal = ({
  open,
  onOpenChange,
  installmentPayment,
  paymentAmount,
  newRemainingAmount
}: AdjustInstallmentPlanModalProps) => {
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { adjustInstallmentPlan } = useInstallmentPayments();
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('keep_current');
  const [customAmount, setCustomAmount] = useState(installmentPayment.installment_amount.toString());
  const [loading, setLoading] = useState(false);

  // Calculate suggestions
  const currentFrequency = installmentPayment.frequency;
  
  // Calculate remaining payments based on current installment amount (for keep_current and reduce_count)
  const remainingPaymentsWithCurrentAmount = Math.ceil(newRemainingAmount / installmentPayment.installment_amount);
  
  // For reduce_amount: calculate how many payments were originally remaining BEFORE this payment
  // We use the old remaining amount (before payment) to determine the original planned payment count
  const oldRemainingAmount = newRemainingAmount + paymentAmount;
  const originalRemainingPayments = Math.ceil(oldRemainingAmount / installmentPayment.installment_amount);
  
  // New reduced amount = spread the new remaining amount over the same number of payments as before
  const reducedInstallmentAmount = originalRemainingPayments > 0 
    ? newRemainingAmount / originalRemainingPayments 
    : 0;

  useEffect(() => {
    if (open) {
      setAdjustmentType('keep_current');
      setCustomAmount(installmentPayment.installment_amount.toString());
    }
  }, [open, installmentPayment.installment_amount]);

  const getAdjustmentPreview = () => {
    switch (adjustmentType) {
      case 'keep_current':
        return {
          installmentAmount: installmentPayment.installment_amount,
          estimatedPayments: remainingPaymentsWithCurrentAmount,
          description: 'Continuer avec le même montant de mensualité'
        };
      case 'reduce_amount':
        return {
          installmentAmount: reducedInstallmentAmount,
          estimatedPayments: originalRemainingPayments,
          description: 'Garder le nombre de paiements, réduire le montant de chaque paiement'
        };
      case 'reduce_count':
        return {
          installmentAmount: installmentPayment.installment_amount,
          estimatedPayments: remainingPaymentsWithCurrentAmount,
          description: 'Garder le montant des paiements, réduire le nombre de paiements'
        };
      case 'custom':
        const customAmountNum = parseFloat(customAmount) || installmentPayment.installment_amount;
        return {
          installmentAmount: customAmountNum,
          estimatedPayments: Math.ceil(newRemainingAmount / customAmountNum),
          description: 'Montant personnalisé'
        };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    let finalInstallmentAmount = installmentPayment.installment_amount;

    switch (adjustmentType) {
      case 'keep_current':
        // No change to installment amount
        break;
      case 'reduce_amount':
        finalInstallmentAmount = reducedInstallmentAmount;
        break;
      case 'reduce_count':
        // Keep current installment amount
        break;
      case 'custom':
        const customAmountNum = parseFloat(customAmount);
        if (customAmountNum <= 0 || customAmountNum > newRemainingAmount) {
          toast({
            title: "Montant invalide",
            description: "Le montant doit être supérieur à 0 et inférieur ou égal au montant restant.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        finalInstallmentAmount = customAmountNum;
        break;
    }

    const { error } = await adjustInstallmentPlan(
      installmentPayment.id,
      adjustmentType,
      finalInstallmentAmount
    );

    if (error) {
      toast({
        title: "Erreur lors de l'ajustement",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Plan ajusté",
        description: "Le plan de paiement a été ajusté avec succès.",
      });
      onOpenChange(false);
    }

    setLoading(false);
  };

  const preview = getAdjustmentPreview();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <Calculator className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            Ajuster le Plan
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
          {/* Summary */}
          <div className="p-3 bg-muted rounded-lg space-y-1.5">
            <div className="font-semibold text-xs sm:text-sm mb-2">Résumé</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Enregistré</span>
              <span className="font-medium text-green-600 text-[11px] sm:text-sm whitespace-nowrap">{formatCurrency(paymentAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Restant</span>
              <span className="font-bold text-primary text-[11px] sm:text-sm whitespace-nowrap">{formatCurrency(newRemainingAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Échéance actuelle</span>
              <span className="font-medium text-[11px] sm:text-sm whitespace-nowrap">{formatCurrency(installmentPayment.installment_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Restants estimés</span>
              <span className="font-medium text-[11px] sm:text-sm">{remainingPaymentsWithCurrentAmount}</span>
            </div>
          </div>

          {/* Adjustment Options */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm font-semibold">Comment ajuster le plan ?</Label>

              <RadioGroup value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}>
                {/* Keep Current */}
                <div className="flex items-start space-x-2.5 p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="keep_current" id="keep_current" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor="keep_current" className="cursor-pointer font-medium text-xs sm:text-sm">
                      Garder le plan actuel
                    </Label>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(installmentPayment.installment_amount)}/éch. (≈{remainingPaymentsWithCurrentAmount} restants)
                    </p>
                  </div>
                </div>

                {/* Reduce Amount */}
                <div className="flex items-start space-x-2.5 p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="reduce_amount" id="reduce_amount" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor="reduce_amount" className="cursor-pointer font-medium text-xs sm:text-sm">
                      Réduire le montant
                    </Label>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(reducedInstallmentAmount)}/éch. (≈{originalRemainingPayments} restants)
                    </p>
                  </div>
                </div>

                {/* Reduce Count - Keep Amount */}
                <div className="flex items-start space-x-2.5 p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="reduce_count" id="reduce_count" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor="reduce_count" className="cursor-pointer font-medium text-xs sm:text-sm">
                      Réduire le nombre
                    </Label>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(installmentPayment.installment_amount)}/éch. (≈{Math.ceil(newRemainingAmount / installmentPayment.installment_amount)} restants)
                    </p>
                  </div>
                </div>

                {/* Custom */}
                <div className="flex items-start space-x-2.5 p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="custom" id="custom" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor="custom" className="cursor-pointer font-medium text-xs sm:text-sm">
                      Personnalisé
                    </Label>
                    <div className="mt-1.5">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="0.00"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        disabled={adjustmentType !== 'custom'}
                        className="w-full h-8 text-xs sm:text-sm"
                      />
                      {adjustmentType === 'custom' && parseFloat(customAmount) > 0 && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                          ≈{Math.ceil(newRemainingAmount / parseFloat(customAmount))} restants
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Preview */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-xs sm:text-sm font-semibold mb-1.5">Aperçu</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Nouvelle échéance</span>
                  <span className="font-bold text-[11px] sm:text-sm whitespace-nowrap">{formatCurrency(preview.installmentAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Restants estimés</span>
                  <span className="font-medium text-[11px] sm:text-sm">{preview.estimatedPayments}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 h-9 text-xs sm:text-sm">
                {loading ? 'Ajustement...' : 'Appliquer'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
