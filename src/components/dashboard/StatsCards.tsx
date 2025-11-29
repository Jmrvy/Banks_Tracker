import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Repeat } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface StatsCardsProps {
  startDate: Date;
  endDate: Date;
}

export function StatsCards({ startDate, endDate }: StatsCardsProps) {
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const stats = useMemo(() => {
    const filteredTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= startDate && date <= endDate;
    });

    const moneyIn = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const moneyOut = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const available = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    const activeRecurring = recurringTransactions.filter(rt => rt.is_active).length;

    return {
      moneyIn,
      moneyOut,
      available,
      recurring: activeRecurring
    };
  }, [transactions, accounts, recurringTransactions, startDate, endDate]);

  const cards = [
    {
      label: "Revenus",
      value: stats.moneyIn,
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10"
    },
    {
      label: "Dépenses",
      value: stats.moneyOut,
      icon: TrendingDown,
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    },
    {
      label: "Disponible",
      value: stats.available,
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      label: "Récurrents",
      value: stats.recurring,
      icon: Repeat,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      isCount: true
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-border bg-card hover:bg-accent/50 transition-colors">
          <CardContent className="p-3 md:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm text-muted-foreground mb-1 md:mb-2 truncate">{card.label}</p>
                <p className="text-base md:text-xl lg:text-2xl font-bold truncate">
                  {card.isCount ? card.value : formatCurrency(card.value)}
                </p>
              </div>
              <div className={`h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full ${card.bgColor} flex items-center justify-center flex-shrink-0 ml-2`}>
                <card.icon className={`h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
