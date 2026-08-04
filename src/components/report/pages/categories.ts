import { format } from 'date-fns';
import type { ReportCtx } from '../types';

export function renderCategories(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, COL, setText, setFill, setDraw,
    ink, ink2, mute, neg, negSoft, line2Col,
    sans, mono, fmt, fmtSigned, newPage, state, totalPagesEstimate, locale,
    drawTopChrome, drawPageTitle, drawProgressBar, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { expenseCats, totalCatSpent, totalBudget, breachedCats, actualDates } = ctx.data;

  // The template's BUDGET / Δ columns use whole euros (no cents) so the
  // narrow columns never wrap. Strip the fractional part locale-agnostically
  // — handles "€2,680.00", "2 680,00 €", "2.680,00 €" alike (a decimal
  // separator + exactly two digits, followed only by the currency symbol).
  const m0 = (n: number) => fmt(Math.round(n)).replace(/[.,]\d{2}(?=\D*$)/, '');
  const sd = (n: number) => (n > 0 ? '+' : n < 0 ? '-' : '') + m0(Math.abs(n));

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  const y = drawPageTitle(
    'Section 05 · Breakdown',
    'By category',
    `${expenseCats.length} categories`,
    `${breachedCats.length} over budget`,
    breachedCats.length > 0 ? neg : ink2,
  );

  // How many rows fit on the page; remainder rolls into one "Other (N)".
  const SHOWN = 16;
  const shown = expenseCats.slice(0, SHOWN);
  const rest = expenseCats.slice(SHOWN);
  const maxSpent = expenseCats.reduce((m, c) => Math.max(m, c.spent), 0) || 1;

  // Per-body-row drawing instructions consumed by didDrawCell.
  type RowMeta = {
    over: boolean;
    muted: boolean;
    nameTag: boolean;
    nameText: string;
    barFraction: number;
    barOver: boolean;
  };
  const rowMeta: RowMeta[] = [];

  const body: Record<string, unknown>[][] = [];

  for (const c of shown) {
    const over = c.over;
    const hasBudget = c.budget > 0;
    const figCol = over ? neg : ink;
    rowMeta.push({
      over,
      muted: false,
      nameTag: over,
      nameText: c.name,
      barFraction: hasBudget ? c.spent / c.budget : c.spent / maxSpent,
      barOver: over,
    });
    body.push([
      { content: c.name, styles: { textColor: figCol } },
      { content: fmt(c.spent), styles: { halign: 'right', font: 'courier', textColor: figCol } },
      { content: `${Math.round(c.pctOfTotal)}%`, styles: { halign: 'right', font: 'courier', textColor: over ? neg : mute } },
      hasBudget
        ? { content: m0(c.budget), styles: { halign: 'right', font: 'courier', textColor: mute } }
        : { content: '—', styles: { halign: 'right', font: 'courier', textColor: mute } },
      hasBudget
        ? {
            content: sd(c.deltaVsBudget),
            styles: { halign: 'right', font: 'courier', textColor: c.deltaVsBudget > 0 ? neg : ctx.pos },
          }
        : { content: '—', styles: { halign: 'right', font: 'courier', textColor: mute } },
      { content: '', styles: {} },
    ]);
  }

  if (rest.length > 0) {
    const restSpent = rest.reduce((s, c) => s + c.spent, 0);
    const restPct = totalCatSpent > 0 ? (restSpent / totalCatSpent) * 100 : 0;
    rowMeta.push({
      over: false,
      muted: true,
      nameTag: false,
      nameText: `Other (${rest.length})`,
      barFraction: restSpent / maxSpent,
      barOver: false,
    });
    body.push([
      { content: `Other (${rest.length})`, styles: { textColor: mute } },
      { content: fmt(restSpent), styles: { halign: 'right', font: 'courier', textColor: mute } },
      { content: `${Math.round(restPct)}%`, styles: { halign: 'right', font: 'courier', textColor: mute } },
      { content: '—', styles: { halign: 'right', font: 'courier', textColor: mute } },
      { content: '—', styles: { halign: 'right', font: 'courier', textColor: mute } },
      { content: '', styles: {} },
    ]);
  }

  const totalDelta = totalCatSpent - totalBudget;

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['CATEGORY', 'SPENT', '% OF TOTAL', 'BUDGET', 'Δ VS BUDGET', '']],
    body,
    foot: [[
      { content: `Total · ${expenseCats.length} categories`, styles: { fontStyle: 'bold' } },
      { content: fmt(totalCatSpent), styles: { halign: 'right', font: 'courier', fontStyle: 'bold' } },
      { content: '100%', styles: { halign: 'right', font: 'courier', fontStyle: 'bold' } },
      { content: m0(totalBudget), styles: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: mute } },
      {
        content: sd(totalDelta),
        styles: { halign: 'right', font: 'courier', fontStyle: 'bold', textColor: totalDelta > 0 ? neg : ctx.pos },
      },
      { content: '', styles: {} },
    ]],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 1.9, bottom: 1.9, left: 0, right: 2 },
      textColor: ink,
      valign: 'middle',
    },
    headStyles: {
      font: 'courier',
      fontSize: 7,
      fontStyle: 'bold',
      textColor: mute,
      lineWidth: 0,
      fillColor: [255, 255, 255],
      cellPadding: { top: 0, bottom: 3, left: 0, right: 2 },
    },
    footStyles: { fillColor: [255, 255, 255], textColor: ink, lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 44 },
      1: { cellWidth: 24, halign: 'right' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: COL - 44 - 24 - 18 - 18 - 20 },
    },
    didDrawCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string;
        column: { index: number };
        row: { index: number };
        cell: { x: number; y: number; width: number; height: number; text: string[] };
      };

      // Thin ink rule under the header.
      if (d.section === 'head' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.4);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }

      if (d.section === 'body') {
        const m = rowMeta[d.row.index];

        // "over" pill right after the category name.
        if (d.column.index === 0 && m && m.nameTag) {
          sans(9, 'normal');
          const nameW = pdf.getTextWidth(m.nameText);
          const bx = d.cell.x + nameW + 4;
          const by = d.cell.y + d.cell.height / 2;
          setFill(negSoft);
          pdf.roundedRect(bx, by - 2, 11, 4, 0.6, 0.6, 'F');
          mono(6, 'bold');
          setText(neg);
          pdf.text('over', bx + 1.6, by + 1.1);
        }

        // Progress bar in the last column.
        if (d.column.index === 5 && m) {
          const bw = d.cell.width - 4;
          const bx = d.cell.x;
          const by = d.cell.y + d.cell.height / 2 - 0.8;
          drawProgressBar(bx, by, bw, 1.6, m.barFraction, m.barOver);
        }

        // Faint row separators.
        setDraw(line2Col);
        pdf.setLineWidth(0.1);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }

      // Heavy ink rule above the footer.
      if (d.section === 'foot' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.5);
        pdf.line(MARGIN_X, d.cell.y, PW - MARGIN_X, d.cell.y);
      }
    },
  });

  if (ctx.data.includeForecasted) {
    const projTotal = expenseCats.reduce((s, c) => s + c.projectedSpent, 0);
    if (projTotal > 0) {
      const cnt = expenseCats.filter((c) => c.projectedSpent > 0).length;
      mono(6.5, 'normal', 8);
      setText(mute);
      ctx.pdf.text(
        `Includes forecast · ${ctx.fmtSigned(-projTotal)} projected across ${cnt} categor${cnt === 1 ? 'y' : 'ies'}`,
        MARGIN_X, ctx.STRIP_Y - 9,
      );
      ctx.pdf.setCharSpace(0);
    }
  }
  // Named for what it actually is. This is the sum of the categories on this
  // page — special-budget rows live in their own envelope and never reach it
  // — so labelling it the period's total expenses put a second, different
  // "total expenses" in the same document.
  drawBottomStrip(`Total by category · ${ctx.periodLabel}`, fmt(totalCatSpent), neg);
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
