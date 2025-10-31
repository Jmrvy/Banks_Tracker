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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2 lg:gap-3">
      <Card className="hover-scale cursor-pointer" onClick={onIncomeClick}>
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-success flex-shrink-0" />
            <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Revenus</p>
          </div>
          <div className="mt-0.5 sm:mt-1">
            <p className="text-xs sm:text-sm lg:text-lg font-bold text-success leading-tight">
              {formatCurrency(stats.income)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale cursor-pointer" onClick={onExpensesClick}>
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <TrendingDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-destructive flex-shrink-0" />
            <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Dépenses</p>
          </div>
          <div className="mt-0.5 sm:mt-1">
            <p className="text-xs sm:text-sm lg:text-lg font-bold text-destructive leading-tight">
              {formatCurrency(stats.expenses)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale">
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-primary flex-shrink-0" />
            <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Initial</p>
          </div>
          <div className="mt-0.5 sm:mt-1">
            <p className="text-xs sm:text-sm lg:text-lg font-bold leading-tight">
              {formatCurrency(stats.initialBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale">
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <Target className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-accent-foreground flex-shrink-0" />
            <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Final</p>
          </div>
          <div className="mt-0.5 sm:mt-1">
            <p className={cn(
              "text-xs sm:text-sm lg:text-lg font-bold leading-tight",
              stats.finalBalance >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(stats.finalBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hover-scale col-span-2 sm:col-span-1">
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center space-x-1 sm:space-x-1.5">
            <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Comptes</p>
          </div>
          <div className="mt-0.5 sm:mt-1">
            <p className="text-xs sm:text-sm lg:text-lg font-bold leading-tight">
              {accountsCount}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};