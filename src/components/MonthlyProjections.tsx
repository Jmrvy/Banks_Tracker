import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

export const MonthlyProjections = () => {
  const currentSpending = 2245;
  const projectedSpending = 2680;
  const monthlyBudget = 2450;
  const daysRemaining = 12;
  const daysInMonth = 31;
  const projectionTrend = projectedSpending - monthlyBudget;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projections Mensuelles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current vs Projected */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Dépensé à ce jour</span>
            <span className="font-semibold">
              {currentSpending.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Projection fin de mois</span>
            <div className="flex items-center space-x-2">
              <span className="font-semibold">
                {projectedSpending.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
              {projectionTrend > 0 ? (
                <Badge variant="destructive">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  +{projectionTrend.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </Badge>
              ) : (
                <Badge variant="default">
                  <TrendingDown className="w-3 h-3 mr-1" />
                  {Math.abs(projectionTrend).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Budget mensuel</span>
            <span className="font-semibold">
              {monthlyBudget.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{daysInMonth - daysRemaining} jours écoulés</span>
            <span>{daysRemaining} jours restants</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((daysInMonth - daysRemaining) / daysInMonth) * 100}%` }}
            />
          </div>
        </div>

        {/* Alert if over budget */}
        {projectionTrend > 0 && (
          <div className="flex items-center space-x-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Attention: Dépassement prévu</p>
              <p className="text-xs text-muted-foreground">
                Réduisez vos dépenses de {projectionTrend.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} pour respecter le budget
              </p>
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Recommandations</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Budget journalier recommandé: {((monthlyBudget - currentSpending) / daysRemaining).toFixed(0)}€</li>
            <li>• Catégorie à surveiller: Loisirs (+20€ vs budget)</li>
            <li>• Économie potentielle: Transport (-15€ possible)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};