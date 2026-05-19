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

  newPage();
  setFill(ink);
  pdf.rect(MARGIN_X, 24, 5, 5, 'F');
  sans(11, 'bold');
  setText(ink2);
  pdf.text('Spending Tracker', MARGIN_X + 7, 28);
  mono(8, 'bold');
  setText(ink2);
  pdf.text('FINANCIAL REPORT', PW - MARGIN_X, 24, { align: 'right' });
  mono(7);
  setText(mute);
  pdf.text(`REF · ${reference}`, PW - MARGIN_X, 28, { align: 'right' });
  pdf.text(`1 OF ${totalPagesEstimate}`, PW - MARGIN_X, 32, { align: 'right' });

  mono(8, 'bold');
  setText(mute);
  pdf.text('ON-DEMAND REPORT · PERIOD', MARGIN_X, 100);

  sans(36, 'bold');
  setText(ink);
  const titleText = format(actualDates.start, 'MMMM yyyy', { locale });
  pdf.text(titleText.charAt(0).toUpperCase() + titleText.slice(1), MARGIN_X, 118);

  sans(11);
  setText(ink3);
  const days = periodDays;
  const subtitle = `A ${days}-day statement of income, expenses and balances across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}. Compiled ${format(generatedAt, 'd MMM yyyy', { locale })}, for your records.`;
  const subtitleLines = pdf.splitTextToSize(subtitle, COL * 0.55);
  pdf.text(subtitleLines, MARGIN_X, 128);

  const holderName = '—';
  const holderY = 152;
  const labels: [string, string][] = [
    ['HOLDER', holderName],
    ['PERIOD', `${periodCompact} · ${days} days`],
    ['BASIS', `${config.dateType === 'value' ? 'Value' : 'Accounting'} date · EUR`],
    ['REFERENCE', reference],
  ];
  labels.forEach(([k, v], i) => {
    mono(7, 'bold');
    setText(mute);
    pdf.text(k, MARGIN_X, holderY + i * 7);
    sans(10);
    setText(ink);
    pdf.text(v, MARGIN_X + 30, holderY + i * 7);
  });

  const figsY = 235;
  setText(ink);
  setFill(ink);
  pdf.setDrawColor(ink[0], ink[1], ink[2]);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN_X, figsY, PW - MARGIN_X, figsY);
  const fcellW = COL / 3;
  const fc = [
    { lbl: 'INCOME', val: fmt(totalIncome), color: pos },
    { lbl: 'EXPENSES', val: fmt(totalExpenses), color: neg },
    { lbl: 'NET RESULT', val: fmtSigned(netResult), color: netResult >= 0 ? pos : neg },
  ];
  fc.forEach((c, i) => {
    const x = MARGIN_X + i * fcellW;
    mono(7, 'bold');
    setText(mute);
    pdf.text(c.lbl, x + 2, figsY + 6);
    mono(15, 'bold');
    setText(c.color);
    pdf.text(c.val, x + 2, figsY + 14);
    if (i < 2) {
      pdf.setDrawColor(lineCol[0], lineCol[1], lineCol[2]);
      pdf.setLineWidth(0.2);
      pdf.line(x + fcellW, figsY, x + fcellW, figsY + 17);
    }
  });
  pdf.setDrawColor(lineCol[0], lineCol[1], lineCol[2]);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, figsY + 19, PW - MARGIN_X, figsY + 19);

  mono(8);
  setText(mute);
  pdf.text(
    `GENERATED ${format(generatedAt, 'd MMM yyyy · HH:mm', { locale }).toUpperCase()}`,
    MARGIN_X, figsY + 26,
  );
  pdf.text(`01 / ${String(totalPagesEstimate).padStart(2, '0')}`, PW - MARGIN_X, figsY + 26, { align: 'right' });
}
