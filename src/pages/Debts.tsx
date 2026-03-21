import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Wallet } from 'lucide-react';
import { NewDebtModal } from '@/components/NewDebtModal';
import { EditDebtModal } from '@/components/EditDebtModal';
import { AddPaymentModal } from '@/components/AddPaymentModal';
import { DebtDetailsModal } from '@/components/DebtDetailsModal';
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
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);

  const handleAddPayment = (debt: Debt) => {
    setSelectedDebt(debt);
    setPaymentModalOpen(true);
  };

  const handleEditDebt = (debt: Debt) => {
    setSelectedDebt(debt);
    setEditDebtModalOpen(true);
  };

  const handleViewDetails = (debt: Debt) => {
    setSelectedDebt(debt);
    setDetailsModalOpen(true);
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

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 truncate">Accordés</p>
                  <p className="text-base sm:text-2xl font-bold text-success truncate">{formatCurrency(totalLoansGiven)}</p>
                </div>
                <div className="icon-badge icon-badge-sm bg-success/10 flex-shrink-0 flex">
                  <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 truncate">Contractés</p>
                  <p className="text-base sm:text-2xl font-bold text-destructive truncate">
                    {formatCurrency(totalLoansReceived)}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-destructive/10 flex-shrink-0 flex">
                  <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 truncate">Position nette</p>
                  <p className={`text-base sm:text-2xl font-bold truncate ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netPosition)}
                  </p>
                </div>
                <div className={`icon-badge icon-badge-sm ${netPosition >= 0 ? 'bg-success/10' : 'bg-destructive/10'} flex-shrink-0 flex`}>
                  <Wallet className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${netPosition >= 0 ? 'text-success' : 'text-destructive'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="space-y-3 sm:space-y-4">
          <TabsList className="h-auto flex-wrap gap-1 p-1 w-full sm:w-auto">
            <TabsTrigger value="all" className="text-[11px] sm:text-sm h-8 px-1.5 sm:px-3">Tous ({activeDebts.length})</TabsTrigger>
            <TabsTrigger value="loans_given" className="text-[11px] sm:text-sm h-8 px-1.5 sm:px-3">Accordés ({loansGiven.length})</TabsTrigger>
            <TabsTrigger value="loans_received" className="text-[11px] sm:text-sm h-8 px-1.5 sm:px-3">Contractés ({loansReceived.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3 sm:space-y-4">
            {activeDebts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 px-4">
                  <div className="icon-badge icon-badge-lg bg-muted/50 mx-auto mb-3 sm:mb-4">
                    <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-base sm:text-lg font-medium mb-2">Aucune dette active</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center mb-4">
                    Suivez vos prêts et remboursements en créant votre première dette.
                  </p>
                  <Button onClick={() => setNewDebtModalOpen(true)} className="h-9 text-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Nouvelle dette
                  </Button>
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
                    onClick={handleViewDetails}
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
      <DebtDetailsModal
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        debt={selectedDebt}
        onAddPayment={handleAddPayment}
        onEdit={handleEditDebt}
      />
    </div>
  );
};

export default Debts;
