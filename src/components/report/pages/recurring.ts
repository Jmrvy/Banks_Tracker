import type { ReportCtx } from '../types';

export function renderRecurring(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, COL, setText, setDraw, ink, mute, pos, neg, line2Col,
    mono, fmt, fmtSigned, newPage, state, totalPagesEstimate,
    drawTopChrome, drawPageTitle, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { activeRecurring } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  const y = drawPageTitle(
    'Section 09 · Schedule',
    'Recurring & subscriptions',
    `${activeRecurring.length} item${activeRecurring.length !== 1 ? 's' : ''}`,
    '',
  );

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['Description', 'Cat.', 'Freq.', 'Type', 'Period amt.']],
    body: activeRecurring.slice(0, 22).map((r) => [
      r.recurring.description,
      r.recurring.category?.name ?? '—',
      { content: r.recurring.recurrence_type, styles: { font: 'courier' } },
      { content: r.effectiveType, styles: { font: 'courier', textColor: r.effectiveType === 'income' ? pos : neg } },
      { content: fmt(r.periodAmount), styles: { halign: 'right', font: 'courier' } },
    ]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 2 }, textColor: ink },
    headStyles: { font: 'courier', fontSize: 7, fontStyle: 'bold', textColor: mute, fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30 },
      2: { cellWidth: 22 },
      3: { cellWidth: 20 },
      4: { cellWidth: COL - 80 - 30 - 22 - 20, halign: 'right' },
    },
    didDrawCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string;
        column: { index: number };
        cell: { y: number; height: number };
      };
      if (d.section === 'head' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.4);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      if (d.section === 'body') {
        setDraw(line2Col);
        pdf.setLineWidth(0.1);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
    },
  });

  const recTotal = activeRecurring.reduce(
    (s, r) => s + r.periodAmount * (r.effectiveType === 'income' ? 1 : -1), 0,
  );
  drawBottomStrip('Net recurring · period', fmtSigned(recTotal), recTotal >= 0 ? pos : neg);
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
