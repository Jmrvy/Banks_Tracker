import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { NewSavingsGoalModal } from '@/components/NewSavingsGoalModal';
import { EditSavingsGoalModal } from '@/components/EditSavingsGoalModal';
import type { SavingsGoal } from '@/hooks/useSavingsGoals';
import { differenceInDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const SavingsGoalsTab = () => {
  const { goals, isLoading } = useSavingsGoals();
  const { formatCurrency } = useUserPreferences();
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);

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