import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, ArrowLeft } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePeriod } from "@/contexts/PeriodContext";
import { NewAccountModal } from "@/components/NewAccountModal";
import { AccountDetails } from "@/components/AccountDetails";

const Accounts = () => {
  const { accounts, transactions, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { dateRange, periodLabel } = usePeriod();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const selectedAccount = useMemo(() => {
    return accounts.find(acc => acc.id === selectedAccountId);
  }, [accounts, selectedAccountId]);


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

  // If an account is selected, show its details
  if (selectedAccountId && selectedAccount) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
          {/* Header with back button */}
          <div className="flex items-center gap-2 sm:gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setSelectedAccountId(null)}
              className="h-8 w-8 sm:h-10 sm:w-10"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">{selectedAccount.name}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {getBankLabel(selectedAccount.bank)} • {getAccountTypeLabel(selectedAccount.account_type)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs sm:text-sm text-muted-foreground">Solde</p>
              <p className={`text-base sm:text-xl md:text-2xl font-bold ${selectedAccount.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(selectedAccount.balance)}
              </p>
            </div>
          </div>

          {/* Account Details with Charts */}
          <AccountDetails 
            accountId={selectedAccountId}
            transactions={transactions}
            balance={selectedAccount.balance}
            startDate={dateRange.start}
            endDate={dateRange.end}
            periodLabel={periodLabel}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
              <span className="truncate">Comptes</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">
              Gérez vos comptes et transactions
            </p>
          </div>
          <Button 
            onClick={() => setShowNewAccountModal(true)}
            size="sm"
            className="h-8 sm:h-9 px-2 sm:px-4 flex-shrink-0"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nouveau compte</span>
          </Button>
        </div>

        {/* Total Balance Card */}
        <Card className="border-border bg-card">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Solde total</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold">{formatCurrency(totalBalance)}</p>
              </div>
              <div className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wallet className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts List */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Tous les comptes ({accounts.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {accounts.map((account) => (
              <Card
                key={account.id}
                className="border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer active:scale-[0.98]"
                onClick={() => setSelectedAccountId(account.id)}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg truncate">{account.name}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">{getBankLabel(account.bank)}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0">
                        {getAccountTypeLabel(account.account_type)}
                      </Badge>
                    </div>
                    
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">Solde</p>
                      <p className={`text-lg sm:text-xl md:text-2xl font-bold ${account.balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <NewAccountModal 
        open={showNewAccountModal} 
        onOpenChange={setShowNewAccountModal} 
      />
    </div>
  );
};

export default Accounts;
