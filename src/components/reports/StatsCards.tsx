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
    <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2 lg:gap-3">
      {/* Income */}
      <Card className="hover-scale cursor-pointer" onClick={onIncomeClick}>
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-success flex-shrink-0" />
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Revenus</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold text-success leading-tight mt-0.5 truncate">
            {formatCurrency(stats.income)}
          </p>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card className="hover-scale cursor-pointer" onClick={onExpensesClick}>
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <TrendingDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-destructive flex-shrink-0" />
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Dépenses</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold text-destructive leading-tight mt-0.5 truncate">
            {formatCurrency(stats.expenses)}
          </p>
        </CardContent>
      </Card>

      {/* Initial Balance */}
      <Card className="hover-scale">
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-primary flex-shrink-0" />
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Initial</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold leading-tight mt-0.5 truncate">
            {formatCurrency(stats.initialBalance)}
          </p>
        </CardContent>
      </Card>

      {/* Final Balance */}
      <Card className="hover-scale">
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <Target className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-accent-foreground flex-shrink-0" />
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Final</p>
          </div>
          <p className={cn(
            "text-[10px] sm:text-xs lg:text-lg font-bold leading-tight mt-0.5 truncate",
            stats.finalBalance >= 0 ? "text-success" : "text-destructive"
          )}>
            {formatCurrency(stats.finalBalance)}
          </p>
        </CardContent>
      </Card>

      {/* Accounts count - hidden on mobile */}
      <Card className="hover-scale hidden lg:block">
        <CardContent className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Comptes</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold leading-tight mt-0.5">
            {accountsCount}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};