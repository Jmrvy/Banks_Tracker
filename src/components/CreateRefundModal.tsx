import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface CreateRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function CreateRefundModal({ open, onOpenChange, transaction }: CreateRefundModalProps) {
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

  // Calculate remaining amount to refund
  const remainingToRefund = transaction 
    ? transaction.amount - (transaction.refunded_amount || 0) 
    : 0;

  // Reset form when transaction changes
  const resetForm = () => {
    if (transaction) {
      setFormData({
        amount: remainingToRefund.toFixed(2),
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
        title: "Montant invalide",
        description: "Veuillez entrer un montant valide.",
        variant: "destructive",
      });
      return;
    }

    if (amount > remainingToRefund) {
      toast({
        title: "Montant trop élevé",
        description: `Le montant maximum remboursable est de ${formatCurrency(remainingToRefund)}.`,
        variant: "destructive",
      });
      return;
    }

    if (!formData.account_id) {
      toast({
        title: "Compte requis",
        description: "Veuillez sélectionner un compte pour le remboursement.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await createRefund({
      original_transaction_id: transaction.id,
      amount,
      description: formData.description,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      transaction_date: formData.transaction_date,
      value_date: formData.value_date,
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la création du remboursement.",
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

  const isFullyRefunded = remainingToRefund <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            Créer un remboursement
          </DialogTitle>
          <DialogDescription>
            Enregistrer un remboursement pour cette transaction
          </DialogDescription>
        </DialogHeader>

        {/* Original transaction info */}
        <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
          <p className="text-sm font-medium">Transaction originale :</p>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground truncate max-w-[60%]">
              {transaction.description}
            </span>
            <span className="text-sm font-semibold text-destructive">
              -{formatCurrency(transaction.amount)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              {format(new Date(transaction.transaction_date), 'dd MMMM yyyy', { locale: fr })}
            </span>
            {transaction.category && (
              <span 
                className="px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: transaction.category.color }}
              >
                {transaction.category.name}
              </span>
            )}
          </div>
          {(transaction.refunded_amount || 0) > 0 && (
            <div className="flex justify-between items-center text-xs pt-1 border-t border-border/50">
              <span className="text-muted-foreground">Déjà remboursé :</span>
              <span className="text-green-600 font-medium">
                +{formatCurrency(transaction.refunded_amount || 0)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm pt-1 border-t border-border/50">
            <span className="font-medium">Remboursable :</span>
            <span className={`font-semibold ${isFullyRefunded ? 'text-muted-foreground' : 'text-primary'}`}>
              {formatCurrency(remainingToRefund)}
            </span>
          </div>
        </div>

        {isFullyRefunded ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Cette transaction a déjà été entièrement remboursée.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-amount">Montant du remboursement *</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={remainingToRefund}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum : {formatCurrency(remainingToRefund)}
              </p>
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
                  <SelectValue placeholder="Sélectionner un compte" />
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
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Même que l'original" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Même que l'original</SelectItem>
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
                <Label>Date du remboursement</Label>
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

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
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
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
