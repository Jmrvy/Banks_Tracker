import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportsStats } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface StatsCardsProps {
  stats: ReportsStats;
  accountsCount: number;
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}

export const StatsCards = ({ stats, accountsCount, onIncomeClick, onExpensesClick }: StatsCardsProps) => {
  const { formatCurrency } = useUserPreferences();

  return (
    <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2 lg:gap-3 animate-glass-fade-in">
      {/* Income */}
      <div className="stat-card glass-hover cursor-pointer" onClick={onIncomeClick}>
        <div className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <div className="icon-badge icon-badge-sm bg-success/10 flex-shrink-0">
              <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-success" />
            </div>
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Revenus</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold text-success leading-tight mt-0.5 truncate">
            {formatCurrency(stats.income)}
          </p>
        </div>
      </div>

      {/* Expenses */}
      <div className="stat-card glass-hover cursor-pointer" onClick={onExpensesClick}>
        <div className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <div className="icon-badge icon-badge-sm bg-destructive/10 flex-shrink-0">
              <TrendingDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-destructive" />
            </div>
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Dépenses</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold text-destructive leading-tight mt-0.5 truncate">
            {formatCurrency(stats.expenses)}
          </p>
        </div>
      </div>

      {/* Initial Balance */}
      <div className="stat-card glass-hover">
        <div className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <div className="icon-badge icon-badge-sm bg-primary/10 flex-shrink-0">
              <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-primary" />
            </div>
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Initial</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold leading-tight mt-0.5 truncate">
            {formatCurrency(stats.initialBalance)}
          </p>
        </div>
      </div>

      {/* Final Balance */}
      <div className="stat-card glass-hover">
        <div className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <div className="icon-badge icon-badge-sm bg-accent/50 flex-shrink-0">
              <Target className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-accent-foreground" />
            </div>
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate hidden sm:block">Final</p>
          </div>
          <p className={cn(
            "text-[10px] sm:text-xs lg:text-lg font-bold leading-tight mt-0.5 truncate",
            stats.finalBalance >= 0 ? "text-success" : "text-destructive"
          )}>
            {formatCurrency(stats.finalBalance)}
          </p>
        </div>
      </div>

      {/* Accounts count - hidden on mobile */}
      <div className="stat-card glass-hover hidden lg:block">
        <div className="p-1.5 sm:p-2 lg:p-4">
          <div className="flex items-center gap-1">
            <div className="icon-badge icon-badge-sm bg-muted flex-shrink-0">
              <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-muted-foreground" />
            </div>
            <p className="text-[8px] sm:text-[10px] lg:text-xs font-medium text-muted-foreground truncate">Comptes</p>
          </div>
          <p className="text-[10px] sm:text-xs lg:text-lg font-bold leading-tight mt-0.5">
            {accountsCount}
          </p>
        </div>
      </div>
    </div>
  );
};