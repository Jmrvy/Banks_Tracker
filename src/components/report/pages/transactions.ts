import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { ReportCtx } from '../types';

export function renderTransactions(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, COL, setDraw, ink, mute, pos, neg, line2Col,
    fmt, fmtSigned, newPage, state, locale, totalPagesEstimate, BODY_TOP, STRIP_Y,
    drawTopChrome, drawPageTitle, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { filteredTransactions, netResult, config } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  const startY = drawPageTitle(
    'Section 10 · Ledger',
    'Transactions ledger',
    `${filteredTransactions.length} rows`,
    '',
  );

  let lastDrawnPage = state.pageIdx;
  autoTable(pdf, {
    startY,
    margin: { left: MARGIN_X, right: MARGIN_X, top: BODY_TOP - 2, bottom: STRIP_Y },
    head: [['Date', 'Description', 'Account', 'Category', 'Type', 'Amount']],
    body: filteredTransactions.map((tx) => {
      const txDate = config.dateType === 'value'
        ? parseLocalDate(tx.value_date || tx.transaction_date)
        : parseLocalDate(tx.transaction_date);
      const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '';
      return [
        { content: format(txDate, 'd MMM', { locale }), styles: { font: 'courier' as const } },
        tx.description,
        { content: tx.account?.name ?? '—', styles: { font: 'courier' as const, textColor: mute } },
        { content: tx.category?.name ?? '—', styles: { font: 'courier' as const, textColor: mute } },
        { content: tx.type, styles: { font: 'courier' as const, textColor: tx.type === 'income' ? pos : tx.type === 'expense' ? neg : mute } },
        { content: sign + fmt(Number(tx.amount)), styles: { halign: 'right' as const, font: 'courier' as const, textColor: tx.type === 'income' ? pos : tx.type === 'expense' ? neg : ink } },
      ];
    }),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 2 }, textColor: ink },
    headStyles: { font: 'courier', fontSize: 7, fontStyle: 'bold', textColor: mute, fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 68 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 18 },
      5: { cellWidth: COL - 18 - 68 - 26 - 26 - 18, halign: 'right' },
    },
    didDrawPage: () => {
      const physicalPage = pdf.getCurrentPageInfo().pageNumber;
      if (physicalPage !== lastDrawnPage) {
        state.pageIdx++;
        lastDrawnPage = physicalPage;
        drawTopChrome(state.pageIdx, totalPagesEstimate);
        drawPageTitle('Section 10 · Ledger (cont.)', 'Transactions ledger', `${filteredTransactions.length} rows`, '');
      }
      drawBottomStrip(`${filteredTransactions.length} rows · period`, fmtSigned(netResult), netResult >= 0 ? pos : neg);
      drawBottomChrome(state.pageIdx, totalPagesEstimate);
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
        pdf.setLineWidth(0.08);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
    },
  });
}
