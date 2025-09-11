import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, CreditCard } from "lucide-react";
import { AccountTransactionsModal } from "@/components/AccountTransactionsModal";
import { useState } from "react";

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
    name: 'Compte Boursorama',
    bank: 'boursorama',
    balance: 1420.30,
    monthlyChange: -85.20,
    lastTransaction: 'Abonnement Netflix'
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

// Mock transactions by account
const transactionsByAccount: Record<string, any[]> = {
  '1': [ // Compte Courant SG
    {
      id: 'sg_1',
      description: 'Salaire Novembre',
      amount: 3200,
      category: 'Revenus',
      date: '2024-01-05',
      type: 'income'
    },
    {
      id: 'sg_2',
      description: 'Station Shell',
      amount: -62.40,
      category: 'Transport',
      date: '2024-01-04',
      type: 'expense'
    },
    {
      id: 'sg_3',
      description: 'Pharmacie',
      amount: -28.90,
      category: 'Santé',
      date: '2024-01-02',
      type: 'expense'
    },
    {
      id: 'sg_4',
      description: 'Loyer Janvier',
      amount: -1200.00,
      category: 'Logement',
      date: '2024-01-01',
      type: 'expense'
    },
    {
      id: 'sg_5',
      description: 'Boulangerie Paul',
      amount: -12.50,
      category: 'Alimentation',
      date: '2024-01-03',
      type: 'expense'
    }
  ],
  '2': [ // Revolut Card
    {
      id: 'rev_1',
      description: 'Carrefour Market',
      amount: -45.80,
      category: 'Alimentation',
      date: '2024-01-04',
      type: 'expense'
    },
    {
      id: 'rev_2',
      description: 'RATP - Navigo',
      amount: -75.20,
      category: 'Transport',
      date: '2024-01-01',
      type: 'expense'
    },
    {
      id: 'rev_3',
      description: 'Cinéma Gaumont',
      amount: -24.50,
      category: 'Loisirs',
      date: '2023-12-30',
      type: 'expense'
    },
    {
      id: 'rev_4',
      description: 'Restaurant - Le Petit Bistro',
      amount: -42.30,
      category: 'Alimentation',
      date: '2023-12-28',
      type: 'expense'
    }
  ],
  '3': [ // Compte Boursorama
    {
      id: 'bour_1',
      description: 'Netflix',
      amount: -13.49,
      category: 'Loisirs',
      date: '2024-01-03',
      type: 'expense'
    },
    {
      id: 'bour_2',
      description: 'Médecin généraliste',
      amount: -25.00,
      category: 'Santé',
      date: '2023-12-28',
      type: 'expense'
    },
    {
      id: 'bour_3',
      description: 'Monoprix',
      amount: -67.20,
      category: 'Alimentation',
      date: '2024-01-02',
      type: 'expense'
    },
    {
      id: 'bour_4',
      description: 'Virement depuis SG',
      amount: 500.00,
      category: 'Revenus',
      date: '2024-01-01',
      type: 'income'
    }
  ]
};

export const AccountCards = () => {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  const handleAccountClick = (account: Account) => {
    setSelectedAccount(account);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Total Overview */}
      <Card className="border">
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
          <Card 
            key={account.id} 
            className="hover:shadow-sm transition-all duration-200 border cursor-pointer hover:bg-muted/50"
            onClick={() => handleAccountClick(account)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-8 rounded-full ${bankColors[account.bank]}`} />
                  <div>
                    <h3 className="font-semibold text-foreground">{account.name}</h3>
                    <p className="text-sm text-muted-foreground">{bankNames[account.bank]}</p>
                  </div>
                </div>
                <Badge variant={account.monthlyChange >= 0 ? 'secondary' : 'destructive'} className="text-xs">
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
                <p className="text-2xl font-bold text-foreground">
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
      
      <AccountTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        accountName={selectedAccount?.name || ''}
        bankName={selectedAccount ? bankNames[selectedAccount.bank] : ''}
        transactions={selectedAccount ? transactionsByAccount[selectedAccount.id] || [] : []}
        balance={selectedAccount?.balance || 0}
      />
    </div>
  );
};