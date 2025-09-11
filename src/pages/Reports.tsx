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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
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

  // Calculs des statistiques
  const stats = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const balance = income - expenses;

    return { income, expenses, balance };
  }, [filteredTransactions]);

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

      months.push({
        month: format(monthDate, "MMM", { locale: fr }),
        revenus: monthIncome,
        dépenses: monthExpenses
      });
    }
    
    return months;
  }, [transactions, selectedDate, periodType]);

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
    revenus: { label: "Revenus", color: "hsl(var(--chart-1))" },
    dépenses: { label: "Dépenses", color: "hsl(var(--chart-2))" }
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenus</CardTitle>
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
              <CardTitle className="text-sm font-medium">Dépenses</CardTitle>
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
              <CardTitle className="text-sm font-medium">Solde Net</CardTitle>
              <Wallet className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", stats.balance >= 0 ? "text-green-500" : "text-red-500")}>
                {stats.balance >= 0 ? '+' : ''}{stats.balance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredTransactions.length} transaction(s) au total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comptes Actifs</CardTitle>
              <Target className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {accounts.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Solde total: {accounts.reduce((sum, acc) => sum + Number(acc.balance), 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
            {periodType === 'year' && monthlyData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Évolution mensuelle</CardTitle>
                  <CardDescription>Revenus et dépenses par mois pour {format(selectedDate, "yyyy")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="revenus" fill="var(--color-revenus)" />
                        <Bar dataKey="dépenses" fill="var(--color-dépenses)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            {categoryData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Dépenses par catégorie</CardTitle>
                  <CardDescription>Répartition des dépenses pour {period.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="amount"
                            label={(entry) => `${entry.name}: ${entry.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`}
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      {categoryData.map((category, index) => (
                        <div key={category.name} className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="font-medium">{category.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">
                              {category.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {((category.amount / stats.expenses) * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transactions de la période</CardTitle>
                <CardDescription>{filteredTransactions.length} transaction(s) • {period.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredTransactions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Aucune transaction trouvée pour cette période.
                    </p>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            transaction.type === 'income' ? "bg-green-500" : "bg-red-500"
                          )} />
                          <div>
                            <div className="font-medium">{transaction.description}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              <span>{transaction.account.name}</span>
                              {transaction.category && (
                                <>
                                  <span>•</span>
                                  <Badge variant="secondary" style={{ backgroundColor: `${transaction.category.color}20`, color: transaction.category.color }}>
                                    {transaction.category.name}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn(
                            "font-bold",
                            transaction.type === 'income' ? "text-green-500" : "text-red-500"
                          )}>
                            {transaction.type === 'income' ? '+' : '-'}
                            {Number(transaction.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(transaction.transaction_date), "dd/MM/yyyy", { locale: fr })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Reports;