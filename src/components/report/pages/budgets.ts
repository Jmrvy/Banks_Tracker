import { format } from 'date-fns';
import type { ReportCtx } from '../types';

export function renderBudgets(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, setDraw, ink, ink3, mute,
    line2Col, lineCol, neg, amber, pos, sans, mono, fmt, fmtSigned,
    newPage, state, locale, totalPagesEstimate, BODY_BOTTOM,
    drawTopChrome, drawPageTitle, drawSectionEyebrow, drawProgressBar,
    drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    budgetedCats, breachedCats, nearCats, totalBudget, totalBudgetedSpent,
    filteredTransactions, actualDates, specialBudgets,
  } = ctx.data;

  const remaining = totalBudget - totalBudgetedSpent;
  const usedPct = totalBudget > 0 ? Math.round((totalBudgetedSpent / totalBudget) * 100) : 0;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 06 · Discipline',
    'Budgets vs actual',
    `${budgetedCats.length} active budgets`,
    `${breachedCats.length} breached · ${nearCats.length} near`,
    breachedCats.length > 0 ? neg : ctx.ink2,
  );

  // ── KPI band — 3 cells, bordered ────────────────────────────────
  const kpiH = 20;
  const kpiCells = [
    {
      label: 'TOTAL BUDGETED',
      value: fmt(totalBudget),
      valueColor: ink,
      sub: `${budgetedCats.length} categor${budgetedCats.length === 1 ? 'y' : 'ies'}`,
      subColor: mute,
    },
    {
      label: 'TOTAL SPENT',
      value: fmt(totalBudgetedSpent),
      valueColor: ink,
      sub: `${usedPct}% used`,
      subColor: usedPct >= 100 ? neg : pos,
    },
    {
      label: 'REMAINING',
      value: fmtSigned(remaining),
      valueColor: remaining >= 0 ? pos : neg,
      sub: remaining >= 0 ? 'on track' : 'over',
      subColor: mute,
    },
  ];
  const cellW = COL / kpiCells.length;
  setDraw(lineCol);
  pdf.setLineWidth(0.3);
  pdf.rect(MARGIN_X, y, COL, kpiH, 'S');
  kpiCells.forEach((c, i) => {
    const x = MARGIN_X + i * cellW;
    if (i > 0) pdf.line(x, y, x, y + kpiH);
    mono(6.5, 'bold');
    setText(mute);
    pdf.text(c.label, x + 3, y + 4);
    mono(12, 'bold');
    setText(c.valueColor);
    pdf.text(c.value, x + 3, y + 11);
    mono(7);
    setText(c.subColor);
    pdf.text(c.sub, x + 3, y + kpiH - 2.5);
  });
  y += kpiH + 6;

  // ── Breach callout band ─────────────────────────────────────────
  const worst =
    breachedCats.length > 0
      ? breachedCats.reduce((a, b) =>
          (b.budget > 0 ? b.spent / b.budget : 0) > (a.budget > 0 ? a.spent / a.budget : 0) ? b : a,
        )
      : null;

  if (worst) {
    const wPct = worst.budget > 0 ? Math.round((worst.spent / worst.budget) * 100) : 0;
    const overBy = worst.spent - worst.budget;
    const wName = (worst.name || '').toLowerCase();
    const txCount = filteredTransactions.filter(
      (tx) => tx.type === 'expense' && (tx.category?.name || '').toLowerCase() === wName,
    ).length;

    const calloutH = 22;
    const calloutY = y;
    // bar
    setFill(neg);
    pdf.rect(MARGIN_X, calloutY, 1.6, calloutH, 'F');
    // big percentage
    mono(22, 'bold');
    setText(neg);
    pdf.text(`${wPct}%`, MARGIN_X + 6, calloutY + 12);
    const pctW = pdf.getTextWidth(`${wPct}%`);
    const tx = MARGIN_X + 6 + pctW + 8;

    // category name + over delta
    sans(12, 'bold');
    setText(ink);
    pdf.text(worst.name, tx, calloutY + 8);
    const nameW = pdf.getTextWidth(worst.name);
    sans(8);
    setText(mute);
    pdf.text(`  +${fmt(overBy)} over`, tx + nameW + 2, calloutY + 8);

    // detail line
    sans(8);
    setText(ink3);
    pdf.text(
      `${fmt(worst.spent)} of ${fmt(worst.budget)} · ${txCount} transaction${txCount === 1 ? '' : 's'}`,
      tx,
      calloutY + 15,
    );
    y += calloutH + 6;
  }

  // ── Per-budget pace ─────────────────────────────────────────────
  y = drawSectionEyebrow('Per-budget pace', '% used · sorted by share', y);

  const rowH = 16;
  // Reserve room for the definitions strip + bottom chrome on the last
  // budgets page so rows don't collide with the legend.
  const RESERVE = 18;
  for (let i = 0; i < budgetedCats.length; i++) {
    const c = budgetedCats[i];
    if (y + rowH > BODY_BOTTOM - RESERVE) {
      // Continue on a fresh page when more budgets remain.
      drawBottomChrome(state.pageIdx, totalPagesEstimate);
      newPage();
      drawTopChrome(state.pageIdx, totalPagesEstimate);
      y = drawPageTitle(
        'Section 06 · Discipline',
        'Budgets vs actual (cont.)',
        `${budgetedCats.length} active budgets`,
        `${breachedCats.length} breached · ${nearCats.length} near`,
        breachedCats.length > 0 ? neg : ctx.ink2,
      );
      y = drawSectionEyebrow('Per-budget pace', '% used · sorted by share', y);
    }
    const pct = c.budget > 0 ? c.spent / c.budget : 0;
    const pctRound = Math.round(pct * 100);
    const over = c.over;
    const near = c.near;
    const accent = over ? neg : near ? amber : ink;

    // category name
    sans(9, 'bold');
    setText(ink);
    pdf.text(c.name, MARGIN_X, y);

    // NEAR pill
    if (near) {
      const px = MARGIN_X + pdf.getTextWidth(c.name) + 4;
      setFill(ctx.amberSoft);
      pdf.roundedRect(px, y - 3, 12, 4, 0.6, 0.6, 'F');
      mono(6, 'bold');
      setText(amber);
      pdf.text('NEAR', px + 2, y);
    }

    // right-aligned figures
    mono(8, 'bold');
    setText(accent);
    pdf.text(
      `${fmt(c.spent)} / ${fmt(c.budget)} · ${pctRound}%`,
      PW - MARGIN_X,
      y,
      { align: 'right' },
    );

    // progress bar + budget tick
    const barY = y + 2.5;
    const barH = 2;
    drawProgressBar(MARGIN_X, barY, COL, barH, pct, over, accent);
    setDraw(ink);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN_X + COL, barY - 0.8, MARGIN_X + COL, barY + barH + 0.8);

    y += rowH;
  }

  // ── Special budgets (event / trip envelopes) ────────────────────
  // Separate bracket: their spend never counted against the category
  // budgets above, so they get their own pace list. Spend is scoped to
  // the report period; the bar compares it to the lifetime envelope.
  if (specialBudgets.length > 0) {
    const newBudgetsPage = (cont: boolean) => {
      drawBottomChrome(state.pageIdx, totalPagesEstimate);
      newPage();
      drawTopChrome(state.pageIdx, totalPagesEstimate);
      return drawPageTitle(
        'Section 06 · Discipline',
        cont ? 'Budgets vs actual (cont.)' : 'Budgets vs actual',
        `${budgetedCats.length} active budgets`,
        `${breachedCats.length} breached · ${nearCats.length} near`,
        breachedCats.length > 0 ? neg : ctx.ink2,
      );
    };

    // Keep the eyebrow with at least one row on whichever page it lands.
    if (y + 6 + rowH > BODY_BOTTOM - RESERVE) {
      y = newBudgetsPage(true);
    }
    y = drawSectionEyebrow('Special budgets', 'event & trip envelopes · spend in period', y);

    for (let i = 0; i < specialBudgets.length; i++) {
      const sb = specialBudgets[i];
      if (y + rowH > BODY_BOTTOM - RESERVE) {
        y = newBudgetsPage(true);
        y = drawSectionEyebrow('Special budgets (cont.)', 'event & trip envelopes · spend in period', y);
      }
      const pct = sb.totalBudget > 0 ? sb.spent / sb.totalBudget : 0;
      const pctRound = Math.round(pct * 100);
      const over = sb.over;
      const accent = over ? neg : ink;

      // envelope name
      sans(9, 'bold');
      setText(ink);
      pdf.text(sb.name, MARGIN_X, y);

      // CLOSED pill — flags wrapped-up envelopes so a 100% bar reads as
      // "done", not "breached".
      if (sb.status === 'closed') {
        const px = MARGIN_X + pdf.getTextWidth(sb.name) + 4;
        setFill(line2Col);
        pdf.roundedRect(px, y - 3, 14, 4, 0.6, 0.6, 'F');
        mono(6, 'bold');
        setText(mute);
        pdf.text('CLOSED', px + 2, y);
      }

      // right-aligned figures — period spend over the envelope total
      mono(8, 'bold');
      setText(accent);
      pdf.text(
        sb.totalBudget > 0
          ? `${fmt(sb.spent)} / ${fmt(sb.totalBudget)} · ${pctRound}%`
          : fmt(sb.spent),
        PW - MARGIN_X,
        y,
        { align: 'right' },
      );

      // progress bar + envelope tick
      const barY = y + 2.5;
      const barH = 2;
      drawProgressBar(MARGIN_X, barY, COL, barH, pct, over, accent);
      setDraw(ink);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN_X + COL, barY - 0.8, MARGIN_X + COL, barY + barH + 0.8);

      y += rowH;
    }
  }


  // ── Definitions line ────────────────────────────────────────────
  const defY = Math.min(y + 4, BODY_BOTTOM);
  setDraw(lineCol);
  pdf.setLineWidth(0.2);
  pdf.setLineDashPattern([0.6, 0.6], 0);
  pdf.line(MARGIN_X, defY - 5, PW - MARGIN_X, defY - 5);
  pdf.setLineDashPattern([], 0);

  mono(6.5);
  setText(mute);
  let dx = MARGIN_X;
  const defLead = 'DEFINITIONS · ';
  pdf.text(defLead, dx, defY);
  dx += pdf.getTextWidth(defLead);
  setFill(neg);
  pdf.circle(dx + 0.9, defY - 0.7, 0.9, 'F');
  dx += 3;
  const overTxt = 'OVER: ACTUAL > BUDGETED · ';
  setText(mute);
  pdf.text(overTxt, dx, defY);
  dx += pdf.getTextWidth(overTxt);
  setFill(amber);
  pdf.circle(dx + 0.9, defY - 0.7, 0.9, 'F');
  dx += 3;
  setText(mute);
  pdf.text('NEAR: ≥ 90% USED · BLACK TICK = BUDGET LINE', dx, defY);

  if (ctx.data.includeForecasted) {
    const projTotal = ctx.data.expenseCats.reduce((s, c) => s + c.projectedSpent, 0);
    const combinedBreach = ctx.data.expenseCats.filter((c) => c.combinedOver && !c.over).length;
    if (projTotal > 0) {
      mono(6.5, 'normal', 8);
      setText(mute);
      pdf.text(
        combinedBreach > 0
          ? `Includes forecast · ${ctx.fmtSigned(-projTotal)} projected · ${combinedBreach} budget${combinedBreach === 1 ? '' : 's'} would breach`
          : `Includes forecast · ${ctx.fmtSigned(-projTotal)} projected`,
        MARGIN_X, ctx.STRIP_Y - 9,
      );
      pdf.setCharSpace(0);
    }
  }

  // ── Bottom strip + chrome ───────────────────────────────────────
  drawBottomStrip(
    `Net of budgets · ${ctx.periodLabel}`,
    fmtSigned(remaining),
    remaining >= 0 ? pos : neg,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
