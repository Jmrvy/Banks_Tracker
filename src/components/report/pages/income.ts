import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { ReportCtx } from '../types';

export function renderIncome(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, STRIP_Y, setText, setFill, setDraw,
    ink, ink2, mute, mute2, lineCol, line2Col, pos,
    sans, mono, fmt, newPage, state, locale, totalPagesEstimate,
    drawTopChrome, drawPageTitle, drawSectionEyebrow, drawKpiBand,
    drawProgressBar, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    incomeSources, grossIncome, recurringIncomeTotal, recurringIncomeCount,
    oneOffIncomeTotal, oneOffIncomeCount, refundItems, refundTotal, refundCount,
    monthlyIncomeSeries, incomeTrendStable, actualDates, config,
  } = ctx.data;

  const RIGHT = PW - MARGIN_X;
  const monthLabel = format(actualDates.end, 'MMMM', { locale });
  const pctOfGross = (n: number) =>
    grossIncome > 0 ? Math.round((n / grossIncome) * 100) : 0;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);

  let y = drawPageTitle(
    'Section 08 · Inflows',
    'Income sources',
    `${incomeSources.length} source${incomeSources.length !== 1 ? 's' : ''}`,
    `${fmt(grossIncome)} TOTAL`,
  );

  // ── KPI band (3 cells) ───────────────────────────────────────────
  drawKpiBand(y, 18, [
    {
      label: 'Recurring',
      value: fmt(recurringIncomeTotal),
      valueColor: pos,
      delta: `${recurringIncomeCount} source${recurringIncomeCount !== 1 ? 's' : ''} · ${pctOfGross(recurringIncomeTotal)}%`,
    },
    {
      label: 'One-offs',
      value: fmt(oneOffIncomeTotal),
      delta: `${oneOffIncomeCount} source${oneOffIncomeCount !== 1 ? 's' : ''} · ${pctOfGross(oneOffIncomeTotal)}%`,
    },
    {
      label: 'Refunds',
      value: `+${fmt(refundTotal)}`,
      valueColor: pos,
      delta: `${refundCount} refund${refundCount !== 1 ? 's' : ''} · excl.`,
    },
  ]);
  y += 22;

  if (ctx.data.includeForecasted) {
    mono(6.5, 'normal', 8);
    setText(mute);
    const incTxt = ctx.fmtSigned(ctx.data.forecastIncome);
    const expTxt = ctx.fmtSigned(-ctx.data.forecastExpenses);
    pdf.text(
      `Includes forecast · ${incTxt} income · ${expTxt} expenses`,
      MARGIN_X, y + 4,
    );
    pdf.setCharSpace(0);
    y += 7;
  }

  // ── Per source table ─────────────────────────────────────────────
  // Column anchors are declared early so the pagination helpers can
  // re-stamp the header on any continuation page.
  const xSource = MARGIN_X;
  const xCat = MARGIN_X + 62;
  const xCount = MARGIN_X + 91;
  const xAmount = MARGIN_X + 142;
  const xShare = MARGIN_X + 158;
  const barX = MARGIN_X + 162;
  const barW = RIGHT - barX;

  // Safe lower y-bound for body content (just above the bottom strip
  // rule). If content would cross it we spawn a continuation page.
  const BODY_LIMIT = STRIP_Y - 8;

  const drawColHeader = (yy: number): number => {
    mono(7, 'bold');
    setText(mute);
    pdf.text('SOURCE', xSource, yy);
    pdf.text('CATEGORY', xCat, yy);
    pdf.text('COUNT', xCount, yy);
    pdf.text('AMOUNT', xAmount, yy, { align: 'right' });
    pdf.text('%', xShare, yy - 3, { align: 'right' });
    pdf.text('SHARE', xShare, yy, { align: 'right' });
    setDraw(ink);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN_X, yy + 2.5, RIGHT, yy + 2.5);
    return yy + 8;
  };

  /** Close the current page's chrome, spawn a new one, re-stamp the
   *  page title and a fresh section eyebrow. Returns the new body y. */
  const contPage = (eyebrow: string, meta: string): number => {
    drawBottomChrome(state.pageIdx, totalPagesEstimate);
    newPage();
    drawTopChrome(state.pageIdx, totalPagesEstimate);
    const yy = drawPageTitle(
      'Section 08 · Inflows (cont.)',
      'Income sources',
      `${incomeSources.length} source${incomeSources.length !== 1 ? 's' : ''}`,
      `${fmt(grossIncome)} TOTAL`,
    );
    return drawSectionEyebrow(eyebrow, meta, yy);
  };

  y = drawSectionEyebrow('Per source', 'share of gross income', y);
  y = drawColHeader(y);

  const rowH = 8.5;
  for (const s of incomeSources) {
    if (y + rowH > BODY_LIMIT) {
      y = contPage('Per source · cont.', 'share of gross income');
      y = drawColHeader(y);
    }
    sans(9.5, 'bold');
    setText(ink);
    let nm = s.name;
    const nameMax = xCat - xSource - 3;
    while (nm && pdf.getTextWidth(nm) > nameMax) nm = nm.slice(0, -1);
    if (nm !== s.name && nm.length > 1) nm = nm.slice(0, -1) + '…';
    pdf.text(nm, xSource, y);

    mono(8);
    setText(mute);
    let cat = s.category;
    const catMax = xCount - xCat - 3;
    while (cat && pdf.getTextWidth(cat) > catMax) cat = cat.slice(0, -1);
    pdf.text(cat, xCat, y);
    pdf.text(String(s.count), xCount, y);

    mono(9.5, 'bold');
    setText(pos);
    pdf.text(`+${fmt(s.amount)}`, xAmount, y, { align: 'right' });

    mono(8.5);
    setText(ink2);
    pdf.text(`${Math.round(s.share)}%`, xShare, y, { align: 'right' });

    drawProgressBar(barX, y - 1.8, barW, 2, s.share / 100, false, pos);

    setDraw(line2Col);
    pdf.setLineWidth(0.1);
    pdf.line(MARGIN_X, y + rowH - 4, RIGHT, y + rowH - 4);
    y += rowH;
  }

  // gross-income total row
  if (y + 13 > BODY_LIMIT) {
    y = contPage('Per source · cont.', 'share of gross income');
    y = drawColHeader(y);
  }
  y += 1.5;
  const totalCount = incomeSources.reduce((acc, s) => acc + s.count, 0);
  sans(9.5, 'bold');
  setText(ink);
  pdf.text('Gross income', xSource, y);
  mono(7);
  setText(mute);
  pdf.text(`· ${ctx.periodLabel}`, xSource, y + 4.5);
  mono(9.5);
  setText(ink2);
  pdf.text(String(totalCount), xCount, y);
  mono(10, 'bold');
  setText(pos);
  pdf.text(`+${fmt(grossIncome)}`, xAmount, y, { align: 'right' });
  mono(9, 'bold');
  setText(ink2);
  pdf.text('100%', xShare, y, { align: 'right' });
  y += 12;

  // ── Excluded movements ───────────────────────────────────────────
  const exRowH = 8.5;
  const xDesc = MARGIN_X + 32;
  const xKind = MARGIN_X + 122;
  if (y + 20 > BODY_LIMIT) {
    y = contPage('Excluded movements', 'refunds and transfers · not counted as income');
  } else {
    y = drawSectionEyebrow(
      'Excluded movements',
      'refunds and transfers · not counted as income',
      y,
    );
  }
  y += 2;

  if (refundItems.length === 0) {
    mono(8);
    setText(mute2);
    pdf.text('No excluded movements in this period.', MARGIN_X, y);
    y += exRowH;
  } else {
    for (const r of refundItems) {
      if (y + exRowH > BODY_LIMIT) {
        y = contPage('Excluded movements · cont.', 'refunds and transfers · not counted as income');
        y += 2;
      }
      const d = config.dateType === 'value'
        ? parseLocalDate(r.value_date || r.transaction_date)
        : parseLocalDate(r.transaction_date);
      mono(8);
      setText(mute);
      pdf.text(format(d, 'd MMM', { locale }), MARGIN_X, y);

      sans(9.5);
      setText(ink);
      let desc = r.description || '—';
      const descMax = xKind - xDesc - 4;
      while (desc && pdf.getTextWidth(desc) > descMax) desc = desc.slice(0, -1);
      if (desc !== (r.description || '—') && desc.length > 1) desc = desc.slice(0, -1) + '…';
      pdf.text(desc, xDesc, y);

      mono(8);
      setText(mute);
      pdf.text('Refund', xKind, y);

      mono(9.5);
      setText(pos);
      pdf.text(`+${fmt(Math.abs(Number(r.amount)))}`, RIGHT, y, { align: 'right' });

      setDraw(line2Col);
      pdf.setLineWidth(0.1);
      pdf.line(MARGIN_X, y + exRowH - 4, RIGHT, y + exRowH - 4);
      y += exRowH;
    }
  }
  y += 5;

  // ── 12-month income trend ────────────────────────────────────────
  const trendMetaBase = incomeTrendStable ? 'stable, no missing months' : 'has gaps';
  const trendMeta = ctx.data.includeForecasted && ctx.data.monthlyIncomeProjected > 0
    ? `${trendMetaBase} · incl. forecast`
    : trendMetaBase;
  if (y + 46 > BODY_LIMIT) {
    y = contPage('12-month income trend', trendMeta);
  } else {
    y = drawSectionEyebrow('12-month income trend', trendMeta, y);
  }
  y += 4;

  const chartX = MARGIN_X;
  const chartW = COL;
  const chartH = 30;
  const chartBase = y + chartH;
  const series = monthlyIncomeSeries.length ? monthlyIncomeSeries : [];
  const lastIdx = series.length - 1;
  // The forecast projection rides on the LAST bar (the current period).
  const projOnLast = ctx.data.includeForecasted ? ctx.data.monthlyIncomeProjected : 0;
  const maxVal = Math.max(
    1,
    ...series.map((m, i) => m.value + (i === lastIdx ? projOnLast : 0)),
  );
  const n = Math.max(1, series.length);
  const slot = chartW / n;
  const bw = Math.min(11, slot * 0.7);
  const tallestIdx = series.reduce(
    (best, m, i) => {
      const v = m.value + (i === lastIdx ? projOnLast : 0);
      const bestV = series[best].value + (best === lastIdx ? projOnLast : 0);
      return v > bestV ? i : best;
    },
    0,
  );

  series.forEach((m, i) => {
    const cx = chartX + slot * i + slot / 2;
    const actualH = Math.max(0.6, (m.value / maxVal) * chartH);
    setFill(i === tallestIdx ? ink : ink2);
    pdf.rect(cx - bw / 2, chartBase - actualH, bw, actualH, 'F');
    // Stack the projected portion on top in mute2 for the last bar.
    if (i === lastIdx && projOnLast > 0) {
      const projH = (projOnLast / maxVal) * chartH;
      setFill(ctx.mute2);
      pdf.rect(cx - bw / 2, chartBase - actualH - projH, bw, projH, 'F');
    }
  });

  // baseline
  setDraw(lineCol);
  pdf.setLineWidth(0.2);
  pdf.line(chartX, chartBase, chartX + chartW, chartBase);

  // x-axis labels: first · middle · last
  const axisY = chartBase + 5;
  mono(6);
  setText(mute2);
  if (series.length) {
    const midIdx = Math.floor((series.length - 1) / 2);
    pdf.text(series[0].label.toUpperCase(), chartX, axisY);
    if (series.length > 2) {
      pdf.text(
        series[midIdx].label.toUpperCase(),
        chartX + chartW / 2,
        axisY,
        { align: 'center' },
      );
    }
    pdf.text(
      series[series.length - 1].label.toUpperCase(),
      chartX + chartW,
      axisY,
      { align: 'right' },
    );
  }

  // Actual / Forecast key for the last bar.
  if (ctx.data.includeForecasted && projOnLast > 0) {
    const keyY = axisY + 5;
    const keyX = chartX + chartW;
    sans(7, 'normal');
    const fcW = pdf.getTextWidth('Forecast');
    const acW = pdf.getTextWidth('Actual');
    const swatch = 2.6;
    const gapSwatch = 1.5;   // swatch ↔ its own label
    const gapBetween = 6;    // Actual block ↔ Forecast block
    // Forecast (right)
    setFill(ctx.mute2);
    pdf.rect(keyX - fcW - swatch - gapSwatch, keyY - 2.4, swatch, swatch, 'F');
    setText(ctx.mute);
    pdf.text('Forecast', keyX, keyY, { align: 'right' });
    // Actual (left of Forecast)
    const actualRightX = keyX - fcW - swatch - gapSwatch - gapBetween;
    setFill(ink2);
    pdf.rect(actualRightX - acW - swatch - gapSwatch, keyY - 2.4, swatch, swatch, 'F');
    pdf.text('Actual', actualRightX, keyY, { align: 'right' });
  }

  // ── Bottom strip (only on the final page) ────────────────────────
  drawBottomStrip(
    `Gross income · ${ctx.periodLabel}`,
    `+${fmt(grossIncome)}`,
    pos,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
