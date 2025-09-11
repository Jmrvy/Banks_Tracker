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
import { useFinancialData } from "@/hooks/useFinancialData";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, ArrowLeft, TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line } from "recharts";
import { useNavigate } from "react-router-dom";

const Reports = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { transactions, categories, accounts, loading } = useFinancialData();
  const [periodType, setPeriodType] = useState<"month" | "year" | "custom">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });

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

    const netPeriodBalance = income - expenses;

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

  // Données pour les graphiques
  const categoryData = useMemo(() => {
    const expensesByCategory = filteredTransactions
      .filter(t => t.type === 'expense' && t.category)
      .reduce((acc, t) => {
        const categoryName = t.category?.name || 'Non catégorisé';
        const color = t.category?.color || '#6b7280';
        acc[categoryName] = (acc[categoryName] || 0) + Number(t.amount);
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(expensesByCategory)
      .map(([name, amount]) => ({
        name,
        amount,
        color: categories.find(c => c.name === name)?.color || '#6b7280'
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, categories]);

  const monthlyData = useMemo(() => {
    if (periodType !== 'year') return [];

    const months = [];
    let cumulativeBalance = stats.initialBalance;
    
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(selectedDate.getFullYear(), i, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      const monthTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.transaction_date);
        return isWithinInterval(transactionDate, { start: monthStart, end: monthEnd });
      });

      const monthIncome = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const monthExpenses = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const monthBalance = monthIncome - monthExpenses;
      cumulativeBalance += monthBalance;

      months.push({
        month: format(monthDate, "MMM", { locale: fr }),
        revenus: monthIncome,
        dépenses: monthExpenses,
        solde: cumulativeBalance,
        variation: monthBalance
      });
    }
    
    return months;
  }, [transactions, selectedDate, periodType, stats.initialBalance]);

  // Données pour l'évolution des soldes jour par jour dans la période
  const balanceEvolutionData = useMemo(() => {
    const sortedTransactions = filteredTransactions
      .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    
    const dailyData = [];
    let runningBalance = stats.initialBalance;
    
    // Commencer par le solde initial
    dailyData.push({
      date: format(period.from, "dd/MM", { locale: fr }),
      solde: runningBalance,
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
        return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
      }, 0);
      
      runningBalance += dayBalance;
      
      dailyData.push({
        date: format(dateObj, "dd/MM", { locale: fr }),
        solde: runningBalance,
        dateObj: dateObj
      });
    });

    return dailyData;
  }, [filteredTransactions, stats.initialBalance, period]);

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
    revenus: { 
      label: "Revenus", 
      color: "hsl(142 76% 36%)" // Vert pour les revenus
    },
    dépenses: { 
      label: "Dépenses", 
      color: "hsl(346 87% 43%)" // Rouge pour les dépenses
    },
    solde: {
      label: "Solde",
      color: "hsl(217 91% 60%)" // Bleu pour le solde
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/")}
              className="rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Récapitulatifs Financiers</h1>
              <p className="text-muted-foreground">
                Analyse détaillée de vos finances • {period.label}
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
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type de période</label>
                <Select value={periodType} onValueChange={(value: "month" | "year" | "custom") => setPeriodType(value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Mois</SelectItem>
                    <SelectItem value="year">Année</SelectItem>
                    <SelectItem value="custom">Période personnalisée</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {periodType === "month" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sélectionner le mois</label>
                  <MonthPicker
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    placeholder="Choisir un mois"
                  />
                </div>
              )}

              {periodType === "year" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sélectionner l'année</label>
                  <YearPicker
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    placeholder="Choisir une année"
                  />
                </div>
              )}

              {periodType === "custom" && (
                <div className="flex gap-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date de début</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-[150px] justify-start text-left">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(dateRange.from, "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
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
                    <label className="text-sm font-medium">Date de fin</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-[150px] justify-start text-left">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(dateRange.to, "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateRange.to}
                          onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const newDate = periodType === "month" ? subMonths(selectedDate, 1) : subYears(selectedDate, 1);
                    setSelectedDate(newDate);
                  }}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const newDate = periodType === "month" ? subMonths(selectedDate, -1) : subYears(selectedDate, -1);
                    setSelectedDate(newDate);
                  }}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistiques globales */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenus Période</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                +{stats.income.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredTransactions.filter(t => t.type === 'income').length} transaction(s)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dépenses Période</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                -{stats.expenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredTransactions.filter(t => t.type === 'expense').length} transaction(s)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Solde Initial</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", stats.initialBalance >= 0 ? "text-green-500" : "text-red-500")}>
                {stats.initialBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                Au début de la période
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Solde Final</CardTitle>
              <Target className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", stats.finalBalance >= 0 ? "text-green-500" : "text-red-500")}>
                {stats.finalBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                Évolution: {stats.netPeriodBalance >= 0 ? '+' : ''}{stats.netPeriodBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comptes</CardTitle>
              <Wallet className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {accounts.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Solde actuel total: {accounts.reduce((sum, acc) => sum + Number(acc.balance), 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Graphiques et analyses */}
        <Tabs defaultValue="evolution" className="space-y-6">
          <TabsList>
            <TabsTrigger value="evolution">Évolution</TabsTrigger>
            <TabsTrigger value="categories">Par Catégories</TabsTrigger>
            <TabsTrigger value="details">Détails</TabsTrigger>
          </TabsList>

          <TabsContent value="evolution" className="space-y-6">
            {/* Évolution des soldes - Area Chart */}
            {balanceEvolutionData.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Évolution du solde</CardTitle>
                  <CardDescription>
                    Évolution du solde total pour {period.label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart 
                        data={balanceEvolutionData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient id="soldeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartConfig.solde.color} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={chartConfig.solde.color} stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis 
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => `${(value/1000).toFixed(0)}k€`}
                        />
                        <ChartTooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const value = payload[0].value;
                              return (
                                <div className="rounded-lg border bg-background p-3 shadow-md">
                                  <p className="text-sm font-medium">{label}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: chartConfig.solde.color }}
                                    />
                                    <span className="font-semibold">
                                      {Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone"
                          dataKey="solde" 
                          stroke={chartConfig.solde.color}
                          strokeWidth={3}
                          fill="url(#soldeGradient)"
                          dot={{ r: 4, fill: chartConfig.solde.color }}
                          activeDot={{ r: 6, fill: chartConfig.solde.color, strokeWidth: 2, stroke: '#fff' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {periodType === 'year' && monthlyData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Évolution mensuelle détaillée</CardTitle>
                  <CardDescription>Revenus, dépenses et solde par mois pour {format(selectedDate, "yyyy")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart 
                        data={monthlyData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => `${(value/1000).toFixed(0)}k€`}
                        />
                        <ChartTooltip 
                          content={<ChartTooltipContent 
                            formatter={(value, name) => [
                              `${Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`,
                              name === 'solde' ? 'Solde fin de mois' : name
                            ]}
                          />} 
                        />
                        <Bar 
                          dataKey="revenus" 
                          fill={chartConfig.revenus.color}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        />
                        <Bar 
                          dataKey="dépenses" 
                          fill={chartConfig.dépenses.color}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        />
                        <Line 
                          type="monotone"
                          dataKey="solde" 
                          stroke={chartConfig.solde.color}
                          strokeWidth={3}
                          dot={{ r: 4, fill: chartConfig.solde.color }}
                          activeDot={{ r: 6, fill: chartConfig.solde.color }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Graphique d'évolution des soldes dans le temps */}
            <Card>
              <CardHeader>
                <CardTitle>Évolution des soldes</CardTitle>
                <CardDescription>
                  Solde initial vs final pour la période sélectionnée
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Solde Initial</p>
                        <p className={cn("text-xl font-bold", stats.initialBalance >= 0 ? "text-green-600" : "text-red-600")}>
                          {stats.initialBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center py-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Evolution:</span>
                        <span className={cn("font-semibold", stats.netPeriodBalance >= 0 ? "text-green-600" : "text-red-600")}>
                          {stats.netPeriodBalance >= 0 ? '+' : ''}{stats.netPeriodBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Solde Final</p>
                        <p className={cn("text-xl font-bold", stats.finalBalance >= 0 ? "text-green-600" : "text-red-600")}>
                          {stats.finalBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-semibold">Détail par compte</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {accounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between p-3 rounded border bg-card">
                          <div>
                            <p className="font-medium text-sm">{account.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{account.bank}</p>
                          </div>
                          <div className="text-right">
                            <p className={cn("font-semibold text-sm", Number(account.balance) >= 0 ? "text-green-600" : "text-red-600")}>
                              {Number(account.balance).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            {categoryData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Dépenses par catégorie</CardTitle>
                  <CardDescription>Répartition des dépenses pour {period.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="h-[350px]">
                      <ChartContainer 
                        config={Object.fromEntries(
                          categoryData.map(cat => [
                            cat.name.toLowerCase().replace(/\s+/g, '_'), 
                            { label: cat.name, color: cat.color }
                          ])
                        )}
                        className="h-full"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={120}
                              paddingAngle={2}
                              dataKey="amount"
                            >
                              {categoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <ChartTooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border bg-background p-3 shadow-md">
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-3 h-3 rounded-full" 
                                          style={{ backgroundColor: data.color }}
                                        />
                                        <span className="font-medium">{data.name}</span>
                                      </div>
                                      <div className="mt-1">
                                        <p className="font-semibold">
                                          {data.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          {((data.amount / stats.expenses) * 100).toFixed(1)}% du total
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </div>
                    
                    <div className="space-y-3 max-h-[350px] overflow-y-auto">
                      <div className="sticky top-0 bg-background pb-2">
                        <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                          Détail des catégories
                        </h4>
                      </div>
                      {categoryData.map((category, index) => {
                        const percentage = ((category.amount / stats.expenses) * 100);
                        return (
                          <div key={category.name} className="group flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-4 h-4 rounded-full shadow-sm"
                                style={{ backgroundColor: category.color }}
                              />
                              <div>
                                <span className="font-medium text-sm">{category.name}</span>
                                <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                                  <div 
                                    className="h-1.5 rounded-full transition-all duration-300"
                                    style={{ 
                                      backgroundColor: category.color,
                                      width: `${percentage}%`
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-sm">
                                {category.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {percentage.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {categoryData.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <TrendingDown className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-2">Aucune dépense trouvée</h3>
                  <p className="text-muted-foreground text-sm">Il n'y a aucune dépense pour cette période</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Détail des transactions</CardTitle>
                <CardDescription>Toutes les transactions pour {period.label}</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredTransactions.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredTransactions
                      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
                      .map((transaction) => (
                        <div key={transaction.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              {transaction.type === 'income' && (
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                  <TrendingUp className="w-4 h-4 text-green-600" />
                                </div>
                              )}
                              {transaction.type === 'expense' && (
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                  <TrendingDown className="w-4 h-4 text-red-600" />
                                </div>
                              )}
                              {transaction.type === 'transfer' && (
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                  <ArrowLeft className="w-4 h-4 text-blue-600" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{transaction.description}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{format(new Date(transaction.transaction_date), "dd/MM/yyyy")}</span>
                                <span>•</span>
                                <span>{transaction.account.name}</span>
                                {transaction.category && (
                                  <>
                                    <span>•</span>
                                    <Badge 
                                      variant="outline" 
                                      className="text-xs"
                                      style={{ 
                                        borderColor: transaction.category.color,
                                        color: transaction.category.color 
                                      }}
                                    >
                                      {transaction.category.name}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn("font-bold text-sm", 
                              transaction.type === 'income' ? "text-green-600" : "text-red-600"
                            )}>
                              {transaction.type === 'income' ? '+' : '-'}
                              {Number(transaction.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </p>
                            {transaction.transfer_fee && Number(transaction.transfer_fee) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Frais: {Number(transaction.transfer_fee).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Wallet className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">Aucune transaction trouvée</h3>
                    <p className="text-muted-foreground text-sm">Il n'y a aucune transaction pour cette période</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Reports;