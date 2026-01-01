import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Calendar, CreditCard, Tag, FileText, RotateCcw, TrendingUp } from "lucide-react";
import { type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface TransactionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function TransactionDetailModal({ open, onOpenChange, transaction }: TransactionDetailModalProps) {
  const { formatCurrency } = useUserPreferences();

  if (!transaction) return null;

  const getTypeIcon = () => {
    switch (transaction.type) {
      case 'income':
        return <ArrowDownRight className="w-6 h-6 text-green-600" />;
      case 'expense':
        return <ArrowUpRight className="w-6 h-6 text-red-600" />;
      case 'transfer':
        return <ArrowRightLeft className="w-6 h-6 text-blue-600" />;
    }
  };

  const getTypeLabel = () => {
    switch (transaction.type) {
      case 'income':
        return 'Revenu';
      case 'expense':
        return 'Dépense';
      case 'transfer':
        return 'Virement';
    }
  };

  const getTypeColor = () => {
    switch (transaction.type) {
      case 'income':
        return 'text-green-600';
      case 'expense':
        return 'text-red-600';
      case 'transfer':
        return 'text-blue-600';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTypeIcon()}
            Détails de la transaction
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Description and amount */}
          <div className="text-center py-4 bg-muted/30 rounded-lg">
            <p className="text-lg font-semibold mb-2">{transaction.description}</p>
            <p className={`text-3xl font-bold ${getTypeColor()}`}>
              {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '↔'}
              {formatCurrency(Math.abs(transaction.amount))}
            </p>
            <Badge variant="secondary" className="mt-2">
              {getTypeLabel()}
            </Badge>
          </div>

          <Separator />

          {/* Details grid */}
          <div className="space-y-3">
            {/* Dates */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Date comptable</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(transaction.transaction_date), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
                {transaction.value_date && transaction.value_date !== transaction.transaction_date && (
                  <>
                    <p className="text-sm font-medium mt-2">Date de valeur</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(transaction.value_date), "EEEE d MMMM yyyy", { locale: fr })}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Account */}
            <div className="flex items-start gap-3">
              <CreditCard className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Compte</p>
                <p className="text-sm text-muted-foreground">
                  {transaction.account?.name || 'Non défini'}
                </p>
                {transaction.type === 'transfer' && transaction.transfer_to_account && (
                  <>
                    <p className="text-sm font-medium mt-2">Vers</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.transfer_to_account.name}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Category */}
            {transaction.category && (
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Catégorie</p>
                  <Badge 
                    variant="secondary"
                    style={{ backgroundColor: transaction.category.color, color: 'white' }}
                  >
                    {transaction.category.name}
                  </Badge>
                </div>
              </div>
            )}

            {/* Transfer fee */}
            {transaction.type === 'transfer' && transaction.transfer_fee && transaction.transfer_fee > 0 && (
              <div className="flex items-start gap-3">
                <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Frais de virement</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(transaction.transfer_fee)}
                  </p>
                </div>
              </div>
            )}

            {/* Refund info */}
            {transaction.refund_of_transaction_id && (
              <div className="flex items-start gap-3">
                <RotateCcw className="w-4 h-4 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-600">Remboursement</p>
                  <p className="text-sm text-muted-foreground">
                    Cette transaction est un remboursement
                  </p>
                </div>
              </div>
            )}

            {/* Refunded amount for expenses */}
            {transaction.type === 'expense' && (transaction.refunded_amount || 0) > 0 && (
              <div className="flex items-start gap-3">
                <RotateCcw className="w-4 h-4 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Montant remboursé</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(transaction.refunded_amount || 0)} / {formatCurrency(transaction.amount)}
                    {transaction.refunded_amount === transaction.amount && (
                      <span className="ml-2 text-green-600">(Complet)</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Include in stats */}
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Statistiques</p>
                <p className="text-sm text-muted-foreground">
                  {transaction.include_in_stats ? 'Incluse dans les statistiques' : 'Exclue des statistiques'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
