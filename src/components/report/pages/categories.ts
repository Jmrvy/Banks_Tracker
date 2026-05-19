import type { ReportCtx } from '../types';

export function renderCategories(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, COL, setText, setDraw, ink, mute, line2Col,
    mono, fmt, neg, newPage, state, totalPagesEstimate,
    drawTopChrome, drawPageTitle, drawProgressBar, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { expenseCats, totalCatSpent, filteredTransactions } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  const y = drawPageTitle(
    'Section 05 · Allocation',
    'By category',
    `${expenseCats.length} categories`,
    `${filteredTransactions.filter((tx) => tx.type === 'expense').length} tx`,
  );

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['Category', 'Amount', '%', '']],
    body: expenseCats.slice(0, 18).map((c) => {
      const pct = totalCatSpent > 0 ? (c.spent / totalCatSpent) * 100 : 0;
      return [
        c.name,
        { content: fmt(c.spent), styles: { halign: 'right', font: 'courier' } },
        { content: pct.toFixed(0) + '%', styles: { halign: 'right', font: 'courier' } },
        { content: pct.toFixed(0), styles: { halign: 'left' } },
      ];
    }),
    foot: [[
      { content: 'Total', styles: { fontStyle: 'bold' } },
      { content: fmt(totalCatSpent), styles: { halign: 'right', font: 'courier', fontStyle: 'bold' } },
      { content: '100%', styles: { halign: 'right', font: 'courier', fontStyle: 'bold' } },
      '',
    ]],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 2 }, textColor: ink },
    headStyles: { font: 'courier', fontSize: 7, fontStyle: 'bold', textColor: mute, lineWidth: 0, fillColor: [255, 255, 255] },
    footStyles: { fillColor: [255, 255, 255], textColor: ink, lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: COL - 70 - 35 - 16 },
    },
    didDrawCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string;
        column: { index: number };
        row: { index: number };
        cell: { x: number; y: number; width: number; height: number; text: string[] };
      };
      if (d.section === 'head' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.4);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      if (d.section === 'body' && d.column.index === 3 && d.cell.text[0]) {
        const pctv = parseFloat(d.cell.text[0] || '0') / 100;
        const bx = d.cell.x + 2;
        const by = d.cell.y + d.cell.height / 2 - 0.8;
        const bw = d.cell.width - 4;
        d.cell.text = [''];
        const row = expenseCats[d.row.index];
        const over = !!(row && row.budget > 0 && row.spent > row.budget);
        drawProgressBar(bx, by, bw, 1.6, pctv, over);
      }
      if (d.section === 'body') {
        setDraw(line2Col);
        pdf.setLineWidth(0.1);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      if (d.section === 'foot' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.5);
        pdf.line(MARGIN_X, d.cell.y, PW - MARGIN_X, d.cell.y);
      }
    },
  });

  drawBottomStrip('Total expenses · period', fmt(totalCatSpent), neg);
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
