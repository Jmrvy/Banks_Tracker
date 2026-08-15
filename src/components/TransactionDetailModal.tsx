import { useEffect, useState } from "react";
import {
  DetailSheet,
  DetailSheetHeader,
  DetailSheetTitle,
  DetailSheetBody,
  DetailSheetFooter,
} from "@/components/ui/detail-sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, Calendar, CreditCard, Tag, FileText, RotateCcw, TrendingUp, History, Receipt, Pencil, Trash2, Link2, Link2Off } from "lucide-react";
import { type Transaction, useFinancialData } from "@/hooks/useFinancialData";
import { LinkRefundModal } from "@/components/LinkRefundModal";
import { useLinkRefund } from "@/hooks/useLinkRefund";
import { useLinkRepayment } from "@/hooks/useLinkRepayment";
import { describeError } from "@/lib/errorMessage";
import { useToast } from "@/hooks/use-toast";
import { LinkRepaymentModal } from "@/components/LinkRepaymentModal";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
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
  const { isPrivacyMode } = usePrivacy();
  const { refetch } = useFinancialData();
  // Linking lives here rather than in each host. This modal is rendered from
  // four places and only one of them wired the props, so the action existed
  // but was unreachable from the account and dashboard lists.
  const [linking, setLinking] = useState<null | 'refund' | 'repayment'>(null);
  const { toast } = useToast();
  const { unlinkRefund } = useLinkRefund();
  const { unlinkRepayment } = useLinkRepayment();
  const [unlinking, setUnlinking] = useState(false);
  // The `transaction` prop is a snapshot held by whichever list opened this
  // sheet, so refetching does not change it. Tracking the detach locally is
  // what lets the footer swap to "link" without closing and reopening.
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    if (open) setDetached(false);
  }, [open, transaction?.id]);

  const isRefund = !!transaction?.refund_of_transaction_id && !detached;
  const isRepayment = !!transaction?.repayment_of_transaction_id && !detached;

  /** Detaches, and optionally reopens the picker to attach elsewhere. */
  const handleUnlink = async (thenRelink: boolean) => {
    if (!transaction) return;
    setUnlinking(true);
    const kind = transaction.refund_of_transaction_id ? 'refund' : 'repayment';
    const { error } =
      kind === 'refund'
        ? await unlinkRefund(transaction.id)
        : await unlinkRepayment(transaction.id);
    setUnlinking(false);
    if (error) {
      toast({
        title: t('common.error', { defaultValue: 'Error' }),
        description: describeError(error),
        variant: 'destructive',
      });
      return;
    }
    setDetached(true);
    refetch();
    if (thenRelink) {
      setLinking(kind);
    } else {
      toast({
        title: t('transactions.unlinked', { defaultValue: 'Unlinked' }),
        description: t('transactions.unlinkedDesc', {
          defaultValue: 'The two transactions are separate again, and the category was cleared.',
        }),
      });
    }
  };
  const [repayments, setRepayments] = useState<RefundTransaction[]>([]);
  const [repaidIncome, setRepaidIncome] = useState<OriginalTransaction | null>(null);
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
      
      // If this income has been repaid, fetch the expenses that settled it
      if (transaction.type === 'income' && (transaction.repaid_amount || 0) > 0) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, description, amount, transaction_date')
          .eq('repayment_of_transaction_id', transaction.id)
          .order('transaction_date', { ascending: true });

        if (!error && data) {
          setRepayments(data);
        }
      }

      // If this expense repays an advance, fetch the income it settles
      if (transaction.repayment_of_transaction_id) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, description, amount, transaction_date')
          .eq('id', transaction.repayment_of_transaction_id)
          .maybeSingle();

        if (!error && data) {
          setRepaidIncome(data);
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
        return <ArrowDownRight className="w-6 h-6 text-pos" />;
      case 'expense':
        return <ArrowUpRight className="w-6 h-6 text-neg" />;
      case 'transfer':
        return <ArrowRightLeft className="w-6 h-6 text-info" />;
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
        return 'text-pos';
      case 'expense':
        return 'text-neg';
      case 'transfer':
        return 'text-info';
    }
  };

  const remainingToRefund = transaction.type === 'expense' 
    ? transaction.amount - (transaction.refunded_amount || 0) 
    : 0;

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange}>
      <DetailSheetHeader>
        <DetailSheetTitle className="text-[15px] sm:text-[15px] tracking-tight">
          {getTypeIcon()}
          {t('transactions.detailsTitle', { defaultValue: 'Transaction details' })}
        </DetailSheetTitle>
      </DetailSheetHeader>

      <DetailSheetBody>
          {/* Description and amount */}
          <div className="text-center py-4 bg-bg-subtle border border-line rounded-2xl">
            <p className="text-lg font-semibold mb-2">{transaction.description}</p>
            <p
              className={cn(
                'text-[22px] font-semibold font-mono tabular-nums tracking-tight',
                getTypeColor(),
                isPrivacyMode && 'ft-priv'
              )}
            >
              {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '↔'}
              {formatCurrency(Math.abs(transaction.amount))}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <span className="ft-tag">{getTypeLabel()}</span>
              {transaction.refund_of_transaction_id && (
                <span className="ft-tag pos">
                  <RotateCcw className="h-2.5 w-2.5" />
                  Remboursement
                </span>
              )}
              {transaction.repayment_of_transaction_id && (
                <span className="ft-tag">
                  <RotateCcw className="h-2.5 w-2.5" />
                  {t('transactions.repayment', { defaultValue: 'Repayment' })}
                </span>
              )}
              {transaction.type === 'income' && (transaction.repaid_amount || 0) > 0 && (
                <span
                  className={cn(
                    'ft-tag',
                    (transaction.repaid_amount || 0) >= transaction.amount ? '' : 'warn'
                  )}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  {(transaction.repaid_amount || 0) >= transaction.amount
                    ? t('transactions.repaid', { defaultValue: 'Repaid' })
                    : t('transactions.partialRepayment', { defaultValue: 'Partial' })}
                </span>
              )}
              {transaction.type === 'expense' && (transaction.refunded_amount || 0) > 0 && (
                <span
                  className={cn(
                    'ft-tag',
                    transaction.refunded_amount === transaction.amount ? 'pos' : 'warn'
                  )}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  {transaction.refunded_amount === transaction.amount ? 'Remboursé' : 'Partiel'}
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* The advance this expense settles */}
          {transaction.repayment_of_transaction_id && repaidIncome && (
            <>
              <div className="p-3 bg-info/10 border border-info/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-info" />
                  <p className="text-sm font-medium text-info">
                    {t('transactions.repaidAdvance', { defaultValue: 'Advance repaid by this' })}
                  </p>
                </div>
                <div className="ml-6 space-y-1">
                  <p className="text-sm font-medium">{repaidIncome.description}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{format(parseLocalDate(repaidIncome.transaction_date), "d MMM yyyy", { locale: dateLocale })}</span>
                    <span
                      className={cn(
                        'font-medium font-mono tabular-nums text-pos',
                        isPrivacyMode && 'ft-priv'
                      )}
                    >
                      +{formatCurrency(repaidIncome.amount)}
                    </span>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Repayments received against this income */}
          {transaction.type === 'income' && repayments.length > 0 && (
            <>
              <div className="p-3 bg-info/10 border border-info/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-info" />
                  <p className="text-sm font-medium text-info">
                    {t('transactions.repaymentsReceived', { defaultValue: 'Repaid by' })}
                  </p>
                </div>
                <div className="ml-6 space-y-1.5">
                  {repayments.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-2">{r.description}</span>
                      <span className="font-medium text-muted-foreground whitespace-nowrap">
                        {format(parseLocalDate(r.transaction_date), "d MMM", { locale: dateLocale })} ·{' '}
                        <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                          −{formatCurrency(r.amount)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Original transaction info (if this is a refund) */}
          {transaction.refund_of_transaction_id && originalTransaction && (
            <>
              <div className="p-3 bg-pos/10 border border-pos/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-pos" />
                  <p className="text-sm font-medium text-pos">Transaction originale remboursée</p>
                </div>
                <div className="ml-6 space-y-1">
                  <p className="text-sm font-medium">{originalTransaction.description}</p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{format(parseLocalDate(originalTransaction.transaction_date), "d MMM yyyy", { locale: dateLocale })}</span>
                    <span
                      className={cn(
                        'font-medium font-mono tabular-nums text-neg',
                        isPrivacyMode && 'ft-priv'
                      )}
                    >
                      -{formatCurrency(originalTransaction.amount)}
                    </span>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Refund summary for expenses */}
          {transaction.type === 'expense' && (transaction.refunded_amount || 0) > 0 && (
            <>
              <div className="p-3 bg-warn/10 border border-warn/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-warn" />
                  <p className="text-sm font-medium text-warn">{t('refund.history', { defaultValue: 'Refund history' })}</p>
                </div>

                {/* Summary bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      Remboursé :{' '}
                      <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                        {formatCurrency(transaction.refunded_amount || 0)}
                      </span>
                    </span>
                    <span>
                      Reste :{' '}
                      <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                        {formatCurrency(remainingToRefund)}
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-bg-hover rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        transaction.refunded_amount === transaction.amount
                          ? 'bg-pos'
                          : 'bg-warn'
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
                        className="flex items-center justify-between p-2 border border-line bg-bg-subtle/40 hover:bg-bg-subtle rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5">#{index + 1}</span>
                          <div>
                            <p className="text-sm font-medium">{refund.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseLocalDate(refund.transaction_date), "d MMM yyyy", { locale: dateLocale })}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            'text-sm font-medium font-mono tabular-nums text-pos',
                            isPrivacyMode && 'ft-priv'
                          )}
                        >
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
                  {format(parseLocalDate(transaction.transaction_date), "EEEE d MMMM yyyy", { locale: dateLocale })}
                </p>
                {transaction.value_date && transaction.value_date !== transaction.transaction_date && (
                  <>
                    <p className="text-sm font-medium mt-2">Date de valeur</p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseLocalDate(transaction.value_date), "EEEE d MMMM yyyy", { locale: dateLocale })}
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
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: `color-mix(in oklab, ${transaction.category.color} 15%, transparent)`,
                      color: transaction.category.color,
                    }}
                  >
                    <i
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{ background: transaction.category.color }}
                    />
                    {transaction.category.name}
                  </span>
                </div>
              </div>
            )}

            {/* Transfer fee */}
            {transaction.type === 'transfer' && transaction.transfer_fee && transaction.transfer_fee > 0 && (
              <div className="flex items-start gap-3">
                <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Frais de virement</p>
                  <p
                    className={cn(
                      'text-sm text-muted-foreground font-mono tabular-nums',
                      isPrivacyMode && 'ft-priv'
                    )}
                  >
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
      </DetailSheetBody>

      {(onEdit || onDelete || onRefund || transaction.type !== 'transfer') && (
        <DetailSheetFooter>
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
          {transaction.type === 'expense' && !isRepayment && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setLinking('repayment')}
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              {t('transactions.linkAsRepayment', { defaultValue: 'Link as repayment' })}
            </Button>
          )}
          {transaction.type === 'income' && !isRefund && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setLinking('refund')}
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              {t('transactions.linkAsRefund', { defaultValue: 'Link as refund' })}
            </Button>
          )}
          {onRefund && transaction.type === 'expense' && remainingToRefund > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-pos border-pos/30 hover:bg-pos/10"
              onClick={() => { onRefund(transaction); onOpenChange(false); }}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Rembourser
            </Button>
          )}
          {(isRefund || isRepayment) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={unlinking}
                onClick={() => handleUnlink(true)}
              >
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                {t('transactions.relink', { defaultValue: 'Link elsewhere' })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={unlinking}
                onClick={() => handleUnlink(false)}
              >
                <Link2Off className="w-3.5 h-3.5 mr-1.5" />
                {t('transactions.unlink', { defaultValue: 'Unlink' })}
              </Button>
            </>
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
        </DetailSheetFooter>
      )}

      <LinkRefundModal
        open={linking === 'refund'}
        onOpenChange={(o) => !o && setLinking(null)}
        transaction={transaction}
        onLinked={() => {
          setLinking(null);
          refetch();
          onOpenChange(false);
        }}
      />

      <LinkRepaymentModal
        open={linking === 'repayment'}
        onOpenChange={(o) => !o && setLinking(null)}
        transaction={transaction}
        onLinked={() => {
          setLinking(null);
          refetch();
          onOpenChange(false);
        }}
      />
    </DetailSheet>
  );
}
