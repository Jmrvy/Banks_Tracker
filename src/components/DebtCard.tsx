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
      case 'credit': return 'Crédit';
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
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{debt.description}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{getTypeLabel(debt.type)}</Badge>
              <Badge className={getStatusColor(debt.status)}>
                {getStatusLabel(debt.status)}
              </Badge>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(debt)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(debt.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-medium">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Montant total
            </div>
            <p className="text-lg font-semibold">{formatCurrency(debt.total_amount)}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Restant
            </div>
            <p className="text-lg font-semibold text-primary">{formatCurrency(debt.remaining_amount)}</p>
          </div>
        </div>

        {debt.interest_rate > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Taux d'intérêt</span>
            <span className="font-medium">{debt.interest_rate}%</span>
          </div>
        )}

        {debt.payment_frequency && debt.payment_amount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Paiement {getFrequencyLabel(debt.payment_frequency)?.toLowerCase()}</span>
            <span className="font-medium">{formatCurrency(debt.payment_amount)}</span>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            <span>Début: {format(new Date(debt.start_date), 'dd/MM/yyyy', { locale: fr })}</span>
          </div>
          {debt.end_date && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
              <span>Fin prévue: {format(new Date(debt.end_date), 'dd/MM/yyyy', { locale: fr })}</span>
            </div>
          )}
        </div>

        {debt.contact_name && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{debt.contact_name}</span>
            {debt.contact_info && (
              <span className="text-muted-foreground">({debt.contact_info})</span>
            )}
          </div>
        )}

        {debt.notes && (
          <p className="text-sm text-muted-foreground border-t pt-3">{debt.notes}</p>
        )}

        {debt.status === 'active' && (
          <Button 
            onClick={() => onAddPayment(debt)} 
            className="w-full"
          >
            Ajouter un paiement
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
