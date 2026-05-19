import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { ReportCtx } from '../types';

export function renderIncome(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, setDraw,
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
      value: fmt(refundTotal),
      delta: `${refundCount} refund${refundCount !== 1 ? 's' : ''} · excl.`,
    },
  ]);
  y += 24;

  // ── Per source table ─────────────────────────────────────────────
  y = drawSectionEyebrow('Per source', 'share of gross income', y);

  // column anchors (mm)
  const xSource = MARGIN_X;
  const xCat = MARGIN_X + 62;
  const xCount = MARGIN_X + 91;
  const xAmount = MARGIN_X + 142; // right-aligned amount edge
  const xShare = MARGIN_X + 158; // right-aligned share edge
  const barX = MARGIN_X + 162;
  const barW = RIGHT - barX;

  // header row
  mono(7, 'bold');
  setText(mute);
  pdf.text('SOURCE', xSource, y);
  pdf.text('CATEGORY', xCat, y);
  pdf.text('COUNT', xCount, y);
  pdf.text('AMOUNT', xAmount, y, { align: 'right' });
  pdf.text('%', xShare, y - 3, { align: 'right' });
  pdf.text('SHARE', xShare, y, { align: 'right' });
  setDraw(ink);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN_X, y + 2.5, RIGHT, y + 2.5);
  y += 8;

  const rowH = 8.5;
  for (const s of incomeSources) {
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
  y += 1.5;
  const totalCount = incomeSources.reduce((acc, s) => acc + s.count, 0);
  sans(9.5, 'bold');
  setText(ink);
  pdf.text('Gross income', xSource, y);
  mono(7);
  setText(mute);
  pdf.text(`· ${monthLabel}`, xSource, y + 4.5);
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
  y = drawSectionEyebrow(
    'Excluded movements',
    'refunds and transfers · not counted as income',
    y,
  );
  y += 2;

  const exRowH = 8.5;
  const xDesc = MARGIN_X + 32;
  const xKind = MARGIN_X + 122;
  if (refundItems.length === 0) {
    mono(8);
    setText(mute2);
    pdf.text('No excluded movements in this period.', MARGIN_X, y);
    y += exRowH;
  } else {
    for (const r of refundItems) {
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
  y = drawSectionEyebrow(
    '12-month income trend',
    incomeTrendStable ? 'stable, no missing months' : 'has gaps',
    y,
  );
  y += 4;

  const chartX = MARGIN_X;
  const chartW = COL;
  const chartH = 30;
  const chartBase = y + chartH;
  const series = monthlyIncomeSeries.length ? monthlyIncomeSeries : [];
  const maxVal = Math.max(1, ...series.map((m) => m.value));
  const n = Math.max(1, series.length);
  const slot = chartW / n;
  const bw = Math.min(11, slot * 0.7);
  const tallestIdx = series.reduce(
    (best, m, i) => (m.value > series[best].value ? i : best),
    0,
  );

  series.forEach((m, i) => {
    const cx = chartX + slot * i + slot / 2;
    const h = Math.max(0.6, (m.value / maxVal) * chartH);
    setFill(i === tallestIdx ? ink : ink2);
    pdf.rect(cx - bw / 2, chartBase - h, bw, h, 'F');
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

  // ── Bottom strip ─────────────────────────────────────────────────
  drawBottomStrip(
    `Gross income · ${monthLabel}`,
    `+${fmt(grossIncome)}`,
    pos,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
