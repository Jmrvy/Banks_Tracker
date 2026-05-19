import type { ReportCtx } from '../types';

export function renderBudgets(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, COL, setText, setFill, setDraw, ink, mute, neg, negSoft, line2Col,
    sans, mono, fmt, newPage, state, totalPagesEstimate, t, BODY_BOTTOM,
    drawTopChrome, drawPageTitle, drawProgressBar, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { budgetedCats, breachedCats } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  let y = drawPageTitle(
    'Section 06 · Discipline',
    'Budgets vs actual',
    `${budgetedCats.length} active`,
    `${breachedCats.length} breach${breachedCats.length === 1 ? '' : 'es'}`,
  );
  y += 2;

  if (budgetedCats.length === 0) {
    sans(10);
    setText(mute);
    pdf.text(t('reports.noBudgetDefined', { defaultValue: 'No budget defined for this period.' }), MARGIN_X, y + 10);
  } else {
    mono(7, 'bold');
    setText(mute);
    pdf.text('CATEGORY', MARGIN_X, y);
    pdf.text('SPENT / BUDGET', MARGIN_X + 80, y);
    pdf.text('%', PW - MARGIN_X - 8, y, { align: 'right' });
    setDraw(ink);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN_X, y + 2, PW - MARGIN_X, y + 2);
    y += 6;

    for (const c of budgetedCats.slice(0, 18)) {
      const pct = c.budget > 0 ? c.spent / c.budget : 0;
      const over = c.spent > c.budget;
      sans(9, 'bold');
      setText(ink);
      pdf.text(c.name, MARGIN_X, y);
      if (over) {
        setFill(negSoft);
        const bw = 18;
        const bx = MARGIN_X + pdf.getTextWidth(c.name) + 4;
        pdf.roundedRect(bx, y - 3, bw, 4, 0.6, 0.6, 'F');
        mono(6, 'bold');
        setText(neg);
        pdf.text('OVER', bx + 2, y);
      }
      mono(8);
      setText(over ? neg : ink);
      pdf.text(`${fmt(c.spent)} / ${fmt(c.budget)}`, MARGIN_X + 80, y);
      mono(8, 'bold');
      setText(over ? neg : mute);
      pdf.text(`${Math.round(pct * 100)}%`, PW - MARGIN_X, y, { align: 'right' });
      drawProgressBar(MARGIN_X, y + 2, COL, 1.8, pct, over);
      y += 8.5;
      if (y > BODY_BOTTOM - 10) break;
    }
  }

  const totalBudget = budgetedCats.reduce((s, c) => s + c.budget, 0);
  const totalSpent = budgetedCats.reduce((s, c) => s + c.spent, 0);
  drawBottomStrip(
    breachedCats.length > 0 ? `${breachedCats.length} over budget` : 'Within budget',
    `${fmt(totalSpent)} / ${fmt(totalBudget)}`,
    totalSpent > totalBudget ? neg : ink,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
