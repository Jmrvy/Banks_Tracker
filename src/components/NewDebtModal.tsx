import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebts } from '@/hooks/useDebts';
import { LoanCalculator, LoanParams } from '@/components/LoanCalculator';
import { AmortizationSchedule } from '@/components/AmortizationSchedule';
import { LoanCalculation } from '@/utils/loanCalculator';
import { Loader2, Calculator, FileText } from 'lucide-react';

interface NewDebtModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewDebtModal = ({ open, onOpenChange }: NewDebtModalProps) => {
  const { createDebt } = useDebts();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('calculator');
  const [calculation, setCalculation] = useState<LoanCalculation | null>(null);
  const [loanParams, setLoanParams] = useState<LoanParams | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    type: 'loan_received' as 'loan_given' | 'loan_received' | 'credit',
    contact_name: '',
    contact_info: '',
    notes: ''
  });

  const resetForm = () => {
    setFormData({
      description: '',
      type: 'loan_received',
      contact_name: '',
      contact_info: '',
      notes: ''
    });
    setCalculation(null);
    setLoanParams(null);
    setActiveTab('calculator');
  };

  const handleCalculationChange = (calc: LoanCalculation | null, params: LoanParams) => {
    setCalculation(calc);
    setLoanParams(params);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanParams || !calculation) return;

    setLoading(true);

    try {
      const endDate = new Date(loanParams.startDate);
      endDate.setMonth(endDate.getMonth() + loanParams.duration);

      await createDebt({
        description: formData.description,
        type: formData.type,
        total_amount: loanParams.amount,
        remaining_amount: loanParams.amount,
        interest_rate: loanParams.rate,
        start_date: loanParams.startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'active',
        contact_name: formData.contact_name || null,
        contact_info: formData.contact_info || null,
        notes: formData.notes || null,
        payment_frequency: loanParams.frequency,
        payment_amount: calculation.monthlyPayment,
        loan_type: loanParams.loanType
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating debt:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle dette</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="calculator" className="gap-2">
              <Calculator className="h-4 w-4" />
              Calculateur
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-2" disabled={!calculation}>
              <FileText className="h-4 w-4" />
              Détails
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-2" disabled={!calculation}>
              <FileText className="h-4 w-4" />
              Échéancier
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="space-y-4 mt-4">
            <LoanCalculator onCalculationChange={handleCalculationChange} />
            {calculation && (
              <Button 
                onClick={() => setActiveTab('details')} 
                className="w-full"
              >
                Continuer vers les détails
              </Button>
            )}
          </TabsContent>

          <TabsContent value="details" className="space-y-4 mt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Prêt immobilier"
                  required
                />
              </div>

              <div>
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan_received">Prêt contracté</SelectItem>
                    <SelectItem value="loan_given">Prêt accordé</SelectItem>
                    <SelectItem value="credit">Crédit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact_name">Contact</Label>
                  <Input
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="Nom du contact"
                  />
                </div>

                <div>
                  <Label htmlFor="contact_info">Info contact</Label>
                  <Input
                    id="contact_info"
                    value={formData.contact_info}
                    onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                    placeholder="Email ou téléphone"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes supplémentaires..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setActiveTab('calculator')}>
                  Retour
                </Button>
                <Button type="button" variant="outline" onClick={() => setActiveTab('schedule')}>
                  Voir l'échéancier
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4 mt-4">
            {calculation && <AmortizationSchedule calculation={calculation} />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveTab('details')}>
                Retour aux détails
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
