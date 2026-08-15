import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { parseLocalDate } from '@/lib/dateUtils';
import { InstallmentPayment } from '@/hooks/useInstallmentPayments';
import { useFinancialData } from '@/hooks/useFinancialData';
import { Calendar, CreditCard, ArrowRight, Wallet, Tag, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ReimbursementDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: InstallmentPayment;
}


export const ReimbursementDetailModal = ({
  open,
  onOpenChange,
  installment,
}: ReimbursementDetailModalProps) => {
  const { formatCurrency } = useUserPreferences();
  const { accounts, categories } = useFinancialData();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const account = accounts.find(a => a.id === installment.account_id);
  const category = categories.find(c => c.id === installment.category_id);

  const amountPaid = installment.total_amount - installment.remaining_amount;
  const progress = installment.total_amount > 0
    ? Math.min(100, Math.round((amountPaid / installment.total_amount) * 1000) / 10)
    : 0;

  const remainingPayments = installment.installment_amount > 0
    ? Math.ceil(installment.remaining_amount / installment.installment_amount)
    : 0;

  const frequencyLabel = installment.frequency === 'weekly' ? 'Hebdomadaire'
    : installment.frequency === 'monthly' ? 'Mensuelle'
    : 'Trimestrielle';

  const handleNavigateToInstallments = () => {
    onOpenChange(false);
    navigate(`/installment-payments?highlight=${installment.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <div className="h-7 w-7 rounded-lg grid place-items-center bg-success/10 flex-shrink-0">
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-success" />
            </div>
            <span className="truncate">{installment.description}</span>
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={installment.is_active ? 'default' : 'secondary'} className="text-[10px] sm:text-xs">
              {installment.is_active ? t('savings.inProgress') : t('savings.completed')}
            </Badge>
            <Badge variant="outline" className="text-[10px] sm:text-xs">
              Remboursement
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3">
          {/* Progress */}
          <div className="rounded-xl bg-bg-subtle/60 border border-line p-3 sm:p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Progression</span>
              <span className="text-xs sm:text-sm font-semibold">{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-2 mb-3" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-bg-subtle border border-line p-2">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Total</p>
                <p className="text-[11px] sm:text-sm font-bold truncate">{formatCurrency(installment.total_amount)}</p>
              </div>
              <div className="rounded-xl bg-success/5 border border-success/10 p-2">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Reçu</p>
                <p className="text-[11px] sm:text-sm font-bold text-success truncate">{formatCurrency(amountPaid)}</p>
              </div>
              <div className="rounded-xl bg-warn-soft border border-warn/20 p-2">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Restant</p>
                <p className="text-[11px] sm:text-sm font-semibold font-mono tabular-nums text-warn truncate">{formatCurrency(installment.remaining_amount)}</p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="rounded-xl bg-bg-subtle/60 border border-line p-3 sm:p-4 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="w-3 h-3" />
                Échéance
              </span>
              <span className="text-xs sm:text-sm font-medium">{formatCurrency(installment.installment_amount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Fréquence
              </span>
              <span className="text-xs sm:text-sm font-medium">{frequencyLabel}</span>
            </div>
            {installment.is_active && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Prochain
                </span>
                <span className="text-xs sm:text-sm font-medium">
                  {format(parseLocalDate(installment.next_payment_date), 'dd MMMM yyyy', { locale: fr })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Début
              </span>
              <span className="text-xs sm:text-sm">
                {format(parseLocalDate(installment.start_date), 'dd MMMM yyyy', { locale: fr })}
              </span>
            </div>
            {account && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                  <Wallet className="w-3 h-3" />
                  Compte
                </span>
                <span className="text-xs sm:text-sm font-medium">{account.name}</span>
              </div>
            )}
            {category && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                  <Tag className="w-3 h-3" />
                  Catégorie
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                  <span className="text-xs sm:text-sm font-medium">{category.name}</span>
                </div>
              </div>
            )}
            {installment.is_active && remainingPayments > 0 && (
              <div className="flex justify-between items-center pt-1 border-t border-line">
                <span className="text-[10px] sm:text-xs text-muted-foreground">Échéances restantes</span>
                <span className="text-xs sm:text-sm font-semibold">{remainingPayments}</span>
              </div>
            )}
          </div>

          {/* Navigate button */}
          <Button
            onClick={handleNavigateToInstallments}
            className="w-full h-9 text-xs sm:text-sm gap-2"
            variant="outline"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Voir sur la page paiements échelonnés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
