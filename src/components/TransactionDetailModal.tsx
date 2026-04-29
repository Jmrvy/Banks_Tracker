import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Calendar, CreditCard, Tag, FileText, RotateCcw, TrendingUp, History, Receipt, Pencil, Trash2 } from "lucide-react";
import { type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

interface TransactionDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  onRefund?: (transaction: Transaction) => void;
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

export function TransactionDetailModal({ open, onOpenChange, transaction, onEdit, onDelete, onRefund }: TransactionDetailModalProps) {
  const { formatCurrency } = useUserPreferences();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
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
        return transaction.refund_of_transaction_id ? t('transactions.refund') : t('transactions.income');
      case 'expense':
        return t('transactions.expense');
      case 'transfer':
        return t('transactions.transfer');
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
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            {getTypeIcon()}
            Détails de la transaction
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          {/* Description and amount */}
          <div className="text-center py-4 bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-2xl">
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
              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-600">Transaction originale remboursée</p>
                </div>
                <div className="ml-6 space-y-1">
                  <p className="text-sm font-medium">{originalTransaction.description}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{format(new Date(originalTransaction.transaction_date), "d MMM yyyy", { locale: dateLocale })}</span>
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
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
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
                  <div className="w-full bg-white/[0.06] rounded-full h-2">
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
                        className="glass-row flex items-center justify-between p-2 border border-white/[0.04] rounded-xl"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">#{index + 1}</span>
                          <div>
                            <p className="text-sm font-medium">{refund.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(refund.transaction_date), "d MMM yyyy", { locale: dateLocale })}
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
                  {format(new Date(transaction.transaction_date), "EEEE d MMMM yyyy", { locale: dateLocale })}
                </p>
                {transaction.value_date && transaction.value_date !== transaction.transaction_date && (
                  <>
                    <p className="text-sm font-medium mt-2">Date de valeur</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(transaction.value_date), "EEEE d MMMM yyyy", { locale: dateLocale })}
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

          {/* Action buttons */}
          {(onEdit || onDelete || onRefund) && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2 pt-1">
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => { onEdit(transaction); onOpenChange(false); }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Modifier
                  </Button>
                )}
                {onRefund && transaction.type === 'expense' && remainingToRefund > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-green-600 border-green-500/30 hover:bg-green-500/10"
                    onClick={() => { onRefund(transaction); onOpenChange(false); }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Rembourser
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => { onDelete(transaction); onOpenChange(false); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Supprimer
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
