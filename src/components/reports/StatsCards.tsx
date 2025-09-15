import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportsStats } from "@/hooks/useReportsData";

interface StatsCardsProps {
  stats: ReportsStats;
  accountsCount: number;
}

export const StatsCards = ({ stats, accountsCount }: StatsCardsProps) => {
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Revenus</p>
          </div>
          <div className="mt-2">
            <p className="text-lg sm:text-2xl font-bold text-green-600">
              {formatCurrency(stats.income)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center space-x-2">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Dépenses</p>
          </div>
          <div className="mt-2">
            <p className="text-lg sm:text-2xl font-bold text-red-600">
              {formatCurrency(stats.expenses)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center space-x-2">
            <Wallet className="h-4 w-4 text-blue-600" />
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Solde initial</p>
          </div>
          <div className="mt-2">
            <p className="text-lg sm:text-2xl font-bold">
              {formatCurrency(stats.initialBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center space-x-2">
            <Target className="h-4 w-4 text-purple-600" />
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Solde final</p>
          </div>
          <div className="mt-2">
            <p className={cn(
              "text-lg sm:text-2xl font-bold",
              stats.finalBalance >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {formatCurrency(stats.finalBalance)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center space-x-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Comptes</p>
          </div>
          <div className="mt-2">
            <p className="text-lg sm:text-2xl font-bold">
              {accountsCount}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};