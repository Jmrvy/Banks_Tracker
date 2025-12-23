import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { calculateLoanWithFrequency, LoanCalculation } from '@/utils/loanCalculator';
import { DollarSign, TrendingUp, Calendar, Percent } from 'lucide-react';

interface LoanCalculatorProps {
  onCalculationChange?: (calculation: LoanCalculation | null, params: LoanParams) => void;
}

export interface LoanParams {
  amount: number;
  rate: number;
  duration: number;
  frequency: string;
  loanType: 'amortizable' | 'bullet';
  startDate: Date;
}

export const LoanCalculator = ({ onCalculationChange }: LoanCalculatorProps) => {
  const { formatCurrency } = useUserPreferences();
  const [params, setParams] = useState<LoanParams>({
    amount: 10000,
    rate: 3,
    duration: 24,
    frequency: 'monthly',
    loanType: 'amortizable',
    startDate: new Date()
  });
  const [calculation, setCalculation] = useState<LoanCalculation | null>(null);

  useEffect(() => {
    if (params.amount > 0 && params.duration > 0) {
      const calc = calculateLoanWithFrequency(
        params.amount,
        params.rate,
        params.duration,
        params.frequency,
        params.loanType,
        params.startDate
      );
      setCalculation(calc);
      onCalculationChange?.(calc, params);
    } else {
      setCalculation(null);
      onCalculationChange?.(null, params);
    }
  }, [params, onCalculationChange]);

  const updateParam = (key: keyof LoanParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const getFrequencyLabel = (freq: string) => {
    switch (freq) {
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trimestriel';
      case 'semi_annual': return 'Semestriel';
      case 'annual': return 'Annuel';
      default: return freq;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Simulateur de prêt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={params.loanType} onValueChange={(v) => updateParam('loanType', v as 'amortizable' | 'bullet')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="amortizable">Prêt amortissable</TabsTrigger>
              <TabsTrigger value="bullet">Prêt in fine</TabsTrigger>
            </TabsList>
            
            <TabsContent value="amortizable" className="space-y-2 mt-4">
              <p className="text-sm text-muted-foreground">
                Paiements fixes avec capital et intérêts remboursés progressivement
              </p>
            </TabsContent>
            
            <TabsContent value="bullet" className="space-y-2 mt-4">
              <p className="text-sm text-muted-foreground">
                Paiements d'intérêts uniquement, capital remboursé à la fin
              </p>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="amount">Montant du prêt</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                value={params.amount}
                onChange={(e) => updateParam('amount', parseFloat(e.target.value) || 0)}
                placeholder="10000"
              />
            </div>

            <div>
              <Label htmlFor="rate">Taux d'intérêt annuel (%)</Label>
              <Input
                id="rate"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={params.rate}
                onChange={(e) => updateParam('rate', parseFloat(e.target.value) || 0)}
                placeholder="3.0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration">Durée (mois)</Label>
              <Input
                id="duration"
                type="number"
                inputMode="numeric"
                value={params.duration}
                onChange={(e) => updateParam('duration', parseInt(e.target.value) || 0)}
                placeholder="24"
              />
            </div>

            <div>
              <Label htmlFor="frequency">Périodicité</Label>
              <Select value={params.frequency} onValueChange={(v) => updateParam('frequency', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="quarterly">Trimestriel</SelectItem>
                  <SelectItem value="semi_annual">Semestriel</SelectItem>
                  <SelectItem value="annual">Annuel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="startDate">Date de début</Label>
            <Input
              id="startDate"
              type="date"
              value={params.startDate.toISOString().split('T')[0]}
              onChange={(e) => updateParam('startDate', new Date(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {calculation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Résultats du calcul</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Paiement {getFrequencyLabel(params.frequency).toLowerCase()}
                </div>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(calculation.monthlyPayment)}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  Total intérêts
                </div>
                <p className="text-2xl font-bold text-warning">
                  {formatCurrency(calculation.totalInterest)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Capital remboursé
                </div>
                <p className="text-lg font-semibold">
                  {formatCurrency(params.amount)}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Coût total
                </div>
                <p className="text-lg font-semibold">
                  {formatCurrency(calculation.totalAmount)}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Nombre de paiements: <span className="font-semibold text-foreground">{calculation.schedule.length}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Date du dernier paiement: <span className="font-semibold text-foreground">
                  {calculation.schedule[calculation.schedule.length - 1]?.date.toLocaleDateString('fr-FR')}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
