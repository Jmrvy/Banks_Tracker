import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments } from '@/hooks/useInstallmentPayments';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Badge } from '@/components/ui/badge';
import { Calculator, ListChecks, Pencil, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { addWeeks, addMonths, format } from 'date-fns';
import { roundCurrency, subtractCurrency } from '@/lib/currency';

type CalculationMode = 'auto_count' | 'auto_amount' | 'manual';

interface ManualInstallment {
  amount: string;
  date: Date;
}

interface NewInstallmentPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getNextDate = (current: Date, frequency: string): Date => {
  switch (frequency) {
    case 'weekly': return addWeeks(current, 1);
    case 'quarterly': return addMonths(current, 3);
    default: return addMonths(current, 1);
  }
};

export const NewInstallmentPaymentModal = ({ open, onOpenChange }: NewInstallmentPaymentModalProps) => {
  const { toast } = useToast();
  const { createInstallmentPayment } = useInstallmentPayments();
  const { accounts, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const [step, setStep] = useState<1 | 2>(1);
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('auto_count');
  const [formData, setFormData] = useState({
    description: '',
    total_amount: '',
    installment_amount: '',
    num_installments: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly',
    start_date: new Date(),
    account_id: '',
    category_id: '',
    payment_type: 'payment' as 'reimbursement' | 'payment',
  });
  const [manualInstallments, setManualInstallments] = useState<ManualInstallment[]>([]);
  const [manualNumInput, setManualNumInput] = useState('');
  const [manualInitialized, setManualInitialized] = useState(false);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setFormData({
      description: '',
      total_amount: '',
      installment_amount: '',
      num_installments: '',
      frequency: 'monthly',
      start_date: new Date(),
      account_id: '',
      category_id: '',
      payment_type: 'payment',
    });
    setStep(1);
    setCalculationMode('auto_count');
    setManualInstallments([]);
    setManualNumInput('');
    setManualInitialized(false);
  };

  // Manual mode: initialize installments
  const initializeManualInstallments = () => {
    const count = parseInt(manualNumInput) || 0;
    const total = parseFloat(formData.total_amount) || 0;
    if (count <= 0 || count > 120 || total <= 0) return;

    const baseAmount = roundCurrency(total / count);
    const installments: ManualInstallment[] = [];
    let date = formData.start_date;
    let remaining = total;

    for (let i = 0; i < count; i++) {
      const isLast = i === count - 1;
      const amount = isLast ? roundCurrency(remaining) : Math.min(baseAmount, roundCurrency(remaining));
      installments.push({
        amount: amount.toString(),
        date: new Date(date),
      });
      remaining = subtractCurrency(remaining, amount);
      date = getNextDate(date, formData.frequency);
    }

    setManualInstallments(installments);
    setManualInitialized(true);
  };

  const addManualInstallment = () => {
    const lastDate = manualInstallments.length > 0
      ? manualInstallments[manualInstallments.length - 1].date
      : formData.start_date;
    setManualInstallments([
      ...manualInstallments,
      { amount: '', date: getNextDate(lastDate, formData.frequency) },
    ]);
  };

  const removeManualInstallment = (index: number) => {
    setManualInstallments(manualInstallments.filter((_, i) => i !== index));
  };

  const updateManualInstallment = (index: number, field: 'amount' | 'date', value: string | Date) => {
    setManualInstallments(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  // Manual mode totals
  const manualTotal = useMemo(() => {
    return roundCurrency(manualInstallments.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0));
  }, [manualInstallments]);

  const totalAmount = parseFloat(formData.total_amount) || 0;
  const manualDifference = roundCurrency(totalAmount - manualTotal);
  const manualIsValid = manualInstallments.length > 0 && Math.abs(manualDifference) < 0.01 && manualInstallments.every(i => parseFloat(i.amount) > 0);

  // Auto-calculated values based on mode
  const computed = useMemo(() => {
    const total = parseFloat(formData.total_amount) || 0;
    const installment = parseFloat(formData.installment_amount) || 0;
    const count = parseInt(formData.num_installments) || 0;

    if (calculationMode === 'auto_count' && total > 0 && count > 0) {
      return {
        installment_amount: roundCurrency(total / count),
        num_installments: count,
        valid: true,
      };
    }
    if (calculationMode === 'auto_amount' && total > 0 && installment > 0) {
      return {
        installment_amount: installment,
        num_installments: Math.ceil(total / installment),
        valid: true,
      };
    }
    if (calculationMode === 'manual') {
      return {
        installment_amount: manualInstallments.length > 0 ? parseFloat(manualInstallments[0].amount) || 0 : 0,
        num_installments: manualInstallments.length,
        valid: manualIsValid,
      };
    }
    return { installment_amount: 0, num_installments: 0, valid: false };
  }, [formData.total_amount, formData.installment_amount, formData.num_installments, calculationMode, manualInstallments, manualIsValid]);

  // Schedule preview for auto modes
  const schedulePreview = useMemo(() => {
    if (calculationMode === 'manual') {
      return manualInstallments.map((item, i) => ({
        date: item.date,
        amount: parseFloat(item.amount) || 0,
        index: i + 1,
      }));
    }
    if (!computed.valid || computed.num_installments <= 0) return [];
    const items: { date: Date; amount: number; index: number }[] = [];
    let date = formData.start_date;
    const total = parseFloat(formData.total_amount) || 0;
    let remaining = total;

    for (let i = 0; i < Math.min(computed.num_installments, 60); i++) {
      const amount = Math.min(computed.installment_amount, remaining);
      items.push({ date: new Date(date), amount: roundCurrency(amount), index: i + 1 });
      remaining = subtractCurrency(remaining, amount);
      date = getNextDate(date, formData.frequency);
    }
    return items;
  }, [computed, formData.start_date, formData.frequency, formData.total_amount, calculationMode, manualInstallments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.total_amount || !computed.valid || !formData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    if (calculationMode === 'manual' && !manualIsValid) {
      toast({
        title: "Échéancier invalide",
        description: "Le total des échéances doit être égal au montant total.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const installmentAmount = calculationMode === 'manual'
      ? parseFloat(manualInstallments[0]?.amount || '0')
      : computed.installment_amount;

    const startDate = calculationMode === 'manual'
      ? manualInstallments[0]?.date || formData.start_date
      : formData.start_date;

    const { error } = await createInstallmentPayment({
      description: formData.description,
      total_amount: parseFloat(formData.total_amount),
      installment_amount: installmentAmount,
      frequency: formData.frequency,
      start_date: format(startDate, 'yyyy-MM-dd'),
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      payment_type: formData.payment_type,
    });

    if (error) {
      toast({
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Paiement créé",
        description: "Le paiement en plusieurs fois a été créé avec succès.",
      });
      resetForm();
      onOpenChange(false);
    }

    setLoading(false);
  };

  const frequencyLabel = (f: string) => {
    switch (f) {
      case 'weekly': return 'semaine';
      case 'quarterly': return 'trimestre';
      default: return 'mois';
    }
  };

  const canProceedToStep2 = () => {
    if (!formData.description || !formData.total_amount || !formData.account_id) return false;
    if (calculationMode === 'manual') return manualIsValid;
    return computed.valid;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="w-[95vw] max-w-lg sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Nouveau Paiement Échelonné</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="flex-1 overflow-y-auto px-4 pb-2 sm:px-6 space-y-3 sm:space-y-4">
            {/* Payment Type */}
            <div className="space-y-2">
              <Label>Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={formData.payment_type === 'payment' ? 'default' : 'outline'}
                  onClick={() => setFormData({ ...formData, payment_type: 'payment' })}
                  className="w-full text-xs sm:text-sm"
                  size="sm"
                >
                  💳 Paiement
                </Button>
                <Button
                  type="button"
                  variant={formData.payment_type === 'reimbursement' ? 'default' : 'outline'}
                  onClick={() => setFormData({ ...formData, payment_type: 'reimbursement' })}
                  className="w-full text-xs sm:text-sm"
                  size="sm"
                >
                  💰 Remboursement
                </Button>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea
                placeholder={formData.payment_type === 'payment'
                  ? "Ex: Achat ordinateur portable via Klarna"
                  : "Ex: Abonnement Netflix avancé pour coloc"
                }
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Calculation Mode */}
            <div className="space-y-2">
              <Label>Mode de calcul *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={calculationMode === 'auto_count' ? 'default' : 'outline'}
                  onClick={() => { setCalculationMode('auto_count'); setManualInitialized(false); }}
                  className="w-full text-xs justify-start gap-1.5"
                  size="sm"
                >
                  <Calculator className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Nb d'échéances</span>
                </Button>
                <Button
                  type="button"
                  variant={calculationMode === 'auto_amount' ? 'default' : 'outline'}
                  onClick={() => { setCalculationMode('auto_amount'); setManualInitialized(false); }}
                  className="w-full text-xs justify-start gap-1.5"
                  size="sm"
                >
                  <Calculator className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Montant / échéance</span>
                </Button>
                <Button
                  type="button"
                  variant={calculationMode === 'manual' ? 'default' : 'outline'}
                  onClick={() => setCalculationMode('manual')}
                  className="w-full text-xs justify-start gap-1.5"
                  size="sm"
                >
                  <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Personnalisé</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {calculationMode === 'auto_count' && "Entrez le montant total et le nombre d'échéances, le montant par échéance sera calculé automatiquement."}
                {calculationMode === 'auto_amount' && "Entrez le montant total et le montant par échéance, le nombre d'échéances sera calculé automatiquement."}
                {calculationMode === 'manual' && "Définissez chaque échéance individuellement avec un montant personnalisé par échéance."}
              </p>
            </div>

            {/* Amounts */}
            <div className="space-y-1.5">
              <Label>Montant Total *</Label>
              <AmountInput
                placeholder="0.00"
                value={formData.total_amount}
                onChange={(value) => {
                  setFormData({ ...formData, total_amount: value });
                  if (calculationMode === 'manual') setManualInitialized(false);
                }}
                required
              />
            </div>

            {calculationMode === 'auto_count' ? (
              <div className="space-y-1.5">
                <Label>Nombre d'échéances *</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="120"
                  placeholder="Ex: 4"
                  value={formData.num_installments}
                  onChange={(e) => setFormData({ ...formData, num_installments: e.target.value })}
                />
                {computed.valid && (
                  <p className="text-xs text-primary font-medium">
                    → {formatCurrency(computed.installment_amount)} / {frequencyLabel(formData.frequency)}
                  </p>
                )}
              </div>
            ) : calculationMode === 'auto_amount' ? (
              <div className="space-y-1.5">
                <Label>Montant par échéance *</Label>
                <AmountInput
                  placeholder="0.00"
                  value={formData.installment_amount}
                  onChange={(value) => setFormData({ ...formData, installment_amount: value })}
                  required
                />
                {computed.valid && (
                  <p className="text-xs text-primary font-medium">
                    → {computed.num_installments} échéance{computed.num_installments > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ) : null}

            {/* Frequency + Start Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fréquence *</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: 'weekly' | 'monthly' | 'quarterly') => {
                    setFormData({ ...formData, frequency: value });
                    if (calculationMode === 'manual') setManualInitialized(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuel</SelectItem>
                    <SelectItem value="quarterly">Trimestriel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Date de début *</Label>
                <DatePicker
                  date={formData.start_date}
                  onDateChange={(d) => {
                    if (d) {
                      setFormData({ ...formData, start_date: d });
                      if (calculationMode === 'manual') setManualInitialized(false);
                    }
                  }}
                  placeholder="Choisir une date"
                />
              </div>
            </div>

            {/* Manual mode: installment editor */}
            {calculationMode === 'manual' && (
              <div className="space-y-3">
                {!manualInitialized ? (
                  <div className="space-y-3 p-3 rounded-lg border border-dashed border-border">
                    <Label className="text-sm">Nombre d'échéances à créer</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="120"
                        placeholder="Ex: 4"
                        value={manualNumInput}
                        onChange={(e) => setManualNumInput(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={initializeManualInstallments}
                        disabled={!manualNumInput || parseInt(manualNumInput) <= 0 || !formData.total_amount}
                      >
                        Générer
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Les montants seront pré-remplis équitablement, vous pourrez ensuite les ajuster individuellement.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Échéances personnalisées</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addManualInstallment}
                        className="h-7 text-xs gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Ajouter
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                      {manualInstallments.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                          <span className="text-xs text-muted-foreground w-6 text-center flex-shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <DatePicker
                              date={item.date}
                              onDateChange={(d) => d && updateManualInstallment(index, 'date', d)}
                              placeholder="Date"
                            />
                          </div>
                          <div className="w-28 flex-shrink-0">
                            <AmountInput
                              placeholder="0.00"
                              value={item.amount}
                              onChange={(value) => updateManualInstallment(index, 'amount', value)}
                            />
                          </div>
                          {manualInstallments.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeManualInstallment(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Validation summary */}
                    <div className={`flex items-center justify-between p-2.5 rounded-lg border text-sm ${
                      manualIsValid
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}>
                      <div className="flex items-center gap-2">
                        {manualIsValid ? (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium">
                          Total échéances: {formatCurrency(manualTotal)}
                        </span>
                      </div>
                      <div className="text-xs">
                        {manualIsValid ? (
                          <span>✓ Correspond au total</span>
                        ) : (
                          <span>
                            {manualDifference > 0
                              ? `Manque ${formatCurrency(manualDifference)}`
                              : `Excès de ${formatCurrency(Math.abs(manualDifference))}`
                            }
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => { setManualInitialized(false); setManualInstallments([]); }}
                    >
                      Réinitialiser les échéances
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Account + Category */}
            <div className="space-y-1.5">
              <Label>Compte source *</Label>
              <Select
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un compte" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
              >
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
          </div>
        ) : (
          /* Step 2: Schedule Preview */
          <div className="flex-1 overflow-y-auto px-4 pb-2 sm:px-6 space-y-3">
            {/* Summary */}
            <div className="p-3 rounded-lg bg-muted space-y-1">
              <p className="text-sm font-medium">{formData.description || 'Sans description'}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Total: <span className="font-semibold text-foreground">{formatCurrency(parseFloat(formData.total_amount) || 0)}</span></span>
                {calculationMode !== 'manual' && (
                  <span>Échéance: <span className="font-semibold text-foreground">{formatCurrency(computed.installment_amount)}</span></span>
                )}
                <span>{schedulePreview.length} paiement{schedulePreview.length > 1 ? 's' : ''}</span>
                {calculationMode === 'manual' && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Pencil className="h-3 w-3" />
                    Personnalisé
                  </Badge>
                )}
              </div>
            </div>

            {/* Schedule table */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">Échéancier {calculationMode === 'manual' ? 'personnalisé' : 'prévisionnel'}</Label>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                  <span>#</span>
                  <span>Date</span>
                  <span className="text-right">Montant</span>
                </div>
                <div className="max-h-[40vh] overflow-y-auto divide-y divide-border">
                  {schedulePreview.map((item) => (
                    <div key={item.index} className="grid grid-cols-3 gap-2 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{item.index}</span>
                      <span>{format(item.date, 'dd/MM/yyyy')}</span>
                      <span className="text-right font-medium">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
          {step === 1 ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => { resetForm(); onOpenChange(false); }}
                disabled={loading}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!canProceedToStep2()) {
                    toast({
                      title: "Informations manquantes",
                      description: calculationMode === 'manual' && !manualIsValid
                        ? "Le total des échéances doit correspondre au montant total."
                        : "Veuillez remplir tous les champs obligatoires.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setStep(2);
                }}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                Échéancier →
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                ← Retour
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                {loading ? 'Création...' : 'Confirmer'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};