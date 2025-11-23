import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Repeat } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { startOfMonth, endOfMonth } from "date-fns";

export function StatsCards() {
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    const monthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd;
    });

    const moneyIn = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const moneyOut = monthTransactions
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
  }, [transactions, accounts, recurringTransactions]);

  const cards = [
    {
      label: "Money in",
      value: stats.moneyIn,
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10"
    },
    {
      label: "Money out",
      value: stats.moneyOut,
      icon: TrendingDown,
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    },
    {
      label: "Available",
      value: stats.available,
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      label: "Recurring",
      value: stats.recurring,
      icon: Repeat,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      isCount: true
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-border bg-card hover:bg-accent/50 transition-colors">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">{card.label}</p>
                <p className="text-2xl font-bold">
                  {card.isCount ? card.value : formatCurrency(card.value)}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full ${card.bgColor} flex items-center justify-center`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
