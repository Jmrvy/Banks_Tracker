import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Debt } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { CalendarIcon, DollarSign, TrendingUp, User, Trash2, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DebtCardProps {
  debt: Debt;
  onAddPayment: (debt: Debt) => void;
  onEdit: (debt: Debt) => void;
  onDelete: (id: string) => void;
}

export const DebtCard = ({ debt, onAddPayment, onEdit, onDelete }: DebtCardProps) => {
  const { formatCurrency } = useUserPreferences();

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'loan_given': return 'Prêt accordé';
      case 'loan_received': return 'Prêt contracté';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-primary';
      case 'completed': return 'bg-success';
      case 'defaulted': return 'bg-destructive';
      default: return 'bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Actif';
      case 'completed': return 'Terminé';
      case 'defaulted': return 'Défaut';
      default: return status;
    }
  };

  const progress = ((debt.total_amount - debt.remaining_amount) / debt.total_amount) * 100;

  const getFrequencyLabel = (freq: string | null) => {
    if (!freq) return null;
    switch (freq) {
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trimestriel';
      case 'semi_annual': return 'Semestriel';
      case 'annual': return 'Annuel';
      default: return freq;
    }
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 flex-1 min-w-0">
            <CardTitle className="text-sm sm:text-lg truncate">{debt.description}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2">{getTypeLabel(debt.type)}</Badge>
              <Badge className={`${getStatusColor(debt.status)} text-[10px] sm:text-xs px-1.5 sm:px-2`}>
                {getStatusLabel(debt.status)}
              </Badge>
            </div>
          </div>
          <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(debt)}
              className="h-7 w-7 sm:h-8 sm:w-8"
            >
              <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(debt.id)}
              className="text-destructive hover:text-destructive h-7 w-7 sm:h-8 sm:w-8"
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-medium">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-2 sm:h-2.5" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm text-muted-foreground">
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
              Montant total
            </div>
            <p className="text-sm sm:text-lg font-semibold">{formatCurrency(debt.total_amount)}</p>
          </div>

          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm text-muted-foreground">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              Restant
            </div>
            <p className="text-sm sm:text-lg font-semibold text-primary">{formatCurrency(debt.remaining_amount)}</p>
          </div>
        </div>

        {debt.interest_rate > 0 && (
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Taux d'intérêt</span>
            <span className="font-medium">{debt.interest_rate}%</span>
          </div>
        )}

        {debt.payment_frequency && debt.payment_amount > 0 && (
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Paiement {getFrequencyLabel(debt.payment_frequency)?.toLowerCase()}</span>
            <span className="font-medium">{formatCurrency(debt.payment_amount)}</span>
          </div>
        )}

        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
            <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Début: {format(new Date(debt.start_date), 'dd/MM/yyyy', { locale: fr })}</span>
          </div>
          {debt.end_date && (
            <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
              <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Fin: {format(new Date(debt.end_date), 'dd/MM/yyyy', { locale: fr })}</span>
            </div>
          )}
        </div>

        {debt.contact_name && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">{debt.contact_name}</span>
            {debt.contact_info && (
              <span className="text-muted-foreground truncate">({debt.contact_info})</span>
            )}
          </div>
        )}

        {debt.notes && (
          <p className="text-xs sm:text-sm text-muted-foreground border-t pt-2 sm:pt-3 line-clamp-2">{debt.notes}</p>
        )}

        {debt.status === 'active' && (
          <Button 
            onClick={() => onAddPayment(debt)} 
            className="w-full h-8 sm:h-10 text-xs sm:text-sm"
          >
            Ajouter un paiement
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
