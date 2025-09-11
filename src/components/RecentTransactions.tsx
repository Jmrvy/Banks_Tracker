import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, MoreHorizontal } from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  bank: 'sg' | 'revolut' | 'boursorama';
  date: string;
  type: 'expense' | 'income';
}

const recentTransactions: Transaction[] = [
  {
    id: '1',
    description: 'Salaire Novembre',
    amount: 3200,
    category: 'Revenus',
    bank: 'sg',
    date: '2024-01-05',
    type: 'income'
  },
  {
    id: '2',
    description: 'Carrefour Market',
    amount: -45.80,
    category: 'Alimentation',
    bank: 'revolut',
    date: '2024-01-04',
    type: 'expense'
  },
  {
    id: '3',
    description: 'Station Shell',
    amount: -62.40,
    category: 'Transport',
    bank: 'sg',
    date: '2024-01-04',
    type: 'expense'
  },
  {
    id: '4',
    description: 'Netflix',
    amount: -13.49,
    category: 'Loisirs',
    bank: 'boursorama',
    date: '2024-01-03',
    type: 'expense'
  },
  {
    id: '5',
    description: 'Pharmacie',
    amount: -28.90,
    category: 'Santé',
    bank: 'sg',
    date: '2024-01-02',
    type: 'expense'
  }
];

const bankColors = {
  sg: 'bg-bank-sg',
  revolut: 'bg-bank-revolut', 
  boursorama: 'bg-bank-boursorama'
};

const categoryColors: Record<string, string> = {
  'Revenus': 'bg-success',
  'Alimentation': 'bg-primary',
  'Transport': 'bg-accent',
  'Loisirs': 'bg-warning',
  'Santé': 'bg-success',
};

export const RecentTransactions = () => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Transactions Récentes</CardTitle>
        <Button variant="outline" size="sm">
          Voir tout
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentTransactions.map((transaction) => (
            <div 
              key={transaction.id} 
              className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-6 rounded-full ${bankColors[transaction.bank]}`} />
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                    {transaction.type === 'income' ? (
                      <ArrowDownRight className="w-4 h-4 text-success" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                </div>
                
                <div>
                  <p className="font-medium text-sm">{transaction.description}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${categoryColors[transaction.category]} text-white`}
                    >
                      {transaction.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(transaction.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span 
                  className={`font-semibold ${
                    transaction.type === 'income' ? 'text-success' : 'text-foreground'
                  }`}
                >
                  {transaction.amount.toLocaleString('fr-FR', { 
                    style: 'currency', 
                    currency: 'EUR' 
                  })}
                </span>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};