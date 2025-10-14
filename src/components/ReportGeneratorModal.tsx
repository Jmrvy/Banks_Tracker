import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "@/hooks/use-toast";

interface ReportGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReportGeneratorModal = ({ open, onOpenChange }: ReportGeneratorModalProps) => {
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [periodType, setPeriodType] = useState<'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Open the report preview in a new window
      const reportWindow = window.open('/report-preview', '_blank', 'width=1200,height=800');
      
      if (reportWindow) {
        // Pass data to the new window
        reportWindow.addEventListener('load', () => {
          const data = {
            reportDate: reportDate.toISOString(),
            periodType,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          };
          reportWindow.postMessage({ type: 'REPORT_DATA', data }, '*');
        });
      }

      toast({
        title: "Rapport en cours de génération",
        description: "Le rapport s'ouvre dans une nouvelle fenêtre",
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Erreur",
        description: "Impossible de générer le rapport",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Générer un Rapport PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date du rapport */}
          <div className="space-y-2">
            <Label>Date du rapport</Label>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={reportDate}
                onSelect={(date) => date && setReportDate(date)}
                locale={fr}
                className="rounded-md border"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Les soldes seront calculés à la date: {format(reportDate, 'dd MMMM yyyy', { locale: fr })}
            </p>
          </div>

          {/* Type de période */}
          <div className="space-y-2">
            <Label>Période des transactions</Label>
            <Select value={periodType} onValueChange={(value: 'month' | 'custom') => setPeriodType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois en cours</SelectItem>
                <SelectItem value="custom">Période personnalisée</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Période personnalisée */}
          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date de début</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    locale={fr}
                    className="rounded-md border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    locale={fr}
                    className="rounded-md border"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Générer le Rapport
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};