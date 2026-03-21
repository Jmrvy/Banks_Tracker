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
import { supabase } from '@/integrations/supabase/client';
import type { ParsedLoanInfo } from '@/utils/pdfScheduleParser';
import { Upload, FileText, Loader2, Check, AlertCircle, ChevronDown, ChevronUp, Eye, FileSpreadsheet } from 'lucide-react';

const ACCEPTED_EXTENSIONS = '.pdf,.csv,.xlsx,.xls,.ods';
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
];

type FileFormat = 'pdf' | 'csv' | 'excel';

function detectFormat(file: File): FileFormat | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'csv' || file.type === 'text/csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods' ||
      file.type.includes('spreadsheet') || file.type.includes('excel')) return 'excel';
  return null;
}

function getFormatLabel(format: FileFormat): string {
  switch (format) {
    case 'pdf': return 'PDF';
    case 'csv': return 'CSV';
    case 'excel': return 'Excel';
  }
}

interface PdfLoanImportProps {
  onSuccess: () => void;
}

export const PdfLoanImport = ({ onSuccess }: PdfLoanImportProps) => {
  const { createDebt } = useDebts();
  const { user } = useAuth();
  const { formatCurrency } = useUserPreferences();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedLoanInfo | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState<FileFormat | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const parseFile = useCallback(async (file: File) => {
    const format = detectFormat(file);
    if (!format) {
      toast({
        title: 'Format non supporté',
        description: 'Formats acceptés : PDF, CSV, Excel (.xlsx, .xls)',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setFileFormat(format);
    setParsing(true);
    setParsedData(null);

    try {
      let data: ParsedLoanInfo;

      if (format === 'pdf') {
        const { parseLoanPDF } = await import('@/utils/pdfScheduleParser');
        data = await parseLoanPDF(file);
      } else if (format === 'csv') {
        const { parseCSVSchedule } = await import('@/utils/spreadsheetScheduleParser');
        data = await parseCSVSchedule(file);
      } else {
        const { parseExcelSchedule } = await import('@/utils/spreadsheetScheduleParser');
        data = await parseExcelSchedule(file);
      }

      setParsedData(data);

      // Pre-fill the form with parsed data
      const cleanName = file.name
        .replace(/\.(pdf|csv|xlsx|xls|ods)$/i, '')
        .replace(/[_-]/g, ' ');

      setFormData(prev => ({
        ...prev,
        description: cleanName,
        totalAmount: data.totalAmount?.toString() || '',
        interestRate: data.interestRate?.toString() || '',
        monthlyPayment: data.monthlyPayment?.toString() || '',
        startDate: data.startDate || '',
        duration: data.duration?.toString() || '',
      }));

      if (data.schedule.length === 0 && !data.totalAmount) {
        toast({
          title: 'Extraction partielle',
          description: `Le fichier ${getFormatLabel(format)} a été lu mais peu de données ont été détectées. Veuillez compléter les champs manuellement.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: `${getFormatLabel(format)} analysé`,
          description: `${data.schedule.length} échéances détectées`,
        });
      }
    } catch (error) {
      console.error(`${format} parsing error:`, error);
      toast({
        title: 'Erreur de lecture',
        description: `Impossible de lire le fichier. Vérifiez que le format est correct et que le fichier n'est pas protégé.`,
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

      // Create the debt and get its ID directly
      const debtId = await createDebt({
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
      console.error('Error creating debt from import:', error);
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
        ref={dropZoneRef}
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
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          className="hidden"
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyse du fichier en cours...</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-2">
            {fileFormat === 'pdf' ? (
              <FileText className="h-8 w-8 text-primary" />
            ) : (
              <FileSpreadsheet className="h-8 w-8 text-primary" />
            )}
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">Cliquez pour changer de fichier</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Importer un échéancier</p>
              <p className="text-xs text-muted-foreground mt-1">
                Glissez ou cliquez pour sélectionner votre fichier
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge variant="outline" className="text-[10px]">PDF</Badge>
                <Badge variant="outline" className="text-[10px]">CSV</Badge>
                <Badge variant="outline" className="text-[10px]">Excel</Badge>
              </div>
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
                          <td className="p-2">{new Date(row.date + 'T00:00:00').toLocaleDateString('fr-FR')}</td>
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

          {/* Raw text debug view (PDF only) */}
          {parsedData.rawText && (
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <button
                onClick={() => setShowRawText(!showRawText)}
                className="w-full flex items-center justify-between p-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
              >
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Texte extrait du PDF
                </span>
                {showRawText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showRawText && (
                <pre className="max-h-[200px] overflow-auto p-3 text-[10px] text-muted-foreground whitespace-pre-wrap font-mono bg-black/20">
                  {parsedData.rawText}
                </pre>
              )}
            </div>
          )}

          {/* Editable form */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Vérifiez et complétez les informations</h4>

            <div>
              <Label htmlFor="import-description">Description *</Label>
              <Input
                id="import-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Prêt immobilier"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="import-type">Type</Label>
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
                <Label htmlFor="import-contact">Contact</Label>
                <Input
                  id="import-contact"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Nom du prêteur"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="import-amount">Montant total *</Label>
                <Input
                  id="import-amount"
                  type="number"
                  step="0.01"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="import-rate">Taux d'intérêt (%)</Label>
                <Input
                  id="import-rate"
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
                <Label htmlFor="import-payment">Mensualité</Label>
                <Input
                  id="import-payment"
                  type="number"
                  step="0.01"
                  value={formData.monthlyPayment}
                  onChange={(e) => setFormData({ ...formData, monthlyPayment: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="import-duration">Durée (mois)</Label>
                <Input
                  id="import-duration"
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="import-start">Date de début</Label>
              <Input
                id="import-start"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="import-notes">Notes</Label>
              <Textarea
                id="import-notes"
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
