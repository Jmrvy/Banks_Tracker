import type { ReportCtx } from '../types';
import { DEFAULT_PAGE_ORDER, PAGE_DEFS } from '../pageMeta';

export function renderContents(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, setText, setDraw, ink, ink2, mute, mute2, lineCol,
    sans, mono, newPage, state, totalPagesEstimate, t,
    drawTopChrome, drawPageTitle, drawBottomStrip, drawBottomChrome,
  } = ctx;
  const { orderedEnabledPages, filteredTransactions, ledgerPageCount } = ctx.data;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  const bodyY = drawPageTitle(
    'Section 02 · Index',
    'Contents',
    `${orderedEnabledPages.length} pages included`,
    `${DEFAULT_PAGE_ORDER.length - orderedEnabledPages.length} omitted`,
  );

  const tocItems: { num: string; title: string; sub: string; page: string; off?: boolean }[] = [];
  let pn = 1;
  const enabledSet = new Set(orderedEnabledPages);
  for (const id of DEFAULT_PAGE_ORDER) {
    const def = PAGE_DEFS[id];
    const label = t(def.labelKey, { defaultValue: def.labelDefault });
    const sub = id === 'transactions' && enabledSet.has(id)
      ? `${filteredTransactions.length} rows · ${ledgerPageCount} page${ledgerPageCount !== 1 ? 's' : ''}`
      : t(def.metaKey, { defaultValue: def.metaDefault });
    if (enabledSet.has(id)) {
      if (id === 'transactions' && ledgerPageCount > 1) {
        tocItems.push({ num: String(pn).padStart(2, '0') + '+', title: label, sub, page: `${pn}-${pn + ledgerPageCount - 1}` });
        pn += ledgerPageCount;
      } else {
        tocItems.push({ num: String(pn).padStart(2, '0'), title: label, sub, page: String(pn).padStart(2, '0') });
        pn++;
      }
    } else {
      tocItems.push({ num: '—', title: label, sub: 'excluded', page: '—', off: true });
    }
  }

  let y = bodyY + 2;
  setDraw(ink);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN_X, y, PW - MARGIN_X, y);
  y += 5;
  for (const item of tocItems) {
    mono(8, 'bold');
    setText(item.off ? mute2 : mute);
    pdf.text(item.num, MARGIN_X, y);
    sans(10, item.off ? 'normal' : 'bold');
    setText(item.off ? mute : ink);
    pdf.text(item.title, MARGIN_X + 10, y);
    sans(8);
    setText(mute);
    pdf.text(' · ' + item.sub, MARGIN_X + 10 + pdf.getTextWidth(item.title), y);
    mono(8, 'bold');
    setText(item.off ? mute : ink2);
    pdf.text(item.page, PW - MARGIN_X, y, { align: 'right' });
    setDraw(lineCol);
    pdf.setLineWidth(0.15);
    pdf.line(MARGIN_X, y + 2, PW - MARGIN_X, y + 2);
    y += 7;
  }

  drawBottomStrip('Pages total · including ledger', String(pn - 1));
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
