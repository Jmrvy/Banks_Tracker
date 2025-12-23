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
  const remainingPayments = Math.ceil(newRemainingAmount / installmentPayment.installment_amount);
  const newInstallmentAmount = remainingPayments > 0 ? newRemainingAmount / remainingPayments : 0;

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
          estimatedPayments: remainingPayments,
          description: 'Continuer avec le même montant de mensualité'
        };
      case 'reduce_amount':
        return {
          installmentAmount: newInstallmentAmount,
          estimatedPayments: remainingPayments,
          description: 'Garder le nombre de paiements, réduire le montant de chaque paiement'
        };
      case 'reduce_count':
        return {
          installmentAmount: installmentPayment.installment_amount,
          estimatedPayments: Math.ceil(newRemainingAmount / installmentPayment.installment_amount),
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

    let newInstallmentAmount = installmentPayment.installment_amount;

    switch (adjustmentType) {
      case 'keep_current':
        // No change to installment amount
        break;
      case 'reduce_amount':
        newInstallmentAmount = newInstallmentAmount;
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
        newInstallmentAmount = customAmountNum;
        break;
    }

    const { error } = await adjustInstallmentPlan(
      installmentPayment.id,
      adjustmentType,
      adjustmentType === 'reduce_amount' ? newInstallmentAmount :
      adjustmentType === 'custom' ? parseFloat(customAmount) :
      installmentPayment.installment_amount
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Ajuster le Plan de Paiement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Summary */}
          <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
            <div className="font-semibold text-base mb-3">Résumé du paiement</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paiement enregistré:</span>
              <span className="font-medium text-green-600">{formatCurrency(paymentAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nouveau montant restant:</span>
              <span className="font-bold text-primary">{formatCurrency(newRemainingAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mensualité actuelle:</span>
              <span className="font-medium">{formatCurrency(installmentPayment.installment_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paiements restants estimés:</span>
              <span className="font-medium">{remainingPayments} paiements</span>
            </div>
          </div>

          {/* Adjustment Options */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold">Comment souhaitez-vous ajuster le plan ?</Label>

              <RadioGroup value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}>
                {/* Keep Current */}
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="keep_current" id="keep_current" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="keep_current" className="cursor-pointer font-medium">
                      Garder le plan actuel
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Continuer avec {formatCurrency(installmentPayment.installment_amount)} par paiement
                      (≈ {remainingPayments} paiements restants)
                    </p>
                  </div>
                </div>

                {/* Reduce Amount */}
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="reduce_amount" id="reduce_amount" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="reduce_amount" className="cursor-pointer font-medium">
                      Réduire le montant par paiement
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Nouveau montant: {formatCurrency(newInstallmentAmount)} par paiement
                      (≈ {remainingPayments} paiements restants)
                    </p>
                  </div>
                </div>

                {/* Reduce Count - Keep Amount */}
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="reduce_count" id="reduce_count" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="reduce_count" className="cursor-pointer font-medium">
                      Garder le montant, réduire le nombre de paiements
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Continuer avec {formatCurrency(installmentPayment.installment_amount)} par paiement
                      (≈ {Math.ceil(newRemainingAmount / installmentPayment.installment_amount)} paiements restants)
                    </p>
                  </div>
                </div>

                {/* Custom */}
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="custom" id="custom" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="custom" className="cursor-pointer font-medium">
                      Montant personnalisé
                    </Label>
                    <div className="mt-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="0.00"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        disabled={adjustmentType !== 'custom'}
                        className="w-full"
                      />
                      {adjustmentType === 'custom' && parseFloat(customAmount) > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ≈ {Math.ceil(newRemainingAmount / parseFloat(customAmount))} paiements restants
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Preview */}
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-sm font-semibold mb-2">Aperçu de l'ajustement</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nouveau montant par paiement:</span>
                  <span className="font-bold">{formatCurrency(preview.installmentAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paiements restants estimés:</span>
                  <span className="font-medium">{preview.estimatedPayments}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  {preview.description}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Ajustement...' : 'Appliquer'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
