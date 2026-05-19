import type { ReportCtx, ReportPageId } from '../types';
import { DEFAULT_PAGE_ORDER, PAGE_DEFS } from '../pageMeta';

export function renderContents(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, STRIP_Y, setText, setDraw, setFill,
    ink, ink2, mute, mute2, lineCol,
    sans, mono, newPage, state, totalPagesEstimate,
    drawTopChrome, drawPageTitle, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    orderedEnabledPages, filteredTransactions, ledgerPageCount,
    expenseCats, breachedCats, accountFlows, bankCount, periodDays, config,
  } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);

  const included = orderedEnabledPages.length;
  const omitted = DEFAULT_PAGE_ORDER.length - included;
  const bodyY = drawPageTitle(
    'Section 02 · Index',
    'Contents',
    `${included} PAGES INCLUDED`,
    `${omitted} OMITTED`,
  );

  // ── Per-row data, data-driven sub-text wording ───────────────────
  const enabledSet = new Set<ReportPageId>(orderedEnabledPages);
  const subFor = (id: ReportPageId, on: boolean): string => {
    if (!on) return 'excluded';
    switch (id) {
      case 'cover': return 'Holder · Period · Net result';
      case 'contents': return 'This page';
      case 'summary': return 'KPIs · verdict';
      case 'cashflow': return 'daily income vs. expenses';
      case 'categories': return `${expenseCats.length} categories`;
      case 'budgets': return `${breachedCats.length} breach${breachedCats.length === 1 ? '' : 'es'}`;
      case 'accounts': return `${accountFlows.length} accounts · ${bankCount} banks`;
      case 'income': return 'breakdown';
      case 'recurring': return 'active subscriptions';
      case 'transactions':
        return `${filteredTransactions.length} rows · ${ledgerPageCount} page${ledgerPageCount === 1 ? '' : 's'}`;
      default: return 'included';
    }
  };

  type Row = { num: string; title: string; sub: string; page: string; off: boolean };
  const rows: Row[] = [];
  let pn = 1;
  for (const id of DEFAULT_PAGE_ORDER) {
    const def = PAGE_DEFS[id];
    const label = ctx.t(def.labelKey, { defaultValue: def.labelDefault });
    const on = enabledSet.has(id);
    if (!on) {
      rows.push({ num: '—', title: label, sub: 'excluded', page: '—', off: true });
      continue;
    }
    if (id === 'transactions' && ledgerPageCount > 1) {
      rows.push({
        num: String(pn).padStart(2, '0') + '+',
        title: label,
        sub: subFor(id, true),
        page: `${String(pn).padStart(2, '0')}-${String(pn + ledgerPageCount - 1).padStart(2, '0')}`,
        off: false,
      });
      pn += ledgerPageCount;
    } else {
      rows.push({
        num: String(pn).padStart(2, '0'),
        title: label,
        sub: subFor(id, true),
        page: String(pn).padStart(2, '0'),
        off: false,
      });
      pn += 1;
    }
  }
  const totalDocPages = pn - 1;

  // ── Geometry ─────────────────────────────────────────────────────
  const RIGHT = PW - MARGIN_X;
  const numX = MARGIN_X;
  const titleX = MARGIN_X + 10;
  const titleW = 30;
  const subX = titleX + titleW + 2;
  const subW = 30;
  const leaderX0 = subX + subW + 4;
  const leaderX1 = RIGHT - 12;
  const titleLH = 4.1;
  const subLH = 3.4;

  // Heavy ink rule under the title block.
  const ruleY = bodyY + 2;
  setDraw(ink);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN_X, ruleY, RIGHT, ruleY);

  // Wrap title & sub per row; the row's last line drives the leader.
  const measured = rows.map((r) => {
    sans(10, r.off ? 'normal' : 'bold');
    const titleLines: string[] = pdf.splitTextToSize(r.title, titleW);
    sans(8, 'normal');
    const subLines: string[] = pdf.splitTextToSize('· ' + r.sub, subW);
    const lines = Math.max(titleLines.length, subLines.length);
    return { r, titleLines, subLines, lines, height: lines * titleLH };
  });

  // Compact list (the template is a tight TOC, not justified to fill the
  // page): a small fixed gap between row blocks, DOCUMENT BASIS sits a
  // little below the last row rather than pinned to the strip.
  const rowsTop = ruleY + 8;
  const gap = 3.4;

  let y = rowsTop;
  for (const m of measured) {
    const { r, titleLines, subLines } = m;
    const titleCol: typeof ink = r.off ? mute : ink;
    const numCol: typeof ink = r.off ? mute2 : mute;
    const subCol: typeof ink = r.off ? mute2 : mute;
    const pageCol: typeof ink = r.off ? mute : ink2;
    const lastLineY = y + (m.lines - 1) * titleLH;

    // number token
    mono(8, 'bold');
    setText(numCol);
    pdf.text(r.num, numX, y);

    // wrapped title
    sans(10, r.off ? 'normal' : 'bold');
    setText(titleCol);
    titleLines.forEach((ln, i) => pdf.text(ln, titleX, y + i * titleLH));

    // wrapped sub-text
    sans(8, 'normal');
    setText(subCol);
    subLines.forEach((ln, i) => pdf.text(ln, subX, y + i * subLH));

    // dotted leader on the row's last line
    setFill(mute2);
    const dotGap = 1.7;
    for (let dx = leaderX0; dx <= leaderX1; dx += dotGap) {
      pdf.circle(dx, lastLineY - 0.9, 0.22, 'F');
    }

    // destination page, right-aligned on the last line
    mono(8, 'bold');
    setText(pageCol);
    pdf.text(r.page, RIGHT, lastLineY, { align: 'right' });

    y += m.height + gap;
  }

  // ── DOCUMENT BASIS meta row (just below the list) ────────────────
  const docBasisY = Math.min(y + 6, STRIP_Y - 6 - 9);
  setDraw(lineCol);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, docBasisY - 5, RIGHT, docBasisY - 5);
  mono(7, 'bold');
  setText(mute);
  pdf.text('DOCUMENT BASIS', MARGIN_X, docBasisY);
  mono(7, 'normal');
  setText(ink);
  const dateLabel = config.dateType === 'value' ? 'value' : 'accounting';
  pdf.text(
    `EUR · ${dateLabel} date · ${periodDays} working days`,
    RIGHT, docBasisY, { align: 'right' },
  );

  drawBottomStrip('Pages total · including ledger', String(totalDocPages));
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
