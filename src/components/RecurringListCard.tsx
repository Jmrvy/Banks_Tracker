import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Repeat, Trash2, Pause, Play, Pencil, ChevronDown, Clock } from "lucide-react";
import { RecurringTransaction, Transaction } from "@/hooks/useFinancialData";
import { DebtPayment } from "@/hooks/useDebts";
import { differenceInDays, startOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";

export interface InstallmentInfo {
  ip: InstallmentPayment;
  paid: number;
  paidCount: number;
  totalCount: number;
  pct: number;
  isCompleted: boolean;
}

export interface DebtInfo {
  debt: {
    id: string;
    description: string;
    type: 'loan_given' | 'loan_received';
    total_amount: number;
    remaining_amount: number;
    payment_amount: number;
  };
  paid: number;
  paidCount: number;
  totalCount: number;
  pct: number;
}

const getRecurrenceLabel = (type: string) => {
  switch (type) {
    case 'weekly': return 'Hebdomadaire';
    case 'monthly': return 'Mensuelle';
    case 'quarterly': return 'Trimestrielle';
    case 'yearly': return 'Annuelle';
    default: return type;
  }
};

export { getRecurrenceLabel };

interface RecurringListCardProps {
  recurring: RecurringTransaction;
  isExpanded: boolean;
  onToggleExpand: () => void;
  installmentInfo: InstallmentInfo | null;
  debtInfo: DebtInfo | null;
  listDisplayAmount: number;
  hasOverdueDebtPayment: boolean;
  installmentPaymentHistory: Transaction[];
  debtPaymentHistory: DebtPayment[];
  formatCurrency: (amount: number) => string;
  onEdit: (transaction: RecurringTransaction) => void;
  onToggleActive: (id: string, currentStatus: boolean) => void;
  onDelete: (id: string, description: string) => void;
}

const RecurringListCard = React.memo(({
  recurring,
  isExpanded,
  onToggleExpand,
  installmentInfo,
  debtInfo,
  listDisplayAmount,
  hasOverdueDebtPayment,
  installmentPaymentHistory,
  debtPaymentHistory,
  formatCurrency,
  onEdit,
  onToggleActive,
  onDelete,
}: RecurringListCardProps) => {
  const nextDue = parseLocalDate(recurring.next_due_date);
  const today = startOfDay(new Date());
  const daysUntil = differenceInDays(nextDue, today);

  return (
    <Card
      key={recurring.id}
      className={`overflow-hidden border-border/50 ${recurring.is_active ? 'bg-card/80' : 'bg-card/50 opacity-70'}`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggleExpand}
      >
        {/* Type indicator + status */}
        <div className={`flex-shrink-0 w-11 sm:w-12 h-11 sm:h-12 rounded-xl flex flex-col items-center justify-center ${
          !recurring.is_active ? 'bg-muted/30' : recurring.type === 'income' ? 'bg-success/10' : 'bg-destructive/10'
        }`}>
          <Repeat className={`h-4 w-4 sm:h-5 sm:w-5 ${
            !recurring.is_active ? 'text-muted-foreground' : recurring.type === 'income' ? 'text-success' : 'text-destructive'
          }`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm sm:text-base font-semibold truncate ${!recurring.is_active ? 'text-muted-foreground' : ''}`}>
              {resolveNamePlaceholders(recurring.description, parseLocalDate(recurring.next_due_date))}
            </p>
          {!recurring.is_active && (() => {
            const isCompleted = installmentInfo?.isCompleted;
            return (
              <Badge variant={isCompleted ? "default" : "secondary"} className={`text-[9px] px-1.5 py-0 flex-shrink-0 ${isCompleted ? 'bg-success text-white' : ''}`}>
                {isCompleted ? 'Terminé' : 'Inactif'}
              </Badge>
            );
          })()}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] sm:text-xs text-muted-foreground">
              {recurring.is_active ? (
                (daysUntil < 0 || hasOverdueDebtPayment) ? 'En retard' :
                daysUntil === 0 ? "Aujourd'hui" :
                daysUntil === 1 ? 'Demain' :
                `Dans ${daysUntil} jours`
              ) : (
                getRecurrenceLabel(recurring.recurrence_type)
              )}
            </span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">
              · {getRecurrenceLabel(recurring.recurrence_type)}
            </span>
          </div>
          {installmentInfo && (
            <span className="text-[10px] sm:text-xs text-muted-foreground">
              {installmentInfo.paidCount} sur {installmentInfo.totalCount} payé · {installmentInfo.ip.payment_type === 'reimbursement' ? 'Remboursement' : 'Échelonné'}
            </span>
          )}
          {debtInfo && (
            <span className="text-[10px] sm:text-xs text-muted-foreground">
              {debtInfo.paidCount} sur {debtInfo.totalCount} payé · {debtInfo.debt.type === 'loan_received' ? 'Remboursement dette' : 'Remboursement prêt'}
            </span>
          )}
        </div>

        {/* Amount + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-sm sm:text-base font-bold ${
            !recurring.is_active ? 'text-muted-foreground' : recurring.type === 'income' ? 'text-success' : 'text-destructive'
          }`}>
            {formatCurrency(listDisplayAmount)}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border/50 p-3 sm:p-4 space-y-4 bg-muted/10">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Fréquence</span>
              <span className="font-medium text-xs sm:text-sm">{getRecurrenceLabel(recurring.recurrence_type)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Compte</span>
              <span className="font-medium text-xs sm:text-sm truncate max-w-[150px]">{recurring.account?.name}</span>
            </div>
            {recurring.category && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Catégorie</span>
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: recurring.category.color }} />
                  {recurring.category.name}
                </Badge>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Prochain paiement</span>
              <span className={`font-medium text-xs sm:text-sm ${
                recurring.is_active && daysUntil < 0 ? 'text-warning' : ''
              }`}>
                {nextDue.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Début</span>
              <span className="font-medium text-xs sm:text-sm">
                {parseLocalDate(recurring.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            {recurring.end_date && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Fin</span>
                <span className="font-medium text-xs sm:text-sm">
                  {parseLocalDate(recurring.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">Statut</span>
              {(() => {
                const isCompleted = installmentInfo?.isCompleted;
                return (
                  <Badge variant={recurring.is_active ? 'default' : isCompleted ? 'default' : 'secondary'} className={`text-xs ${isCompleted ? 'bg-success text-white' : ''}`}>
                    {recurring.is_active ? 'Actif' : isCompleted ? 'Terminé' : 'Inactif'}
                  </Badge>
                );
              })()}
            </div>
          </div>

          {/* Installment progress */}
          {installmentInfo && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm sm:text-base font-bold">{formatCurrency(installmentInfo.paid)}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm sm:text-base font-bold">{formatCurrency(installmentInfo.ip.remaining_amount)}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Restant</p>
                  </div>
                </div>
                <Progress value={installmentInfo.pct} className="h-2" />
              </div>

              {/* Payment timeline */}
              <div className="space-y-1">
                {installmentPaymentHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-2.5 py-1.5">
                    <div className="h-4 w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0">
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-xs sm:text-sm flex-1">
                      {parseLocalDate(tx.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </span>
                    <span className="text-xs sm:text-sm font-medium">{formatCurrency(tx.amount)}</span>
                  </div>
                ))}
                {/* Next pending */}
                {recurring.is_active && installmentInfo.ip.remaining_amount > 0 && (
                  <div className="flex items-center gap-2.5 py-1.5">
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                    <span className="text-xs sm:text-sm flex-1">
                      {nextDue.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </span>
                    <span className="text-xs sm:text-sm font-medium">
                      {formatCurrency(installmentInfo.ip.installment_amount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Debt progress */}
          {debtInfo && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm sm:text-base font-bold">{formatCurrency(debtInfo.paid)}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm sm:text-base font-bold">{formatCurrency(debtInfo.debt.remaining_amount)}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Restant</p>
                  </div>
                </div>
                <Progress value={debtInfo.pct} className="h-2" />
              </div>

              {/* Debt payment timeline */}
              <div className="space-y-1">
                {debtPaymentHistory.map((dp) => (
                  <div key={dp.id} className="flex items-center gap-2.5 py-1.5">
                    <div className="h-4 w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0">
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-xs sm:text-sm flex-1">
                      {parseLocalDate(dp.payment_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </span>
                    <span className="text-xs sm:text-sm font-medium">{formatCurrency(dp.amount)}</span>
                  </div>
                ))}
                {/* Next pending */}
                {recurring.is_active && debtInfo.debt.remaining_amount > 0 && (
                  <div className="flex items-center gap-2.5 py-1.5">
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                    <span className="text-xs sm:text-sm flex-1">
                      {nextDue.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </span>
                    <span className="text-xs sm:text-sm font-medium">
                      {formatCurrency(listDisplayAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-border/50">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
              onClick={() => onEdit(recurring)}>
              <Pencil className="h-3.5 w-3.5" /> Modifier
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
              onClick={() => onToggleActive(recurring.id, recurring.is_active)}>
              {recurring.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {recurring.is_active ? 'Désactiver' : 'Activer'}
            </Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs gap-1.5 px-3"
              onClick={() => onDelete(recurring.id, recurring.description)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
});

export default RecurringListCard;
