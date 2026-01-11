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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Transactions liées
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Paiement échelonné:</span>
              <span className="font-semibold">{installmentPayment.description}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total payé:</span>
              <span className="font-bold text-success">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Transactions:</span>
              <Badge variant="secondary">{transactions.length}</Badge>
            </div>
          </div>

          {/* Transactions List */}
          <ScrollArea className="h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Receipt className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Aucune transaction liée à ce paiement échelonné
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Les transactions apparaîtront ici lorsque des paiements seront effectués
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((transaction) => {
                  const category = getCategoryInfo(transaction.category_id);
                  return (
                    <div
                      key={transaction.id}
                      className="bg-card border border-border/50 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {transaction.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(transaction.transaction_date), "dd MMM yyyy", {
                              locale: fr,
                            })}
                          </div>
                        </div>
                        <span className="font-bold text-destructive">
                          -{formatCurrency(transaction.amount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Wallet className="h-3 w-3" />
                          {getAccountName(transaction.account_id)}
                        </div>
                        {category && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </Badge>
                        )}
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
