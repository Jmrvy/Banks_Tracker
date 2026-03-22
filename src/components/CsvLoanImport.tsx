import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useDebts } from '@/hooks/useDebts';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedLoanInfo, CsvValidationResult } from '@/utils/csvScheduleParser';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface CsvLoanImportProps {
  onSuccess: () => void;
}

export const CsvLoanImport = ({ onSuccess }: CsvLoanImportProps) => {
  const { createDebt } = useDebts();
  const { user } = useAuth();
  const { formatCurrency } = useUserPreferences();
  const { toast } = useToast();
  const { accounts, categories } = useFinancialData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedLoanInfo | null>(null);
  const [validation, setValidation] = useState<CsvValidationResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [formData, setFormData] = useState({
    description: '',
    type: 'loan_received' as 'loan_given' | 'loan_received',
    contact_name: '',
    notes: '',
    account_id: '',
    category_id: '',
  });

  const parseFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && file.type !== 'text/csv') {
      toast({
        title: 'Format non supporté',
        description: 'Seul le format CSV est accepté (.csv)',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setParsedData(null);
    setValidation(null);

    try {
      const { parseLoanCSV } = await import('@/utils/csvScheduleParser');
      const result = await parseLoanCSV(file);

      setParsedData(result);
      setValidation(result.validation);

      // Pre-fill description from filename
      const cleanName = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
      setFormData(prev => ({ ...prev, description: cleanName }));

      if (!result.validation.valid) {
        toast({
          title: 'Erreurs de validation',
          description: result.validation.errors[0],
          variant: 'destructive',
        });
      } else if (result.validation.warnings.length > 0) {
        toast({
          title: 'CSV analysé avec avertissements',
          description: `${result.schedule.length} échéances détectées. ${result.validation.warnings.length} avertissement(s).`,
        });
      } else {
        toast({
          title: 'CSV analysé',
          description: `${result.schedule.length} échéances détectées`,
        });
      }
    } catch (error) {
      console.error('CSV parsing error:', error);
      toast({
        title: 'Erreur de lecture',
        description: 'Impossible de lire le fichier CSV. Vérifiez que le format est correct.',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  }, [toast]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await parseFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await parseFile(file);
  }, [parseFile]);

  const handleSubmit = async () => {
    if (!user || !parsedData || !validation?.valid) return;

    if (!formData.description.trim()) {
      toast({ title: 'Erreur', description: 'La description est requise', variant: 'destructive' });
      return;
    }
    if (!formData.account_id) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner un compte de prélèvement', variant: 'destructive' });
      return;
    }

    const totalAmount = parsedData.totalAmount;
    const interestRate = parsedData.interestRate || 0;
    const monthlyPayment = parsedData.monthlyPayment || 0;
    const duration = parsedData.duration || 0;

    if (!totalAmount || totalAmount <= 0) {
      toast({ title: 'Erreur', description: 'Montant total non détecté dans le fichier', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      // Compute end date from schedule
      let endDate: string | null = null;
      if (parsedData.schedule.length > 0) {
        endDate = parsedData.schedule[parsedData.schedule.length - 1].date;
      }

      const debtId = await createDebt({
        description: formData.description,
        type: formData.type,
        total_amount: totalAmount,
        remaining_amount: totalAmount,
        interest_rate: interestRate,
        start_date: parsedData.startDate || new Date().toISOString().split('T')[0],
        end_date: endDate,
        status: 'active',
        contact_name: formData.contact_name || null,
        contact_info: null,
        notes: formData.notes || null,
        payment_frequency: 'monthly',
        payment_amount: monthlyPayment,
        loan_type: 'amortizable',
        category_id: formData.category_id || null,
      });

      // Create scheduled payments
      if (debtId && parsedData.schedule.length > 0) {
        const scheduledPayments = parsedData.schedule.map(row => ({
          debt_id: debtId,
          user_id: user.id,
          scheduled_date: row.date,
          scheduled_amount: row.payment,
          is_paid: false,
        }));

        for (let i = 0; i < scheduledPayments.length; i += 50) {
          const batch = scheduledPayments.slice(i, i + 50);
          const { error } = await supabase
            .from('scheduled_debt_payments')
            .insert(batch);
          if (error) console.error('Error inserting scheduled payments batch:', error);
        }

        toast({
          title: 'Import réussi',
          description: `Dette créée avec ${parsedData.schedule.length} échéances programmées`,
        });
      }

      // Create recurring transaction using the first schedule payment amount (actual CSV amount)
      const firstScheduleAmount = parsedData.schedule.length > 0 ? parsedData.schedule[0].payment : monthlyPayment;
      const recurringAmount = firstScheduleAmount > 0 ? firstScheduleAmount : monthlyPayment;

      if (debtId && recurringAmount > 0) {
        const transactionType = formData.type === 'loan_received' ? 'expense' : 'income';
        const suffix = formData.type === 'loan_received' ? 'Remboursement dette' : 'Remboursement prêt';

        await supabase
          .from('recurring_transactions')
          .insert({
            user_id: user.id,
            description: `${formData.description} (${suffix})`,
            amount: recurringAmount,
            type: transactionType,
            recurrence_type: 'monthly',
            start_date: parsedData.startDate || new Date().toISOString().split('T')[0],
            next_due_date: parsedData.startDate || new Date().toISOString().split('T')[0],
            end_date: endDate,
            account_id: formData.account_id,
            category_id: formData.category_id || null,
            is_active: true,
            debt_id: debtId,
          });
      }

      onSuccess();
    } catch (error) {
      console.error('Error creating debt from CSV import:', error);
      toast({ title: 'Erreur', description: 'Impossible de créer la dette', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Format help toggle */}
      <div className="rounded-xl border border-white/[0.08] overflow-hidden">
        <button
          onClick={() => setShowFormat(!showFormat)}
          className="w-full flex items-center justify-between p-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
        >
          <span className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary" />
            Format CSV attendu
          </span>
          {showFormat ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showFormat && (
          <div className="p-3 sm:p-4 space-y-3 text-xs sm:text-sm">
            <p className="text-muted-foreground">
              Le fichier CSV doit contenir les colonnes suivantes (séparateur <code className="bg-muted px-1 rounded">;</code> ou <code className="bg-muted px-1 rounded">,</code>) :
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] sm:text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-1.5 text-left font-medium">DATE</th>
                    <th className="p-1.5 text-left font-medium">N°</th>
                    <th className="p-1.5 text-right font-medium">Montant échéance</th>
                    <th className="p-1.5 text-right font-medium">Intérêts</th>
                    <th className="p-1.5 text-right font-medium">Assurance</th>
                    <th className="p-1.5 text-right font-medium">Capital amorti</th>
                    <th className="p-1.5 text-right font-medium">Capital restant dû</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-t border-border/30">
                    <td className="p-1.5">25/09/2024</td>
                    <td className="p-1.5">DBL</td>
                    <td className="p-1.5 text-right">0.00</td>
                    <td className="p-1.5 text-right">0.00</td>
                    <td className="p-1.5 text-right">0.00</td>
                    <td className="p-1.5 text-right">0.00</td>
                    <td className="p-1.5 text-right">20000.00</td>
                  </tr>
                  <tr className="border-t border-border/30">
                    <td className="p-1.5">20/10/2024</td>
                    <td className="p-1.5">1</td>
                    <td className="p-1.5 text-right">66.88</td>
                    <td className="p-1.5 text-right">25.48</td>
                    <td className="p-1.5 text-right">41.40</td>
                    <td className="p-1.5 text-right">0.00</td>
                    <td className="p-1.5 text-right">20000.00</td>
                  </tr>
                  <tr className="border-t border-border/30">
                    <td className="p-1.5">...</td>
                    <td className="p-1.5">...</td>
                    <td className="p-1.5 text-right">...</td>
                    <td className="p-1.5 text-right">...</td>
                    <td className="p-1.5 text-right">...</td>
                    <td className="p-1.5 text-right">...</td>
                    <td className="p-1.5 text-right">...</td>
                  </tr>
                  <tr className="border-t border-border/30 font-medium text-foreground">
                    <td className="p-1.5">20/11/2031</td>
                    <td className="p-1.5">86</td>
                    <td className="p-1.5 text-right">295.52</td>
                    <td className="p-1.5 text-right">0.35</td>
                    <td className="p-1.5 text-right">41.40</td>
                    <td className="p-1.5 text-right">253.77</td>
                    <td className="p-1.5 text-right text-success">0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="space-y-1 text-[10px] sm:text-xs text-muted-foreground">
              <p>• La ligne <strong>DBL</strong> (déblocage) est optionnelle et indique le capital initial</p>
              <p>• La dernière échéance doit avoir un <strong>Capital restant dû = 0.00</strong></p>
              <p>• Les dates doivent être au format <strong>JJ/MM/AAAA</strong></p>
            </div>
          </div>
        )}
      </div>

      {/* File upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragOver
            ? 'border-primary/60 bg-primary/5'
            : 'border-white/[0.12] hover:border-primary/40 hover:bg-white/[0.02]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyse du fichier CSV...</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">Cliquez pour changer de fichier</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Importer un échéancier CSV</p>
              <p className="text-xs text-muted-foreground mt-1">
                Glissez ou cliquez pour sélectionner votre fichier
              </p>
              <Badge variant="outline" className="text-[10px] mt-2">CSV uniquement</Badge>
            </div>
          </div>
        )}
      </div>

      {/* Validation results */}
      {validation && (
        <div className="space-y-2">
          {/* Errors */}
          {validation.errors.map((err, i) => (
            <div key={`err-${i}`} className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-destructive">{err}</p>
            </div>
          ))}
          {/* Warnings */}
          {validation.warnings.map((warn, i) => (
            <div key={`warn-${i}`} className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400">{warn}</p>
            </div>
          ))}
          {/* Success */}
          {validation.valid && validation.errors.length === 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
              <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-success">
                Fichier valide — {parsedData?.schedule.length} échéances, capital restant final = 0.00
              </p>
            </div>
          )}
        </div>
      )}

      {/* Parsed data display */}
      {parsedData && parsedData.schedule.length > 0 && (
        <div className="space-y-4">
          {/* Summary badges */}
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">
                {parsedData.schedule.length} échéances détectées
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parsedData.totalAmount && (
                <Badge variant="secondary">Capital: {formatCurrency(parsedData.totalAmount)}</Badge>
              )}
              {parsedData.interestRate && (
                <Badge variant="secondary">Taux: {parsedData.interestRate}%</Badge>
              )}
              {(() => {
                const amounts = parsedData.schedule.map(r => r.payment);
                const distinctAmounts = [...new Set(amounts)].sort((a, b) => a - b);
                if (distinctAmounts.length === 1) {
                  return <Badge variant="secondary">Mensualité: {formatCurrency(distinctAmounts[0])}</Badge>;
                }
                if (distinctAmounts.length <= 4) {
                  return distinctAmounts.map((amount, i) => {
                    const count = amounts.filter(a => a === amount).length;
                    return (
                      <Badge key={i} variant="secondary">
                        {formatCurrency(amount)} × {count} éch.
                      </Badge>
                    );
                  });
                }
                // Too many distinct values — show range
                return (
                  <Badge variant="secondary">
                    Mensualité: {formatCurrency(distinctAmounts[0])} → {formatCurrency(distinctAmounts[distinctAmounts.length - 1])}
                  </Badge>
                );
              })()}
              {parsedData.duration && (
                <Badge variant="secondary">Durée: {parsedData.duration} mois</Badge>
              )}
            </div>
          </div>

          {/* Schedule preview */}
          <div className="rounded-xl border border-white/[0.08] overflow-hidden">
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="w-full flex items-center justify-between p-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-sm font-medium">Aperçu de l'échéancier</span>
              {showSchedule ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSchedule && (
              <div className="max-h-[250px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.04] sticky top-0">
                    <tr>
                      <th className="p-2 text-left text-muted-foreground font-medium">Date</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">Échéance</th>
                      <th className="p-2 text-right text-muted-foreground font-medium hidden sm:table-cell">Intérêts</th>
                      <th className="p-2 text-right text-muted-foreground font-medium hidden sm:table-cell">Assurance</th>
                      <th className="p-2 text-right text-muted-foreground font-medium hidden sm:table-cell">Capital</th>
                      <th className="p-2 text-right text-muted-foreground font-medium">CRD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.schedule.map((row, i) => (
                      <tr key={i} className={`border-t border-white/[0.04] ${i === parsedData.schedule.length - 1 ? 'font-medium' : ''}`}>
                        <td className="p-2">{new Date(row.date + 'T00:00:00').toLocaleDateString('fr-FR')}</td>
                        <td className="p-2 text-right">{formatCurrency(row.payment)}</td>
                        <td className="p-2 text-right hidden sm:table-cell">{formatCurrency(row.interest)}</td>
                        <td className="p-2 text-right hidden sm:table-cell">{formatCurrency(row.insurance)}</td>
                        <td className="p-2 text-right hidden sm:table-cell">{formatCurrency(row.principal)}</td>
                        <td className={`p-2 text-right ${row.remainingBalance === 0 ? 'text-success font-medium' : ''}`}>
                          {formatCurrency(row.remainingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form — only show if validation passed */}
          {validation?.valid && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Complétez les informations</h4>

              <div>
                <Label htmlFor="csv-description">Description *</Label>
                <Input
                  id="csv-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Prêt immobilier"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="csv-type">Type</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })}>
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
                  <Label htmlFor="csv-contact">Contact</Label>
                  <Input
                    id="csv-contact"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="Nom du prêteur"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="csv-account">Compte de prélèvement *</Label>
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
                <Label htmlFor="csv-category">Catégorie des paiements</Label>
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

              <div>
                <Label htmlFor="csv-notes">Notes</Label>
                <Textarea
                  id="csv-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes supplémentaires..."
                  rows={2}
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={saving || !formData.description || !formData.account_id}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Créer la dette avec {parsedData.schedule.length} échéances
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
