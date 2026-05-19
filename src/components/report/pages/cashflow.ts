import { format } from 'date-fns';
import type { ReportCtx } from '../types';

export function renderCashflow(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, setDraw, ink, mute, mute2, mute3, lineCol,
    sans, mono, fmt, fmtSigned, pos, neg, newPage, state, locale, t,
    totalPagesEstimate, drawTopChrome, drawPageTitle, drawKpiBand,
    drawSectionEyebrow, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    actualDates, totalIncome, totalExpenses, netResult, evolutionChartData,
  } = ctx.data;
  const periodCompact = ctx.periodCompact;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle('Section 04 · Flow', 'Cash flow', periodCompact);

  drawKpiBand(y, 18, [
    { label: 'Income · period', value: fmt(totalIncome), valueColor: pos },
    { label: 'Expenses · period', value: fmt(totalExpenses), valueColor: neg },
    { label: 'Net · period', value: fmtSigned(netResult), valueColor: netResult >= 0 ? pos : neg },
  ]);
  y += 24;

  y = drawSectionEyebrow('Daily in / out', `${evolutionChartData.length} days`, y);
  const chartH = 60;
  const chartW = COL;
  const chartY = y + 2;
  setDraw(lineCol);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, chartY + chartH, MARGIN_X + chartW, chartY + chartH);

  const maxFlow = Math.max(1, ...evolutionChartData.map((d) => Math.max(d.income, d.expense)));
  const dayCount = evolutionChartData.length;
  const slot = chartW / Math.max(1, dayCount);
  const barW = Math.min(2.2, slot * 0.35);
  evolutionChartData.forEach((d, i) => {
    const cx = MARGIN_X + slot * i + slot / 2;
    const inH = (d.income / maxFlow) * (chartH * 0.45);
    const outH = (d.expense / maxFlow) * (chartH * 0.45);
    if (inH > 0) {
      setFill(pos);
      pdf.rect(cx - barW - 0.3, chartY + chartH / 2 - inH, barW, inH, 'F');
    }
    if (outH > 0) {
      setFill(neg);
      pdf.rect(cx + 0.3, chartY + chartH / 2, barW, outH, 'F');
    }
  });
  setDraw(mute3);
  pdf.setLineWidth(0.15);
  pdf.line(MARGIN_X, chartY + chartH / 2, MARGIN_X + chartW, chartY + chartH / 2);

  mono(6.5);
  setText(mute2);
  pdf.text(format(actualDates.start, 'd MMM', { locale }).toUpperCase(), MARGIN_X, chartY + chartH + 4);
  pdf.text(format(actualDates.end, 'd MMM', { locale }).toUpperCase(), MARGIN_X + chartW, chartY + chartH + 4, { align: 'right' });

  const legY = chartY + chartH + 10;
  setFill(pos);
  pdf.rect(MARGIN_X, legY, 3, 3, 'F');
  sans(8);
  setText(ink);
  pdf.text(t('reports.income', { defaultValue: 'Income' }), MARGIN_X + 5, legY + 2.5);
  setFill(neg);
  pdf.rect(MARGIN_X + 30, legY, 3, 3, 'F');
  pdf.text(t('reports.expenses', { defaultValue: 'Expenses' }), MARGIN_X + 35, legY + 2.5);

  drawBottomStrip('Net flow · period', fmtSigned(netResult), netResult >= 0 ? pos : neg);
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
