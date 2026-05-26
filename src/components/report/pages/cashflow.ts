import { format } from 'date-fns';
import type { ReportCtx } from '../types';

export function renderCashflow(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, setDraw, ink, mute, mute2, lineCol,
    sans, mono, fmt, fmtSigned, pos, neg, newPage, state, locale,
    totalPagesEstimate, drawTopChrome, drawPageTitle, drawKpiBand,
    drawSectionEyebrow, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    actualDates, evolutionChartData,
    combinedGrossIncome: grossIncome,
    combinedGrossExpenses: grossExpenses,
    combinedNet: netResult,
    refundTotal, refundCount, grossInflowCount, grossOutflowCount,
    typicalDailyExpense, topInflows, topOutflows, periodDays,
  } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);

  const dayCount = Math.max(1, evolutionChartData.length);
  const daysLabel = `${periodDays || dayCount} DAYS`;
  let y = drawPageTitle(
    'Section 04 · Movement',
    'Cash flow',
    'DAILY BASIS',
    daysLabel,
  );

  // ── KPI band (3 cells) ───────────────────────────────────────────
  drawKpiBand(y, 18, [
    {
      label: 'Gross income',
      value: fmt(grossIncome),
      valueColor: pos,
      delta: `${grossInflowCount} inflow${grossInflowCount !== 1 ? 's' : ''}`,
    },
    {
      label: 'Gross expenses',
      value: fmt(grossExpenses),
      valueColor: neg,
      delta: `${grossOutflowCount} outflow${grossOutflowCount !== 1 ? 's' : ''}`,
    },
    {
      label: 'Refunds',
      value: `+${fmt(refundTotal)}`,
      valueColor: pos,
      delta: `${refundCount} refund${refundCount !== 1 ? 's' : ''}`,
    },
  ]);
  y += 22;

  if (ctx.data.includeForecasted) {
    mono(6.5, 'normal', 8);
    setText(ctx.mute);
    const incTxt = ctx.fmtSigned(ctx.data.forecastIncome);
    const expTxt = ctx.fmtSigned(-ctx.data.forecastExpenses);
    const netTxt = ctx.fmtSigned(ctx.data.forecastNet);
    pdf.text(
      `Includes forecast · ${incTxt} income · ${expTxt} expenses · ${netTxt} net`,
      MARGIN_X, y + 4,
    );
    pdf.setCharSpace(0);
    y += 7;
  }

  // ── Daily flow chart ─────────────────────────────────────────────
  y = drawSectionEyebrow(
    'Daily flow · income vs. expenses',
    `net ${fmtSigned(netResult)} over the period`,
    y,
  );

  const chartW = COL;
  const chartH = 52;
  const chartX = MARGIN_X;
  const chartY = y + 2;
  const baseline = chartY + chartH / 2;
  const halfSpan = chartH / 2 - 4; // vertical room above/below baseline

  // box
  setDraw(lineCol);
  pdf.setLineWidth(0.3);
  pdf.rect(chartX, chartY, chartW, chartH, 'S');
  // mid baseline
  pdf.setLineWidth(0.2);
  pdf.line(chartX, baseline, chartX + chartW, baseline);

  // Scale to a robust band (≈85th percentile of daily flow), not the
  // absolute max — otherwise a single salary day flattens every other
  // bar. Outlier days simply clip at the chart edge, as in the template.
  const dailyMax = evolutionChartData
    .map((d) => Math.max(d.income, d.expense))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const pctile = dailyMax.length
    ? dailyMax[Math.min(dailyMax.length - 1, Math.floor(dailyMax.length * 0.85))]
    : 1;
  const rawMax = Math.max(1, pctile);
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const norm = rawMax / pow;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * pow;
  })();

  const innerPad = 3;
  const usableW = chartW - innerPad * 2;
  const slot = usableW / dayCount;
  const barW = Math.max(0.6, Math.min(2.4, slot * 0.5));

  evolutionChartData.forEach((d, i) => {
    const cx = chartX + innerPad + slot * i + slot / 2;
    const projected = !!d.isProjection;
    if (d.income > 0) {
      const h = Math.min(halfSpan, (d.income / niceMax) * halfSpan);
      // Projected income days drawn in a lighter mute so they read as
      // forecast without breaking the greyscale spec.
      setFill(projected ? ctx.mute2 : pos);
      pdf.rect(cx - barW / 2, baseline - h, barW, h, 'F');
    }
    if (d.expense > 0) {
      const h = Math.min(halfSpan, (d.expense / niceMax) * halfSpan);
      const heavy = d.expense > typicalDailyExpense * 1.5;
      setFill(projected ? ctx.mute : heavy ? neg : ink);
      pdf.rect(cx - barW / 2, baseline, barW, h, 'F');
    }
  });

  // Y-axis labels (inside, top-left & bottom-left)
  mono(6);
  setText(mute2);
  pdf.text(`+€${niceMax.toLocaleString('en-US')}`, chartX + 3, chartY + 5);
  pdf.text(`−€${niceMax.toLocaleString('en-US')}`, chartX + 3, chartY + chartH - 3);

  // X-axis labels under the box: 1 · mid · last
  const lastDay = dayCount;
  const midDay = Math.max(2, Math.round(dayCount / 2));
  const axisY = chartY + chartH + 4;
  mono(6);
  setText(mute2);
  pdf.text('1', chartX, axisY);
  if (lastDay > 2) {
    pdf.text(String(midDay), chartX + chartW / 2, axisY, { align: 'center' });
  }
  pdf.text(String(lastDay), chartX + chartW, axisY, { align: 'right' });

  // legend
  const legY = chartY + chartH + 9;
  const legend: { label: string; color: typeof pos }[] = [
    { label: 'Income', color: pos },
    { label: 'Expense', color: ink },
    { label: 'Over typical', color: neg },
  ];
  if (ctx.data.includeForecasted) {
    legend.push({ label: 'Forecast', color: ctx.mute });
  }
  let legX = chartX + chartW;
  // measure & right-align the legend cluster
  sans(8);
  const segW = legend.map((l) => 4 + pdf.getTextWidth(l.label) + 7);
  legX = chartX + chartW - segW.reduce((s, w) => s + w, 0) + 7;
  legend.forEach((l, i) => {
    setFill(l.color);
    pdf.rect(legX, legY - 2, 2.6, 2.6, 'F');
    sans(8);
    setText(ink);
    pdf.text(l.label, legX + 4, legY);
    legX += segW[i];
  });
  y = legY + 8;

  // ── Largest movements (two columns) ──────────────────────────────
  y = drawSectionEyebrow('Largest movements', 'single-day, ranked', y);

  const colGap = 10;
  const colW = (COL - colGap) / 2;
  const leftX = MARGIN_X;
  const rightX = MARGIN_X + colW + colGap;

  mono(7, 'bold');
  setText(mute);
  pdf.text('TOP 4 INFLOWS', leftX, y + 2);
  pdf.text('TOP 4 OUTFLOWS', rightX, y + 2);
  y += 8;

  const rowH = 9;
  const dateW = 14;
  const amtPad = 2;

  const drawRow = (
    x: number,
    w: number,
    rowY: number,
    date: Date,
    label: string,
    amount: number,
    color: typeof pos,
    sign: string,
  ) => {
    mono(7.5);
    setText(mute);
    pdf.text(format(date, 'd MMM', { locale }), x, rowY);
    sans(9);
    setText(ink);
    const labelMax = w - dateW - 22;
    let lbl = label || '';
    while (lbl && pdf.getTextWidth(lbl) > labelMax) lbl = lbl.slice(0, -1);
    if (lbl !== label && lbl.length > 1) lbl = lbl.slice(0, -1) + '…';
    pdf.text(lbl, x + dateW, rowY);
    mono(9, 'bold');
    setText(color);
    pdf.text(`${sign}${fmt(Math.abs(amount))}`, x + w - amtPad, rowY, {
      align: 'right',
    });
  };

  const rows = Math.max(topInflows.length, topOutflows.length, 4);
  for (let i = 0; i < rows; i++) {
    const rowY = y + i * rowH;
    const inf = topInflows[i];
    const out = topOutflows[i];
    if (inf) {
      drawRow(leftX, colW, rowY, inf.date, inf.label, inf.amount, pos, '+');
    }
    if (out) {
      drawRow(rightX, colW, rowY, out.date, out.label, out.amount, neg, '−');
    }
  }

  // ── Bottom strip ─────────────────────────────────────────────────
  drawBottomStrip(
    `Net cash flow · ${ctx.periodLabel}`,
    fmtSigned(netResult),
    netResult >= 0 ? pos : neg,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
