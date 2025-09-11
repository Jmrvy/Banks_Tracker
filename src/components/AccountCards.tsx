import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, CreditCard } from "lucide-react";

interface Account {
  id: string;
  name: string;
  bank: 'sg' | 'revolut' | 'boursorama';
  balance: number;
  monthlyChange: number;
  lastTransaction: string;
}

const accounts: Account[] = [
  {
    id: '1',
    name: 'Compte Courant',
    bank: 'sg',
    balance: 2450.75,
    monthlyChange: -230.50,
    lastTransaction: 'Courses - Carrefour'
  },
  {
    id: '2',
    name: 'Revolut Card',
    bank: 'revolut',
    balance: 890.20,
    monthlyChange: -45.80,
    lastTransaction: 'Restaurant - Le Petit Bistro'
  },
  {
    id: '3',
    name: 'Épargne Boursorama',
    bank: 'boursorama',
    balance: 15420.30,
    monthlyChange: 500.00,
    lastTransaction: 'Virement automatique'
  }
];

const bankColors = {
  sg: 'bg-bank-sg',
  revolut: 'bg-bank-revolut', 
  boursorama: 'bg-bank-boursorama'
};

const bankNames = {
  sg: 'Société Générale',
  revolut: 'Revolut',
  boursorama: 'Boursorama'
};

export const AccountCards = () => {
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <div className="space-y-6">
      {/* Total Overview */}
      <Card className="bg-gradient-to-r from-card to-secondary border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">Solde Total</p>
              <p className="text-3xl font-bold text-foreground">
                {totalBalance.toLocaleString('fr-FR', { 
                  style: 'currency', 
                  currency: 'EUR' 
                })}
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map((account) => (
          <Card key={account.id} className="hover:shadow-md transition-all duration-200 border-0 bg-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-8 rounded-full ${bankColors[account.bank]}`} />
                  <div>
                    <h3 className="font-semibold text-card-foreground">{account.name}</h3>
                    <p className="text-sm text-muted-foreground">{bankNames[account.bank]}</p>
                  </div>
                </div>
                <Badge variant={account.monthlyChange >= 0 ? 'default' : 'destructive'} className="text-xs">
                  {account.monthlyChange >= 0 ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {Math.abs(account.monthlyChange).toLocaleString('fr-FR', { 
                    style: 'currency', 
                    currency: 'EUR' 
                  })}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <p className="text-2xl font-bold text-card-foreground">
                  {account.balance.toLocaleString('fr-FR', { 
                    style: 'currency', 
                    currency: 'EUR' 
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  Dernière transaction: {account.lastTransaction}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};