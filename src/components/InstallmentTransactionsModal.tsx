import { useState, useEffect } from "react";
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
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
    return account?.name || "Compte inconnu";
  };

  const getCategoryInfo = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId);
  };

  const totalPaid = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            <span className="truncate">Transactions liées</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
            <div className="flex justify-between items-center gap-2">
              <span className="text-[11px] sm:text-sm text-muted-foreground flex-shrink-0">Paiement:</span>
              <span className="font-semibold text-xs sm:text-base truncate text-right">{installmentPayment.description}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] sm:text-sm text-muted-foreground">Total payé:</span>
              <span className="font-bold text-success text-xs sm:text-base">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] sm:text-sm text-muted-foreground">Transactions:</span>
              <Badge variant="secondary" className="text-[10px] sm:text-xs">{transactions.length}</Badge>
            </div>
          </div>

          {/* Transactions List */}
          <ScrollArea className="h-[220px] sm:h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Receipt className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground/50 mb-2" />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Aucune transaction liée
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Les transactions apparaîtront ici lorsque des paiements seront effectués
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2 pr-2">
                {transactions.map((transaction) => {
                  const category = getCategoryInfo(transaction.category_id);
                  return (
                    <div
                      key={transaction.id}
                      className="bg-card border border-border/50 rounded-lg p-2 sm:p-3"
                    >
                      {/* Mobile: compact single-line layout */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[11px] sm:text-sm truncate">
                            {transaction.description}
                          </p>
                          <div className="flex items-center gap-1 sm:gap-2 mt-0.5">
                            <Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs text-muted-foreground">
                              {format(new Date(transaction.transaction_date), "dd/MM/yy", {
                                locale: fr,
                              })}
                            </span>
                            {category && (
                              <>
                                <span className="text-muted-foreground text-[10px]">•</span>
                                <div className="flex items-center gap-0.5 min-w-0">
                                  <div
                                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: category.color }}
                                  />
                                  <span className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[60px] sm:max-w-none">
                                    {category.name}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="font-bold text-destructive text-[11px] sm:text-sm whitespace-nowrap flex-shrink-0">
                          -{formatCurrency(transaction.amount)}
                        </span>
                      </div>
                      {/* Account info - hidden on very small screens, shown as secondary info */}
                      <div className="hidden sm:flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                        <Wallet className="h-3 w-3 flex-shrink-0" />
                        <span>{getAccountName(transaction.account_id)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
