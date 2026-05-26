import { format } from 'date-fns';
import type { ReportCtx } from '../types';

export function renderAccounts(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, COL, setText, setDraw,
    ink, ink2, mute, mute2, lineCol, line2Col, pos, neg,
    sans, mono, fmt, fmtSigned, newPage, state, locale,
    totalPagesEstimate, drawTopChrome, drawPageTitle,
    drawSectionEyebrow, drawSparkline, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    accountFlows, bankCount, totalBalance, stats, balanceEnd,
    sparkPoints, actualDates,
  } = ctx.data;

  // ── helpers ──────────────────────────────────────────────────────
  const cap = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
  const round0 = (n: number) => Math.round(n);
  const initBal = round0(stats.initialBalance);
  // Use the combined final balance when forecast is on so the
  // sparkline's trailing label matches the closing column.
  const endBal = round0(ctx.data.combinedFinalBalance);
  const pct = stats.initialBalance
    ? Math.round(((ctx.data.combinedFinalBalance - stats.initialBalance) / stats.initialBalance) * 1000) / 10
    : 0;
  const pctStr = `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
  const asOf = format(actualDates.end, 'd MMM yyyy', { locale }).toUpperCase();

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 07 · Holdings',
    'Accounts',
    `${accountFlows.length} account${accountFlows.length !== 1 ? 's' : ''} · ${bankCount} bank${bankCount !== 1 ? 's' : ''}`,
    `AS OF ${asOf}`,
  );

  // ── Statement table ──────────────────────────────────────────────
  // When forecast is enabled, the per-row figures show the combined
  // (actual + projected) flow and closing balance; otherwise they
  // collapse to actuals.
  const useCombined = ctx.data.includeForecasted;
  const rowVals = (a: typeof accountFlows[number]) => ({
    inflow: a.inflow + (useCombined ? a.projectedInflow : 0),
    outflow: a.outflow + (useCombined ? a.projectedOutflow : 0),
    net: a.net + (useCombined ? a.projectedInflow - a.projectedOutflow : 0),
    closing: useCombined ? a.projectedClosing : a.closing,
  });
  const tot = accountFlows.reduce(
    (acc, c) => {
      const v = rowVals(c);
      return {
        opening: acc.opening + c.opening,
        inflow: acc.inflow + v.inflow,
        outflow: acc.outflow + v.outflow,
        net: acc.net + v.net,
        closing: acc.closing + v.closing,
      };
    },
    { opening: 0, inflow: 0, outflow: 0, net: 0, closing: 0 },
  );

  // Column geometry (mm) tuned to the template's rhythm: a narrow ACCOUNT
  // block (bold name wraps + mono masked tail), a mono TYPE word, then five
  // right-aligned numeric columns whose right edges line up at
  // OPENING≈90 · INCOME≈115 · EXPENSES≈140 · NET≈164 · CLOSING≈192.
  const W_ACCT = 30;
  const W_TYPE = 21;
  const W_OPEN = 28.3;
  const W_INC = 25.2;
  const W_EXP = 24.9;
  const W_NET = 24.1;
  const W_CLOSE = COL - W_ACCT - W_TYPE - W_OPEN - W_INC - W_EXP - W_NET;

  const numCell = (txt: string, color: [number, number, number], bold = false) => ({
    content: txt,
    styles: {
      halign: 'right' as const,
      font: 'courier' as const,
      fontStyle: (bold ? 'bold' : 'normal') as 'bold' | 'normal',
      textColor: color,
    },
  });

  const lastRow = accountFlows.length - 1;

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['ACCOUNT', 'TYPE', 'OPENING', 'INCOME', 'EXPENSES', 'NET', 'CLOSING']],
    body: accountFlows.map((a) => {
      const v = rowVals(a);
      return [
        // ACCOUNT — rendered manually in didDrawCell (bold name + mono tail)
        { content: '', styles: { minCellHeight: 17 } },
        { content: cap(a.type), styles: { font: 'courier', fontSize: 8, textColor: ink2 } },
        numCell(fmt(a.opening), ink),
        v.inflow > 0 ? numCell(`+${fmt(v.inflow)}`, pos) : numCell('—', mute),
        v.outflow > 0 ? numCell(`−${fmt(v.outflow)}`, neg) : numCell('—', mute),
        numCell(fmtSigned(v.net), v.net >= 0 ? pos : neg),
        numCell(fmt(v.closing), v.closing < 0 ? neg : ink, true),
      ];
    }),
    foot: [[
      { content: 'Net total', styles: { fontStyle: 'bold', textColor: ink } },
      '',
      numCell(fmt(tot.opening), ink, true),
      tot.inflow > 0 ? numCell(`+${fmt(tot.inflow)}`, pos, true) : numCell('—', mute, true),
      tot.outflow > 0 ? numCell(`−${fmt(tot.outflow)}`, neg, true) : numCell('—', mute, true),
      numCell(fmtSigned(tot.net), tot.net >= 0 ? pos : neg, true),
      numCell(fmt(tot.closing), tot.closing < 0 ? neg : ink, true),
    ]],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2.5, bottom: 2.5, left: 0, right: 2 },
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
    footStyles: { fillColor: [255, 255, 255], textColor: ink, lineWidth: 0, fontSize: 9 },
    columnStyles: {
      0: { cellWidth: W_ACCT },
      1: { cellWidth: W_TYPE },
      2: { cellWidth: W_OPEN, halign: 'right' },
      3: { cellWidth: W_INC, halign: 'right' },
      4: { cellWidth: W_EXP, halign: 'right' },
      5: { cellWidth: W_NET, halign: 'right' },
      6: { cellWidth: W_CLOSE, halign: 'right' },
    },
    didDrawCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string;
        column: { index: number };
        row: { index: number };
        cell: { x: number; y: number; width: number; height: number; text: string[] };
      };
      // ink rule under the header
      if (d.section === 'head' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.4);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      // ACCOUNT cell — bold name (≤2 lines) + smaller mono masked tail
      if (d.section === 'body' && d.column.index === 0) {
        const a = accountFlows[d.row.index];
        d.cell.text = [];
        const tx = d.cell.x;
        const nameH = 3.7;
        const tailH = 3.1;
        sans(9, 'bold');
        const nameLines = (pdf.splitTextToSize(a.name, d.cell.width - 1) as string[]).slice(0, 2);
        // Masked account tail only (no raw bank enum) — kept inside the
        // ACCOUNT column so it never overruns into TYPE.
        let tailStr = `···· ${a.tail}`;
        mono(6.5);
        const tailMax = d.cell.width - 1.5;
        while (tailStr.length > 4 && pdf.getTextWidth(tailStr) > tailMax) {
          tailStr = tailStr.slice(0, -1);
        }
        // Top-anchored within the cell so the block can never bleed into
        // the header rule or the neighbouring row.
        let ly = d.cell.y + 3.6;
        setText(ink);
        nameLines.forEach((ln) => {
          pdf.text(ln, tx, ly);
          ly += nameH;
        });
        ly += 1.4;
        mono(6.5);
        setText(mute);
        pdf.text(tailStr, tx, ly);
      }
      // thin separators between body rows (none after the last — the heavy
      // rule above "Net total" closes the ledger)
      if (d.section === 'body' && d.row.index < lastRow) {
        setDraw(line2Col);
        pdf.setLineWidth(0.1);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      // heavier rule above Net total
      if (d.section === 'foot' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.5);
        pdf.line(MARGIN_X, d.cell.y, PW - MARGIN_X, d.cell.y);
      }
    },
  });

  const tableEnd = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  y = tableEnd + 12;

  // ── Cumulative balance · all accounts ────────────────────────────
  y = drawSectionEyebrow(
    'Cumulative balance · all accounts',
    `${fmt(initBal)} → ${fmt(endBal)} · ${pctStr}`,
    y,
  );
  y += 3;

  const boxH = 52;
  const padX = 6;
  const padTop = 6;
  const labelBandH = 15;
  setDraw(lineCol);
  pdf.setLineWidth(0.3);
  pdf.rect(MARGIN_X, y, COL, boxH, 'S');

  const sparkX = MARGIN_X + padX;
  const sparkY = y + padTop;
  const sparkW = COL - padX * 2;
  const sparkH = boxH - padTop - labelBandH;
  drawSparkline(sparkX, sparkY, sparkW, sparkH, sparkPoints, ink, ctx.data.projectionStartIndex);

  const midDate = new Date(
    (actualDates.start.getTime() + actualDates.end.getTime()) / 2,
  );
  const labelY = y + boxH - 5;
  mono(6);
  setText(mute2);
  pdf.text(
    `1 ${format(actualDates.start, 'MMM', { locale }).toUpperCase()} · ${fmt(initBal)}`,
    sparkX, labelY,
  );
  pdf.text(
    format(midDate, 'd MMM', { locale }),
    MARGIN_X + COL / 2, labelY, { align: 'center' },
  );
  pdf.text(
    fmt(endBal),
    PW - MARGIN_X - padX, labelY, { align: 'right' },
  );
  // Actual / forecast key for the dashed-tail sparkline.
  if (ctx.data.includeForecasted && ctx.data.projectionStartIndex > 0) {
    mono(5.5, 'normal', 8);
    setText(mute2);
    pdf.text(
      '— ACTUAL  · - - FORECAST',
      PW - MARGIN_X - padX, labelY + 4, { align: 'right' },
    );
    pdf.setCharSpace(0);
  }

  // ── Bottom strip ─────────────────────────────────────────────────
  // tot.closing is combined (= sum of projectedClosing) when forecast
  // is enabled, otherwise sum of actual closings.
  drawBottomStrip(
    `Total balance · ${format(actualDates.end, 'd MMM yyyy', { locale })}`,
    fmt(tot.closing),
  );
  void totalBalance;
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
