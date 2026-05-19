import type { ReportCtx } from '../types';

export function renderAccounts(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, setText, setDraw, ink, ink2, mute, neg, line2Col,
    sans, mono, fmt, newPage, state, totalPagesEstimate, BODY_BOTTOM,
    drawTopChrome, drawPageTitle, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { accountFlows } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 07 · Holdings',
    'Accounts',
    `${accountFlows.length} account${accountFlows.length !== 1 ? 's' : ''}`,
    '',
  );

  mono(7, 'bold');
  setText(mute);
  pdf.text('ACCOUNT', MARGIN_X, y);
  pdf.text('FLOW · IN / OUT', PW - MARGIN_X - 50, y);
  pdf.text('BALANCE', PW - MARGIN_X, y, { align: 'right' });
  setDraw(ink);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN_X, y + 2, PW - MARGIN_X, y + 2);
  y += 6;

  const totalBal = accountFlows.reduce((s, a) => s + a.closing, 0);
  for (const a of accountFlows) {
    sans(10, 'bold');
    setText(ink);
    pdf.text(a.name, MARGIN_X, y);
    sans(8);
    setText(mute);
    pdf.text(`${a.bank} · ${a.count} tx`, MARGIN_X, y + 4);
    mono(8);
    setText(mute);
    pdf.text(`+${fmt(a.inflow)} / −${fmt(a.outflow)}`, PW - MARGIN_X - 50, y);
    mono(11, 'bold');
    setText(a.closing < 0 ? neg : ink);
    pdf.text(fmt(a.closing), PW - MARGIN_X, y, { align: 'right' });
    setDraw(line2Col);
    pdf.setLineWidth(0.15);
    pdf.line(MARGIN_X, y + 7, PW - MARGIN_X, y + 7);
    y += 11;
    if (y > BODY_BOTTOM - 16) break;
  }

  y += 2;
  setDraw(ink);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN_X, y, PW - MARGIN_X, y);
  y += 5;
  mono(8, 'bold');
  setText(ink2);
  pdf.text('TOTAL BALANCE', MARGIN_X, y);
  mono(13, 'bold');
  setText(ink);
  pdf.text(fmt(totalBal), PW - MARGIN_X, y, { align: 'right' });

  drawBottomStrip('Total balance · end of period', fmt(totalBal));
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
