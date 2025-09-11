import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, MoreHorizontal } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";

const bankColors: Record<string, string> = {
  societe_generale: 'bg-red-500',
  revolut: 'bg-blue-500', 
  boursorama: 'bg-orange-500',
  bnp_paribas: 'bg-green-600',
  credit_agricole: 'bg-green-700',
  lcl: 'bg-blue-700',
  caisse_epargne: 'bg-yellow-600',
  credit_mutuel: 'bg-blue-800',
  other: 'bg-gray-500'
};

export const RecentTransactions = () => {
  const { transactions, loading } = useFinancialData();
  
  // Get the 5 most recent transactions
  const recentTransactions = transactions.slice(0, 5);

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                <div className="flex items-center space-x-4">
                  <div className="animate-pulse w-2 h-6 rounded-full bg-muted" />
                  <div className="animate-pulse w-8 h-8 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="animate-pulse h-4 bg-muted rounded w-32" />
                    <div className="animate-pulse h-3 bg-muted rounded w-20" />
                  </div>
                </div>
                <div className="animate-pulse h-4 bg-muted rounded w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recentTransactions.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Aucune transaction trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Commencez par créer votre première transaction
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Transactions Récentes</CardTitle>
        <Button variant="outline" size="sm">
          Voir tout ({transactions.length})
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
                  <div className={`w-2 h-6 rounded-full ${
                    bankColors[transaction.account?.bank || 'other'] || 'bg-gray-500'
                  }`} />
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                    {transaction.type === 'income' ? (
                      <ArrowDownRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                </div>
                
                <div>
                  <p className="font-medium text-sm">{transaction.description}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {transaction.category && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ backgroundColor: transaction.category.color, color: 'white' }}
                      >
                        {transaction.category.name}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(transaction.transaction_date).toLocaleDateString('fr-FR')}
                    </span>
                    {transaction.account && (
                      <span className="text-xs text-muted-foreground">
                        • {transaction.account.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span 
                  className={`font-semibold ${
                    transaction.type === 'income' ? 'text-green-600' : 'text-foreground'
                  }`}
                >
                  {transaction.type === 'income' ? '+' : '-'}{Math.abs(transaction.amount).toLocaleString('fr-FR', { 
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