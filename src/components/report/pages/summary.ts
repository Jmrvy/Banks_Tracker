import { format } from 'date-fns';
import type { ReportCtx, RGB } from '../types';

export function renderSummary(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, setDraw, ink, ink3, mute, mute2,
    lineCol, line2Col, sans, mono, fmt, fmtSigned, pos, neg, newPage, state, locale,
    totalPagesEstimate, drawTopChrome, drawPageTitle,
    drawSectionEyebrow, drawDonut, drawSparkline, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    actualDates, filteredTransactions, totalIncome, totalExpenses, netResult,
    balanceEnd, accounts, breachedCats, expenseCats, totalCatSpent,
    topCatsWithOther, sparkPoints, stats, periodDays, incomeMoM, expenseMoM,
    prevPeriodLabel, prevExpenses,
    combinedIncome, combinedExpenses, combinedNet, combinedFinalBalance,
    combinedTotalCatSpent,
  } = ctx.data;
  // When forecast is included, every headline figure shows the
  // forward-looking total; otherwise the combined values equal the
  // actuals so the same code path is used.
  const headIncome = combinedIncome;
  const headExpenses = combinedExpenses;
  const headNet = combinedNet;
  const headBalance = combinedFinalBalance;
  const headCatSpent = combinedTotalCatSpent;
  void totalIncome; void totalExpenses; void netResult; void balanceEnd; void totalCatSpent;

  // ── helpers ──────────────────────────────────────────────────────
  const sign1 = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
  const savingsRate = headIncome > 0 ? Math.round((headNet / headIncome) * 100) : 0;
  const monthName = format(actualDates.start, 'MMMM', { locale });
  const balDate = format(actualDates.end, 'd MMM', { locale }).toUpperCase();

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 03 · Snapshot',
    'Executive summary',
    `${periodDays} days`,
    `${filteredTransactions.length} tx`,
  );

  // ── KPI band (drawn locally: multi-line value / coloured sub-lines) ─
  const bandH = 30;
  const cells = [
    {
      label: 'Income',
      value: fmt(headIncome),
      valueColor: pos,
      sub: incomeMoM == null ? '—' : `${sign1(incomeMoM)}% vs ${prevPeriodLabel}`,
      subColor: incomeMoM == null ? mute : incomeMoM >= 0 ? pos : neg,
    },
    {
      label: 'Expenses',
      value: fmt(headExpenses),
      valueColor: neg,
      sub: expenseMoM == null ? '—' : `${sign1(expenseMoM)}% vs ${prevPeriodLabel}`,
      subColor: expenseMoM == null ? mute : expenseMoM < 0 ? pos : neg,
    },
    {
      label: 'Net result',
      value: fmtSigned(headNet),
      valueColor: headNet >= 0 ? pos : neg,
      sub: `${savingsRate}% savings`,
      subColor: mute,
      wrapValue: true,
    },
    {
      label: `Balance · ${balDate}`,
      value: fmt(headBalance),
      valueColor: ink,
      sub: `across ${accounts.length} accts`,
      subColor: mute,
    },
  ] as {
    label: string; value: string; valueColor: RGB;
    sub: string; subColor: RGB; wrapValue?: boolean;
  }[];

  const cellW = COL / cells.length;
  setDraw(lineCol);
  pdf.setLineWidth(0.3);
  pdf.rect(MARGIN_X, y, COL, bandH, 'S');
  cells.forEach((c, i) => {
    const x = MARGIN_X + i * cellW;
    if (i > 0) pdf.line(x, y, x, y + bandH);
    mono(6.5, 'bold');
    setText(mute);
    pdf.text(c.label.toUpperCase(), x + 4, y + 5);
    mono(12.5, 'bold');
    setText(c.valueColor);
    if (c.wrapValue) {
      const vLines = pdf.splitTextToSize(c.value, cellW - 6) as string[];
      vLines.slice(0, 2).forEach((ln, li) => pdf.text(ln, x + 4, y + 11 + li * 6.5));
    } else {
      pdf.text(c.value, x + 4, y + 12);
    }
    mono(7);
    setText(c.subColor);
    pdf.text(c.sub, x + 4, y + bandH - 3.5);
  });
  y += bandH + 4;

  // Forecast note (only when projection is enabled and non-empty).
  if (ctx.data.includeForecasted) {
    mono(6.5, 'normal', 8);
    setText(mute);
    const incTxt = ctx.fmtSigned(ctx.data.forecastIncome);
    const expTxt = ctx.fmtSigned(-ctx.data.forecastExpenses);
    const netTxt = ctx.fmtSigned(ctx.data.forecastNet);
    pdf.text(
      `Includes forecast · ${incTxt} income · ${expTxt} expenses · ${netTxt} net`,
      MARGIN_X, y,
    );
    pdf.setCharSpace(0);
    y += 5;
  }
  y += 4;

  // ── Commentary paragraph ─────────────────────────────────────────
  sans(9);
  setText(ink3);
  const spendDelta = totalExpenses - prevExpenses;
  const spendVerb = spendDelta < 0 ? 'fell' : 'rose';
  let commentary =
    `Across ${monthName}, total inflow was ${fmt(totalIncome)} against outflow of ` +
    `${fmt(totalExpenses)} — a ${savingsRate}% savings rate. Spending ${spendVerb} ` +
    `${fmt(Math.abs(spendDelta))} vs. ${prevPeriodLabel}.`;
  const firstBreach = breachedCats[0];
  if (firstBreach) {
    const usedPct = firstBreach.budget > 0
      ? Math.round((firstBreach.spent / firstBreach.budget) * 100)
      : 0;
    commentary +=
      ` ${firstBreach.name} exceeded its budget by ` +
      `${fmtSigned(firstBreach.spent - firstBreach.budget)} (${usedPct}% used).`;
  }
  const commentaryLines = pdf.splitTextToSize(commentary, COL) as string[];
  pdf.text(commentaryLines, MARGIN_X, y);
  y += commentaryLines.length * 4.7 + 13;

  // ── Where it went · top six ──────────────────────────────────────
  const acctPct = Math.round(topCatsWithOther.reduce((s, c) => s + c.pct, 0));
  y = drawSectionEyebrow(
    'Where it went · top six',
    `${expenseCats.length} categories · ${acctPct}% accounted for`,
    y,
  );

  // Wide-step greyscale ramp (spec is monochrome — 0 brand accents).
  // Larger tonal gaps + the donut's paper separators keep slices legible.
  const palette: RGB[] = [
    [12, 13, 12], [74, 76, 71], [128, 130, 123],
    [170, 171, 163], [206, 205, 197], [231, 229, 221],
  ];
  const donutCx = MARGIN_X + 28;
  const donutCy = y + 32;
  const donutSegs = topCatsWithOther.map((c, i) => ({
    value: c.spent,
    color: palette[i] ?? mute2,
  }));
  if (donutSegs.length > 0) drawDonut(donutCx, donutCy, 30, 18, donutSegs);
  mono(10, 'bold');
  setText(ink);
  pdf.text(fmt(Math.round(headCatSpent)), donutCx, donutCy + 0.5, { align: 'center' });
  mono(6);
  setText(mute);
  pdf.text('EXPENSES', donutCx, donutCy + 5, { align: 'center' });
  // Make the forecast inclusion explicit on the donut so the
  // combined breakdown doesn't read as actuals.
  if (ctx.data.includeForecasted && ctx.data.forecastExpenses > 0) {
    mono(5.5, 'normal', 8);
    setText(ctx.mute2);
    pdf.text('INCL. FORECAST', donutCx, donutCy + 9.5, { align: 'center' });
    pdf.setCharSpace(0);
  }

  const legendX = MARGIN_X + 70;
  let legendY = y + 9;
  topCatsWithOther.forEach((c, i) => {
    setFill(palette[i] ?? mute2);
    pdf.rect(legendX, legendY - 2.5, 2.8, 2.8, 'F');
    sans(9, 'bold');
    setText(c.over ? neg : ink);
    pdf.text(c.name, legendX + 5.5, legendY);
    mono(8);
    setText(c.over ? neg : mute);
    pdf.text(
      `${fmt(c.spent)} · ${Math.round(c.pct)}%`,
      PW - MARGIN_X, legendY, { align: 'right' },
    );
    legendY += 9.4;
  });
  y = Math.max(donutCy + 34, legendY - 0.5) + 12;

  // ── Balance trend · {periodDays} days ────────────────────────────
  y = drawSectionEyebrow(
    `Balance trend · ${periodDays} days`,
    `${fmt(Math.round(stats.initialBalance))} → ${fmt(Math.round(headBalance))}`,
    y,
  );
  const sparkH = 34;
  // Subtle area fill under the curve (drawn locally; helper draws line only)
  if (sparkPoints.length > 1) {
    const min = Math.min(...sparkPoints);
    const max = Math.max(...sparkPoints);
    const range = max - min || 1;
    const sx = (i: number) => MARGIN_X + (i / (sparkPoints.length - 1)) * COL;
    const syv = (v: number) => y + sparkH - ((v - min) / range) * sparkH;
    const poly: [number, number][] = [[0, 0]];
    let prevX = sx(0);
    let prevY = syv(sparkPoints[0]);
    for (let i = 1; i < sparkPoints.length; i++) {
      const nx = sx(i);
      const ny = syv(sparkPoints[i]);
      poly.push([nx - prevX, ny - prevY]);
      prevX = nx;
      prevY = ny;
    }
    poly.push([0, y + sparkH - prevY]);
    poly.push([-(prevX - sx(0)), 0]);
    setFill(line2Col);
    pdf.lines(poly, sx(0), syv(sparkPoints[0]), [1, 1], 'F');
  }
  drawSparkline(MARGIN_X, y, COL, sparkH, sparkPoints, ink, ctx.data.projectionStartIndex);

  const midDate = new Date(
    (actualDates.start.getTime() + actualDates.end.getTime()) / 2,
  );
  mono(6.5);
  setText(mute2);
  pdf.text(
    `1 ${format(actualDates.start, 'MMM', { locale }).toUpperCase()} · ${fmt(Math.round(stats.initialBalance))}`,
    MARGIN_X, y + sparkH + 7,
  );
  pdf.text(
    format(midDate, 'd MMM', { locale }).toUpperCase(),
    MARGIN_X + COL / 2, y + sparkH + 7, { align: 'center' },
  );
  pdf.text(
    `${format(actualDates.end, 'd MMM', { locale }).toUpperCase()} · ${fmt(Math.round(headBalance))}`,
    PW - MARGIN_X, y + sparkH + 7, { align: 'right' },
  );
  // Small actual / forecast key when the sparkline carries a dashed tail.
  if (ctx.data.includeForecasted && ctx.data.projectionStartIndex > 0) {
    const keyY = y + sparkH + 11;
    mono(5.5, 'normal', 8);
    setText(ctx.mute2);
    pdf.text('— ACTUAL  · - - FORECAST', PW - MARGIN_X, keyY, { align: 'right' });
    pdf.setCharSpace(0);
  }

  // ── Bottom strip ─────────────────────────────────────────────────
  drawBottomStrip(
    `Net result · ${ctx.periodLabel}`,
    fmtSigned(headNet),
    headNet >= 0 ? pos : neg,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
