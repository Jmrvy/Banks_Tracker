import { useState, useMemo } from 'react';
import { Plus, TrendingUp, Calendar, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { NewSavingsGoalModal } from '@/components/NewSavingsGoalModal';
import { EditSavingsGoalModal } from '@/components/EditSavingsGoalModal';
import type { SavingsGoal } from '@/hooks/useSavingsGoals';
import type { ReportsPeriod } from '@/hooks/useReportsData';
import { differenceInDays, format, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SavingsGoalsTabProps {
  transactions: Transaction[];
  period: ReportsPeriod;
}

export const SavingsGoalsTab = ({ transactions, period }: SavingsGoalsTabProps) => {
  const { goals, isLoading } = useSavingsGoals();
  const { formatCurrency } = useUserPreferences();
  const { categories } = useFinancialData();
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);

  // Calculate investment statistics
  const investmentStats = useMemo(() => {
    const investmentCategory = categories.find(cat => 
      cat.name.toLowerCase() === 'investissements' || 
      cat.name.toLowerCase() === 'investissement' ||
      cat.name.toLowerCase() === 'épargne'
    );
    
    if (!investmentCategory) {
      return { total: 0, monthlyAverage: 0, monthlyData: [] };
    }

    const investmentTransactions = transactions.filter(
      t => t.type === 'expense' && t.category?.id === investmentCategory.id
    );

    const total = investmentTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Calculate monthly breakdown
    const monthlyMap = new Map<string, number>();
    investmentTransactions.forEach(t => {
      const month = format(new Date(t.value_date), 'yyyy-MM');
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + t.amount);
    });

    const monthlyData = Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const monthlyAverage = monthlyData.length > 0 ? total / monthlyData.length : 0;

    return { total, monthlyAverage, monthlyData };
  }, [transactions, categories]);

  const calculateProjection = (goal: SavingsGoal) => {
    if (!goal.target_date) return null;
    
    const today = new Date();
    const targetDate = new Date(goal.target_date);
    const daysRemaining = differenceInDays(targetDate, today);
    
    if (daysRemaining <= 0) return null;
    
    const remaining = goal.target_amount - goal.current_amount;
    const dailyRequired = remaining / daysRemaining;
    const monthlyRequired = dailyRequired * 30;
    
    return {
      daysRemaining,
      monthlyRequired,
      dailyRequired,
    };
  };

  if (isLoading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Investment Statistics Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-primary" />
                Épargne accumulée
              </h3>
              <p className="text-sm text-muted-foreground">
                Total des investissements sur {period.label}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  Total épargné
                </div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(investmentStats.total)}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-accent/5 border-accent/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Moyenne mensuelle
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(investmentStats.monthlyAverage)}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-secondary/5 border-secondary/20">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">
                  Nombre de transactions
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {transactions.filter(t => {
                    const investmentCategory = categories.find(cat => 
                      cat.name.toLowerCase() === 'investissements' || 
                      cat.name.toLowerCase() === 'investissement' ||
                      cat.name.toLowerCase() === 'épargne'
                    );
                    return t.type === 'expense' && t.category?.id === investmentCategory?.id;
                  }).length}
                </div>
              </div>
            </Card>
          </div>

          {investmentStats.monthlyData.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">Évolution mensuelle</h4>
              <div className="space-y-2">
                {investmentStats.monthlyData.slice(-6).map(({ month, amount }) => (
                  <div key={month} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground min-w-[80px]">
                      {format(new Date(month + '-01'), 'MMM yyyy', { locale: fr })}
                    </span>
                    <div className="flex-1">
                      <Progress 
                        value={(amount / Math.max(...investmentStats.monthlyData.map(d => d.amount))) * 100} 
                        className="h-2"
                      />
                    </div>
                    <span className="text-sm font-medium min-w-[100px] text-right">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Savings Goals Section */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Objectifs d'épargne</h3>
          <p className="text-sm text-muted-foreground">
            Suivez vos objectifs et leurs progressions
          </p>
        </div>
        <Button onClick={() => setIsNewModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel objectif
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">
            Aucun objectif d'épargne défini
          </p>
          <Button onClick={() => setIsNewModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Créer votre premier objectif
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => {
            const progress = (goal.current_amount / goal.target_amount) * 100;
            const projection = calculateProjection(goal);
            
            return (
              <Card
                key={goal.id}
                className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setEditingGoal(goal)}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: goal.color }}
                        />
                        <h4 className="font-semibold">{goal.name}</h4>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {goal.description}
                        </p>
                      )}
                      {goal.category && (
                        <span className="inline-block mt-2 text-xs bg-secondary px-2 py-1 rounded">
                          {goal.category}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progression</span>
                      <span className="font-medium">{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {formatCurrency(goal.current_amount)}
                      </span>
                      <span className="text-muted-foreground">
                        sur {formatCurrency(goal.target_amount)}
                      </span>
                    </div>
                  </div>

                  {goal.target_date && (
                    <div className="pt-3 border-t space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Échéance: {format(new Date(goal.target_date), 'dd MMMM yyyy', { locale: fr })}
                      </div>
                      {projection && projection.daysRemaining > 0 && (
                        <div className="text-sm space-y-1">
                          <div className="text-muted-foreground">
                            {projection.daysRemaining} jours restants
                          </div>
                          <div className="font-medium text-primary">
                            Épargne mensuelle requise: {formatCurrency(projection.monthlyRequired)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Soit {formatCurrency(projection.dailyRequired)} par jour
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewSavingsGoalModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
      />

      {editingGoal && (
        <EditSavingsGoalModal
          goal={editingGoal}
          isOpen={!!editingGoal}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </div>
  );
};