import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import type { ReportCtx } from '../types';

/** Interpolate description placeholders ({MM}, {YY}, {YYYY}, {MOIS},
 *  {ANNEE}, {MONTH}, {YEAR}, {M}, {D}, {DD}) using the report's period.
 *  For monthly reports we substitute with the period's month/year. For
 *  other period types (year / quarter / custom) the placeholders refer
 *  to a specific month that doesn't apply, so we strip them and tidy
 *  the residue. */
function interpolatePeriod(
  desc: string,
  periodType: 'month' | 'quarter' | 'year' | 'custom',
  start: Date,
  locale: import('date-fns').Locale,
): string {
  if (!desc) return desc;
  if (periodType !== 'month') {
    return desc
      .replace(/\{[^}]+\}/g, '')
      .replace(/\(\s*\.?\s*\)/g, '')
      .replace(/[\s\-–—]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  const m = start.getMonth() + 1;
  const yyyy = String(start.getFullYear());
  const monthName = (() => {
    const n = (locale as { code?: string }).code === 'fr'
      ? new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(start)
      : new Intl.DateTimeFormat('en-US', { month: 'long' }).format(start);
    return n;
  })();
  const map: Record<string, string> = {
    MM: String(m).padStart(2, '0'),
    M: String(m),
    YY: yyyy.slice(-2),
    YYYY: yyyy,
    YEAR: yyyy,
    ANNEE: yyyy,
    MOIS: monthName,
    MONTH: monthName,
    DD: String(start.getDate()).padStart(2, '0'),
    D: String(start.getDate()),
  };
  return desc.replace(/\{([A-Za-z]+)\}/g, (_, k) => map[k.toUpperCase()] ?? '');
}

/** English ordinal suffix for a day-of-month (1 -> "1st", 22 -> "22nd"). */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/** Step a date back by one recurrence period (used when no past occurrence). */
function previousPeriod(d: Date, type: string): Date {
  const r = new Date(d);
  switch (type) {
    case 'weekly': r.setDate(r.getDate() - 7); break;
    case 'quarterly': r.setMonth(r.getMonth() - 3); break;
    case 'yearly': r.setFullYear(r.getFullYear() - 1); break;
    default: r.setMonth(r.getMonth() - 1); break;
  }
  return r;
}

export function renderRecurring(ctx: ReportCtx) {
  const {
    pdf, autoTable, MARGIN_X, PW, PH, COL, setText, setDraw, ink, mute, pos, neg, line2Col,
    sans, mono, fmt, fmtSigned, newPage, state, locale, totalPagesEstimate,
    BODY_TOP, STRIP_Y,
    drawTopChrome, drawPageTitle, drawSectionEyebrow, drawKpiBand,
    drawBottomStrip, drawBottomChrome,
  } = ctx;
  const {
    activeRecurring,
    recurringActiveCount,
    recurringSubsTotal, recurringSubsCount,
    recurringBillsTotal, recurringBillsCount,
    recurringRentTotal,
    recurringMonthlyExpense, recurringMonthlyNet,
  } = ctx.data;

  // Representative "/ month" cadence figure: total monthly outflow plus
  // recurring monthly inflow (net = income − expense -> income = net + expense).
  const recurringMonthlyIncome = recurringMonthlyNet + recurringMonthlyExpense;
  const monthlyTotalAbs = recurringMonthlyExpense + recurringMonthlyIncome;

  // Sorted ascending by next charge date.
  const rows = activeRecurring
    .slice()
    .sort((a, b) =>
      a.recurring.next_due_date < b.recurring.next_due_date ? -1
      : a.recurring.next_due_date > b.recurring.next_due_date ? 1 : 0);

  // Cap rows to what fits on the page (header + KPI band + table + net row).
  const MAX_ROWS = 8;
  const shown = rows.slice(0, MAX_ROWS);
  const shownCount = shown.length;

  newPage();
  drawTopChrome(state.pageIdx, totalPagesEstimate);
  const upcoming = ctx.data.recurringUpcoming;
  const titleY = drawPageTitle(
    'Section 09 · Cadence',
    'Recurring & subscriptions',
    `${shownCount} of ${recurringActiveCount} shown`,
    ctx.data.includeForecasted && upcoming > 0
      ? `${fmt(monthlyTotalAbs)} / month · ${upcoming} upcoming`
      : `${fmt(monthlyTotalAbs)} / month`,
  );

  // KPI band — 4 cells.
  const bandH = 18;
  drawKpiBand(titleY, bandH, [
    { label: 'Active', value: String(recurringActiveCount), delta: 'all charged' },
    { label: 'Subscriptions', value: fmt(recurringSubsTotal), delta: `${recurringSubsCount} active` },
    { label: 'Bills', value: fmt(recurringBillsTotal), delta: `${recurringBillsCount} active` },
    { label: 'Rent', value: fmt(recurringRentTotal), delta: 'monthly' },
  ]);

  const y = drawSectionEyebrow(
    'All recurring · this month',
    'sorted by next charge',
    titleY + bandH + 8,
  );

  // Net recurring (income − expense), signed.
  const netRecurring = shown.reduce(
    (s, r) => s + r.periodAmount * (r.effectiveType === 'income' ? 1 : -1), 0,
  );

  const body: Array<Array<string | Record<string, unknown>>> = shown.map((r) => {
    const rec = r.recurring;
    const nextDate = parseLocalDate(rec.next_due_date);
    const dayOfMonth = nextDate.getDate();
    const cadence = `${CADENCE_LABEL[rec.recurrence_type] ?? 'Monthly'} · ${ordinal(dayOfMonth)}`;

    // Last charge: most recent past occurrence, else next_due − one period.
    const pastOcc = r.occurrenceDetails
      .filter((o) => !o.isFuture)
      .map((o) => parseLocalDate(o.date))
      .sort((a, b) => b.getTime() - a.getTime());
    const lastCharge = pastOcc.length > 0
      ? pastOcc[0]
      : previousPeriod(nextDate, rec.recurrence_type);

    const isIncome = r.effectiveType === 'income';
    const signed = (isIncome ? '+' : '−') + fmt(r.periodAmount);

    return [
      interpolatePeriod(rec.description, ctx.data.config.periodType, ctx.data.actualDates.start, locale),
      { content: cadence, styles: { font: 'courier' as const, textColor: mute } },
      { content: rec.category?.name ?? '—', styles: { font: 'courier' as const, textColor: mute } },
      { content: format(lastCharge, 'd MMM', { locale }), styles: { font: 'courier' as const, textColor: mute } },
      { content: signed, styles: { halign: 'right' as const, font: 'courier' as const, textColor: isIncome ? pos : neg } },
      { content: format(nextDate, 'd MMM', { locale }), styles: { font: 'courier' as const, textColor: ink } },
    ];
  });

  // Trailing bold "Net recurring · monthly" row.
  body.push([
    { content: 'Net recurring · monthly', styles: { fontStyle: 'bold' as const, textColor: ink } },
    { content: '', styles: {} },
    { content: '', styles: {} },
    { content: '', styles: {} },
    { content: fmtSigned(netRecurring), styles: { halign: 'right' as const, font: 'courier' as const, fontStyle: 'bold' as const, textColor: netRecurring >= 0 ? pos : neg } },
    { content: '', styles: {} },
  ]);

  const lastBodyIdx = body.length - 1;

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: BODY_TOP + 14, bottom: PH - STRIP_Y + 12 },
    head: [['ITEM', 'CADENCE', 'CATEGORY', 'LAST CHARGE', 'AMOUNT', 'NEXT']],
    body,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 0, right: 2 }, textColor: ink, valign: 'top' },
    headStyles: { font: 'courier', fontSize: 7, fontStyle: 'bold', textColor: mute, fillColor: [255, 255, 255], valign: 'top' },
    columnStyles: {
      0: { cellWidth: 44 },
      1: { cellWidth: 26 },
      2: { cellWidth: 38 },
      3: { cellWidth: 24 },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: COL - 44 - 26 - 38 - 24 - 26 },
    },
    didDrawCell: (data: Record<string, unknown>) => {
      const d = data as {
        section: string;
        row: { index: number };
        column: { index: number };
        cell: { y: number; height: number };
      };
      if (d.section === 'head' && d.column.index === 0) {
        setDraw(ink);
        pdf.setLineWidth(0.4);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      if (d.section === 'body' && d.column.index === 0 && d.row.index < lastBodyIdx) {
        setDraw(line2Col);
        pdf.setLineWidth(0.1);
        pdf.line(MARGIN_X, d.cell.y + d.cell.height, PW - MARGIN_X, d.cell.y + d.cell.height);
      }
      // Heavier rule above the bold net row.
      if (d.section === 'body' && d.column.index === 0 && d.row.index === lastBodyIdx) {
        setDraw(line2Col);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN_X, d.cell.y, PW - MARGIN_X, d.cell.y);
      }
    },
  });

  drawBottomStrip(
    'Recurring expense · monthly cadence',
    '−' + fmt(recurringMonthlyExpense),
    neg,
  );
  drawBottomChrome(state.pageIdx, totalPagesEstimate);
}
