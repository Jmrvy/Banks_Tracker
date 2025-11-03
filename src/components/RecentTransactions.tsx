import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowUpRight, ArrowDownRight, ArrowRightLeft, MoreHorizontal, Edit, Trash2 } from "lucide-react";
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

export const RecentTransactions = () => {
  const { transactions, loading, deleteTransaction } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { toast } = useToast();

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Display only 10 most recent transactions
  const displayedTransactions = transactions.slice(0, 10);

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer la transaction "${transaction.description}" ?`)) {
      const { error } = await deleteTransaction(transaction.id);
      if (error) {
        toast({
          title: "Erreur",
          description: error.message || "Erreur lors de la suppression de la transaction",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Succès",
          description: "Transaction supprimée avec succès",
        });
      }
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transactions Récentes</CardTitle>
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
        <CardTitle className="text-lg">Transactions Récentes</CardTitle>
        <p className="text-xs text-muted-foreground">Les 10 dernières transactions</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayedTransactions.map((transaction) => (
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
                      {new Date(transaction.transaction_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                      <MoreHorizontal className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditTransaction(transaction)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleDeleteTransaction(transaction)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <EditTransactionModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        transaction={editingTransaction}
      />
    </Card>
  );
};
