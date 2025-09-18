import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useNavigate } from 'react-router-dom';

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

const NewAccount = () => {
  const { toast } = useToast();
  const { createAccount } = useFinancialData();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    bank: 'other' as const,
    account_type: 'checking' as const,
    balance: '0'
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez saisir un nom de compte.",
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
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Compte créé",
        description: `Le compte ${formData.name} a été créé avec succès.`,
      });
      
      // Reset form
      setFormData({
        name: '',
        bank: 'other',
        account_type: 'checking',
        balance: '0'
      });
      
      navigate('/');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/")}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nouveau Compte</h1>
            <p className="text-sm text-muted-foreground">
              Ajouter un nouveau compte bancaire
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
            <Label htmlFor="bank">Banque</Label>
            <Select 
              value={formData.bank} 
              onValueChange={(value: any) => setFormData({ ...formData, bank: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une banque" />
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
            <Label htmlFor="type">Type de compte</Label>
            <Select 
              value={formData.account_type} 
              onValueChange={(value: any) => setFormData({ ...formData, account_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le type de compte" />
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
            <Label htmlFor="balance">Solde initial</Label>
            <Input
              id="balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Saisissez le solde actuel de votre compte
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/')}
              disabled={loading}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Création...' : 'Créer le compte'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewAccount;