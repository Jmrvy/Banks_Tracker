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
import { DebtsPayoffTrajectory } from '@/components/DebtsPayoffTrajectory';
import { useDebts, Debt, DebtPayment } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useTranslation } from 'react-i18next';


const Debts = () => {
  const { debts, payments, loading, deleteDebt, getDebtDeletionImpact, getNextScheduledAmount, getNextScheduledPayment } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();
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
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.debts')}</div>
            <h1 className="ft-page-title">{t('debts.pageTitle', { defaultValue: 'Loans & liabilities' })}</h1>
            <div className="ft-page-sub">
              {activeDebts.length} {t('debts.active', { defaultValue: 'active' })}
              {' · '}
              <span className="font-mono">{formatCurrency(totalRemaining)}</span> {t('debts.remaining', { defaultValue: 'remaining' })}
            </div>
          </div>
          <Button
            onClick={() => setNewDebtModalOpen(true)}
            size="sm"
            className="h-8 px-3 gap-1.5 font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('debts.newDebt', { defaultValue: 'New debt' })}</span>
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon neg"><Wallet className="h-4 w-4" /></div>
              <span className="ft-kpi-label">{t('debts.totalDue', { defaultValue: 'Total due' })}</span>
            </div>
            <div className="ft-kpi-value">{formatCurrency(totalRemaining)}</div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon pos"><Wallet className="h-4 w-4" /></div>
              <span className="ft-kpi-label">{t('debts.active', { defaultValue: 'Active' })}</span>
            </div>
            <div className="ft-kpi-value">{activeDebts.length}</div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon"><Clock className="h-4 w-4 text-muted-foreground" /></div>
              <span className="ft-kpi-label">{t('debts.completed', { defaultValue: 'Completed' })}</span>
            </div>
            <div className="ft-kpi-value">{completedDebts.length}</div>
          </div>
        </div>

        {/* Payoff trajectory deep-dive (snowball / avalanche / minimum) */}
        {activeDebts.length > 0 && <DebtsPayoffTrajectory debts={activeDebts} />}

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
          <div className="ft-card p-8 sm:p-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-bg-subtle mx-auto mb-3 sm:mb-4 grid place-items-center">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base sm:text-lg font-medium mb-2">{t('debts.empty', { defaultValue: 'No debts yet' })}</h3>
            <p className="text-muted-foreground text-xs sm:text-sm mb-4">
              {t('debts.emptyHint', { defaultValue: 'Track loans and repayments by creating your first debt' })}
            </p>
            <Button onClick={() => setNewDebtModalOpen(true)} size="sm" className="h-8 text-sm gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t('debts.newDebt', { defaultValue: 'New debt' })}
            </Button>
          </div>
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
                nextScheduledPayment={getNextScheduledPayment(debt.id)}
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
            <AlertDialogTitle className="text-sm sm:text-lg">{t('debts.deleteConfirmTitle', { defaultValue: 'Delete this debt?' })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs sm:text-sm space-y-3">
                {debtToDelete && (
                  <p>
                    <strong>{debtToDelete.description}</strong> sera définitivement supprimée.
                    Cette action est irréversible.
                  </p>
                )}
                {loadingImpact && (
                  <p className="text-muted-foreground">{t('common.analyzingLinkedData', { defaultValue: 'Analyzing linked data…' })}</p>
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
