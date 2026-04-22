import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
  ChevronDown,
  Clock,
  CheckCircle2,
  Pencil,
  Trash2,
  History,
  DollarSign,
  User,
  Percent,
  Calendar,
} from 'lucide-react';
import { NewDebtModal } from '@/components/NewDebtModal';
import { EditDebtModal } from '@/components/EditDebtModal';
import { AddPaymentModal } from '@/components/AddPaymentModal';
import { DebtDetailsModal } from '@/components/DebtDetailsModal';
import { useDebts, Debt } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';


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

  // Keep selectedDebt in sync with refreshed debts
  useEffect(() => {
    if (selectedDebt) {
      const updated = debts.find(d => d.id === selectedDebt.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedDebt)) {
        setSelectedDebt(updated);
      }
    }
  }, [debts]);

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

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'loan_given': return 'Accordé';
      case 'loan_received': return 'Contracté';
      default: return type;
    }
  };

  const getFrequencyLabel = (freq: string | null) => {
    if (!freq) return null;
    switch (freq) {
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trimestriel';
      case 'semi_annual': return 'Semestriel';
      case 'annual': return 'Annuel';
      case 'weekly': return 'Hebdomadaire';
      default: return freq;
    }
  };

  const getDebtPayments = (debtId: string) => {
    return payments
      .filter(p => p.debt_id === debtId)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  };

  const renderDebtCard = (debt: Debt) => {
    const isActive = debt.status === 'active';
    const isExpanded = expandedId === debt.id;
    const progress = debt.total_amount > 0
      ? Math.min(100, Math.round(((debt.total_amount - debt.remaining_amount) / debt.total_amount) * 1000) / 10)
      : 0;
    const paid = debt.total_amount - debt.remaining_amount;
    const debtPayments = getDebtPayments(debt.id);

    // Days until end date
    let daysInfo: string | null = null;
    if (debt.end_date && isActive) {
      const endDate = parseLocalDate(debt.end_date);
      const today = startOfDay(new Date());
      const days = differenceInDays(endDate, today);
      if (days < 0) daysInfo = 'Échu';
      else if (days === 0) daysInfo = "Échéance auj.";
      else if (days === 1) daysInfo = 'Demain';
      else daysInfo = `${days}j restants`;
    }

    return (
      <Card
        key={debt.id}
        className={`overflow-hidden border-border/50 transition-all duration-500 ${isActive ? 'bg-card/80' : 'bg-card/50 opacity-70'}`}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : debt.id)}
        >
          {/* Type indicator */}
          <div className={`flex-shrink-0 w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex flex-col items-center justify-center ${
            !isActive ? 'bg-muted/30' : debt.type === 'loan_given' ? 'bg-success/10' : 'bg-destructive/10'
          }`}>
            <Wallet className={`h-4 w-4 sm:h-5 sm:w-5 ${
              !isActive ? 'text-muted-foreground' : debt.type === 'loan_given' ? 'text-success' : 'text-destructive'
            }`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm sm:text-base font-semibold truncate ${!isActive ? 'text-muted-foreground' : ''}`}>
              {debt.description}
            </p>
            <div className="flex items-center gap-1 mt-0.5 truncate">
              {isActive ? (
                <>
                  <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  {daysInfo && (
                    <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                      {daysInfo}
                    </span>
                  )}
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    · {getTypeLabel(debt.type)}
                  </span>
                  {debt.payment_frequency && (
                    <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                      · {getFrequencyLabel(debt.payment_frequency)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    {debt.status === 'completed' ? 'Terminé' : 'Défaut'}
                  </span>
                </>
              )}
            </div>
            {debt.contact_name && (
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                {debt.contact_name}
              </p>
            )}
          </div>

          {/* Amount + chevron */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="text-right">
              <span className={`text-xs sm:text-base font-bold whitespace-nowrap ${
                !isActive ? 'text-muted-foreground' : debt.type === 'loan_given' ? 'text-success' : 'text-destructive'
              }`}>
                {formatCurrency(debt.remaining_amount)}
              </span>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">restant</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-border/50 p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/10">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs sm:text-base font-bold">{formatCurrency(paid)}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Payé</p>
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-base font-bold">{formatCurrency(debt.remaining_amount)}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Restant</p>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Details */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Total</span>
                <span className="font-bold text-[11px] sm:text-sm">{formatCurrency(debt.total_amount)}</span>
              </div>
              {debt.interest_rate > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Taux d'intérêt</span>
                  <span className="font-medium text-[11px] sm:text-sm">{debt.interest_rate}%</span>
                </div>
              )}
              {debt.payment_frequency && debt.payment_amount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Échéance</span>
                  <span className="font-medium text-[11px] sm:text-sm">{formatCurrency(getNextScheduledAmount(debt.id) ?? debt.payment_amount)}</span>
                </div>
              )}
              {debt.payment_frequency && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Fréquence</span>
                  <span className="font-medium text-[11px] sm:text-sm">{getFrequencyLabel(debt.payment_frequency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Début</span>
                <span className="font-medium text-[11px] sm:text-sm">
                  {format(parseLocalDate(debt.start_date), 'dd MMM yyyy', { locale: fr })}
                </span>
              </div>
              {debt.end_date && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Fin</span>
                  <span className="font-medium text-[11px] sm:text-sm">
                    {format(parseLocalDate(debt.end_date), 'dd MMM yyyy', { locale: fr })}
                  </span>
                </div>
              )}
              {debt.contact_name && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Contact</span>
                  <span className="font-medium text-[11px] sm:text-sm truncate ml-2">
                    {debt.contact_name}
                    {debt.contact_info && <span className="text-muted-foreground ml-1">({debt.contact_info})</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Type</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] sm:text-xs ${debt.type === 'loan_given' ? 'border-success text-success' : ''}`}
                >
                  {getTypeLabel(debt.type)}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Statut</span>
                <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px] sm:text-xs">
                  {isActive ? 'Actif' : debt.status === 'completed' ? 'Terminé' : 'Défaut'}
                </Badge>
              </div>
            </div>

            {/* Payment timeline */}
            {debtPayments.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1.5">Historique</p>
                {debtPayments.slice(-5).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0">
                      <svg className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[11px] sm:text-sm flex-1">
                      {format(parseLocalDate(p.payment_date), 'd MMM', { locale: fr })}
                    </span>
                    <span className="text-[11px] sm:text-sm font-medium whitespace-nowrap">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
                {debtPayments.length > 5 && (
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center">
                    +{debtPayments.length - 5} autre{debtPayments.length - 5 > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            {debt.notes && (
              <p className="text-[10px] sm:text-xs text-muted-foreground border-t border-border/50 pt-2 line-clamp-2">
                {debt.notes}
              </p>
            )}

            {/* Record payment button */}
            {isActive && (
              <Button
                size="sm"
                className="w-full h-8 sm:h-9 text-[11px] sm:text-sm gap-1.5"
                onClick={() => handleAddPayment(debt)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Enregistrer un paiement
              </Button>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-2 border-t border-border/50">
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleViewDetails(debt)}>
                <History className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Détails</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleEditDebt(debt)}>
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Modifier</span>
              </Button>
              <Button size="sm" variant="destructive" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleDeleteClick(debt)}>
                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Supprimer</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

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
            {filteredDebts.map(renderDebtCard)}
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
