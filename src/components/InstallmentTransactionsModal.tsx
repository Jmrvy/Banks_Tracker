import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { parseLocalDate } from "@/lib/dateUtils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { Receipt, Calendar, Wallet } from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: string;
  transaction_date: string;
  account_id: string;
  category_id: string | null;
}


interface InstallmentTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentPayment: InstallmentPayment;
}

export const InstallmentTransactionsModal = ({
  open,
  onOpenChange,
  installmentPayment,
}: InstallmentTransactionsModalProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { accounts, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user || !open) return;

      setLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("installment_payment_id", installmentPayment.id)
        .order("transaction_date", { ascending: false });

      if (error) {
        console.error("Error fetching transactions:", error);
      } else {
        setTransactions(data || []);
      }
      setLoading(false);
    };

    fetchTransactions();
  }, [user, open, installmentPayment.id]);

  const getAccountName = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.name || t('common.unknownAccount');
  };

  const getCategoryInfo = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId);
  };

  const totalPaid = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            <span className="truncate">Transactions liées</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3">
          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between items-center gap-2">
              <span className="text-[11px] sm:text-xs text-muted-foreground flex-shrink-0">Paiement</span>
              <span className="font-semibold text-xs sm:text-sm truncate">{installmentPayment.description}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] sm:text-xs text-muted-foreground">Total payé</span>
              <span className="font-bold text-success text-xs sm:text-sm">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] sm:text-xs text-muted-foreground">Transactions</span>
              <Badge variant="secondary" className="text-[10px] sm:text-xs">{transactions.length}</Badge>
            </div>
          </div>

          {/* Transactions List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Receipt className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50 mb-2" />
              <p className="text-xs sm:text-sm text-muted-foreground">
                Aucune transaction liée
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                Les transactions apparaîtront ici lorsque des paiements seront effectués
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {transactions.map((transaction) => {
                const category = getCategoryInfo(transaction.category_id);
                return (
                  <div
                    key={transaction.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-card border border-border/50"
                  >
                    {/* Date indicator */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted/50 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold leading-tight">
                        {parseLocalDate(transaction.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric' })}
                      </span>
                      <span className="text-[8px] sm:text-[9px] text-muted-foreground uppercase leading-tight">
                        {parseLocalDate(transaction.transaction_date).toLocaleDateString('fr-FR', { month: 'short' })}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">
                        {transaction.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                          {getAccountName(transaction.account_id)}
                        </span>
                        {category && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <div
                              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                              {category.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <span className="font-bold text-destructive text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
                      -{formatCurrency(transaction.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
