import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Wallet,
  ChevronDown,
  Clock,
  CheckCircle2,
  Pencil,
  Trash2,
  History,
} from 'lucide-react';
import { format, differenceInDays, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';
import { Debt, DebtPayment, ScheduledDebtPayment } from '@/hooks/useDebts';

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

interface DebtCardProps {
  debt: Debt;
  isExpanded: boolean;
  onToggleExpand: () => void;
  payments: DebtPayment[];
  nextScheduledAmount: number | null;
  nextScheduledPayment: ScheduledDebtPayment | null;
  formatCurrency: (amount: number) => string;
  onAddPayment: (debt: Debt) => void;
  onEdit: (debt: Debt) => void;
  onViewDetails: (debt: Debt) => void;
  onDelete: (debt: Debt) => void;
}

const DebtCard = React.memo(({
  debt,
  isExpanded,
  onToggleExpand,
  payments,
  nextScheduledAmount,
  nextScheduledPayment,
  formatCurrency,
  onAddPayment,
  onEdit,
  onViewDetails,
  onDelete,
}: DebtCardProps) => {
  const { t } = useTranslation();
  const isActive = debt.status === 'active';
  const progress = debt.total_amount > 0
    ? Math.min(100, Math.round(((debt.total_amount - debt.remaining_amount) / debt.total_amount) * 1000) / 10)
    : 0;
  const paid = debt.total_amount - debt.remaining_amount;

  let daysInfo: string | null = null;
  if (debt.end_date && isActive) {
    const endDate = parseLocalDate(debt.end_date);
    const today = startOfDay(new Date());
    const days = differenceInDays(endDate, today);
    if (days < 0) daysInfo = 'Échu';
    else if (days === 0) daysInfo = t('common.dueToday');
    else if (days === 1) daysInfo = t('common.tomorrow');
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
        onClick={onToggleExpand}
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
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Échéance</span>
                  <span className="font-medium text-[11px] sm:text-sm">{formatCurrency(nextScheduledAmount ?? debt.payment_amount)}</span>
                </div>
                {nextScheduledPayment && (nextScheduledPayment.principal_amount > 0 || nextScheduledPayment.interest_amount > 0 || (nextScheduledPayment.insurance_amount || 0) > 0) && (
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground text-right mt-0.5">
                    Capital: {formatCurrency(nextScheduledPayment.principal_amount)} · Intérêts: {formatCurrency(nextScheduledPayment.interest_amount)}
                    {(nextScheduledPayment.insurance_amount || 0) > 0 && ` · Assurance: ${formatCurrency(nextScheduledPayment.insurance_amount)}`}
                  </p>
                )}
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
          {payments.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1.5">Historique</p>
              {payments.slice(-5).map((p) => {
                const hasBreakdown = p.principal_amount > 0 || p.interest_amount > 0 || (p.insurance_amount || 0) > 0;
                return (
                  <div key={p.id} className="flex items-start gap-2 py-1">
                    <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-success-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] sm:text-sm">
                          {format(parseLocalDate(p.payment_date), 'd MMM', { locale: fr })}
                        </span>
                        <span className="text-[11px] sm:text-sm font-medium whitespace-nowrap">{formatCurrency(p.amount)}</span>
                      </div>
                      {hasBreakdown && (
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                          Capital: {formatCurrency(p.principal_amount)} · Intérêts: {formatCurrency(p.interest_amount)}
                          {(p.insurance_amount || 0) > 0 && ` · Assurance: ${formatCurrency(p.insurance_amount)}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {payments.length > 5 && (
                <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center">
                  +{payments.length - 5} autre{payments.length - 5 > 1 ? 's' : ''}
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
              onClick={() => onAddPayment(debt)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Enregistrer un paiement
            </Button>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-2 border-t border-border/50">
            <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
              onClick={() => onViewDetails(debt)}>
              <History className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">Détails</span>
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
              onClick={() => onEdit(debt)}>
              <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">Modifier</span>
            </Button>
            <Button size="sm" variant="destructive" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
              onClick={() => onDelete(debt)}>
              <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
});

export default DebtCard;
