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
      <Card>
        <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-4 pt-2 sm:pt-4">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
            <Repeat className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
            Récurrentes
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs hidden sm:block">
            Revenus et dépenses
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4 pb-2 sm:pb-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Revenus/mois</p>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(recurringData.monthlyIncome)}
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Dépenses/mois</p>
                <p className="text-lg font-bold text-red-600">
                  {formatCurrency(recurringData.monthlyExpenses)}
                </p>
              </div>
            </div>
            
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Net mensuel récurrent</p>
              <p className={cn(
                "text-xl font-bold",
                recurringData.monthlyNet >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {recurringData.monthlyNet >= 0 ? "+" : ""}{formatCurrency(recurringData.monthlyNet)}
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
                      {formatCurrency(Number(recurring.amount))}
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
        <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-4 pt-2 sm:pt-4">
          <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
            Patterns
          </CardTitle>
          <CardDescription className="text-[10px] sm:text-xs hidden sm:block">
            Analyse historique
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4 pb-2 sm:pb-4">
          {spendingPatternsData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Moy. revenus/jour</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(spendingPatternsData.dailyAvgIncome)}
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Moy. dépenses/jour</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(spendingPatternsData.dailyAvgExpenses)}
                  </p>
                </div>
              </div>
              
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Net quotidien moyen</p>
                <p className={cn(
                  "text-xl font-bold",
                  spendingPatternsData.dailyNet >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {spendingPatternsData.dailyNet >= 0 ? "+" : ""}{formatCurrency(spendingPatternsData.dailyNet)}
                </p>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg">
                <h4 className="text-sm font-medium mb-2">Projection mensuelle (patterns)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Revenus projetés:</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(spendingPatternsData.projectedMonthlyIncome)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dépenses projetées:</span>
                    <span className="font-medium text-red-600">
                      {formatCurrency(spendingPatternsData.projectedMonthlyExpenses)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium">Net projeté:</span>
                    <span className={cn(
                      "font-bold",
                      spendingPatternsData.projectedMonthlyNet >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {spendingPatternsData.projectedMonthlyNet >= 0 ? "+" : ""}{formatCurrency(spendingPatternsData.projectedMonthlyNet)}
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
  );
};