import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Calendar, CreditCard, Tag, FileText, RotateCcw, TrendingUp, History, Receipt } from "lucide-react";
import { type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface TransactionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

interface RefundTransaction {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
}

interface OriginalTransaction {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
}

export function TransactionDetailModal({ open, onOpenChange, transaction }: TransactionDetailModalProps) {
  const { formatCurrency } = useUserPreferences();
  const [refunds, setRefunds] = useState<RefundTransaction[]>([]);
  const [originalTransaction, setOriginalTransaction] = useState<OriginalTransaction | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch related refunds or original transaction
  useEffect(() => {
    if (!open || !transaction) {
      setRefunds([]);
      setOriginalTransaction(null);
      return;
    }

    const fetchRelatedData = async () => {
      setLoading(true);
      
      // If this is an expense with refunds, fetch the refund transactions
      if (transaction.type === 'expense' && (transaction.refunded_amount || 0) > 0) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, description, amount, transaction_date')
          .eq('refund_of_transaction_id', transaction.id)
          .order('transaction_date', { ascending: true });
        
        if (!error && data) {
          setRefunds(data);
        }
      }
      
      // If this is a refund, fetch the original transaction
      if (transaction.refund_of_transaction_id) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, description, amount, transaction_date')
          .eq('id', transaction.refund_of_transaction_id)
          .maybeSingle();
        
        if (!error && data) {
          setOriginalTransaction(data);
        }
      }
      
      setLoading(false);
    };

    fetchRelatedData();
  }, [open, transaction]);

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
        return transaction.refund_of_transaction_id ? 'Remboursement' : 'Revenu';
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

  const remainingToRefund = transaction.type === 'expense' 
    ? transaction.amount - (transaction.refunded_amount || 0) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant="secondary">
                {getTypeLabel()}
              </Badge>
              {transaction.refund_of_transaction_id && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Remboursement
                </Badge>
              )}
              {transaction.type === 'expense' && (transaction.refunded_amount || 0) > 0 && (
                <Badge 
                  variant="outline" 
                  className={
                    transaction.refunded_amount === transaction.amount 
                      ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                  }
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {transaction.refunded_amount === transaction.amount ? 'Remboursé' : 'Partiel'}
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Original transaction info (if this is a refund) */}
          {transaction.refund_of_transaction_id && originalTransaction && (
            <>
              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-600">Transaction originale remboursée</p>
                </div>
                <div className="ml-6 space-y-1">
                  <p className="text-sm font-medium">{originalTransaction.description}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{format(new Date(originalTransaction.transaction_date), "d MMM yyyy", { locale: fr })}</span>
                    <span className="font-medium text-red-600">-{formatCurrency(originalTransaction.amount)}</span>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Refund summary for expenses */}
          {transaction.type === 'expense' && (transaction.refunded_amount || 0) > 0 && (
            <>
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-600">Historique des remboursements</p>
                </div>
                
                {/* Summary bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Remboursé : {formatCurrency(transaction.refunded_amount || 0)}</span>
                    <span>Reste : {formatCurrency(remainingToRefund)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        transaction.refunded_amount === transaction.amount 
                          ? 'bg-green-500' 
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${((transaction.refunded_amount || 0) / transaction.amount) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Refund list */}
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-2">Chargement...</p>
                ) : refunds.length > 0 ? (
                  <div className="space-y-2">
                    {refunds.map((refund, index) => (
                      <div 
                        key={refund.id} 
                        className="flex items-center justify-between p-2 bg-background rounded border"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">#{index + 1}</span>
                          <div>
                            <p className="text-sm font-medium">{refund.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(refund.transaction_date), "d MMM yyyy", { locale: fr })}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-medium text-green-600">
                          +{formatCurrency(refund.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">Aucun détail disponible</p>
                )}
              </div>
              <Separator />
            </>
          )}

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
