import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Repeat, Trash2, Pause, Play, Pencil, ChevronDown, Lock, ArrowRight, CreditCard, Scale } from "lucide-react";
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
  /** Open the debt detail modal when a debt-linked card's CTA is clicked. */
  onOpenDebt?: (debtId: string) => void;
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
  onOpenDebt,
}: RecurringListCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nextDue = parseLocalDate(recurring.next_due_date);
  const today = startOfDay(new Date());
  const daysUntil = differenceInDays(nextDue, today);
  const isOverdue = recurring.is_active && (daysUntil < 0 || hasOverdueDebtPayment);

  // Plan-linked rows are managed by their parent (installment plan or
  // debt). The Recurring page exposes a read-only view + a single CTA
  // routing to the owner, never inline edit/delete/toggle actions.
  const isPlanLinked = !!installmentInfo || !!debtInfo;
  const linkLabel = installmentInfo
    ? 'Plan d’échelonnement'
    : debtInfo
    ? (debtInfo.debt.type === 'loan_received' ? 'Dette' : 'Prêt')
    : '';
  const LinkIcon = installmentInfo ? CreditCard : Scale;

  return (
    <div key={recurring.id} className={cn(!recurring.is_active && "opacity-50")}>
      {/* Ledger row — the design's 34px / 1fr / 90px / 96px / auto grid,
          collapsing to glyph / name / amount below the wide breakpoint. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="ft-list-row cursor-pointer md:grid-cols-[34px_1fr_90px_96px_auto]"
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {/* Square glyph — flips to the negative token when overdue. */}
        <div
          className="ft-glyph sq"
          style={isOverdue ? { borderColor: 'hsl(var(--neg))', color: 'hsl(var(--neg))' } : undefined}
        >
          <Repeat className="h-4 w-4" />
        </div>

        {/* Name + context */}
        <div className="min-w-0">
          <div className="flex items-center gap-[7px] min-w-0">
            <span className="ft-row-title truncate">
              {resolveNamePlaceholders(recurring.description, parseLocalDate(recurring.next_due_date))}
            </span>
            {isOverdue && (
              <span className="ft-tag neg flex-shrink-0">
                {t('recurring.late', { defaultValue: 'Overdue' })}
              </span>
            )}
            {isPlanLinked && (
              <span
                className="ft-tag acc flex-shrink-0"
                title={installmentInfo
                  ? t('recurring.managedByPlan', { defaultValue: 'Managed by an installment plan' })
                  : t('recurring.managedByDebt', { defaultValue: 'Managed by a debt or loan' })}
              >
                <Lock className="h-2.5 w-2.5" />
                {linkLabel}
              </span>
            )}
            {!recurring.is_active && installmentInfo?.isCompleted && (
              <span className="ft-tag pos flex-shrink-0">
                {t('common.completed', { defaultValue: 'Completed' })}
              </span>
            )}
          </div>
          <div className="ft-row-sub truncate">
            {installmentInfo
              ? t('recurring.planProgressSub', {
                  defaultValue: '{{done}} of {{total}} paid',
                  done: installmentInfo.paidCount,
                  total: installmentInfo.totalCount,
                })
              : debtInfo
              ? t('recurring.planProgressSub', {
                  defaultValue: '{{done}} of {{total}} paid',
                  done: debtInfo.paidCount,
                  total: debtInfo.totalCount,
                })
              : recurring.category?.name ?? recurring.account?.name ?? ''}
            {recurring.account?.name && (installmentInfo || debtInfo || recurring.category?.name)
              ? ` · ${recurring.account.name}`
              : ''}
          </div>
          {/* Below the wide breakpoint the two fixed columns fold into the
              sub line so nothing is lost on a phone. */}
          <div className="ft-row-sub md:hidden">
            {getRecurrenceLabel(recurring.recurrence_type)}
            {' · '}
            {recurring.is_active
              ? nextDue.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
              : t('recurring.paused', { defaultValue: 'Paused' })}
          </div>
        </div>

        {/* Frequency column */}
        <span className="hidden md:block text-[11.5px] text-fg-dim truncate">
          {getRecurrenceLabel(recurring.recurrence_type)}
        </span>

        {/* Next-due column */}
        <span
          className={cn(
            "hidden md:block text-[11.5px] truncate",
            isOverdue ? "text-neg" : "text-fg-dim",
          )}
        >
          {recurring.is_active
            ? nextDue.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
            : t('recurring.paused', { defaultValue: 'Paused' })}
        </span>

        {/* Amount, inline on/off switch, chevron */}
        <div className="flex items-center gap-2.5 justify-end">
          <span className={cn(
            "ft-row-amt min-w-[82px]",
            !recurring.is_active ? "text-muted-foreground" : recurring.type === 'income' ? "text-pos" : "",
          )}>
            {formatCurrency(listDisplayAmount)}
          </span>
          {!isPlanLinked && (
            <span
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex-shrink-0"
            >
              <Switch
                checked={recurring.is_active}
                onCheckedChange={() => onToggleActive(recurring.id, recurring.is_active)}
                className="scale-[0.8] data-[state=unchecked]:bg-line-strong"
                aria-label={recurring.is_active
                  ? t('recurring.deactivate', { defaultValue: 'Deactivate' })
                  : t('recurring.activate', { defaultValue: 'Activate' })}
              />
            </span>
          )}
          <ChevronDown className={cn(
            "h-4 w-4 text-fg-dim transition-transform flex-shrink-0",
            isExpanded && "rotate-180",
          )} />
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-line-soft px-[22px] py-4 space-y-4 bg-bg-subtle">
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
                  <Badge variant={recurring.is_active ? 'default' : isCompleted ? 'default' : 'secondary'} className={`text-xs ${isCompleted ? 'bg-success text-success-foreground' : ''}`}>
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
                    <p className="font-mono text-base font-medium tracking-[-0.02em]">{formatCurrency(installmentInfo.paid)}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base font-medium tracking-[-0.02em]">{formatCurrency(installmentInfo.ip.remaining_amount)}</p>
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
                      <svg className="h-2.5 w-2.5 text-success-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                    <p className="font-mono text-base font-medium tracking-[-0.02em]">{formatCurrency(debtInfo.paid)}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base font-medium tracking-[-0.02em]">{formatCurrency(debtInfo.debt.remaining_amount)}</p>
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
                      <svg className="h-2.5 w-2.5 text-success-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
          {isPlanLinked ? (
            <div className="pt-2 border-t border-line-soft space-y-2">
              <p className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5">
                <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>
                  {installmentInfo
                    ? "Cette récurrente est gérée par un plan d'échelonnement. Modifiez-la depuis la fiche du plan."
                    : "Cette récurrente est gérée par une dette/prêt. Modifiez-la depuis la fiche correspondante."}
                </span>
              </p>
              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                onClick={() => {
                  if (installmentInfo) {
                    navigate(`/installment-payments/${installmentInfo.ip.id}`);
                  } else if (debtInfo && onOpenDebt) {
                    onOpenDebt(debtInfo.debt.id);
                  }
                }}
              >
                <LinkIcon className="h-3.5 w-3.5" />
                {installmentInfo ? 'Ouvrir le plan' : 'Ouvrir la dette'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pt-2 border-t border-line-soft">
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
          )}
        </div>
      )}
    </div>
  );
});

export default RecurringListCard;
