import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Repeat, BarChart3 } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { RecurringData, SpendingPatternsData, ReportsPeriod } from "@/hooks/useReportsData";

interface RecurringTabProps {
  recurringData: RecurringData;
  spendingPatternsData: SpendingPatternsData | null;
  period: ReportsPeriod;
  useSpendingPatterns: boolean;
  setUseSpendingPatterns: (value: boolean) => void;
}

export const RecurringTab = ({ 
  recurringData, 
  spendingPatternsData, 
  period,
  useSpendingPatterns,
  setUseSpendingPatterns 
}: RecurringTabProps) => {
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      <Card className="border-border">
        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
            <Repeat className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Récurrentes
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs">
            Revenus et dépenses automatiques
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-success/10 rounded-lg text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Revenus/mois</p>
                <p className="text-sm sm:text-base font-semibold text-success">
                  {formatCurrency(recurringData.monthlyIncome)}
                </p>
              </div>
              <div className="p-2 sm:p-2.5 bg-destructive/10 rounded-lg text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Dépenses/mois</p>
                <p className="text-sm sm:text-base font-semibold text-destructive">
                  {formatCurrency(recurringData.monthlyExpenses)}
                </p>
              </div>
            </div>
            
            <div className="p-2.5 sm:p-3 bg-primary/10 rounded-lg text-center">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Net mensuel récurrent</p>
              <p className={cn(
                "text-base sm:text-lg font-bold",
                recurringData.monthlyNet >= 0 ? "text-success" : "text-destructive"
              )}>
                {recurringData.monthlyNet >= 0 ? "+" : ""}{formatCurrency(recurringData.monthlyNet)}
              </p>
            </div>

            <div className="space-y-1.5 max-h-40 sm:max-h-48 overflow-y-auto">
              <h4 className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                Détail ({recurringData.activeRecurring.length})
              </h4>
              {recurringData.activeRecurring.map((recurring) => (
                <div key={recurring.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">{recurring.description}</p>
                    <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 py-0 h-4">
                        {recurring.recurrence_type === 'weekly' ? 'Hebdo' : 
                         recurring.recurrence_type === 'monthly' ? 'Mensuel' : 'Annuel'}
                      </Badge>
                      <span>•</span>
                      <span>{format(new Date(recurring.next_due_date), "dd/MM", { locale: fr })}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={cn(
                      "text-xs sm:text-sm font-semibold",
                      recurring.type === 'income' ? "text-success" : "text-destructive"
                    )}>
                      {recurring.type === 'income' ? "+" : "-"}
                      {formatCurrency(Number(recurring.amount))}
                    </p>
                  </div>
                </div>
              ))}
              {recurringData.activeRecurring.length === 0 && (
                <p className="text-[10px] sm:text-xs text-muted-foreground text-center py-3">
                  Aucune transaction récurrente active
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Patterns
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs">
            Analyse historique
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          {spendingPatternsData ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2 sm:p-2.5 bg-success/10 rounded-lg text-center">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Moy. revenus/jour</p>
                  <p className="text-sm sm:text-base font-semibold text-success">
                    {formatCurrency(spendingPatternsData.dailyAvgIncome)}
                  </p>
                </div>
                <div className="p-2 sm:p-2.5 bg-destructive/10 rounded-lg text-center">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Moy. dépenses/jour</p>
                  <p className="text-sm sm:text-base font-semibold text-destructive">
                    {formatCurrency(spendingPatternsData.dailyAvgExpenses)}
                  </p>
                </div>
              </div>
              
              <div className="p-2.5 sm:p-3 bg-primary/10 rounded-lg text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Net quotidien moyen</p>
                <p className={cn(
                  "text-base sm:text-lg font-bold",
                  spendingPatternsData.dailyNet >= 0 ? "text-success" : "text-destructive"
                )}>
                  {spendingPatternsData.dailyNet >= 0 ? "+" : ""}{formatCurrency(spendingPatternsData.dailyNet)}
                </p>
              </div>

              <div className="p-2.5 sm:p-3 bg-muted/30 rounded-lg">
                <h4 className="text-[10px] sm:text-xs font-medium mb-2">Projection mensuelle</h4>
                <div className="space-y-1.5 text-[10px] sm:text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Revenus projetés:</span>
                    <span className="font-medium text-success">
                      {formatCurrency(spendingPatternsData.projectedMonthlyIncome)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dépenses projetées:</span>
                    <span className="font-medium text-destructive">
                      {formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="font-medium">Net projeté:</span>
                    <span className={cn(
                      "font-bold",
                      spendingPatternsData.projectedMonthlyNet >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {spendingPatternsData.projectedMonthlyNet >= 0 ? "+" : ""}{formatCurrency(spendingPatternsData.projectedMonthlyNet)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-2 sm:p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                <h4 className="text-[10px] sm:text-xs font-medium mb-1.5">Recommandations</h4>
                <ul className="text-[9px] sm:text-[10px] space-y-0.5 text-muted-foreground">
                  {spendingPatternsData.dailyNet > 0 ? (
                    <li>• Épargne quotidienne positive, continuez !</li>
                  ) : (
                    <li>• Attention, dépenses supérieures aux revenus</li>
                  )}
                  <li>• Basé sur {differenceInDays(period.to, period.from) + 1} jours d'analyse</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-2">
                Activez les patterns pour voir l'analyse
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] sm:text-xs"
                onClick={() => setUseSpendingPatterns(true)}
              >
                Activer les patterns
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
