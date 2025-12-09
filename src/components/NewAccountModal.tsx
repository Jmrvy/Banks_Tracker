import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const bankOptions = [
  { value: 'societe_generale', label: 'Société Générale' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'boursorama', label: 'Boursorama' },
  { value: 'bnp_paribas', label: 'BNP Paribas' },
  { value: 'credit_agricole', label: 'Crédit Agricole' },
  { value: 'lcl', label: 'LCL' },
  { value: 'caisse_epargne', label: 'Caisse d\'Épargne' },
  { value: 'credit_mutuel', label: 'Crédit Mutuel' },
  { value: 'other', label: 'Autre' },
];

const accountTypeOptions = [
  { value: 'checking', label: 'Compte Courant' },
  { value: 'savings', label: 'Livret d\'Épargne' },
  { value: 'credit', label: 'Carte de Crédit' },
  { value: 'investment', label: 'Compte Titre' },
];

export function NewAccountModal({ open, onOpenChange }: NewAccountModalProps) {
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
        title: "Erreur de validation",
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
        title: "Error creating account",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Account created",
        description: `${formData.name} account created successfully.`,
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
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            New Account
          </DialogTitle>
          <DialogDescription>
            Add a new financial account to track your money
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nom du compte *</Label>
            <Input
              id="name"
              placeholder="ex: Compte Courant SG, Revolut Perso, CB Boursorama"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <p className="text-xs text-muted-foreground">
              Vous pouvez avoir plusieurs comptes par banque (ex: CB, Épargne, etc.)
            </p>
          </div>

          {/* Bank */}
          <div className="space-y-2">
            <Label htmlFor="bank">Bank</Label>
            <Select 
              value={formData.bank} 
              onValueChange={(value: any) => setFormData({ ...formData, bank: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a bank" />
              </SelectTrigger>
              <SelectContent>
                {bankOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Account Type</Label>
            <Select 
              value={formData.account_type} 
              onValueChange={(value: any) => setFormData({ ...formData, account_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                {accountTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Starting Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">Starting Balance</Label>
            <Input
              id="balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Enter your current account balance
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}