import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/ui/month-picker";
import { YearPicker } from "@/components/ui/year-picker";
import { FileText, Loader2, FileSpreadsheet } from "lucide-react";
import { format, startOfQuarter, endOfQuarter, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useReportsData } from "@/hooks/useReportsData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface ReportGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReportGeneratorModal = ({ open, onOpenChange }: ReportGeneratorModalProps) => {
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [dateType, setDateType] = useState<'accounting' | 'value'>('accounting');
  const [reportFormat, setReportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [isGenerating, setIsGenerating] = useState(false);

  // Fix timezone issue: create date at noon local time
  const fixTimezone = (date: Date) => new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12, 0, 0, 0
  );

  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();

  // PDF-only currency formatting to avoid non-breaking spaces turning into slashes
  const pdfFormatAbs = (value: number) => {
    const n = Math.abs(Number(value) || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
  };
  const pdfFormatWithSign = (value: number) => {
    const sign = (Number(value) || 0) < 0 ? '-' : '';
    const n = Math.abs(Number(value) || 0);
    return sign + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
  };

  const actualStartDate = periodType === 'custom' ? startDate :
                          periodType === 'quarter' ? startOfQuarter(reportDate) :
                          periodType === 'year' ? startOfYear(reportDate) :
                          startOfMonth(reportDate);
  const actualEndDate = periodType === 'custom' ? endDate :
                        periodType === 'quarter' ? endOfQuarter(reportDate) :
                        periodType === 'year' ? endOfYear(reportDate) :
                        endOfMonth(reportDate);

  const { stats, categoryChartData, balanceEvolutionData, incomeAnalysis } = useReportsData(
    periodType === 'custom' || periodType === 'quarter' ? 'custom' : periodType === 'year' ? 'year' : 'month',
    reportDate,
    periodType === 'custom' || periodType === 'quarter' ? { from: actualStartDate, to: actualEndDate } : undefined,
    false,
    dateType
  );

  // ─── Programmatic slide-style PDF generation ──────────────────────────────

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const pdf = new jsPDF('l', 'mm', 'a4'); // landscape throughout
      const W = 297, H = 210;

      // Colors [R, G, B] 0-255
      const DARK: [number, number, number] = [30, 41, 59];
      const DARK_ALT: [number, number, number] = [51, 65, 85];
      const WHITE: [number, number, number] = [255, 255, 255];
      const GREEN: [number, number, number] = [5, 150, 105];
      const RED: [number, number, number] = [220, 38, 38];
      const BLUE: [number, number, number] = [59, 130, 246];
      const GRAY: [number, number, number] = [100, 116, 139];
      const SUBTLE: [number, number, number] = [148, 163, 184];
      const LIGHT_GRAY: [number, number, number] = [241, 245, 249];
      const LIGHT_GREEN: [number, number, number] = [240, 253, 244];
      const LIGHT_RED: [number, number, number] = [254, 242, 242];
      const TEXT_DARK: [number, number, number] = [17, 24, 39];
      const DIVIDER: [number, number, number] = [229, 231, 235];

      const setFill = (c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
      const setTextC = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
      const setDraw = (c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);

      const hexToRgb = (hex: string): [number, number, number] => {
        const h = hex.replace('#', '');
        return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
      };

      const periodStr = `${format(actualStartDate, 'dd MMM', { locale: fr })} - ${format(actualEndDate, 'dd MMM yyyy', { locale: fr })}`;
      const genDate = format(new Date(), 'dd MMMM yyyy', { locale: fr });
      const savingsRate = stats.income > 0 ? Math.round(((stats.income - stats.expenses) / stats.income) * 100) : 0;

      // Slide header helper
      const drawHeader = (title: string) => {
        setFill(DARK);
        pdf.rect(0, 0, W, 28, 'F');
        setTextC(WHITE);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text(title, 20, 18);
        setTextC(SUBTLE);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.text(periodStr, W - 20, 18, { align: 'right' });
        // Blue accent
        setFill(BLUE);
        pdf.rect(20, 28, 60, 2, 'F');
      };

      // Page number helper
      let slideNum = 0;
      const drawPageNum = () => {
        slideNum++;
        setTextC(SUBTLE);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(String(slideNum), W - 15, H - 8, { align: 'right' });
        pdf.text('Gestion des comptes CB', 15, H - 8);
      };

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 1: COVER
      // ═══════════════════════════════════════════════════════════════════════
      setFill(DARK);
      pdf.rect(0, 0, W, H, 'F');

      // Blue accent line
      setFill(BLUE);
      pdf.rect(0, H * 0.44, W, 2.5, 'F');

      // App name
      setTextC(SUBTLE);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.text('GESTION DES COMPTES CB', W / 2, 60, { align: 'center' });

      // Title
      setTextC(WHITE);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(36);
      pdf.text('RAPPORT FINANCIER', W / 2, 82, { align: 'center' });

      // Period
      pdf.setFontSize(18);
      pdf.text(periodStr.toUpperCase(), W / 2, 100, { align: 'center' });

      // Generated date
      setTextC(SUBTLE);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(`Rapport du ${genDate}`, W / 2, 158, { align: 'center' });

      // Badges
      const txCount = transactionsWithBalance.length;
      pdf.setFontSize(10);
      const txBadge = `${txCount} transactions`;
      const txBW = pdf.getTextWidth(txBadge) + 16;
      const srBadge = `Epargne : ${savingsRate}%`;
      const srBW = pdf.getTextWidth(srBadge) + 16;
      const badgeTotal = txBW + 10 + srBW;
      const badgeX = (W - badgeTotal) / 2;

      setFill(DARK_ALT);
      pdf.rect(badgeX, 130, txBW, 14, 'F');
      setTextC(SUBTLE);
      pdf.text(txBadge, badgeX + 8, 139);

      const srBg: [number, number, number] = savingsRate >= 0 ? [6, 78, 59] : [127, 29, 29];
      const srTxt: [number, number, number] = savingsRate >= 0 ? [110, 231, 183] : [252, 165, 165];
      pdf.setFillColor(srBg[0], srBg[1], srBg[2]);
      pdf.rect(badgeX + txBW + 10, 130, srBW, 14, 'F');
      pdf.setTextColor(srTxt[0], srTxt[1], srTxt[2]);
      pdf.text(srBadge, badgeX + txBW + 10 + 8, 139);

      drawPageNum();

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 2: FINANCIAL OVERVIEW
      // ═══════════════════════════════════════════════════════════════════════
      pdf.addPage('a4', 'l');
      drawHeader("VUE D'ENSEMBLE");

      const boxW = 80, boxH = 55, boxGap = 12;
      const bStartX = (W - (3 * boxW + 2 * boxGap)) / 2;
      const bTopY = 40;

      // Revenue box
      setFill(LIGHT_GREEN);
      pdf.rect(bStartX, bTopY, boxW, boxH, 'F');
      setTextC(GRAY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text('REVENUS', bStartX + boxW / 2, bTopY + 15, { align: 'center' });
      setTextC(GREEN); pdf.setFontSize(20);
      pdf.text(pdfFormatAbs(stats.income), bStartX + boxW / 2, bTopY + 35, { align: 'center' });

      // Expenses box
      const eX = bStartX + boxW + boxGap;
      setFill(LIGHT_RED);
      pdf.rect(eX, bTopY, boxW, boxH, 'F');
      setTextC(GRAY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text('DEPENSES', eX + boxW / 2, bTopY + 15, { align: 'center' });
      setTextC(RED); pdf.setFontSize(20);
      pdf.text(pdfFormatAbs(stats.expenses), eX + boxW / 2, bTopY + 35, { align: 'center' });

      // Net box
      const nX = eX + boxW + boxGap;
      const net = stats.income - stats.expenses;
      const netClr = net >= 0 ? GREEN : RED;
      setFill(LIGHT_GRAY);
      pdf.rect(nX, bTopY, boxW, boxH, 'F');
      setTextC(GRAY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text('NET', nX + boxW / 2, bTopY + 15, { align: 'center' });
      setTextC(netClr); pdf.setFontSize(20);
      pdf.text(pdfFormatWithSign(net), nX + boxW / 2, bTopY + 35, { align: 'center' });

      // Balance bar
      const barW = 3 * boxW + 2 * boxGap;
      const barY = bTopY + boxH + 15;
      setFill(DARK);
      pdf.rect(bStartX, barY, barW, 28, 'F');
      setTextC(SUBTLE); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
      pdf.text('SOLDE TOTAL', bStartX + 15, barY + 18);
      setTextC(WHITE); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18);
      pdf.text(pdfFormatWithSign(totalBalance), bStartX + barW - 15, barY + 17, { align: 'right' });

      // Starting / ending balance
      const compY = barY + 38;
      setFill(LIGHT_GRAY);
      pdf.rect(bStartX, compY, barW / 2 - 5, 22, 'F');
      setTextC(GRAY); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      pdf.text('SOLDE DEBUT', bStartX + 10, compY + 9);
      setTextC(TEXT_DARK); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
      pdf.text(pdfFormatWithSign(startingBalance), bStartX + barW / 2 - 15, compY + 15, { align: 'right' });

      setFill(LIGHT_GRAY);
      pdf.rect(bStartX + barW / 2 + 5, compY, barW / 2 - 5, 22, 'F');
      setTextC(GRAY); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      pdf.text('SOLDE FIN', bStartX + barW / 2 + 15, compY + 9);
      setTextC(TEXT_DARK); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
      pdf.text(pdfFormatWithSign(totalBalance), bStartX + barW - 10, compY + 15, { align: 'right' });

      // Savings rate bar
      const srY = compY + 30;
      setFill(savingsRate >= 0 ? LIGHT_GREEN : LIGHT_RED);
      pdf.rect(bStartX, srY, barW, 18, 'F');
      setTextC(savingsRate >= 0 ? GREEN : RED);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
      pdf.text(`Taux d'epargne : ${savingsRate}%`, bStartX + barW / 2, srY + 12, { align: 'center' });

      drawPageNum();

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 3: BALANCE EVOLUTION (line chart)
      // ═══════════════════════════════════════════════════════════════════════
      if (balanceEvolutionData.length > 1) {
        pdf.addPage('a4', 'l');
        drawHeader('EVOLUTION DU SOLDE');

        const chartData = balanceEvolutionData;
        const cX = 55, cTopY = 42, cW = W - 75, cH = H - 72;

        // Chart background
        setFill([249, 250, 251]);
        pdf.rect(cX, cTopY, cW, cH, 'F');

        const soldes = chartData.map((d: any) => Number(d.solde));
        const yMin = Math.min(...soldes);
        const yMax = Math.max(...soldes);
        const yRange = yMax - yMin || 1;
        const yPad = yRange * 0.1;
        const adjMin = yMin - yPad;
        const adjMax = yMax + yPad;
        const adjRange = adjMax - adjMin;

        // Grid lines
        setDraw([229, 231, 235]);
        pdf.setLineWidth(0.2);
        for (let i = 0; i <= 4; i++) {
          const gy = cTopY + cH - (i / 4) * cH;
          pdf.line(cX, gy, cX + cW, gy);
          const val = adjMin + (i / 4) * adjRange;
          setTextC([107, 114, 128]);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
          pdf.text(pdfFormatAbs(val), cX - 3, gy + 1, { align: 'right' });
        }

        // Data line
        setDraw(BLUE);
        pdf.setLineWidth(0.7);
        for (let i = 0; i < chartData.length - 1; i++) {
          const x1 = cX + (i / (chartData.length - 1)) * cW;
          const y1 = cTopY + cH - ((soldes[i] - adjMin) / adjRange) * cH;
          const x2 = cX + ((i + 1) / (chartData.length - 1)) * cW;
          const y2 = cTopY + cH - ((soldes[i + 1] - adjMin) / adjRange) * cH;
          pdf.line(x1, y1, x2, y2);
        }

        // Data dots
        setFill(BLUE);
        const dotStep = Math.max(1, Math.floor(chartData.length / 30));
        for (let i = 0; i < chartData.length; i += dotStep) {
          const px = cX + (i / (chartData.length - 1)) * cW;
          const py = cTopY + cH - ((soldes[i] - adjMin) / adjRange) * cH;
          pdf.circle(px, py, 0.8, 'F');
        }

        // X-axis labels
        const labelStep = Math.max(1, Math.floor(chartData.length / 10));
        setTextC([107, 114, 128]);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        for (let i = 0; i < chartData.length; i += labelStep) {
          const px = cX + (i / (chartData.length - 1)) * cW;
          pdf.text(String(chartData[i].date), px, cTopY + cH + 6, { align: 'center' });
        }

        drawPageNum();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 4: EXPENSES BY CATEGORY
      // ═══════════════════════════════════════════════════════════════════════
      const expCats = categoryChartData
        .filter(c => c.spent > 0)
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 12);

      if (expCats.length > 0) {
        pdf.addPage('a4', 'l');
        drawHeader('DEPENSES PAR CATEGORIE');

        const tX = 25, tW = W - 50, rowH = 13;
        let curY = 38;

        // Header row
        setFill(LIGHT_GRAY);
        pdf.rect(tX, curY, tW, rowH, 'F');
        setTextC(GRAY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        pdf.text('CATEGORIE', tX + 8, curY + 9);
        pdf.text('MONTANT', tX + tW * 0.38, curY + 9);
        pdf.text('%', tX + tW * 0.55, curY + 9);
        pdf.text('REPARTITION', tX + tW * 0.63, curY + 9);
        curY += rowH + 1;

        const totalExpenses = stats.expenses || 1;
        for (let i = 0; i < expCats.length; i++) {
          const cat = expCats[i];
          const pct = totalExpenses > 0 ? Math.round((cat.spent / totalExpenses) * 100) : 0;

          if (i % 2 === 1) {
            setFill([250, 250, 252]);
            pdf.rect(tX, curY, tW, rowH, 'F');
          }

          setDraw(DIVIDER); pdf.setLineWidth(0.2);
          pdf.line(tX, curY + rowH, tX + tW, curY + rowH);

          // Category name
          setTextC(TEXT_DARK); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
          const catName = cat.name.length > 25 ? cat.name.substring(0, 25) + '...' : cat.name;
          pdf.text(catName, tX + 8, curY + 9);

          // Amount
          pdf.setFont('helvetica', 'bold');
          pdf.text(pdfFormatAbs(cat.spent), tX + tW * 0.38, curY + 9);

          // Percentage
          setTextC(GRAY); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
          pdf.text(`${pct}%`, tX + tW * 0.55, curY + 9);

          // Bar
          const barBX = tX + tW * 0.63;
          const barMaxW = tW * 0.33;
          const catBarW = Math.max(1, (pct / 100) * barMaxW);

          setFill([229, 231, 235]);
          pdf.rect(barBX, curY + 4, barMaxW, 5, 'F');

          const catColor = cat.color ? hexToRgb(cat.color) : BLUE;
          const isOver = cat.budget > 0 && cat.spent > cat.budget;
          setFill(isOver ? RED : catColor);
          pdf.rect(barBX, curY + 4, catBarW, 5, 'F');

          curY += rowH;
        }

        drawPageNum();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 5: INCOME ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════
      if (incomeAnalysis.length > 0) {
        pdf.addPage('a4', 'l');
        drawHeader('ANALYSE DES REVENUS');

        const incomeCats = incomeAnalysis.slice(0, 12);
        const totalIncome = stats.income || 1;
        const incomeColors = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16'];

        const tX = 25, tW = W - 50, rowH = 13;
        let curY = 38;

        setFill(LIGHT_GRAY);
        pdf.rect(tX, curY, tW, rowH, 'F');
        setTextC(GRAY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        pdf.text('CATEGORIE', tX + 8, curY + 9);
        pdf.text('MONTANT', tX + tW * 0.38, curY + 9);
        pdf.text('NB', tX + tW * 0.53, curY + 9);
        pdf.text('%', tX + tW * 0.60, curY + 9);
        pdf.text('REPARTITION', tX + tW * 0.68, curY + 9);
        curY += rowH + 1;

        for (let i = 0; i < incomeCats.length; i++) {
          const cat = incomeCats[i];
          const pct = totalIncome > 0 ? Math.round((cat.totalAmount / totalIncome) * 100) : 0;

          if (i % 2 === 1) {
            setFill([250, 250, 252]);
            pdf.rect(tX, curY, tW, rowH, 'F');
          }

          setDraw(DIVIDER); pdf.setLineWidth(0.2);
          pdf.line(tX, curY + rowH, tX + tW, curY + rowH);

          setTextC(TEXT_DARK); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
          const catName = cat.category.length > 25 ? cat.category.substring(0, 25) + '...' : cat.category;
          pdf.text(catName, tX + 8, curY + 9);

          pdf.setFont('helvetica', 'bold');
          pdf.text(pdfFormatAbs(cat.totalAmount), tX + tW * 0.38, curY + 9);

          setTextC(GRAY); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
          pdf.text(String(cat.count), tX + tW * 0.53, curY + 9);
          pdf.text(`${pct}%`, tX + tW * 0.60, curY + 9);

          const barBX = tX + tW * 0.68;
          const barMaxW = tW * 0.28;
          const incBarW = Math.max(1, (pct / 100) * barMaxW);

          setFill([229, 231, 235]);
          pdf.rect(barBX, curY + 4, barMaxW, 5, 'F');
          setFill(hexToRgb(incomeColors[i % incomeColors.length]));
          pdf.rect(barBX, curY + 4, incBarW, 5, 'F');

          curY += rowH;
        }

        drawPageNum();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 6: BUDGET ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════
      const budgetCats = categoryChartData.filter(c => c.budget > 0).sort((a, b) => b.spent - a.spent);

      if (budgetCats.length > 0) {
        pdf.addPage('a4', 'l');
        drawHeader('BUDGET VS DEPENSES');

        let curY = 40;
        for (const cat of budgetCats.slice(0, 8)) {
          const pctUsed = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
          const remaining = cat.budget - cat.spent;
          const isOver = cat.spent > cat.budget;

          // Card background
          setFill(isOver ? LIGHT_RED : LIGHT_GRAY);
          pdf.rect(25, curY, W - 50, 18, 'F');

          // Left accent
          setFill(isOver ? RED : GREEN);
          pdf.rect(25, curY, 3, 18, 'F');

          // Name
          setTextC(TEXT_DARK); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
          pdf.text(cat.name, 35, curY + 7);

          // Status
          const statusText = pctUsed >= 100 ? 'DEPASSE' : pctUsed >= 80 ? 'ATTENTION' : 'OK';
          const statusClr: [number, number, number] = pctUsed >= 100 ? RED : pctUsed >= 80 ? [234, 88, 12] : GREEN;
          setTextC(statusClr); pdf.setFontSize(8);
          pdf.text(statusText, W - 35, curY + 7, { align: 'right' });

          // Details
          setTextC(GRAY); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
          const detailText = `${pdfFormatAbs(cat.spent)} / ${pdfFormatAbs(cat.budget)} (${Math.round(pctUsed)}%)`;
          const remainText = isOver ? `Depassement: ${pdfFormatAbs(Math.abs(remaining))}` : `Restant: ${pdfFormatAbs(remaining)}`;
          pdf.text(`${detailText} — ${remainText}`, 35, curY + 14);

          // Progress bar
          const pBarX = W * 0.55;
          const pBarMaxW = W * 0.25;
          const pBarFillW = Math.min(pctUsed, 100) / 100 * pBarMaxW;

          setFill([229, 231, 235]);
          pdf.rect(pBarX, curY + 11, pBarMaxW, 4, 'F');
          setFill(isOver ? RED : pctUsed >= 80 ? [234, 88, 12] : GREEN);
          pdf.rect(pBarX, curY + 11, pBarFillW, 4, 'F');

          curY += 22;
        }

        drawPageNum();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // SLIDE 7: ACCOUNT BALANCES
      // ═══════════════════════════════════════════════════════════════════════
      pdf.addPage('a4', 'l');
      drawHeader('SOLDES DES COMPTES');

      {
        const tX = 30, tW = W - 60, rowH = 14;
        let curY = 38;

        // Header row
        setFill(LIGHT_GRAY);
        pdf.rect(tX, curY, tW, rowH, 'F');
        setTextC(GRAY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        pdf.text('COMPTE', tX + 8, curY + 10);
        pdf.text('BANQUE', tX + tW * 0.30, curY + 10);
        pdf.text('TYPE', tX + tW * 0.55, curY + 10);
        pdf.text('SOLDE', tX + tW - 10, curY + 10, { align: 'right' });
        curY += rowH + 1;

        for (let i = 0; i < accountBalances.length; i++) {
          const acc = accountBalances[i];

          if (i % 2 === 1) {
            setFill([250, 250, 252]);
            pdf.rect(tX, curY, tW, rowH, 'F');
          }

          setDraw(DIVIDER); pdf.setLineWidth(0.2);
          pdf.line(tX, curY + rowH, tX + tW, curY + rowH);

          setTextC(TEXT_DARK); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
          pdf.text(acc.name, tX + 8, curY + 10);
          pdf.setFont('helvetica', 'normal');
          pdf.text(acc.bank || '-', tX + tW * 0.30, curY + 10);
          pdf.text(acc.account_type || '-', tX + tW * 0.55, curY + 10);

          const balClr = acc.currentBalance >= 0 ? GREEN : RED;
          setTextC(balClr); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
          pdf.text(pdfFormatWithSign(acc.currentBalance), tX + tW - 10, curY + 10, { align: 'right' });

          curY += rowH;
        }

        // Total row
        curY += 3;
        setFill(DARK);
        pdf.rect(tX, curY, tW, rowH + 2, 'F');
        setTextC(WHITE); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
        pdf.text('TOTAL', tX + 8, curY + 11);
        pdf.text(pdfFormatWithSign(totalBalance), tX + tW - 10, curY + 11, { align: 'right' });
      }

      drawPageNum();

      // ═══════════════════════════════════════════════════════════════════════
      // TABLE: BUDGET VS EXPENSES DETAIL (autoTable, landscape)
      // ═══════════════════════════════════════════════════════════════════════
      if (budgetCats.length > 0) {
        pdf.addPage('a4', 'l');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.setTextColor(0);
        pdf.text('Analyse Budget vs D\u00e9penses', 14, 15);

        const budgetTableData = budgetCats.map(cat => {
          const percentUsed = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
          const remaining = cat.budget - cat.spent;
          const status = percentUsed >= 100 ? 'D\u00e9pass\u00e9' : percentUsed >= 80 ? 'Attention' : 'OK';
          return [
            cat.name,
            pdfFormatAbs(cat.spent),
            pdfFormatAbs(cat.budget),
            pdfFormatWithSign(remaining),
            percentUsed.toFixed(0) + '%',
            status
          ];
        });

        autoTable(pdf, {
          head: [['Cat\u00e9gorie', 'D\u00e9pens\u00e9', 'Budget', 'Restant', '% Utilis\u00e9', 'Statut']],
          body: budgetTableData,
          startY: 25,
          theme: 'grid',
          tableWidth: 'auto',
          headStyles: {
            fillColor: [243, 244, 246],
            textColor: [55, 65, 81],
            fontStyle: 'bold',
            lineWidth: 0.5,
            lineColor: [209, 213, 219],
            halign: 'left',
            fontSize: 8
          },
          styles: {
            fontSize: 8,
            cellPadding: 3,
            lineColor: [229, 231, 235],
            lineWidth: 0.1,
            halign: 'left'
          },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { halign: 'right', cellWidth: 35 },
            2: { halign: 'right', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 35 },
            4: { halign: 'center', cellWidth: 28 },
            5: { halign: 'center', cellWidth: 28 }
          },
          rowPageBreak: 'avoid',
          pageBreak: 'avoid',
          didParseCell: (data: any) => {
            if (data.section === 'body') {
              if (data.column.index === 5) {
                const status = data.cell.raw;
                if (status === 'D\u00e9pass\u00e9') {
                  data.cell.styles.textColor = [220, 38, 38];
                  data.cell.styles.fontStyle = 'bold';
                } else if (status === 'Attention') {
                  data.cell.styles.textColor = [234, 88, 12];
                  data.cell.styles.fontStyle = 'bold';
                } else {
                  data.cell.styles.textColor = [22, 163, 74];
                  data.cell.styles.fontStyle = 'bold';
                }
              }
              if (data.column.index === 3) {
                const remaining = String(data.cell.raw);
                if (remaining.startsWith('-')) {
                  data.cell.styles.textColor = [220, 38, 38];
                }
              }
            }
          },
          margin: { top: 25, bottom: 15, left: 14, right: 14 }
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // TABLE: TRANSACTION DETAIL (autoTable, landscape)
      // ═══════════════════════════════════════════════════════════════════════
      pdf.addPage('a4', 'l');

      const tableData = transactionsWithBalance.map(t => {
        const amountNum = Number(t.amount);
        const amountStr = (t.type === 'income' ? '+' : '-') + pdfFormatAbs(amountNum);
        const balanceStr = pdfFormatWithSign(t.runningBalance);
        const displayDate = dateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);
        return [
          format(displayDate, 'dd/MM/yyyy'),
          accounts.find(a => a.id === t.account_id)?.name || '-',
          t.description,
          t.category?.name || '-',
          t.type === 'income' ? 'Revenu' : t.type === 'expense' ? 'D\u00e9pense' : 'Virement',
          amountStr,
          balanceStr,
        ];
      });

      const tableBody = [
        ['__SUM__START', 'Solde d\u00e9but', '', '', '', '', pdfFormatWithSign(startingBalance)],
        ...tableData,
        ['__SUM__END', 'Solde fin', '', '', '', '', pdfFormatWithSign(totalBalance)],
        ['__SUM__TOTAL', 'Total transactions', '', '', '', '', String(transactionsWithBalance.length)],
      ];

      let txFirstPage = true;
      autoTable(pdf, {
        head: [['Date', 'Compte', 'Description', 'Cat\u00e9gorie', 'Type', 'Montant', 'Solde']],
        body: tableBody,
        startY: 25,
        theme: 'grid',
        tableWidth: 'auto',
        headStyles: {
          fillColor: [243, 244, 246],
          textColor: [55, 65, 81],
          fontStyle: 'bold',
          lineWidth: 0.5,
          lineColor: [209, 213, 219],
          halign: 'left',
          fontSize: 7
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
          lineColor: [229, 231, 235],
          lineWidth: 0.1,
          halign: 'left',
          overflow: 'linebreak'
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 30 },
          2: { cellWidth: 80, overflow: 'linebreak' },
          3: { cellWidth: 30 },
          4: { cellWidth: 20 },
          5: { halign: 'right', cellWidth: 28 },
          6: { halign: 'right', fontStyle: 'bold', cellWidth: 28 }
        },
        rowPageBreak: 'avoid',
        didDrawPage: (data: any) => {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0);
          pdf.setFontSize(txFirstPage ? 16 : 14);
          pdf.text(txFirstPage ? 'D\u00e9tail des Transactions' : 'D\u00e9tail des Transactions (suite)', 14, 15);
          txFirstPage = false;
        },
        didParseCell: (data: any) => {
          const raw = data.row?.raw;
          if (raw && typeof raw[0] === 'string' && raw[0].startsWith('__SUM__')) {
            data.cell.styles.fillColor = [249, 250, 251];
            data.cell.styles.fontStyle = 'bold';

            if (data.column.index === 0) {
              data.cell.text = [String(raw[1])];
              data.cell.colSpan = 5;
              data.cell.styles.halign = 'left';
            } else if (data.column.index > 0 && data.column.index < 5) {
              data.cell.text = [''];
            } else if (data.column.index === 5) {
              data.cell.text = [''];
            } else if (data.column.index === 6) {
              data.cell.styles.halign = 'right';
              data.cell.text = [String(raw[6])];
            }
          }
        },
        showHead: 'everyPage',
        showFoot: 'never',
        margin: { top: 25, bottom: 15, left: 14, right: 14 }
      });

      pdf.save(`rapport-financier-${format(actualStartDate, 'yyyy-MM-dd')}.pdf`);

      toast({
        title: "Rapport g\u00e9n\u00e9r\u00e9",
        description: "Le PDF a \u00e9t\u00e9 t\u00e9l\u00e9charg\u00e9 avec succ\u00e8s",
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Erreur",
        description: "Impossible de g\u00e9n\u00e9rer le rapport",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateExcel = async () => {
    setIsGenerating(true);
    try {
      // Helper function to format currency for Excel
      const excelFormatCurrency = (value: number) => Number(value).toFixed(2);

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: Soldes
      const balanceData = [
        ['Rapport Financier'],
        [`P\u00e9riode: ${format(actualStartDate, 'dd/MM/yyyy', { locale: fr })} - ${format(actualEndDate, 'dd/MM/yyyy', { locale: fr })}`],
        [`Type de date: ${dateType === 'accounting' ? 'Date Comptable' : 'Date Valeur'}`],
        [`G\u00e9n\u00e9r\u00e9 le: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}`],
        [],
        ['R\u00e9sum\u00e9 des Soldes'],
        ['Revenus', excelFormatCurrency(stats.income)],
        ['D\u00e9penses', excelFormatCurrency(stats.expenses)],
        ['Net P\u00e9riode', excelFormatCurrency(stats.netPeriodBalance)],
        ['Solde Initial', excelFormatCurrency(stats.initialBalance)],
        ['Solde Final', excelFormatCurrency(stats.finalBalance)],
        [],
        ['Soldes des Comptes'],
        ['Compte', 'Banque', 'Type', 'Solde'],
        ...accountBalances.map(acc => [
          acc.name,
          acc.bank,
          acc.account_type,
          excelFormatCurrency(acc.currentBalance)
        ])
      ];
      const wsBalance = XLSX.utils.aoa_to_sheet(balanceData);
      XLSX.utils.book_append_sheet(wb, wsBalance, 'Soldes');

      // Sheet 2: Dépenses par catégorie vs budget
      const expensesData = [
        ['D\u00e9penses par Cat\u00e9gorie vs Budget'],
        [`P\u00e9riode: ${format(actualStartDate, 'dd/MM/yyyy', { locale: fr })} - ${format(actualEndDate, 'dd/MM/yyyy', { locale: fr })}`],
        [],
        ['Cat\u00e9gorie', 'D\u00e9pens\u00e9', 'Budget', 'Restant', '% Utilis\u00e9'],
        ...categoryChartData.map(cat => [
          cat.name,
          excelFormatCurrency(cat.spent),
          excelFormatCurrency(cat.budget),
          excelFormatCurrency(cat.remaining),
          cat.percentage + '%'
        ])
      ];
      const wsExpenses = XLSX.utils.aoa_to_sheet(expensesData);
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'D\u00e9penses');

      // Sheet 3: Revenus par catégorie
      const totalIncome = incomeAnalysis.reduce((sum, cat) => sum + cat.totalAmount, 0);
      const incomeData = [
        ['Revenus par Cat\u00e9gorie'],
        [`P\u00e9riode: ${format(actualStartDate, 'dd/MM/yyyy', { locale: fr })} - ${format(actualEndDate, 'dd/MM/yyyy', { locale: fr })}`],
        [],
        ['Cat\u00e9gorie', 'Montant', 'Nombre', '% du Total'],
        ...incomeAnalysis.map(cat => [
          cat.category,
          excelFormatCurrency(cat.totalAmount),
          cat.count,
          totalIncome > 0 ? ((cat.totalAmount / totalIncome) * 100).toFixed(1) + '%' : '0%'
        ])
      ];
      const wsIncome = XLSX.utils.aoa_to_sheet(incomeData);
      XLSX.utils.book_append_sheet(wb, wsIncome, 'Revenus');

      // Sheet 4: Historique des transactions
      const transactionsData = [
        ['Historique des Transactions'],
        [`P\u00e9riode: ${format(actualStartDate, 'dd/MM/yyyy', { locale: fr })} - ${format(actualEndDate, 'dd/MM/yyyy', { locale: fr })}`],
        [`Type de date: ${dateType === 'accounting' ? 'Date Comptable' : 'Date Valeur'}`],
        [],
        ['Date', 'Compte', 'Description', 'Cat\u00e9gorie', 'Type', 'Montant', 'Solde'],
        ...transactionsWithBalance.map(t => {
          const displayDate = dateType === 'value'
            ? new Date(t.value_date || t.transaction_date)
            : new Date(t.transaction_date);
          return [
            format(displayDate, 'dd/MM/yyyy'),
            accounts.find(a => a.id === t.account_id)?.name || '-',
            t.description,
            t.category?.name || '-',
            t.type === 'income' ? 'Revenu' : t.type === 'expense' ? 'D\u00e9pense' : 'Virement',
            (t.type === 'income' ? '' : '-') + excelFormatCurrency(Number(t.amount)),
            excelFormatCurrency(t.runningBalance)
          ];
        }),
        [],
        ['Solde d\u00e9but de p\u00e9riode', '', '', '', '', '', excelFormatCurrency(startingBalance)],
        ['Solde fin de p\u00e9riode', '', '', '', '', '', excelFormatCurrency(totalBalance)],
        ['Total transactions', '', '', '', '', '', String(transactionsWithBalance.length)]
      ];
      const wsTransactions = XLSX.utils.aoa_to_sheet(transactionsData);
      XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transactions');

      // Generate and download Excel file
      XLSX.writeFile(wb, `rapport-financier-${format(actualStartDate, 'yyyy-MM-dd')}.xlsx`);

      toast({
        title: "Rapport g\u00e9n\u00e9r\u00e9",
        description: "Le fichier Excel a \u00e9t\u00e9 t\u00e9l\u00e9charg\u00e9 avec succ\u00e8s",
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error generating Excel report:', error);
      toast({
        title: "Erreur",
        description: "Impossible de g\u00e9n\u00e9rer le rapport Excel",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Calculate total balance at end of period - needed first for other calculations
  const totalBalance = stats.finalBalance;

  // Filter transactions by date range using selected date type and sort chronologically
  const filteredTransactions = transactions
    .filter(t => {
      const dateToUse = dateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      return dateToUse >= actualStartDate && dateToUse <= actualEndDate;
    })
    .sort((a, b) => {
      const dateA = dateType === 'value'
        ? new Date(a.value_date || a.transaction_date)
        : new Date(a.transaction_date);
      const dateB = dateType === 'value'
        ? new Date(b.value_date || b.transaction_date)
        : new Date(b.transaction_date);
      return dateA.getTime() - dateB.getTime();
    });

  // Calculate starting balance (beginning of period)
  // Starting balance = final balance - net period balance
  const startingBalance = totalBalance - stats.netPeriodBalance;

  // Add running balance to transactions
  let runningBalance = startingBalance;
  const transactionsWithBalance = filteredTransactions.map(transaction => {
    const amount = Number(transaction.amount);
    if (transaction.type === 'income') {
      runningBalance += amount;
    } else if (transaction.type === 'expense') {
      runningBalance -= amount;
    }
    // For transfers, the amount was already subtracted from source account
    // We don't modify running balance for transfers as it's internal movement

    return {
      ...transaction,
      runningBalance: runningBalance
    };
  });

  // Calculate account balances at end of selected period
  // Start from current balance and subtract transactions after the end date
  const accountBalances = accounts.map(account => {
    // Get transactions that happened AFTER the end date
    const transactionsAfterEndDate = transactions.filter(t => {
      const dateToUse = dateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      return (t.account_id === account.id || t.transfer_to_account_id === account.id) &&
             dateToUse > actualEndDate;
    });

    // Start with current balance and reverse transactions after end date
    let balanceAtEndDate = Number(account.balance);
    transactionsAfterEndDate.forEach(t => {
      if (t.account_id === account.id) {
        if (t.type === 'income') balanceAtEndDate -= Number(t.amount);
        if (t.type === 'expense') balanceAtEndDate += Number(t.amount);
        if (t.type === 'transfer') balanceAtEndDate += Number(t.amount) + Number(t.transfer_fee || 0);
      }
      if (t.transfer_to_account_id === account.id && t.type === 'transfer') {
        balanceAtEndDate -= Number(t.amount);
      }
    });

    return { ...account, currentBalance: balanceAtEndDate };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            G\u00e9n\u00e9rer un Rapport PDF
          </DialogTitle>
          <DialogDescription className="sr-only">
            G\u00e9n\u00e9rer un rapport financier au format PDF ou Excel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Type de période */}
          <div className="space-y-2">
            <Label>Type de p\u00e9riode</Label>
            <Select value={periodType} onValueChange={(value: 'month' | 'quarter' | 'year' | 'custom') => setPeriodType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mois</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Ann\u00e9e</SelectItem>
                <SelectItem value="custom">P\u00e9riode personnalis\u00e9e</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type de date */}
          <div className="space-y-2">
            <Label>Type de date pour les calculs</Label>
            <Select value={dateType} onValueChange={(value: 'accounting' | 'value') => setDateType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accounting">Date Comptable</SelectItem>
                <SelectItem value="value">Date Valeur</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ind\u00e9pendant du param\u00e8tre global dans les pr\u00e9f\u00e9rences
            </p>
          </div>

          {/* Format de rapport */}
          <div className="space-y-2">
            <Label>Format du rapport</Label>
            <Select value={reportFormat} onValueChange={(value: 'pdf' | 'excel') => setReportFormat(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF (avec graphiques)</SelectItem>
                <SelectItem value="excel">Excel (tableaux d\u00e9taill\u00e9s)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {reportFormat === 'pdf'
                ? 'Rapport visuel avec graphiques et mise en page professionnelle'
                : 'Donn\u00e9es structur\u00e9es en plusieurs feuilles pour analyse approfondie'}
            </p>
          </div>

          {/* Sélecteur de mois */}
          {periodType === 'month' && (
            <div className="space-y-2">
              <Label>S\u00e9lectionner le mois</Label>
              <MonthPicker
                selected={reportDate}
                onSelect={(date) => date && setReportDate(date)}
                placeholder="Choisir un mois"
              />
            </div>
          )}

          {/* Sélecteur de trimestre */}
          {periodType === 'quarter' && (
            <div className="space-y-2">
              <Label>S\u00e9lectionner le trimestre</Label>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  value={Math.floor(reportDate.getMonth() / 3).toString()}
                  onValueChange={(value) => {
                    const quarter = parseInt(value);
                    const newDate = new Date(reportDate.getFullYear(), quarter * 3, 1);
                    setReportDate(newDate);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Q1 (Jan-Mar)</SelectItem>
                    <SelectItem value="1">Q2 (Avr-Juin)</SelectItem>
                    <SelectItem value="2">Q3 (Juil-Sep)</SelectItem>
                    <SelectItem value="3">Q4 (Oct-D\u00e9c)</SelectItem>
                  </SelectContent>
                </Select>
                <YearPicker
                  selected={reportDate}
                  onSelect={(date) => date && setReportDate(date)}
                  placeholder="Ann\u00e9e"
                />
              </div>
            </div>
          )}

          {/* Sélecteur d'année */}
          {periodType === 'year' && (
            <div className="space-y-2">
              <Label>S\u00e9lectionner l'ann\u00e9e</Label>
              <YearPicker
                selected={reportDate}
                onSelect={(date) => date && setReportDate(date)}
                placeholder="Choisir une ann\u00e9e"
              />
            </div>
          )}

          {/* Période personnalisée */}
          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date de d\u00e9but</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(fixTimezone(date))}
                    locale={fr}
                    className="rounded-md border pointer-events-auto"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(fixTimezone(date))}
                    locale={fr}
                    className="rounded-md border pointer-events-auto"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Résumé de la période sélectionnée */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-1">P\u00e9riode du rapport</p>
            <p className="text-sm text-muted-foreground">
              Du {format(actualStartDate, 'dd MMMM yyyy', { locale: fr })} au {format(actualEndDate, 'dd MMMM yyyy', { locale: fr })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={reportFormat === 'pdf' ? handleGenerate : handleGenerateExcel} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  G\u00e9n\u00e9ration en cours...
                </>
              ) : (
                <>
                  {reportFormat === 'pdf' ? (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      G\u00e9n\u00e9rer le PDF
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      G\u00e9n\u00e9rer l'Excel
                    </>
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
