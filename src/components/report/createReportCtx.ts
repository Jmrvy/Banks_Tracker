import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import type jsPDF from 'jspdf';
import type { ReportCtx, ReportData, RGB, KpiCell } from './types';

interface CtxInputs {
  pdf: jsPDF;
  autoTable: (doc: jsPDF, options: Record<string, unknown>) => void;
  formatCurrency: (n: number) => string;
  locale: Locale;
  t: (key: string, opts?: { defaultValue?: string } & Record<string, unknown>) => string;
  generatedAt: Date;
  reference: string;
  periodCompact: string;
  totalPagesEstimate: number;
  data: ReportData;
}

export function createReportCtx(input: CtxInputs): ReportCtx {
  const {
    pdf, autoTable, formatCurrency, locale, t,
    generatedAt, reference, periodCompact, totalPagesEstimate, data,
  } = input;
  const { actualDates } = data;

  const PW = pdf.internal.pageSize.getWidth(); // 210
  const PH = pdf.internal.pageSize.getHeight(); // 297
  const MARGIN_X = 16;
  const TOP_Y = 16;
  const FOOT_Y = PH - 12;
  const STRIP_Y = PH - 22;
  const BODY_TOP = 30;
  const BODY_BOTTOM = STRIP_Y - 6;
  const COL = PW - 2 * MARGIN_X;

  const ink: RGB = [12, 13, 12];
  const ink2: RGB = [31, 33, 31];
  const ink3: RGB = [60, 62, 58];
  const mute: RGB = [110, 113, 108];
  const mute2: RGB = [154, 156, 151];
  const mute3: RGB = [198, 197, 189];
  const lineCol: RGB = [231, 229, 221];
  const line2Col: RGB = [239, 236, 228];
  const pos: RGB = [44, 138, 91];
  const neg: RGB = [200, 58, 42];
  const negSoft: RGB = [248, 232, 229];
  const amber: RGB = [183, 119, 24];
  const amberSoft: RGB = [248, 240, 222];

  // jsPDF's built-in fonts are WinAnsi-only. A handful of typographic
  // glyphs the design calls for (minus, arrow, delta, ≥, up/down arrows)
  // are outside that encoding and render as garbage. Patch the document's
  // text() once so every draw — including jspdf-autotable's internal cell
  // rendering on this same instance — is transliterated to safe glyphs.
  const GLYPH_MAP: Array<[RegExp, string]> = [
    [/−/g, '-'],   // − minus  → hyphen-minus
    [/→/g, '–'], // → arrow → en dash (range-style, WinAnsi 0x96)
    [/Δ/g, '±'], // Δ delta → ± (plus-minus, WinAnsi 0xB1)
    [/≥/g, '>='],  // ≥        → >=
    [/↑/g, '+'],   // ↑        → +
    [/↓/g, '-'],   // ↓        → -
  ];
  const sanitize = (s: string) =>
    GLYPH_MAP.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
  const rawText = pdf.text.bind(pdf);
  (pdf as unknown as { text: (...a: unknown[]) => unknown }).text = (
    text: unknown,
    ...rest: unknown[]
  ) => {
    const fixed = typeof text === 'string'
      ? sanitize(text)
      : Array.isArray(text)
        ? text.map((s) => (typeof s === 'string' ? sanitize(s) : s))
        : text;
    return (rawText as (...a: unknown[]) => unknown)(fixed, ...rest);
  };

  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
  // Per the spec, type tracking is given in em × 1000 (negative tightens).
  // jsPDF charSpace is in the doc unit (mm); convert via point size.
  const applyTrack = (size: number, trackEmK: number) => {
    pdf.setCharSpace(trackEmK ? (trackEmK / 1000) * size * 0.352778 : 0);
  };
  const sans = (size: number, weight: 'normal' | 'bold' = 'normal', trackEmK = 0) => {
    pdf.setFont('helvetica', weight);
    pdf.setFontSize(size);
    applyTrack(size, trackEmK);
  };
  const mono = (size: number, weight: 'normal' | 'bold' = 'normal', trackEmK = 0) => {
    pdf.setFont('courier', weight);
    pdf.setFontSize(size);
    applyTrack(size, trackEmK);
  };

  const fmt = (n: number) => formatCurrency(n).replace(/\s/g, ' ');
  const fmtSigned = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

  // ── Spec stroke system — 3 weights only (§ 04) ───────────────────
  //  hairline → --line · section → --ink · document → --ink
  const HAIR = 0.15;
  const SECT = 0.5;
  const DOC = 0.8;
  const ruleHair = (x1: number, yy: number, x2: number) => {
    setDraw(lineCol);
    pdf.setLineWidth(HAIR);
    pdf.line(x1, yy, x2, yy);
  };
  const ruleSection = (x1: number, yy: number, x2: number) => {
    setDraw(ink);
    pdf.setLineWidth(SECT);
    pdf.line(x1, yy, x2, yy);
  };
  const ruleDoc = (x1: number, yy: number, x2: number) => {
    setDraw(ink);
    pdf.setLineWidth(DOC);
    pdf.line(x1, yy, x2, yy);
  };
  const noTrack = () => pdf.setCharSpace(0);

  const drawTopChrome = (pageNum: number, totalPages: number) => {
    setFill(ink);
    pdf.roundedRect(MARGIN_X, TOP_Y - 4.2, 4, 4, 1, 1, 'F');
    sans(8.5, 'bold', 2);
    setText(ink2);
    pdf.text('Spending Tracker · Financial report', MARGIN_X + 6, TOP_Y - 1);
    mono(7, 'normal', 8);
    setText(mute);
    pdf.text(format(actualDates.start, 'MMMM yyyy', { locale }).toUpperCase(), PW - MARGIN_X, TOP_Y - 5, { align: 'right' });
    pdf.text(`REF · ${reference}`, PW - MARGIN_X, TOP_Y - 1, { align: 'right' });
    mono(7, 'bold', 6);
    setText(ink2);
    pdf.text(
      `${String(pageNum).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
      PW - MARGIN_X, TOP_Y + 3, { align: 'right' },
    );
    ruleHair(MARGIN_X, TOP_Y + 6, PW - MARGIN_X);
    noTrack();
  };

  const drawBottomChrome = (pageNum: number, totalPages: number) => {
    ruleHair(MARGIN_X, FOOT_Y - 6, PW - MARGIN_X);
    mono(7, 'normal', 6);
    setText(mute);
    pdf.text(
      `SPENDING TRACKER · FINANCIAL REPORT · ${format(generatedAt, 'd MMM yyyy', { locale }).toUpperCase()}`,
      MARGIN_X, FOOT_Y - 1,
    );
    pdf.text(
      `${String(pageNum).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`,
      PW - MARGIN_X, FOOT_Y - 1, { align: 'right' },
    );
    noTrack();
  };

  const drawBottomStrip = (label: string, value: string, valueColor: RGB = ink) => {
    ruleDoc(MARGIN_X, STRIP_Y - 6, PW - MARGIN_X);
    mono(7.5, 'bold', 10);
    setText(ink2);
    pdf.text(label.toUpperCase(), MARGIN_X, STRIP_Y);
    mono(15, 'bold', -20);
    setText(valueColor);
    pdf.text(value, PW - MARGIN_X, STRIP_Y, { align: 'right' });
    noTrack();
  };

  const drawPageTitle = (
    eyebrow: string,
    title: string,
    rightPrimary?: string,
    rightSecondary?: string,
    rightSecondaryColor: RGB = ink2,
  ): number => {
    const y = BODY_TOP;
    mono(8, 'bold', 12);
    setText(mute);
    pdf.text(eyebrow.toUpperCase(), MARGIN_X, y);
    sans(17, 'bold', -15);
    setText(ink);
    pdf.text(title, MARGIN_X, y + 6.5);
    if (rightPrimary) {
      mono(7, 'normal', 8);
      setText(mute);
      pdf.text(rightPrimary, PW - MARGIN_X, y, { align: 'right' });
    }
    if (rightSecondary) {
      mono(7, 'bold', 8);
      setText(rightSecondaryColor);
      pdf.text(rightSecondary, PW - MARGIN_X, y + 5, { align: 'right' });
    }
    ruleSection(MARGIN_X, y + 9.5, PW - MARGIN_X);
    noTrack();
    return y + 14.5;
  };

  const drawSectionEyebrow = (label: string, meta: string | undefined, y: number): number => {
    mono(8, 'bold', 12);
    setText(ink);
    pdf.text(label.toUpperCase(), MARGIN_X, y);
    if (meta) {
      mono(7, 'normal', 8);
      setText(mute);
      pdf.text(meta, PW - MARGIN_X, y, { align: 'right' });
    }
    ruleHair(MARGIN_X, y + 2, PW - MARGIN_X);
    noTrack();
    return y + 6;
  };

  const drawKpiBand = (y: number, height: number, cells: KpiCell[]) => {
    const cellW = COL / cells.length;
    setDraw(lineCol);
    pdf.setLineWidth(HAIR);
    pdf.rect(MARGIN_X, y, COL, height, 'S');
    cells.forEach((c, i) => {
      const x = MARGIN_X + i * cellW;
      if (i > 0) pdf.line(x, y, x, y + height);
      mono(6.5, 'bold', 10);
      setText(mute);
      pdf.text(c.label.toUpperCase(), x + 3, y + 4);
      noTrack();
      mono(12, 'normal', -20);
      setText(c.valueColor ?? ink);
      pdf.text(c.value, x + 3, y + 10);
      noTrack();
      if (c.delta) {
        mono(7, 'normal', 4);
        setText(c.deltaColor ?? mute);
        pdf.text(c.delta, x + 3, y + height - 2);
        noTrack();
      }
    });
    noTrack();
  };

  const drawProgressBar = (
    x: number, y: number, w: number, h: number,
    fraction: number, over: boolean, color?: RGB,
  ) => {
    setFill(line2Col);
    pdf.roundedRect(x, y, w, h, 0.6, 0.6, 'F');
    const clamped = Math.max(0, Math.min(1, fraction));
    if (clamped > 0) {
      setFill(over ? neg : (color ?? ink));
      pdf.roundedRect(x, y, w * clamped, h, 0.6, 0.6, 'F');
    }
  };

  const drawDonut = (
    cx: number, cy: number, rOuter: number, rInner: number,
    segments: { value: number; color: RGB }[],
  ) => {
    const total = segments.reduce((a, b) => a + b.value, 0) || 1;
    const TAU = Math.PI * 2;
    const ARC = Math.PI / 90; // ~2° arc resolution

    // 1) Each segment as a single solid pie wedge (one fill — no seams).
    let angle = -Math.PI / 2;
    segments.forEach((seg) => {
      const sweep = (seg.value / total) * TAU;
      if (sweep <= 0) return;
      const steps = Math.max(2, Math.ceil(sweep / ARC));
      const pts: [number, number][] = [[cx, cy]];
      for (let i = 0; i <= steps; i++) {
        const a = angle + (sweep * i) / steps;
        pts.push([cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter]);
      }
      pts.push([cx, cy]);
      const rel: [number, number][] = [];
      for (let i = 1; i < pts.length; i++) {
        rel.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      }
      setFill(seg.color);
      pdf.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
      angle += sweep;
    });

    // 2) Crisp paper separators between segments so adjacent greys read
    //    as distinct slices even with low tonal contrast.
    angle = -Math.PI / 2;
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.8);
    segments.forEach((seg) => {
      if (seg.value <= 0) return;
      pdf.line(
        cx + Math.cos(angle) * (rInner - 0.3), cy + Math.sin(angle) * (rInner - 0.3),
        cx + Math.cos(angle) * (rOuter + 0.3), cy + Math.sin(angle) * (rOuter + 0.3),
      );
      angle += (seg.value / total) * TAU;
    });

    // 3) Punch the donut hole.
    pdf.setFillColor(255, 255, 255);
    pdf.circle(cx, cy, rInner, 'F');
  };

  const drawSparkline = (
    x: number, y: number, w: number, h: number,
    points: number[], color: RGB = ink,
  ) => {
    if (points.length === 0) return;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const toX = (i: number) => x + (i / Math.max(1, points.length - 1)) * w;
    const toY = (v: number) => y + h - ((v - min) / range) * h;
    setDraw(lineCol);
    pdf.setLineWidth(0.2);
    pdf.line(x, y + h, x + w, y + h);
    setDraw(color);
    pdf.setLineWidth(0.4);
    for (let i = 0; i < points.length - 1; i++) {
      pdf.line(toX(i), toY(points[i]), toX(i + 1), toY(points[i + 1]));
    }
  };

  const state = { pageIdx: 0 };
  const newPage = () => {
    if (state.pageIdx > 0) pdf.addPage();
    state.pageIdx++;
  };

  return {
    pdf,
    autoTable,
    PW, PH, MARGIN_X, TOP_Y, FOOT_Y, STRIP_Y, BODY_TOP, BODY_BOTTOM, COL,
    ink, ink2, ink3, mute, mute2, mute3, lineCol, line2Col, pos, neg, negSoft, amber, amberSoft,
    setText, setFill, setDraw, sans, mono, fmt, fmtSigned,
    drawTopChrome, drawBottomChrome, drawBottomStrip, drawPageTitle,
    drawSectionEyebrow, drawKpiBand, drawProgressBar, drawDonut, drawSparkline,
    state, newPage,
    generatedAt, reference, periodCompact, totalPagesEstimate, locale, t, formatCurrency,
    data,
  };
}
