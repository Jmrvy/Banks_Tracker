import { format } from 'date-fns';
import type { ReportCtx } from '../types';

export function renderCover(ctx: ReportCtx) {
  const {
    pdf, MARGIN_X, PW, setFill, setText, ink, ink2, ink3, mute, lineCol, pos, neg,
    sans, mono, fmt, fmtSigned, newPage, locale, reference, totalPagesEstimate,
  } = ctx;
  const { accounts, actualDates, config, totalIncome, totalExpenses, netResult, periodDays } = ctx.data;
  const { periodCompact, generatedAt } = ctx;
  const COL = ctx.COL;
  const RIGHT = PW - MARGIN_X;

  newPage();

  // ── Top header (cover-specific) ──────────────────────────────────
  // Spec § 06: cover mark — rounded, two-scale single mark.
  setFill(ink);
  pdf.roundedRect(MARGIN_X, 23.4, 5, 5, 1.3, 1.3, 'F');
  sans(11, 'bold', -5);
  setText(ink2);
  pdf.text('Spending Tracker', MARGIN_X + 7.5, 27.6);

  mono(7.5, 'bold', 10);
  setText(ink2);
  pdf.text('FINANCIAL REPORT', RIGHT, 24, { align: 'right' });
  mono(7, 'normal', 8);
  setText(mute);
  pdf.text(`REF · ${reference}`, RIGHT, 28, { align: 'right' });
  pdf.text(`1 PAGE OF ${totalPagesEstimate}`, RIGHT, 32, { align: 'right' });

  // ── Eyebrow + big title ──────────────────────────────────────────
  mono(8.5, 'bold', 12);
  setText(mute);
  pdf.text('ON-DEMAND REPORT · PERIOD', MARGIN_X, 100);
  pdf.setCharSpace(0);

  sans(38, 'bold', -30);
  setText(ink);
  pdf.text(ctx.periodLabel, MARGIN_X, 118);
  pdf.setCharSpace(0);

  // ── Subtitle paragraph ───────────────────────────────────────────
  sans(11, 'normal');
  setText(ink3);
  const days = periodDays;
  const acctCount = accounts.length;
  const subtitle =
    `A ${days}-day statement of income, expenses and balances across ` +
    `${acctCount} account${acctCount !== 1 ? 's' : ''}. ` +
    `Compiled ${format(generatedAt, 'd MMM yyyy', { locale })}, for your records.`;
  const subtitleLines = pdf.splitTextToSize(subtitle, COL * 0.55);
  pdf.text(subtitleLines, MARGIN_X, 128, { lineHeightFactor: 1.45 });

  // ── Detail block ─────────────────────────────────────────────────
  const detailY = 152;
  const detailRows: [string, string][] = [
    ['HOLDER', '—'],
    ['PERIOD', `${periodCompact} · ${days} days`],
    ['BASIS', `${config.dateType === 'value' ? 'Value' : 'Accounting'} date · EUR`],
    ['REFERENCE', reference],
  ];
  detailRows.forEach(([k, v], i) => {
    const y = detailY + i * 7;
    mono(7, 'bold', 10);
    setText(mute);
    pdf.text(k, MARGIN_X, y);
    pdf.setCharSpace(0);
    sans(10, 'normal');
    setText(ink);
    pdf.text(v, MARGIN_X + 30, y);
  });

  // ── Lower key-figures block ──────────────────────────────────────
  const figsY = 235;
  pdf.setDrawColor(ink[0], ink[1], ink[2]);
  pdf.setLineWidth(0.8); // document rule (spec § 04)
  pdf.line(MARGIN_X, figsY, RIGHT, figsY);

  const fcellW = COL / 3;
  const figCells = [
    { lbl: 'INCOME', val: fmt(totalIncome), color: pos },
    { lbl: 'EXPENSES', val: fmt(totalExpenses), color: neg },
    { lbl: 'NET RESULT', val: fmtSigned(netResult), color: netResult >= 0 ? pos : neg },
  ];
  figCells.forEach((c, i) => {
    const x = MARGIN_X + i * fcellW;
    mono(7, 'bold', 10);
    setText(mute);
    pdf.text(c.lbl, x + 2, figsY + 6);
    pdf.setCharSpace(0);
    mono(15, 'normal', -20);
    setText(c.color);
    pdf.text(c.val, x + 2, figsY + 14);
    pdf.setCharSpace(0);
    if (i < 2) {
      pdf.setDrawColor(lineCol[0], lineCol[1], lineCol[2]);
      pdf.setLineWidth(0.15);
      pdf.line(x + fcellW, figsY, x + fcellW, figsY + 17);
    }
  });
  pdf.setDrawColor(lineCol[0], lineCol[1], lineCol[2]);
  pdf.setLineWidth(0.15);
  pdf.line(MARGIN_X, figsY + 19, RIGHT, figsY + 19);

  // ── Footer ───────────────────────────────────────────────────────
  mono(7.5, 'normal', 6);
  setText(mute);
  pdf.text(
    `Generated ${format(generatedAt, 'd MMM yyyy · HH:mm', { locale })} CET`,
    MARGIN_X, figsY + 26,
  );
  pdf.text(
    `01 / ${String(totalPagesEstimate).padStart(2, '0')}`,
    RIGHT, figsY + 26, { align: 'right' },
  );
  pdf.setCharSpace(0);
}
