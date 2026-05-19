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
  } = ctx.data;

  // ── helpers ──────────────────────────────────────────────────────
  const sign1 = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
  const savingsRate = totalIncome > 0 ? Math.round((netResult / totalIncome) * 100) : 0;
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
      value: fmt(totalIncome),
      valueColor: pos,
      sub: incomeMoM == null ? '—' : `${sign1(incomeMoM)}% vs ${prevPeriodLabel}`,
      subColor: incomeMoM == null ? mute : incomeMoM >= 0 ? pos : neg,
    },
    {
      label: 'Expenses',
      value: fmt(totalExpenses),
      valueColor: neg,
      sub: expenseMoM == null ? '—' : `${sign1(expenseMoM)}% vs ${prevPeriodLabel}`,
      subColor: expenseMoM == null ? mute : expenseMoM < 0 ? pos : neg,
    },
    {
      label: 'Net result',
      value: fmtSigned(netResult),
      valueColor: netResult >= 0 ? pos : neg,
      sub: `${savingsRate}% savings`,
      subColor: mute,
      wrapValue: true,
    },
    {
      label: `Balance · ${balDate}`,
      value: fmt(balanceEnd),
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
  y += bandH + 13;

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

  const palette: RGB[] = [
    [12, 13, 12], [60, 62, 58], [110, 113, 108],
    [154, 156, 151], [198, 197, 189], [223, 221, 213],
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
  pdf.text(fmt(Math.round(totalCatSpent)), donutCx, donutCy + 0.5, { align: 'center' });
  mono(6);
  setText(mute);
  pdf.text('EXPENSES', donutCx, donutCy + 5, { align: 'center' });

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
    `${fmt(Math.round(stats.initialBalance))} → ${fmt(Math.round(balanceEnd))}`,
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
  drawSparkline(MARGIN_X, y, COL, sparkH, sparkPoints, ink);

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
    `${format(actualDates.end, 'd MMM', { locale }).toUpperCase()} · ${fmt(Math.round(balanceEnd))}`,
    PW - MARGIN_X, y + sparkH + 7, { align: 'right' },
  );

  // ── Bottom strip ─────────────────────────────────────────────────
  drawBottomStrip(
    `Net result · ${format(actualDates.start, 'MMMM yyyy', { locale })}`,
    fmtSigned(netResult),
    netResult >= 0 ? pos : neg,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
