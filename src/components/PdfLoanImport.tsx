import { useState, useRef } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { parseLoanPDF, type ParsedLoanInfo, type ParsedScheduleRow } from '@/utils/pdfScheduleParser';
import { Upload, FileText, Loader2, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface PdfLoanImportProps {
  onSuccess: () => void;
}

export const PdfLoanImport = ({ onSuccess }: PdfLoanImportProps) => {
  const { createDebt } = useDebts();
  const { user } = useAuth();
  const { formatCurrency } = useUserPreferences();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedLoanInfo | null>(null);
  const [fileName, setFileName] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  // Editable fields (populated from parsed data, user can adjust)
  const [formData, setFormData] = useState({
    description: '',
    type: 'loan_received' as 'loan_given' | 'loan_received',
    totalAmount: '',
    interestRate: '',
    monthlyPayment: '',
    startDate: '',
    duration: '',
    contact_name: '',
    notes: '',
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Format invalide',
        description: 'Veuillez sélectionner un fichier PDF',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setParsedData(null);

    try {
      const data = await parseLoanPDF(file);
      setParsedData(data);

      // Pre-fill the form with parsed data
      setFormData(prev => ({
        ...prev,
        description: file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '),
        totalAmount: data.totalAmount?.toString() || '',
        interestRate: data.interestRate?.toString() || '',
        monthlyPayment: data.monthlyPayment?.toString() || '',
        startDate: data.startDate || '',
        duration: data.duration?.toString() || '',
      }));

      if (data.schedule.length === 0 && !data.totalAmount) {
        toast({
          title: 'Extraction partielle',
          description: 'Le PDF a été lu mais peu de données ont été détectées. Veuillez compléter les champs manuellement.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'PDF analysé',
          description: `${data.schedule.length} échéances détectées`,
        });
      }
    } catch (error) {
      console.error('PDF parsing error:', error);
      toast({
        title: 'Erreur de lecture',
        description: 'Impossible de lire le fichier PDF. Vérifiez que le fichier n\'est pas protégé.',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    const totalAmount = parseFloat(formData.totalAmount);
    const interestRate = parseFloat(formData.interestRate) || 0;
    const monthlyPayment = parseFloat(formData.monthlyPayment) || 0;
    const duration = parseInt(formData.duration) || 0;

    if (!totalAmount || totalAmount <= 0) {
      toast({
        title: 'Erreur',
        description: 'Le montant total est requis',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.description.trim()) {
      toast({
        title: 'Erreur',
        description: 'La description est requise',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      // Calculate end date from start date + duration
      let endDate: string | null = null;
      if (formData.startDate && duration > 0) {
        const start = new Date(formData.startDate);
        start.setMonth(start.getMonth() + duration);
        endDate = start.toISOString().split('T')[0];
      } else if (parsedData?.schedule && parsedData.schedule.length > 0) {
        endDate = parsedData.schedule[parsedData.schedule.length - 1].date;
      }

      // Create the debt
      await createDebt({
        description: formData.description,
        type: formData.type,
        total_amount: totalAmount,
        remaining_amount: totalAmount,
        interest_rate: interestRate,
        start_date: formData.startDate || new Date().toISOString().split('T')[0],
        end_date: endDate,
        status: 'active',
        contact_name: formData.contact_name || null,
        contact_info: null,
        notes: formData.notes || null,
        payment_frequency: 'monthly',
        payment_amount: monthlyPayment,
        loan_type: 'amortizable',
      });

      // Get the newly created debt to link scheduled payments
      const { data: debts } = await supabase
        .from('debts')
        .select('id')
        .eq('user_id', user.id)
        .eq('description', formData.description)
        .order('created_at', { ascending: false })
        .limit(1);

      const debtId = debts?.[0]?.id;

      // Create scheduled payments from the parsed schedule
      if (debtId && parsedData?.schedule && parsedData.schedule.length > 0) {
        const scheduledPayments = parsedData.schedule.map(row => ({
          debt_id: debtId,
          user_id: user.id,
          scheduled_date: row.date,
          scheduled_amount: row.payment,
          is_paid: false,
        }));

        // Insert in batches of 50
        for (let i = 0; i < scheduledPayments.length; i += 50) {
          const batch = scheduledPayments.slice(i, i + 50);
          const { error } = await supabase
            .from('scheduled_debt_payments')
            .insert(batch);

          if (error) {
            console.error('Error inserting scheduled payments batch:', error);
          }
        }

        toast({
          title: 'Import réussi',
          description: `Dette créée avec ${parsedData.schedule.length} échéances programmées`,
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error creating debt from PDF:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de créer la dette',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* File upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-white/[0.12] rounded-2xl p-6 sm:p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-white/[0.02] transition-all duration-300"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyse du PDF en cours...</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">Cliquez pour changer de fichier</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Importer un échéancier PDF</p>
              <p className="text-xs text-muted-foreground mt-1">
                Glissez ou cliquez pour sélectionner votre fichier
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Parsed data summary */}
      {parsedData && (
        <div className="space-y-4">
          {/* Detection summary */}
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
            <div className="flex items-center gap-2 mb-2">
              {parsedData.schedule.length > 0 ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4 text-warning" />
              )}
              <span className="text-sm font-medium">
                {parsedData.schedule.length > 0
                  ? `${parsedData.schedule.length} échéances détectées`
                  : 'Aucun échéancier détecté'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parsedData.totalAmount && (
                <Badge variant="secondary">Montant: {formatCurrency(parsedData.totalAmount)}</Badge>
              )}
              {parsedData.interestRate && (
                <Badge variant="secondary">Taux: {parsedData.interestRate}%</Badge>
              )}
              {parsedData.monthlyPayment && (
                <Badge variant="secondary">Mensualité: {formatCurrency(parsedData.monthlyPayment)}</Badge>
              )}
              {parsedData.duration && (
                <Badge variant="secondary">Durée: {parsedData.duration} mois</Badge>
              )}
            </div>
          </div>

          {/* Schedule preview */}
          {parsedData.schedule.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <button
                onClick={() => setShowSchedule(!showSchedule)}
                className="w-full flex items-center justify-between p-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
              >
                <span className="text-sm font-medium">Aperçu de l'échéancier</span>
                {showSchedule ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showSchedule && (
                <div className="max-h-[200px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.04] sticky top-0">
                      <tr>
                        <th className="p-2 text-left text-muted-foreground font-medium">Date</th>
                        <th className="p-2 text-right text-muted-foreground font-medium">Mensualité</th>
                        <th className="p-2 text-right text-muted-foreground font-medium hidden sm:table-cell">Capital</th>
                        <th className="p-2 text-right text-muted-foreground font-medium hidden sm:table-cell">Intérêts</th>
                        <th className="p-2 text-right text-muted-foreground font-medium">CRD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.schedule.slice(0, 12).map((row, i) => (
                        <tr key={i} className="border-t border-white/[0.04]">
                          <td className="p-2">{new Date(row.date).toLocaleDateString('fr-FR')}</td>
                          <td className="p-2 text-right">{formatCurrency(row.payment)}</td>
                          <td className="p-2 text-right hidden sm:table-cell">{formatCurrency(row.principal)}</td>
                          <td className="p-2 text-right hidden sm:table-cell">{formatCurrency(row.interest)}</td>
                          <td className="p-2 text-right">{formatCurrency(row.remainingBalance)}</td>
                        </tr>
                      ))}
                      {parsedData.schedule.length > 12 && (
                        <tr className="border-t border-white/[0.04]">
                          <td colSpan={5} className="p-2 text-center text-muted-foreground">
                            ... {parsedData.schedule.length - 12} autres échéances
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Editable form */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Vérifiez et complétez les informations</h4>

            <div>
              <Label htmlFor="pdf-description">Description *</Label>
              <Input
                id="pdf-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Prêt immobilier"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pdf-type">Type</Label>
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
                <Label htmlFor="pdf-contact">Contact</Label>
                <Input
                  id="pdf-contact"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Nom du prêteur"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pdf-amount">Montant total *</Label>
                <Input
                  id="pdf-amount"
                  type="number"
                  step="0.01"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="pdf-rate">Taux d'intérêt (%)</Label>
                <Input
                  id="pdf-rate"
                  type="number"
                  step="0.01"
                  value={formData.interestRate}
                  onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pdf-payment">Mensualité</Label>
                <Input
                  id="pdf-payment"
                  type="number"
                  step="0.01"
                  value={formData.monthlyPayment}
                  onChange={(e) => setFormData({ ...formData, monthlyPayment: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="pdf-duration">Durée (mois)</Label>
                <Input
                  id="pdf-duration"
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pdf-start">Date de début</Label>
              <Input
                id="pdf-start"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="pdf-notes">Notes</Label>
              <Textarea
                id="pdf-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes supplémentaires..."
                rows={2}
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={saving || !formData.totalAmount || !formData.description}
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
                Créer la dette{parsedData.schedule.length > 0 ? ` avec ${parsedData.schedule.length} échéances` : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
