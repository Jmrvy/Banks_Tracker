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
    <div className="min-h-screen bg-background pb-20">
      <main className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestion des dettes</h1>
            <p className="text-muted-foreground">Suivez vos prêts, crédits et remboursements</p>
          </div>
          <Button onClick={() => setNewDebtModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle dette
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prêts accordés</p>
                  <p className="text-2xl font-bold text-success">{formatCurrency(totalLoansGiven)}</p>
                </div>
                <Wallet className="h-8 w-8 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prêts contractés</p>
                  <p className="text-2xl font-bold text-destructive">
                    {formatCurrency(totalLoansReceived)}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Position nette</p>
                  <p className={`text-2xl font-bold ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netPosition)}
                  </p>
                </div>
                <Wallet className={`h-8 w-8 ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">Tous ({activeDebts.length})</TabsTrigger>
            <TabsTrigger value="loans_given">Prêts accordés ({loansGiven.length})</TabsTrigger>
            <TabsTrigger value="loans_received">Prêts contractés ({loansReceived.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {activeDebts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Aucune dette active. Cliquez sur "Nouvelle dette" pour commencer.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
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

          <TabsContent value="loans_given" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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

          <TabsContent value="loans_received" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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
