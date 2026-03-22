import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebts } from '@/hooks/useDebts';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useAuth } from '@/contexts/AuthContext';
import { LoanCalculator, LoanParams } from '@/components/LoanCalculator';
import { AmortizationSchedule } from '@/components/AmortizationSchedule';
import { LoanCalculation } from '@/utils/loanCalculator';
import { Loader2, Calculator, FileText, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { debtSchema, validateForm } from '@/lib/validations';
import { CsvLoanImport } from '@/components/CsvLoanImport';
import { supabase } from '@/integrations/supabase/client';

interface NewDebtModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewDebtModal = ({ open, onOpenChange }: NewDebtModalProps) => {
  const { createDebt } = useDebts();
  const { accounts, categories } = useFinancialData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('calculator');
  const [calculation, setCalculation] = useState<LoanCalculation | null>(null);
  const [loanParams, setLoanParams] = useState<LoanParams | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    type: 'loan_received' as 'loan_given' | 'loan_received',
    contact_name: '',
    contact_info: '',
    notes: '',
    account_id: '',
    category_id: '',
  });

  const resetForm = () => {
    setFormData({
      description: '',
      type: 'loan_received',
      contact_name: '',
      contact_info: '',
      notes: '',
      account_id: '',
      category_id: '',
    });
    setCalculation(null);
    setLoanParams(null);
    setActiveTab('calculator');
  };

  const handleCalculationChange = (calc: LoanCalculation | null, params: LoanParams) => {
    setCalculation(calc);
    setLoanParams(params);
  };

  const createRecurringTransaction = async (debtId: string, description: string, amount: number, type: 'loan_given' | 'loan_received', frequency: string, startDate: string, endDate: string | null, accountId: string, categoryId?: string | null) => {
    if (!user) return;

    // loan_received = expense (we pay), loan_given = income (we receive)
    const transactionType = type === 'loan_received' ? 'expense' : 'income';
    const suffix = type === 'loan_received' ? 'Remboursement dette' : 'Remboursement prêt';

    const frequencyMap: Record<string, string> = {
      'monthly': 'monthly',
      'quarterly': 'quarterly',
      'semi_annual': 'monthly', // No semi_annual in recurrence_type, fallback to monthly
      'annual': 'yearly',
      'weekly': 'weekly',
    };

    const recurrenceType = frequencyMap[frequency] || 'monthly';

    const { error } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: user.id,
        description: `${description} (${suffix})`,
        amount,
        type: transactionType,
        recurrence_type: recurrenceType,
        start_date: startDate,
        next_due_date: startDate,
        end_date: endDate,
        account_id: accountId,
        category_id: categoryId || null,
        is_active: true,
      });

    if (error) {
      console.error('Error creating recurring transaction for debt:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanParams || !calculation) return;

    // Validate form data with zod schema
    const validation = validateForm(debtSchema, formData);

    if (!validation.success) {
      toast({
        title: "Erreur de validation",
        description: (validation as { success: false; error: string }).error,
        variant: "destructive",
      });
      return;
    }

    if (!formData.account_id) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner un compte de prélèvement",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const endDate = new Date(loanParams.startDate);
      endDate.setMonth(endDate.getMonth() + loanParams.duration);
      const endDateStr = endDate.toISOString().split('T')[0];
      const startDateStr = loanParams.startDate.toISOString().split('T')[0];

      const debtId = await createDebt({
        description: formData.description,
        type: formData.type,
        total_amount: loanParams.amount,
        remaining_amount: loanParams.amount,
        interest_rate: loanParams.rate,
        start_date: startDateStr,
        end_date: endDateStr,
        status: 'active',
        contact_name: formData.contact_name || null,
        contact_info: formData.contact_info || null,
        notes: formData.notes || null,
        payment_frequency: loanParams.frequency,
        payment_amount: calculation.monthlyPayment,
        loan_type: loanParams.loanType,
        category_id: formData.category_id || null
      });

      // Create recurring transaction for the debt
      if (debtId) {
        await createRecurringTransaction(
          debtId,
          formData.description,
          calculation.monthlyPayment,
          formData.type,
          loanParams.frequency,
          startDateStr,
          endDateStr,
          formData.account_id,
          formData.category_id || null,
        );
      }

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
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Nouvelle dette</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="calculator" className="gap-1 sm:gap-2 text-[11px] sm:text-sm">
              <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Calculateur</span>
              <span className="sm:hidden">Calcul</span>
            </TabsTrigger>
            <TabsTrigger value="csv-import" className="gap-1 sm:gap-2 text-[11px] sm:text-sm">
              <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Importer CSV</span>
              <span className="sm:hidden">CSV</span>
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-1 sm:gap-2 text-[11px] sm:text-sm" disabled={!calculation}>
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Détails
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1 sm:gap-2 text-[11px] sm:text-sm" disabled={!calculation}>
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Échéancier</span>
              <span className="sm:hidden">Éch.</span>
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

          <TabsContent value="csv-import" className="space-y-4 mt-4">
            <CsvLoanImport onSuccess={() => { resetForm(); onOpenChange(false); }} />
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
              </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="account_id">Compte de prélèvement *</Label>
                <Select value={formData.account_id} onValueChange={(value) => setFormData({ ...formData, account_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un compte" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} {account.bank ? `(${account.bank})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category_id">Catégorie des paiements</Label>
                <Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optionnel" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
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
                <Button type="button" variant="outline" onClick={() => setActiveTab('calculator')} className="h-9 text-xs sm:text-sm">
                  Retour
                </Button>
                <Button type="button" variant="outline" onClick={() => setActiveTab('schedule')} className="h-9 text-xs sm:text-sm">
                  Voir l'échéancier
                </Button>
                <Button type="submit" disabled={loading || !formData.account_id} className="h-9 text-xs sm:text-sm">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4 mt-4">
            {calculation && <AmortizationSchedule calculation={calculation} />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveTab('details')} className="h-9 text-xs sm:text-sm">
                Retour aux détails
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
