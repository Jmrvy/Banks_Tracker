import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportsStats } from "@/hooks/useReportsData";

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
}

interface StatsCardsProps {
  stats: ReportsStats;
  accountsCount: number;
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}

export const StatsCards = ({ stats, accountsCount, onIncomeClick, onExpensesClick }: StatsCardsProps) => {
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
      <Card className="hover-scale cursor-pointer" onClick={onIncomeClick}>
        <CardContent className="p-2 sm:p-3 lg:p-6">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-success flex-shrink-0" />
            <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-muted-foreground truncate">Revenus</p>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className="text-sm sm:text-lg lg:text-2xl font-bold text-success leading-tight">
              {formatCurrency(stats.income)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale cursor-pointer" onClick={onExpensesClick}>
        <CardContent className="p-2 sm:p-3 lg:p-6">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive flex-shrink-0" />
            <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-muted-foreground truncate">Dépenses</p>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className="text-sm sm:text-lg lg:text-2xl font-bold text-destructive leading-tight">
              {formatCurrency(stats.expenses)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale">
        <CardContent className="p-2 sm:p-3 lg:p-6">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
            <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-muted-foreground truncate">Solde initial</p>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className="text-sm sm:text-lg lg:text-2xl font-bold leading-tight">
              {formatCurrency(stats.initialBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale">
        <CardContent className="p-2 sm:p-3 lg:p-6">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <Target className="h-3 w-3 sm:h-4 sm:w-4 text-accent-foreground flex-shrink-0" />
            <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-muted-foreground truncate">Solde final</p>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className={cn(
              "text-sm sm:text-lg lg:text-2xl font-bold leading-tight",
              stats.finalBalance >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(stats.finalBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale col-span-2 sm:col-span-1">
        <CardContent className="p-2 sm:p-3 lg:p-6">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-muted-foreground truncate">Comptes</p>
          </div>
          <div className="mt-1 sm:mt-2">
            <p className="text-sm sm:text-lg lg:text-2xl font-bold leading-tight">
              {accountsCount}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};