import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { ReportCtx } from '../types';

export function renderTransactions(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, PH, COL, setText, setDraw,
    ink, mute, pos, neg, lineCol, line2Col,
    mono, fmt, newPage, state, locale, totalPagesEstimate,
    BODY_TOP, STRIP_Y, drawTopChrome, drawPageTitle, drawBottomChrome,
  } = ctx;
  const {
    filteredTransactions, ledgerRows, openingBalance, ledgerPageCount,
    actualDates,
  } = ctx.data;

  // ledgerRows already resolves accounting/value dates; parseLocalDate kept
  // for type/import parity with sibling pages.
  void parseLocalDate;

  const totalRows = filteredTransactions.length;
  const periodStart = format(actualDates.start, 'd MMM yyyy', { locale }).toUpperCase();

  // ── First ledger page: top chrome + title ────────────────────────
  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 10 · Ledger',
    'Transactions',
    `${filteredTransactions.length} transactions`,
    `MOST RECENT FIRST · 1 OF ${ledgerPageCount}`,
  );

  // ── OPENING row (first ledger page only) ─────────────────────────
  mono(7, 'bold');
  setText(mute);
  pdf.text(`OPENING · ${periodStart}`, MARGIN_X, y + 2);
  mono(7);
  setText(ink);
  pdf.text(fmt(openingBalance), PW - MARGIN_X, y + 2, { align: 'right' });
  setDraw(lineCol);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, y + 5, PW - MARGIN_X, y + 5);
  y += 11;

  // ── Ledger table ─────────────────────────────────────────────────
  // column geometry (mm). DESCRIPTION widest; figures right-aligned.
  const W_DATE = 16;
  const W_CAT = 26;
  const W_ACCT = 26;
  const W_AMT = 24;
  const W_BAL = 24;
  const W_DESC = COL - W_DATE - W_CAT - W_ACCT - W_AMT - W_BAL;

  // physical page where the table currently is; used to detect the
  // page breaks autoTable spawns so we can re-stamp chrome.
  let lastDrawnPage = state.pageIdx;
  // ledger page ordinal within the section (1-based, set per spawned page)
  let ledgerPageNo = 0;
  // highest body row index drawn on the current physical page, so the
  // status line can show an honest cumulative "N OF total SHOWN".
  let pageMaxRowIdx = -1;

  autoTable(pdf, {
    startY: y,
    // margin.bottom/top are the page insets autoTable reserves. Bottom must
    // leave room for the status line + footer chrome (rule sits at
    // STRIP_Y-6); top governs continuation pages so the table starts under
    // the re-stamped "(cont.)" title rather than over it.
    margin: { left: MARGIN_X, right: MARGIN_X, top: BODY_TOP + 14, bottom: PH - STRIP_Y + 12 },
    head: [['DATE', 'DESCRIPTION', 'CATEGORY', 'ACCOUNT', 'AMOUNT', 'BALANCE']],
    body: ledgerRows.map((row) => {
      const tx = row.tx;
      const isIncome = tx.type === 'income';
      const isExpense = tx.type === 'expense';
      const sign = isIncome ? '+' : isExpense ? '−' : '';
      const isProj = !!row.isProjection;
      // Forecast rows are muted across the row (amount + balance), with a
      // small "· forecast" mute suffix on the description so they read as
      // upcoming rather than confirmed.
      const amtColor = isProj ? mute : isIncome ? pos : isExpense ? neg : ink;
      const balColor = isProj ? mute : ink;
      const descTxt = isProj ? `${tx.description}  · forecast` : tx.description;
      return [
        { content: format(row.date, 'd MMM', { locale }), styles: { font: 'courier' as const, textColor: isProj ? mute : ink } },
        { content: descTxt, styles: { textColor: isProj ? mute : ink } },
        { content: tx.category?.name ?? '—', styles: { font: 'courier' as const, textColor: mute } },
        { content: tx.account?.name ?? '—', styles: { font: 'courier' as const, textColor: mute } },
        {
          content: sign + fmt(Number(tx.amount)),
          styles: { halign: 'right' as const, font: 'courier' as const, textColor: amtColor },
        },
        {
          content: fmt(row.balance),
          styles: {
            halign: 'right' as const,
            font: 'courier' as const,
            fontStyle: (isProj ? 'normal' : 'bold') as 'bold' | 'normal',
            textColor: balColor,
          },
        },
      ];
    }),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 2 },
      textColor: ink,
    },
    headStyles: {
      font: 'courier',
      fontSize: 7,
      fontStyle: 'bold',
      textColor: mute,
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: W_DATE },
      1: { cellWidth: W_DESC },
      2: { cellWidth: W_CAT },
      3: { cellWidth: W_ACCT },
      4: { cellWidth: W_AMT, halign: 'right' },
      5: { cellWidth: W_BAL, halign: 'right' },
    },
    didDrawPage: () => {
      const physicalPage = pdf.getCurrentPageInfo().pageNumber;
      const isContinuation = physicalPage !== lastDrawnPage;
      ledgerPageNo += 1;

      // Continuation pages: bump the shared counter and re-stamp the
      // top chrome + a "(cont.)" title. The OPENING row is NOT repeated.
      if (isContinuation) {
        state.pageIdx++;
        lastDrawnPage = physicalPage;
        drawTopChrome(state.pageIdx, totalPagesEstimate);
        drawPageTitle(
          'Section 10 · Ledger (cont.)',
          'Transactions',
          `${filteredTransactions.length} transactions`,
          `MOST RECENT FIRST · ${ledgerPageNo} OF ${ledgerPageCount}`,
        );
      }

      // rows shown cumulatively through the end of this ledger page
      const shownThrough = pageMaxRowIdx >= 0
        ? Math.min(pageMaxRowIdx + 1, totalRows)
        : Math.min(ledgerPageNo * 30, totalRows);
      const isLast = ledgerPageNo >= ledgerPageCount || shownThrough >= totalRows;

      // ── status line (replaces the big headline value strip) ──────
      // The template ledger page has no bold value strip — just a thin
      // ink rule, a left status line and a right continuation marker.
      setDraw(ink);
      pdf.setLineWidth(0.4);
      pdf.line(MARGIN_X, STRIP_Y - 6, PW - MARGIN_X, STRIP_Y - 6);
      mono(7, 'bold');
      setText(ink);
      pdf.text(
        `PAGE ${ledgerPageNo} OF ${ledgerPageCount} · ${shownThrough} OF ${totalRows} SHOWN`,
        MARGIN_X, STRIP_Y,
      );
      mono(7);
      setText(mute);
      if (isLast) {
        pdf.text('END OF LEDGER', PW - MARGIN_X, STRIP_Y, { align: 'right' });
      } else {
        const nextPdfPage = state.pageIdx + 1;
        pdf.text(
          `CONTINUED · ${String(nextPdfPage).padStart(2, '0')} / ${String(totalPagesEstimate).padStart(2, '0')} →`,
          PW - MARGIN_X, STRIP_Y, { align: 'right' },
        );
      }

      drawBottomChrome(state.pageIdx, totalPagesEstimate);

      // reset per-physical-page row tracker
      pageMaxRowIdx = -1;
    },
    didDrawCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string;
        column: { index: number };
        row: { index: number };
        cell: { y: number; height: number };
      };
      // thin ink rule directly under the header row
      if (d.section === 'head' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.4);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      if (d.section === 'body') {
        if (d.column.index === 0 && d.row.index > pageMaxRowIdx) {
          pageMaxRowIdx = d.row.index;
        }
        // very faint per-row separators
        setDraw(line2Col);
        pdf.setLineWidth(0.08);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
    },
  });
}
