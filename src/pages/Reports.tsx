import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ArrowLeft, TrendingUp, TrendingDown, Wallet, Target, BarChart3, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from "recharts";
import { useNavigate } from "react-router-dom";

const Reports = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { transactions, categories, accounts, recurringTransactions, loading } = useFinancialData();
  const [periodType, setPeriodType] = useState<"month" | "year" | "custom">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);

  // Calcul de la période sélectionnée
  const period = useMemo(() => {
    switch (periodType) {
      case "month":
        return {
          from: startOfMonth(selectedDate),
          to: endOfMonth(selectedDate),
          label: format(selectedDate, "MMMM yyyy", { locale: fr })
        };
      case "year":
        return {
          from: startOfYear(selectedDate),
          to: endOfYear(selectedDate),
          label: format(selectedDate, "yyyy", { locale: fr })
        };
      case "custom":
        return {
          from: dateRange.from,
          to: dateRange.to,
          label: `${format(dateRange.from, "dd/MM/yyyy")} - ${format(dateRange.to, "dd/MM/yyyy")}`
        };
    }
  }, [periodType, selectedDate, dateRange]);

  // Filtrage des transactions pour la période
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.transaction_date);
      return isWithinInterval(transactionDate, { start: period.from, end: period.to });
    });
  }, [transactions, period]);

  // Calculs des statistiques avec soldes initiaux
  const stats = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const transferFees = filteredTransactions
      .filter(t => t.type === 'transfer')
      .reduce((sum, t) => sum + Number(t.transfer_fee || 0), 0);

    // Variation nette de la période (tout compris)
    const netPeriodBalance = income - expenses - transferFees;

    // Calcul du solde initial basé sur les comptes actuels moins les transactions de la période
    const initialBalance = accounts.reduce((sum, account) => {
      // Trouver toutes les transactions qui affectent ce compte depuis le début de la période
      const accountTransactionsSincePeriodStart = transactions.filter(t => {
        const transactionDate = new Date(t.transaction_date);
        return transactionDate >= period.from && 
               (t.account?.name === account.name || t.transfer_to_account?.name === account.name);
      });
      
      // Calculer l'impact net de ces transactions sur le compte
      const accountNetChange = accountTransactionsSincePeriodStart.reduce((change, t) => {
        if (t.account?.name === account.name) {
          switch (t.type) {
            case 'income':
              return change - Number(t.amount);
            case 'expense':
              return change + Number(t.amount);
            case 'transfer':
              return change + Number(t.amount) + Number(t.transfer_fee || 0);
          }
        }
        if (t.transfer_to_account?.name === account.name) {
          return change - Number(t.amount);
        }
        return change;
      }, 0);

      // Solde initial = solde actuel - impact des transactions de la période
      const initialAccountBalance = Number(account.balance) + accountNetChange;
      return sum + initialAccountBalance;
    }, 0);

    // Solde final = solde initial + variation nette de la période
    const finalBalance = initialBalance + netPeriodBalance;

    return { 
      income, 
      expenses, 
      netPeriodBalance, 
      initialBalance,
      finalBalance
    };
  }, [filteredTransactions, accounts, transactions, period]);

  // Données pour l'évolution des soldes avec projection récurrents ET spending patterns
  const balanceEvolutionData = useMemo(() => {
    const sortedTransactions = filteredTransactions
      .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    
    const dailyData = [];
    let runningBalance = stats.initialBalance;
    
    // Commencer par le solde initial
    dailyData.push({
      date: format(period.from, "dd/MM", { locale: fr }),
      solde: runningBalance,
      soldeProjecte: runningBalance,
      dateObj: period.from
    });

    // Grouper les transactions par date
    const transactionsByDate = new Map();
    sortedTransactions.forEach(t => {
      const date = format(new Date(t.transaction_date), "yyyy-MM-dd");
      if (!transactionsByDate.has(date)) {
        transactionsByDate.set(date, []);
      }
      transactionsByDate.get(date).push(t);
    });

    // Créer les points de données pour chaque jour avec transactions
    transactionsByDate.forEach((dayTransactions, dateStr) => {
      const dateObj = new Date(dateStr);
      const dayBalance = dayTransactions.reduce((sum, t) => {
        if (t.type === 'income') return sum + Number(t.amount);
        if (t.type === 'expense') return sum - Number(t.amount);
        return sum - Number(t.transfer_fee || 0);
      }, 0);
      
      runningBalance += dayBalance;
      
      dailyData.push({
        date: format(dateObj, "dd/MM", { locale: fr }),
        solde: runningBalance,
        soldeProjecte: runningBalance,
        dateObj: dateObj
      });
    });

    // Projection sur 3 mois
    if (dailyData.length > 0) {
      const lastDate = dailyData[dailyData.length - 1].dateObj;
      const projectionEndDate = new Date(lastDate);
      projectionEndDate.setMonth(projectionEndDate.getMonth() + 3);

      let projectedBalance = runningBalance;
      let currentDate = new Date(lastDate);
      currentDate.setDate(currentDate.getDate() + 1);

      if (useSpendingPatterns) {
        // Projection basée sur les patterns de dépenses
        const daysInPeriod = differenceInDays(period.to, period.from) + 1;
        const dailyAvgIncome = stats.income / daysInPeriod;
        const dailyAvgExpenses = stats.expenses / daysInPeriod;
        const dailyNetAvg = dailyAvgIncome - dailyAvgExpenses;

        while (currentDate <= projectionEndDate) {
          projectedBalance += dailyNetAvg;

          if (currentDate.getDate() % 7 === 0) {
            dailyData.push({
              date: format(currentDate, "dd/MM", { locale: fr }),
              solde: null,
              soldeProjecte: projectedBalance,
              dateObj: new Date(currentDate),
              isProjection: true
            });
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        // Projection basée sur les transactions récurrentes
        const activeRecurring = [...recurringTransactions.filter(rt => rt.is_active)];

        while (currentDate <= projectionEndDate) {
          const dailyRecurringImpact = activeRecurring.reduce((impact, rt) => {
            const nextDueDate = new Date(rt.next_due_date);
            
            if (currentDate.toDateString() === nextDueDate.toDateString()) {
              if (rt.type === 'income') {
                impact += Number(rt.amount);
              } else if (rt.type === 'expense') {
                impact -= Number(rt.amount);
              }

              // Calculer la prochaine échéance
              const newNextDue = new Date(nextDueDate);
              switch (rt.recurrence_type) {
                case 'weekly':
                  newNextDue.setDate(newNextDue.getDate() + 7);
                  break;
                case 'monthly':
                  newNextDue.setMonth(newNextDue.getMonth() + 1);
                  break;
                case 'yearly':
                  newNextDue.setFullYear(newNextDue.getFullYear() + 1);
                  break;
              }
              rt.next_due_date = newNextDue.toISOString().split('T')[0];
            }
            return impact;
          }, 0);

          projectedBalance += dailyRecurringImpact;

          if (currentDate.getDate() % 7 === 0 || dailyRecurringImpact !== 0) {
            dailyData.push({
              date: format(currentDate, "dd/MM", { locale: fr }),
              solde: null,
              soldeProjecte: projectedBalance,
              dateObj: new Date(currentDate),
              isProjection: true
            });
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }

    return dailyData;
  }, [filteredTransactions, stats, period, recurringTransactions, useSpendingPatterns]);

  // Données pour les catégories avec budgets
  const categoryChartData = useMemo(() => {
    const expensesByCategory = filteredTransactions
      .filter(t => t.type === 'expense' && t.category)
      .reduce((acc, t) => {
        const categoryId = t.category?.id;
        const categoryName = t.category?.name || 'Non catégorisé';
        const category = categories.find(c => c.id === categoryId);
        if (!acc[categoryId]) {
          acc[categoryId] = {
            name: categoryName,
            spent: 0,
            budget: Number(category?.budget || 0),
            color: t.category?.color || '#6b7280'
          };
        }
        acc[categoryId].spent += Number(t.amount);
        return acc;
      }, {} as Record<string, any>);

    return Object.entries(expensesByCategory)
      .map(([_, data]) => ({
        ...data,
        percentage: data.budget > 0 ? (data.spent / data.budget * 100).toFixed(1) : 0,
        remaining: Math.max(0, data.budget - data.spent)
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [filteredTransactions, categories]);

  // Données pour les transactions récurrentes
  const recurringData = useMemo(() => {
    const activeRecurring = recurringTransactions.filter(rt => rt.is_active);
    
    const monthlyIncome = activeRecurring
      .filter(rt => rt.type === 'income')
      .reduce((sum, rt) => {
        const amount = Number(rt.amount);
        switch (rt.recurrence_type) {
          case 'weekly': return sum + (amount * 52 / 12);
          case 'monthly': return sum + amount;
          case 'yearly': return sum + (amount / 12);
          default: return sum;
        }
      }, 0);

    const monthlyExpenses = activeRecurring
      .filter(rt => rt.type === 'expense')
      .reduce((sum, rt) => {
        const amount = Number(rt.amount);
        switch (rt.recurrence_type) {
          case 'weekly': return sum + (amount * 52 / 12);
          case 'monthly': return sum + amount;
          case 'yearly': return sum + (amount / 12);
          default: return sum;
        }
      }, 0);

    return {
      activeRecurring,
      monthlyIncome,
      monthlyExpenses,
      monthlyNet: monthlyIncome - monthlyExpenses
    };
  }, [recurringTransactions]);

  // Données spending patterns si activé
  const spendingPatternsData = useMemo(() => {
    if (!useSpendingPatterns || filteredTransactions.length === 0) return null;

    const daysInPeriod = differenceInDays(period.to, period.from) + 1;
    const dailyAvgIncome = stats.income / daysInPeriod;
    const dailyAvgExpenses = stats.expenses / daysInPeriod;

    return {
      dailyAvgIncome,
      dailyAvgExpenses,
      dailyNet: dailyAvgIncome - dailyAvgExpenses,
      projectedMonthlyIncome: dailyAvgIncome * 30,
      projectedMonthlyExpenses: dailyAvgExpenses * 30,
      projectedMonthlyNet: (dailyAvgIncome - dailyAvgExpenses) * 30
    };
  }, [useSpendingPatterns, filteredTransactions, stats, period]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <div>Chargement des récapitulatifs...</div>
        </div>
      </div>
    );
  }

  const chartConfig = {
    solde: {
      label: "Solde",
      color: "hsl(var(--primary))"
    },
    soldeProjecte: {
      label: "Solde Projeté",
      color: "hsl(var(--primary) / 0.6)"
    },
    spent: {
      label: "Dépensé",
      color: "hsl(var(--destructive))"
    },
    budget: {
      label: "Budget",
      color: "hsl(var(--muted-foreground))"
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/")}
              className="rounded-full flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold truncate">Récapitulatifs Financiers</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Analyse détaillée • {period.label}
              </p>
            </div>
          </div>
        </div>

        {/* Filtres de période */}
        <Card>
          <CardHeader>
            <CardTitle>Sélectionner la période</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type de période</label>
                  <Select value={periodType} onValueChange={(value: "month" | "year" | "custom") => setPeriodType(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Mois</SelectItem>
                      <SelectItem value="year">Année</SelectItem>
                      <SelectItem value="custom">Personnalisée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {periodType === "month" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mois</label>
                    <MonthPicker
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      placeholder="Choisir un mois"
                    />
                  </div>
                )}

                {periodType === "year" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Année</label>
                    <YearPicker
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      placeholder="Choisir une année"
                    />
                  </div>
                )}

                {periodType === "custom" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date début</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left">
                            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{format(dateRange.from, "dd/MM/yy")}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange.from}
                            onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date fin</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left">
                            <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{format(dateRange.to, "dd/MM/yy")}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange.to}
                            onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Résumé des soldes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">Revenus</p>
              </div>
              <div className="mt-2">
                <p className="text-lg sm:text-2xl font-bold text-green-600">
                  {stats.income.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
                  {stats.expenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
                  {stats.initialBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
                  {stats.finalBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
                  {accounts.length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Graphiques et analyses */}
        <Tabs defaultValue="evolution" className="space-y-4">
          <TabsList className="grid w-fit grid-cols-3 mx-auto">
            <TabsTrigger value="evolution">Évolution</TabsTrigger>
            <TabsTrigger value="categories">Catégories</TabsTrigger>
            <TabsTrigger value="recurring">Récapitulatif</TabsTrigger>
          </TabsList>

          <TabsContent value="evolution" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Évolution du solde</CardTitle>
                    <CardDescription>
                      Évolution de votre solde avec projection sur 3 mois
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="spending-patterns"
                      checked={useSpendingPatterns}
                      onCheckedChange={setUseSpendingPatterns}
                    />
                    <label htmlFor="spending-patterns" className="text-sm font-medium">
                      {useSpendingPatterns ? 'Spending Patterns' : 'Récurrents'}
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ChartContainer config={chartConfig}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={balanceEvolutionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => 
                            value.toLocaleString('fr-FR', { 
                              style: 'currency', 
                              currency: 'EUR',
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0
                            })
                          }
                        />
                        <ChartTooltip 
                          content={
                            <ChartTooltipContent 
                              formatter={(value, name) => [
                                typeof value === 'number' 
                                  ? value.toLocaleString('fr-FR', { 
                                      style: 'currency', 
                                      currency: 'EUR' 
                                    })
                                  : 'N/A',
                                name === 'solde' ? 'Solde réel' : `Solde projeté (${useSpendingPatterns ? 'patterns' : 'récurrents'})`
                              ]}
                              labelFormatter={(label) => `Date: ${label}`}
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="solde"
                          stroke={chartConfig.solde.color}
                          fill={chartConfig.solde.color}
                          fillOpacity={0.3}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="soldeProjecte"
                          stroke={chartConfig.soldeProjecte.color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          connectNulls={true}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Résumé des soldes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Solde de début:</span>
                    <span className="text-sm font-mono">
                      {stats.initialBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Variation nette:</span>
                    <span className={cn(
                      "text-sm font-mono",
                      stats.netPeriodBalance >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {stats.netPeriodBalance >= 0 ? "+" : ""}{stats.netPeriodBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-sm font-medium">Solde de fin:</span>
                    <span className={cn(
                      "text-sm font-mono font-bold",
                      stats.finalBalance >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {stats.finalBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Projection mensuelle</CardTitle>
                  <CardDescription>
                    Basée sur {useSpendingPatterns ? 'les patterns de dépenses' : 'les transactions récurrentes'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {useSpendingPatterns && spendingPatternsData ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Revenus projetés:</span>
                        <span className="text-sm font-mono text-green-600">
                          {spendingPatternsData.projectedMonthlyIncome.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Dépenses projetées:</span>
                        <span className="text-sm font-mono text-red-600">
                          {spendingPatternsData.projectedMonthlyExpenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-sm font-medium">Net mensuel projeté:</span>
                        <span className={cn(
                          "text-sm font-mono font-bold",
                          spendingPatternsData.projectedMonthlyNet >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {spendingPatternsData.projectedMonthlyNet >= 0 ? "+" : ""}{spendingPatternsData.projectedMonthlyNet.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Revenus récurrents:</span>
                        <span className="text-sm font-mono text-green-600">
                          {recurringData.monthlyIncome.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Dépenses récurrentes:</span>
                        <span className="text-sm font-mono text-red-600">
                          {recurringData.monthlyExpenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-sm font-medium">Net récurrent mensuel:</span>
                        <span className={cn(
                          "text-sm font-mono font-bold",
                          recurringData.monthlyNet >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {recurringData.monthlyNet >= 0 ? "+" : ""}{recurringData.monthlyNet.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            {categoryChartData.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Dépenses par catégorie</CardTitle>
                    <CardDescription>Montants dépensés et budgets alloués</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ChartContainer config={chartConfig}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={categoryChartData} 
                            layout="horizontal"
                            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              type="number"
                              fontSize={12}
                              tickFormatter={(value) => 
                                value.toLocaleString('fr-FR', { 
                                  style: 'currency', 
                                  currency: 'EUR',
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0
                                })
                              }
                            />
                            <YAxis 
                              type="category"
                              dataKey="name" 
                              fontSize={12}
                              width={75}
                            />
                            <ChartTooltip 
                              content={
                                <ChartTooltipContent 
                                  formatter={(value, name) => [
                                    typeof value === 'number' 
                                      ? value.toLocaleString('fr-FR', { 
                                          style: 'currency', 
                                          currency: 'EUR' 
                                        })
                                      : 'N/A',
                                    name === 'spent' ? 'Dépensé' : 'Budget'
                                  ]}
                                />
                              }
                            />
                            <Bar dataKey="budget" fill={chartConfig.budget.color} opacity={0.5} />
                            <Bar dataKey="spent" fill={chartConfig.spent.color} />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Analyse budgétaire</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-h-80 overflow-y-auto">
                      {categoryChartData.map((category, index) => (
                        <div key={index} className="p-3 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-4 h-4 rounded-full" 
                                style={{ backgroundColor: category.color }}
                              />
                              <span className="font-medium">{category.name}</span>
                            </div>
                            <Badge variant={category.budget > 0 && category.spent > category.budget ? "destructive" : "secondary"}>
                              {category.budget > 0 ? `${category.percentage}%` : 'Pas de budget'}
                            </Badge>
                          </div>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Dépensé:</span>
                              <span className="font-medium text-red-600">
                                {category.spent.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                              </span>
                            </div>
                            {category.budget > 0 && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Budget:</span>
                                  <span className="font-medium">
                                    {category.budget.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Restant:</span>
                                  <span className={cn(
                                    "font-medium",
                                    category.remaining > 0 ? "text-green-600" : "text-red-600"
                                  )}>
                                    {category.remaining.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          {category.budget > 0 && (
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className={cn(
                                  "h-2 rounded-full transition-all",
                                  category.spent > category.budget ? "bg-red-500" : "bg-green-500"
                                )}
                                style={{ 
                                  width: `${Math.min(100, (category.spent / category.budget) * 100)}%` 
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground">Aucune dépense trouvée pour cette période</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="recurring" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Repeat className="h-5 w-5" />
                    Transactions récurrentes
                  </CardTitle>
                  <CardDescription>
                    Analyse de vos revenus et dépenses récurrents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Revenus/mois</p>
                        <p className="text-lg font-bold text-green-600">
                          {recurringData.monthlyIncome.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Dépenses/mois</p>
                        <p className="text-lg font-bold text-red-600">
                          {recurringData.monthlyExpenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">Net mensuel récurrent</p>
                      <p className={cn(
                        "text-xl font-bold",
                        recurringData.monthlyNet >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {recurringData.monthlyNet >= 0 ? "+" : ""}{recurringData.monthlyNet.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </p>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      <h4 className="text-sm font-medium">Détail des récurrences ({recurringData.activeRecurring.length})</h4>
                      {recurringData.activeRecurring.map((recurring) => (
                        <div key={recurring.id} className="flex items-center justify-between p-2 bg-background rounded border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{recurring.description}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {recurring.recurrence_type === 'weekly' ? 'Hebdo' : 
                                 recurring.recurrence_type === 'monthly' ? 'Mensuel' : 'Annuel'}
                              </Badge>
                              <span>•</span>
                              <span>Prochaine: {format(new Date(recurring.next_due_date), "dd/MM", { locale: fr })}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className={cn(
                              "text-sm font-semibold",
                              recurring.type === 'income' ? "text-green-600" : "text-red-600"
                            )}>
                              {recurring.type === 'income' ? "+" : "-"}
                              {Number(recurring.amount).toLocaleString('fr-FR', { 
                                style: 'currency', 
                                currency: 'EUR' 
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                      {recurringData.activeRecurring.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucune transaction récurrente active
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Analyse des patterns
                  </CardTitle>
                  <CardDescription>
                    Patterns de dépenses basés sur votre historique
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {spendingPatternsData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm text-muted-foreground">Moy. revenus/jour</p>
                          <p className="text-lg font-bold text-green-600">
                            {spendingPatternsData.dailyAvgIncome.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </p>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm text-muted-foreground">Moy. dépenses/jour</p>
                          <p className="text-lg font-bold text-red-600">
                            {spendingPatternsData.dailyAvgExpenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">Net quotidien moyen</p>
                        <p className={cn(
                          "text-xl font-bold",
                          spendingPatternsData.dailyNet >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {spendingPatternsData.dailyNet >= 0 ? "+" : ""}{spendingPatternsData.dailyNet.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>

                      <div className="p-3 bg-muted/50 rounded-lg">
                        <h4 className="text-sm font-medium mb-2">Projection mensuelle (patterns)</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Revenus projetés:</span>
                            <span className="font-medium text-green-600">
                              {spendingPatternsData.projectedMonthlyIncome.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Dépenses projetées:</span>
                            <span className="font-medium text-red-600">
                              {spendingPatternsData.projectedMonthlyExpenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="font-medium">Net projeté:</span>
                            <span className={cn(
                              "font-bold",
                              spendingPatternsData.projectedMonthlyNet >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {spendingPatternsData.projectedMonthlyNet >= 0 ? "+" : ""}{spendingPatternsData.projectedMonthlyNet.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <h4 className="text-sm font-medium mb-2 text-blue-900 dark:text-blue-100">Recommandations</h4>
                        <ul className="text-xs space-y-1 text-blue-800 dark:text-blue-200">
                          {spendingPatternsData.dailyNet > 0 ? (
                            <li>• Votre épargne quotidienne moyenne est positive, continuez sur cette voie !</li>
                          ) : (
                            <li>• Attention, vos dépenses dépassent vos revenus en moyenne</li>
                          )}
                          <li>• Basé sur {differenceInDays(period.to, period.from) + 1} jours d'analyse</li>
                          <li>• Les patterns peuvent varier selon les saisons et événements spéciaux</li>
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        Activez les spending patterns pour voir l'analyse
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setUseSpendingPatterns(true)}
                      >
                        Activer les patterns
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Reports;