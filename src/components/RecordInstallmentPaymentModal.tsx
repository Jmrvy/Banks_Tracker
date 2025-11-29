import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments, InstallmentPayment } from '@/hooks/useInstallmentPayments';

interface RecordInstallmentPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentPaymentId: string;
  onPaymentRecorded?: (
    payment: InstallmentPayment,
    paymentAmount: number,
    newRemainingAmount: number
  ) => void;
}

export const RecordInstallmentPaymentModal = ({
  open,
  onOpenChange,
  installmentPaymentId,
  onPaymentRecorded
}: RecordInstallmentPaymentModalProps) => {
  const { toast } = useToast();
  const { recordPayment, installmentPayments } = useInstallmentPayments();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const installmentPayment = installmentPayments.find(ip => ip.id === installmentPaymentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Montant invalide",
        description: "Veuillez saisir un montant valide.",
        variant: "destructive",
      });
      return;
    }

    if (installmentPayment && parseFloat(amount) > installmentPayment.remaining_amount) {
      toast({
        title: "Montant trop élevé",
        description: "Le montant ne peut pas dépasser le solde restant.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const paymentAmount = parseFloat(amount);
    const { error } = await recordPayment(installmentPaymentId, paymentAmount);

    if (error) {
      toast({
        title: "Erreur lors de l'enregistrement",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    } else {
      toast({
        title: "Paiement enregistré",
        description: "Le paiement a été enregistré avec succès.",
      });

      const newRemainingAmount = installmentPayment.remaining_amount - paymentAmount;

      setAmount('');
      onOpenChange(false);
      setLoading(false);

      // Trigger the adjustment modal if there's remaining amount
      if (onPaymentRecorded && installmentPayment) {
        onPaymentRecorded(installmentPayment, paymentAmount, newRemainingAmount);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer un Paiement</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {installmentPayment && (
            <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description:</span>
                <span className="font-medium">{installmentPayment.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant suggéré:</span>
                <span className="font-medium">{installmentPayment.installment_amount.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restant à payer:</span>
                <span className="font-medium text-primary">{installmentPayment.remaining_amount.toFixed(2)}€</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Montant du Paiement *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Vous pouvez payer le montant suggéré ou un montant différent
            </p>
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
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};