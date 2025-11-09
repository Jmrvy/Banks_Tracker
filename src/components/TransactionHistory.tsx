import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, History, Pencil, Trash2 } from "lucide-react";
import { useFinancialData, type Transaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { useToast } from "@/hooks/use-toast";

const bankColors = {
  societe_generale: 'bg-red-500',
  revolut: 'bg-blue-500', 
  boursorama: 'bg-orange-500',
  bnp_paribas: 'bg-green-600',
  credit_agricole: 'bg-green-700',
  lcl: 'bg-blue-700',
  caisse_epargne: 'bg-yellow-600',
  credit_mutuel: 'bg-blue-800',
  other: 'bg-gray-500'
};

export const TransactionHistory = () => {
  const { transactions, loading, deleteTransaction } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { toast } = useToast();
  const [displayCount, setDisplayCount] = useState<string>("25");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Utiliser la préférence de date pour l'affichage et le tri
  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const dateA = preferences.dateType === 'value' 
        ? new Date(a.value_date || a.transaction_date)
        : new Date(a.transaction_date);
      const dateB = preferences.dateType === 'value'
        ? new Date(b.value_date || b.transaction_date)
        : new Date(b.transaction_date);
      return dateB.getTime() - dateA.getTime();
    });
  }, [transactions, preferences.dateType]);

  const displayedTransactions = sortedTransactions.slice(0, parseInt(displayCount));

  const handleDelete = async () => {
    if (!deletingTransaction) return;

    setIsDeleting(true);
    const { error } = await deleteTransaction(deletingTransaction.id);

    if (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la suppression",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Succès",
        description: "Transaction supprimée avec succès",
      });
    }

    setIsDeleting(false);
    setDeletingTransaction(null);
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Historique des Transactions
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Basé sur la date {preferences.dateType === 'value' ? 'de valeur' : 'comptable'}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                <div className="flex items-center space-x-4">
                  <div className="animate-pulse w-2 h-6 rounded-full bg-muted" />
                  <div className="animate-pulse w-8 h-8 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="animate-pulse h-4 bg-muted rounded w-32" />
                    <div className="animate-pulse h-3 bg-muted rounded w-20" />
                  </div>
                </div>
                <div className="animate-pulse h-4 bg-muted rounded w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historique des Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Aucune transaction trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Commencez par créer votre première transaction
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Historique des Transactions
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Basé sur la date {preferences.dateType === 'value' ? 'de valeur' : 'comptable'}
            </p>
          </div>
          <Select value={displayCount} onValueChange={setDisplayCount}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 dernières</SelectItem>
              <SelectItem value="25">25 dernières</SelectItem>
              <SelectItem value="50">50 dernières</SelectItem>
              <SelectItem value="100">100 dernières</SelectItem>
              <SelectItem value={transactions.length.toString()}>Toutes ({transactions.length})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayedTransactions.map((transaction) => {
            const displayDate = preferences.dateType === 'value' 
              ? new Date(transaction.value_date || transaction.transaction_date)
              : new Date(transaction.transaction_date);

            return (
              <div 
                key={transaction.id} 
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/80 hover:bg-accent/50 hover:border-accent transition-all duration-200 shadow-sm"
              >
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                  <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                    <div className={`w-1.5 sm:w-2 h-5 sm:h-6 rounded-full ${
                      bankColors[transaction.account?.bank || 'other'] || 'bg-gray-500'
                    }`} />
                    <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-muted">
                      {transaction.type === 'income' ? (
                        <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                      ) : transaction.type === 'transfer' ? (
                        <ArrowRightLeft className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
                      )}
                    </div>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs sm:text-sm truncate">{transaction.description}</p>
                    <div className="flex items-center space-x-1 sm:space-x-2 mt-0.5 sm:mt-1">
                      {transaction.category && (
                        <Badge 
                          variant="secondary" 
                          className="text-[10px] sm:text-xs px-1 sm:px-2 py-0"
                          style={{ backgroundColor: transaction.category.color, color: 'white' }}
                        >
                          {transaction.category.name}
                        </Badge>
                      )}
                      <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {displayDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      {transaction.account && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline truncate">
                          • {transaction.account.name}
                        </span>
                      )}
                      {transaction.type === 'transfer' && transaction.transfer_to_account && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground hidden md:inline truncate">
                          → {transaction.transfer_to_account.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 ml-2">
                  <span 
                    className={`font-semibold text-xs sm:text-sm ${
                      transaction.type === 'income' ? 'text-green-600' : 
                      transaction.type === 'transfer' ? 'text-blue-600' : 
                      'text-foreground'
                    }`}
                  >
                    {transaction.type === 'income' ? '+' : 
                     transaction.type === 'transfer' ? '↔' : 
                     '-'}{formatCurrency(Math.abs(transaction.amount))}
                    {transaction.type === 'transfer' && transaction.transfer_fee && transaction.transfer_fee > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-0.5 hidden sm:inline">
                        (+{formatCurrency(transaction.transfer_fee)} frais)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8"
                      onClick={() => setEditingTransaction(transaction)}
                    >
                      <Pencil className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8"
                      onClick={() => setDeletingTransaction(transaction)}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {displayedTransactions.length < transactions.length && (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            Affichage de {displayedTransactions.length} sur {transactions.length} transactions
          </div>
        )}
      </CardContent>

      <EditTransactionModal
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
        transaction={editingTransaction}
      />

      <AlertDialog open={!!deletingTransaction} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette transaction ? Cette action est irréversible.
              {deletingTransaction && (
                <div className="mt-2 p-2 bg-muted rounded-md">
                  <p className="font-medium">{deletingTransaction.description}</p>
                  <p className="text-sm">{formatCurrency(deletingTransaction.amount)}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
