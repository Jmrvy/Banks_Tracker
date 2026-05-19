import { format } from 'date-fns';
import type { ReportCtx, RGB } from '../types';

export function renderSummary(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, ink, ink3, mute, mute2,
    sans, mono, fmt, fmtSigned, pos, neg, newPage, state, locale,
    totalPagesEstimate, drawTopChrome, drawPageTitle, drawKpiBand,
    drawSectionEyebrow, drawDonut, drawSparkline, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    actualDates, filteredTransactions, totalIncome, totalExpenses, netResult,
    balanceEnd, accounts, breachedCats, expenseCats, totalCatSpent, sparkPoints, stats,
  } = ctx.data;
  const top6Cats = expenseCats.slice(0, 6);

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 03 · Snapshot',
    'Executive summary',
    `${Math.max(1, Math.round((actualDates.end.getTime() - actualDates.start.getTime()) / 86400000))} days`,
    `${filteredTransactions.length} tx`,
  );

  drawKpiBand(y, 20, [
    { label: 'Income', value: fmt(totalIncome), valueColor: pos },
    { label: 'Expenses', value: fmt(totalExpenses), valueColor: neg },
    { label: 'Net result', value: fmtSigned(netResult), valueColor: netResult >= 0 ? pos : neg, delta: `${totalIncome > 0 ? Math.round((netResult / totalIncome) * 100) : 0}% savings` },
    { label: 'Balance · end', value: fmt(balanceEnd), delta: `${accounts.length} account${accounts.length !== 1 ? 's' : ''}` },
  ]);
  y += 26;

  sans(9);
  setText(ink3);
  const verdict =
    netResult >= 0
      ? `Across the period, inflow was ${fmt(totalIncome)} against outflow of ${fmt(totalExpenses)} — a ${Math.round((netResult / Math.max(1, totalIncome)) * 100)}% savings rate.`
      : `Period net was ${fmt(netResult)} (${fmt(totalIncome)} in vs. ${fmt(totalExpenses)} out).`;
  const breachLine = breachedCats.length > 0
    ? ` ${breachedCats.length} categor${breachedCats.length === 1 ? 'y' : 'ies'} exceeded budget (${breachedCats.map((b) => b.name).slice(0, 3).join(', ')}${breachedCats.length > 3 ? '…' : ''}).`
    : '';
  const commentaryLines = pdf.splitTextToSize(verdict + breachLine, COL);
  pdf.text(commentaryLines, MARGIN_X, y);
  y += commentaryLines.length * 4.5 + 4;

  y = drawSectionEyebrow('Where it went · top six', `${expenseCats.length} categories`, y);
  const donutCx = MARGIN_X + 22;
  const donutCy = y + 22;
  const palette: RGB[] = [
    [12, 13, 12], [60, 62, 58], [110, 113, 108],
    [154, 156, 151], [198, 197, 189], [218, 216, 208],
  ];
  const donutSegs = top6Cats.map((c, i) => ({ value: c.spent, color: palette[i] ?? mute2 }));
  if (donutSegs.length > 0) drawDonut(donutCx, donutCy, 22, 14, donutSegs);
  mono(7, 'bold');
  setText(ink);
  pdf.text(fmt(totalCatSpent), donutCx, donutCy + 0, { align: 'center' });
  mono(5.5);
  setText(mute);
  pdf.text('EXPENSES', donutCx, donutCy + 3, { align: 'center' });

  const legendX = MARGIN_X + 50;
  let legendY = y + 4;
  top6Cats.forEach((c, i) => {
    setFill(palette[i] ?? mute2);
    pdf.rect(legendX, legendY - 2, 2.5, 2.5, 'F');
    sans(9, 'bold');
    setText(ink);
    pdf.text(c.name, legendX + 4, legendY);
    const pct = totalCatSpent > 0 ? Math.round((c.spent / totalCatSpent) * 100) : 0;
    mono(8);
    setText(c.budget > 0 && c.spent > c.budget ? neg : mute);
    pdf.text(`${fmt(c.spent)} · ${pct}%`, PW - MARGIN_X, legendY, { align: 'right' });
    legendY += 5;
  });
  y = Math.max(y + 50, legendY + 4);

  y = drawSectionEyebrow('Balance trend', `${fmt(stats.initialBalance)} → ${fmt(balanceEnd)}`, y);
  drawSparkline(MARGIN_X, y, COL, 18, sparkPoints, ink);
  mono(6.5);
  setText(mute2);
  pdf.text(format(actualDates.start, 'd MMM', { locale }).toUpperCase(), MARGIN_X, y + 22);
  pdf.text(format(actualDates.end, 'd MMM', { locale }).toUpperCase(), PW - MARGIN_X, y + 22, { align: 'right' });

  drawBottomStrip('Net result · period', fmtSigned(netResult), netResult >= 0 ? pos : neg);
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
