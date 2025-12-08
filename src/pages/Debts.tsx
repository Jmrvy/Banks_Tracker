import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Wallet } from 'lucide-react';
import { NewDebtModal } from '@/components/NewDebtModal';
import { EditDebtModal } from '@/components/EditDebtModal';
import { AddPaymentModal } from '@/components/AddPaymentModal';
import { DebtCard } from '@/components/DebtCard';
import { useDebts, Debt } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Debts = () => {
  const { debts, loading, deleteDebt } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const [newDebtModalOpen, setNewDebtModalOpen] = useState(false);
  const [editDebtModalOpen, setEditDebtModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);

  const handleAddPayment = (debt: Debt) => {
    setSelectedDebt(debt);
    setPaymentModalOpen(true);
  };

  const handleEditDebt = (debt: Debt) => {
    setSelectedDebt(debt);
    setEditDebtModalOpen(true);
  };

  const activeDebts = debts.filter(d => d.status === 'active');
  const loansGiven = activeDebts.filter(d => d.type === 'loan_given');
  const loansReceived = activeDebts.filter(d => d.type === 'loan_received');

  const totalLoansGiven = loansGiven.reduce((sum, d) => sum + d.remaining_amount, 0);
  const totalLoansReceived = loansReceived.reduce((sum, d) => sum + d.remaining_amount, 0);
  const netPosition = totalLoansGiven - totalLoansReceived;

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
      <main className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Gestion des dettes</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Suivez vos prêts et remboursements</p>
          </div>
          <Button onClick={() => setNewDebtModalOpen(true)} className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm">
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle dette
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Prêts accordés</p>
                  <p className="text-lg sm:text-2xl font-bold text-success">{formatCurrency(totalLoansGiven)}</p>
                </div>
                <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Prêts contractés</p>
                  <p className="text-lg sm:text-2xl font-bold text-destructive">
                    {formatCurrency(totalLoansReceived)}
                  </p>
                </div>
                <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 pt-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Position nette</p>
                  <p className={`text-lg sm:text-2xl font-bold ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netPosition)}
                  </p>
                </div>
                <Wallet className={`h-6 w-6 sm:h-8 sm:w-8 ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="space-y-3 sm:space-y-4">
          <TabsList className="h-auto flex-wrap gap-1 p-1 w-full sm:w-auto">
            <TabsTrigger value="all" className="text-xs sm:text-sm h-8 px-2 sm:px-3">Tous ({activeDebts.length})</TabsTrigger>
            <TabsTrigger value="loans_given" className="text-xs sm:text-sm h-8 px-2 sm:px-3">Accordés ({loansGiven.length})</TabsTrigger>
            <TabsTrigger value="loans_received" className="text-xs sm:text-sm h-8 px-2 sm:px-3">Contractés ({loansReceived.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3 sm:space-y-4">
            {activeDebts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 px-4">
                  <Wallet className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">
                    Aucune dette active. Cliquez sur "Nouvelle dette" pour commencer.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
                {activeDebts.map(debt => (
                  <DebtCard 
                    key={debt.id} 
                    debt={debt} 
                    onAddPayment={handleAddPayment}
                    onEdit={handleEditDebt}
                    onDelete={deleteDebt}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="loans_given" className="space-y-3 sm:space-y-4">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
              {loansGiven.map(debt => (
                <DebtCard 
                  key={debt.id} 
                  debt={debt} 
                  onAddPayment={handleAddPayment}
                  onEdit={handleEditDebt}
                  onDelete={deleteDebt}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="loans_received" className="space-y-3 sm:space-y-4">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
              {loansReceived.map(debt => (
                <DebtCard 
                  key={debt.id} 
                  debt={debt} 
                  onAddPayment={handleAddPayment}
                  onEdit={handleEditDebt}
                  onDelete={deleteDebt}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <NewDebtModal open={newDebtModalOpen} onOpenChange={setNewDebtModalOpen} />
      <EditDebtModal 
        open={editDebtModalOpen} 
        onOpenChange={setEditDebtModalOpen}
        debt={selectedDebt}
      />
      <AddPaymentModal 
        open={paymentModalOpen} 
        onOpenChange={setPaymentModalOpen}
        debt={selectedDebt}
      />
    </div>
  );
};

export default Debts;
