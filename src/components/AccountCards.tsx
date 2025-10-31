import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, CreditCard } from "lucide-react";
import { AccountTransactionsModal } from "@/components/AccountTransactionsModal";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

const bankColors: Record<string, string> = {
  societe_generale: 'bg-red-500',
  revolut: 'bg-blue-500', 
  boursorama: 'bg-orange-500',
  bnp_paribas: 'bg-green-600',
  credit_agricole: 'bg-green-700',
  lcl: 'bg-blue-700',
  caisse_epargne: 'bg-yellow-600',
  credit_mutuel: 'bg-blue-800',
  chase: 'bg-blue-600',
  bofa: 'bg-red-600',
  wells_fargo: 'bg-yellow-500',
  citi: 'bg-blue-500',
  capital_one: 'bg-orange-600',
  other: 'bg-gray-500'
};

const bankNames: Record<string, string> = {
  societe_generale: 'Société Générale',
  revolut: 'Revolut',
  boursorama: 'Boursorama',
  bnp_paribas: 'BNP Paribas',
  credit_agricole: 'Crédit Agricole',
  lcl: 'LCL',
  caisse_epargne: 'Caisse d\'Épargne',
  credit_mutuel: 'Crédit Mutuel',
  chase: 'Chase',
  bofa: 'Bank of America',
  wells_fargo: 'Wells Fargo',
  citi: 'Citibank',
  capital_one: 'Capital One',
  other: 'Autre'
};

export const AccountCards = () => {
  const { accounts, transactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Calculate monthly changes and last transactions for each account
  const enrichedAccounts = useMemo(() => {
    console.log('Accounts:', accounts);
    console.log('Transactions:', transactions);
    
    return accounts.map(account => {
    const accountTransactions = transactions.filter(t => {
      console.log('Filtering transaction:', t, 'for account:', account.name);
      // Match by account_id OR by transfer_to_account_id OR by joined account name as fallback
      return t.account_id === account.id || 
             t.transfer_to_account_id === account.id ||
             t.account?.name === account.name;
    });
      
      console.log('Account transactions for', account.name, ':', accountTransactions);
      
      // Calculate monthly change (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const monthlyTransactions = accountTransactions.filter(t => 
        new Date(t.transaction_date) >= thirtyDaysAgo
      );
      
      const monthlyChange = monthlyTransactions.reduce((sum, t) => {
        if (t.type === 'income') return sum + t.amount;
        if (t.type === 'expense') return sum - t.amount;
        if (t.type === 'transfer') {
          // Check if this account is the source or destination of the transfer
          if (t.account_id === account.id) {
            // This account is the source - deduct amount + fee
            return sum - t.amount - (t.transfer_fee || 0);
          } else if (t.transfer_to_account_id === account.id) {
            // This account is the destination - add amount
            return sum + t.amount;
          }
        }
        return sum;
      }, 0);
      
      // Get last transaction description
      const lastTransaction = accountTransactions.length > 0 
        ? accountTransactions[0].description 
        : 'Aucune transaction';
      
      return {
        ...account,
        monthlyChange,
        lastTransaction,
        transactionCount: accountTransactions.length
      };
    });
  }, [accounts, transactions]);
  
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  const handleAccountClick = (account: any) => {
    console.log('Clicked account:', account);
    console.log('All transactions:', transactions);
    
    const accountTransactions = transactions.filter(t => {
      console.log('Checking transaction:', t, 'Account ID:', (t as any).account_id, 'Target account ID:', account.id);
      // Match by account_id OR by transfer_to_account_id OR by joined account name as fallback
      return (t as any).account_id === account.id || 
             (t as any).transfer_to_account_id === account.id ||
             t.account?.name === account.name;
    });
    
    console.log('Filtered transactions for account:', accountTransactions);
    
    setSelectedAccount({
      ...account,
      transactions: accountTransactions
    });
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="border">
          <CardContent className="p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border">
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
                  <div className="h-6 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card className="border">
        <CardContent className="p-6 text-center">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun compte bancaire</h3>
          <p className="text-muted-foreground mb-4">
            Commencez par créer votre premier compte bancaire pour suivre vos finances.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total Overview */}
      <Card className="border">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs sm:text-sm font-medium">Solde Total</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">
                {formatCurrency(totalBalance)}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {accounts.length} compte{accounts.length > 1 ? 's' : ''} bancaire{accounts.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {enrichedAccounts.map((account) => (
          <Card 
            key={account.id} 
            className="hover:shadow-sm transition-all duration-200 border cursor-pointer hover:bg-muted/50"
            onClick={() => handleAccountClick(account)}
          >
            <CardContent className="p-3 sm:p-4 lg:p-5">
              <div className="flex items-start justify-between mb-2 sm:mb-3">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <div className={`w-2 sm:w-3 h-6 sm:h-8 rounded-full flex-shrink-0 ${bankColors[account.bank] || 'bg-gray-500'}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm sm:text-base text-foreground truncate">{account.name}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {bankNames[account.bank] || account.bank}
                    </p>
                  </div>
                </div>
                <Badge variant={account.monthlyChange >= 0 ? 'secondary' : 'destructive'} className="text-[10px] sm:text-xs flex-shrink-0 ml-1">
                  {account.monthlyChange >= 0 ? (
                    <TrendingUp className="w-2 h-2 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                  ) : (
                    <TrendingDown className="w-2 h-2 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                  )}
                  <span className="hidden sm:inline">{formatCurrency(Math.abs(account.monthlyChange))}</span>
                  <span className="sm:hidden">{Math.abs(account.monthlyChange).toFixed(0)}</span>
                </Badge>
              </div>
              
              <div className="space-y-1 sm:space-y-2">
                <p className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground">
                  {formatCurrency(account.balance)}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                  Dernière: {account.lastTransaction}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {account.transactionCount} transaction{account.transactionCount > 1 ? 's' : ''}
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
        bankName={selectedAccount ? bankNames[selectedAccount.bank] || selectedAccount.bank : ''}
        transactions={selectedAccount?.transactions || []}
        balance={selectedAccount?.balance || 0}
      />
    </div>
  );
};
