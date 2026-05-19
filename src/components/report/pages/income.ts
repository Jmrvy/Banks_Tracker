import type { ReportCtx } from '../types';

export function renderIncome(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, ink, mute, pos, newPage, state,
    sans, mono, fmt, totalPagesEstimate, BODY_BOTTOM,
    drawTopChrome, drawPageTitle, drawProgressBar, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { incomeCats } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 08 · Inflow',
    'Income sources',
    `${incomeCats.length} source${incomeCats.length !== 1 ? 's' : ''}`,
    '',
  );

  mono(7, 'bold');
  setText(mute);
  pdf.text('SOURCE', MARGIN_X, y);
  pdf.text('TX', MARGIN_X + 100, y);
  pdf.text('AMOUNT', PW - MARGIN_X, y, { align: 'right' });
  pdf.setDrawColor(ink[0], ink[1], ink[2]);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN_X, y + 2, PW - MARGIN_X, y + 2);
  y += 6;

  const incomeTotal = incomeCats.reduce((s, c) => s + c.totalAmount, 0);
  for (const c of incomeCats.slice(0, 18)) {
    const pct = incomeTotal > 0 ? c.totalAmount / incomeTotal : 0;
    sans(10, 'bold');
    setText(ink);
    pdf.text(c.category, MARGIN_X, y);
    mono(8);
    setText(mute);
    pdf.text(String(c.count), MARGIN_X + 100, y);
    mono(10, 'bold');
    setText(pos);
    pdf.text(fmt(c.totalAmount), PW - MARGIN_X, y, { align: 'right' });
    drawProgressBar(MARGIN_X, y + 2, COL, 1.6, pct, false, pos);
    y += 8.5;
    if (y > BODY_BOTTOM - 10) break;
  }

  drawBottomStrip('Total income · period', fmt(incomeTotal), pos);
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
