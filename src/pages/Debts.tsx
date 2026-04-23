import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Wallet,
  Clock,
} from 'lucide-react';
import { NewDebtModal } from '@/components/NewDebtModal';
import { EditDebtModal } from '@/components/EditDebtModal';
import { AddPaymentModal } from '@/components/AddPaymentModal';
import { DebtDetailsModal } from '@/components/DebtDetailsModal';
import DebtCard from '@/components/DebtCard';
import { useDebts, Debt, DebtPayment } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';


const Debts = () => {
  const { debts, payments, loading, deleteDebt, getDebtDeletionImpact, getNextScheduledAmount } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const [newDebtModalOpen, setNewDebtModalOpen] = useState(false);
  const [editDebtModalOpen, setEditDebtModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<{ transactionCount: number; recurringCount: number; paymentCount: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const paymentsByDebt = useMemo(() => {
    const map = new Map<string, DebtPayment[]>();
    for (const p of payments) {
      let arr = map.get(p.debt_id);
      if (!arr) {
        arr = [];
        map.set(p.debt_id, arr);
      }
      arr.push(p);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.payment_date.localeCompare(b.payment_date));
    }
    return map;
  }, [payments]);

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

  const handleDeleteClick = async (debt: Debt) => {
    setDebtToDelete(debt);
    setDeletionImpact(null);
    setDeleteDialogOpen(true);
    setLoadingImpact(true);
    try {
      const impact = await getDebtDeletionImpact(debt.id);
      setDeletionImpact(impact);
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!debtToDelete) return;
    await deleteDebt(debtToDelete.id);
    setDeleteDialogOpen(false);
    setDebtToDelete(null);
    if (expandedId === debtToDelete.id) setExpandedId(null);
  };

  const activeDebts = debts.filter(d => d.status === 'active');
  const completedDebts = debts.filter(d => d.status !== 'active');
  const totalRemaining = activeDebts.reduce((sum, d) => sum + d.remaining_amount, 0);

  const filteredDebts = debts.filter(d => {
    if (filter === 'active') return d.status === 'active';
    if (filter === 'completed') return d.status !== 'active';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Chargement des dettes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-20 md:pb-24">
      <div className="p-3 md:p-4 lg:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
              <div className="icon-badge icon-badge-md bg-primary/10">
                <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              Gestion des Dettes
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 ml-11 md:ml-13">
              Suivez vos prêts et remboursements
            </p>
          </div>
          <Button
            onClick={() => setNewDebtModalOpen(true)}
            size="default"
            className="w-full md:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle dette
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground whitespace-nowrap">Total dû</p>
                  <div className="icon-badge icon-badge-sm bg-destructive/10 flex-shrink-0 flex">
                    <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-destructive" />
                  </div>
                </div>
                <p className="text-sm sm:text-2xl font-bold break-all leading-tight">
                  {formatCurrency(totalRemaining)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">Actifs</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {activeDebts.length}
                  </p>
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
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">Terminés</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {completedDebts.length}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-muted/20 flex-shrink-0 flex">
                  <Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 h-9 sm:h-10">
            <TabsTrigger value="active" className="text-[11px] sm:text-sm px-1 sm:px-3">Actifs ({activeDebts.length})</TabsTrigger>
            <TabsTrigger value="completed" className="text-[11px] sm:text-sm px-1 sm:px-3">Terminés ({completedDebts.length})</TabsTrigger>
            <TabsTrigger value="all" className="text-[11px] sm:text-sm px-1 sm:px-3">Tous ({debts.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Debt List */}
        {filteredDebts.length === 0 ? (
          <Card>
            <CardContent className="p-8 sm:p-12 text-center">
              <div className="icon-badge icon-badge-lg bg-muted/50 mx-auto mb-3 sm:mb-4">
                <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base sm:text-lg font-medium mb-2">Aucune dette</h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                Suivez vos prêts et remboursements en créant votre première dette
              </p>
              <Button onClick={() => setNewDebtModalOpen(true)} className="h-9 text-sm">
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle dette
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredDebts.map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                isExpanded={expandedId === debt.id}
                onToggleExpand={() => setExpandedId(expandedId === debt.id ? null : debt.id)}
                payments={paymentsByDebt.get(debt.id) || []}
                nextScheduledAmount={getNextScheduledAmount(debt.id)}
                formatCurrency={formatCurrency}
                onAddPayment={handleAddPayment}
                onEdit={handleEditDebt}
                onViewDetails={handleViewDetails}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </div>

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

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm sm:text-lg">Supprimer cette dette ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs sm:text-sm space-y-3">
                {debtToDelete && (
                  <p>
                    <strong>{debtToDelete.description}</strong> sera définitivement supprimée.
                    Cette action est irréversible.
                  </p>
                )}
                {loadingImpact && (
                  <p className="text-muted-foreground">Analyse des données liées...</p>
                )}
                {deletionImpact && (deletionImpact.transactionCount > 0 || deletionImpact.recurringCount > 0 || deletionImpact.paymentCount > 0) && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 space-y-1">
                    <p className="font-medium text-destructive">Les éléments suivants seront également supprimés :</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                      {deletionImpact.transactionCount > 0 && (
                        <li>{deletionImpact.transactionCount} transaction{deletionImpact.transactionCount > 1 ? 's' : ''}</li>
                      )}
                      {deletionImpact.recurringCount > 0 && (
                        <li>{deletionImpact.recurringCount} transaction{deletionImpact.recurringCount > 1 ? 's' : ''} récurrente{deletionImpact.recurringCount > 1 ? 's' : ''}</li>
                      )}
                      {deletionImpact.paymentCount > 0 && (
                        <li>{deletionImpact.paymentCount} paiement{deletionImpact.paymentCount > 1 ? 's' : ''} enregistré{deletionImpact.paymentCount > 1 ? 's' : ''}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs sm:text-sm">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={loadingImpact} className="h-9 text-xs sm:text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Debts;
