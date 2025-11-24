import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, Edit, Trash2 } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { TransactionHistory } from "@/components/TransactionHistory";
import { NewAccountModal } from "@/components/NewAccountModal";
import { AccountTransactionsModal } from "@/components/AccountTransactionsModal";

const Accounts = () => {
  const { accounts, transactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const selectedAccount = useMemo(() => {
    return accounts.find(acc => acc.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  const selectedAccountTransactions = useMemo(() => {
    if (!selectedAccountId) return [];
    return transactions.filter(t => t.account_id === selectedAccountId);
  }, [transactions, selectedAccountId]);

  const getBankLabel = (bank: string) => {
    const labels: Record<string, string> = {
      'societe_generale': 'Société Générale',
      'revolut': 'Revolut',
      'boursorama': 'Boursorama',
      'bnp_paribas': 'BNP Paribas',
      'credit_agricole': 'Crédit Agricole',
      'lcl': 'LCL',
      'caisse_epargne': "Caisse d'Épargne",
      'credit_mutuel': 'Crédit Mutuel',
      'other': 'Autre',
    };
    return labels[bank] || bank;
  };

  const getAccountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'checking': 'Compte Courant',
      'savings': 'Épargne',
      'credit': 'Crédit',
      'investment': 'Investissement',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p>Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Comptes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gérez vos comptes et transactions
            </p>
          </div>
          <Button onClick={() => setShowNewAccountModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau compte
          </Button>
        </div>

        {/* Total Balance Card */}
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Solde total</p>
                <p className="text-3xl font-bold">{formatCurrency(totalBalance)}</p>
              </div>
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="h-8 w-8 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Tous les comptes ({accounts.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <Card
                key={account.id}
                className="border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => setSelectedAccountId(account.id)}
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{account.name}</h3>
                        <p className="text-sm text-muted-foreground">{getBankLabel(account.bank)}</p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {getAccountTypeLabel(account.account_type)}
                      </Badge>
                    </div>
                    
                    <div className="pt-2 border-t border-border">
                      <p className="text-sm text-muted-foreground mb-1">Solde</p>
                      <p className={`text-2xl font-bold ${account.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Historique des transactions</h2>
          <TransactionHistory filters={{
            searchText: '',
            type: 'all',
            categoryId: 'all',
            accountId: 'all',
            dateFrom: '',
            dateTo: '',
            amountMin: '',
            amountMax: '',
          }} />
        </div>
      </div>

      <NewAccountModal 
        open={showNewAccountModal} 
        onOpenChange={setShowNewAccountModal} 
      />

      {selectedAccount && (
        <AccountTransactionsModal
          accountName={selectedAccount.name}
          bankName={getBankLabel(selectedAccount.bank)}
          transactions={selectedAccountTransactions}
          balance={selectedAccount.balance}
          open={!!selectedAccountId}
          onOpenChange={(open) => !open && setSelectedAccountId(null)}
        />
      )}
    </div>
  );
};

export default Accounts;
