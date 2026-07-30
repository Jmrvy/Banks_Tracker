import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  startOfMonth, endOfMonth, subMonths, format,
  startOfWeek, endOfWeek, subWeeks,
  startOfQuarter, endOfQuarter, subQuarters,
} from "https://esm.sh/date-fns@3.6.0";
import { enGB, fr } from "https://esm.sh/date-fns@3.6.0/locale";
import { type EmailLang, normalizeLang, tr } from "../_shared/emailI18n.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── PDF Generation (slide-style landscape report) ──────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function generateSlidesPdf(data: any, lang: EmailLang): Promise<string> {
  /** Shorthand for a PDF string in the recipient's language. */
  const s = (key: string, params: Record<string, string | number> = {}) => tr(lang, key, params);
  const pdfDoc = await PDFDocument.create();
  // Type system mirrors the redesign — Geist (sans) → Helvetica, Geist Mono
  // → Courier, Fraunces (serif headlines) → Times. pdf-lib only ships the
  // 14 PDF standard fonts; embedding the actual webfonts would balloon the
  // edge function payload.
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const W = 842; // A4 landscape in points
  const H = 595;

  // Colour tokens — straight from the redesign's :root.
  const ink = rgb(0.047, 0.051, 0.047);     // #0c0d0c
  const ink2 = rgb(0.122, 0.129, 0.122);    // #1f211f
  const mute = rgb(0.431, 0.443, 0.424);    // #6e716c
  const mute2 = rgb(0.604, 0.612, 0.592);   // #9a9c97
  const line = rgb(0.906, 0.898, 0.867);    // #e7e5dd
  const line2 = rgb(0.937, 0.925, 0.894);   // #efece4
  const paper = rgb(1, 1, 1);
  const canvas = rgb(0.961, 0.957, 0.941);  // #f5f4f0 — used on the cover
  const pos = rgb(0.173, 0.541, 0.290);     // ≈ oklch(46% 0.09 155)
  const neg = rgb(0.784, 0.227, 0.165);     // ≈ oklch(52% 0.16 25)

  // Width helpers
  const cx = (text: string, size: number, f: any) =>
    (W - f.widthOfTextAtSize(text, size)) / 2;
  const rx = (text: string, size: number, f: any, margin: number) =>
    W - margin - f.widthOfTextAtSize(text, size);

  const income = String(data.income ?? '0.00');
  const expenses = String(data.expenses ?? '0.00');
  const balance = String(data.balance ?? '0.00');
  const net = parseFloat(income) - parseFloat(expenses);
  const netStr = (net >= 0 ? '+' : '') + net.toFixed(2);
  const period = String(data.period ?? '');
  const savingsRate = data.savingsRate ?? 0;
  const txCount = data.transactionCount ?? 0;
  const incomeChange = data.incomeChange ?? 0;
  const expenseChange = data.expenseChange ?? 0;
  const generatedOn = format(new Date(), "d MMMM yyyy", { locale: lang === 'en' ? enGB : fr });

  /** Hairline horizontal rule. */
  function rule(page: any, x: number, y: number, w: number, color = line) {
    page.drawRectangle({ x, y, width: w, height: 0.5, color });
  }

  /** Statement-style page header — eyebrow + serif title + thin rule. */
  function drawSectionHeader(page: any, eyebrow: string, title: string) {
    const M = 50;
    page.drawText(eyebrow.toUpperCase(), { x: M, y: H - 50, size: 9, font: mono, color: mute });
    page.drawText(title, { x: M, y: H - 80, size: 26, font: serif, color: ink });
    page.drawText(period, { x: rx(period, 9, mono, M), y: H - 50, size: 9, font: mono, color: mute });
    rule(page, M, H - 96, W - 2 * M, line);
  }

  /** Statement-style footer — thin rule + brand and page indicator. */
  function drawPageFoot(page: any, num: number, total: number) {
    const M = 50;
    rule(page, M, 38, W - 2 * M, line);
    page.drawText(s('pdf.brandTag'), { x: M, y: 22, size: 8, font: mono, color: mute2 });
    const pn = `${String(num).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    page.drawText(pn, { x: rx(pn, 8, mono, M), y: 22, size: 8, font: mono, color: mute2 });
  }

  const totalPages = 2 + (data.topCategories?.length > 0 ? 1 : 0) + (data.accounts?.length > 0 ? 1 : 0) + (data.budgetOverspent?.length > 0 ? 1 : 0) + (data.specialBudgets?.length > 0 ? 1 : 0);
  let pageNum = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: MAGAZINE COVER
  // ═══════════════════════════════════════════════════════════════════════════
  const p1 = pdfDoc.addPage([W, H]);
  pageNum++;

  // Warm off-white paper
  p1.drawRectangle({ x: 0, y: 0, width: W, height: H, color: canvas });

  // Top brand row
  const COV_M = 56;
  // Logo square (filled near-black)
  p1.drawRectangle({ x: COV_M, y: H - COV_M - 22, width: 22, height: 22, color: ink });
  p1.drawText('Spending Tracker', {
    x: COV_M + 32, y: H - COV_M - 16, size: 13, font: sansBold, color: ink2,
  });
  p1.drawText(s('pdf.docType'), {
    x: rx(s('pdf.docType'), 10, mono, COV_M),
    y: H - COV_M - 16, size: 10, font: mono, color: mute,
  });

  // Hairline rule across the cover, ~52% down the page (matches the redesign).
  rule(p1, COV_M, H * 0.52, W - 2 * COV_M, line);

  // Eyebrow above the headline
  p1.drawText(s('pdf.cover'), {
    x: COV_M, y: H * 0.55 + 14, size: 11, font: mono, color: mute,
  });

  // Big serif period — magazine headline.
  const periodTitle = period;
  p1.drawText(periodTitle, {
    x: COV_M, y: H * 0.42, size: 56, font: serif, color: ink,
  });

  // Subline — verdict-first, italic accent on the sign of the net.
  const verdict = net >= 0
    ? s('pdf.verdict.saved', { amount: Math.abs(net).toFixed(0) })
    : s('pdf.verdict.overspent', { amount: Math.abs(net).toFixed(0) });
  p1.drawText(verdict, {
    x: COV_M, y: H * 0.42 - 26, size: 14, font: serifItalic, color: mute,
  });

  // Bottom meta row — generated date + tx count + savings rate, mono.
  rule(p1, COV_M, 96, W - 2 * COV_M, line);
  p1.drawText(s('pdf.generated'), { x: COV_M, y: 76, size: 8, font: mono, color: mute2 });
  p1.drawText(generatedOn, { x: COV_M, y: 60, size: 11, font: sans, color: ink2 });

  p1.drawText(s('pdf.transactions'), { x: COV_M + 220, y: 76, size: 8, font: mono, color: mute2 });
  p1.drawText(String(txCount), { x: COV_M + 220, y: 60, size: 11, font: monoBold, color: ink2 });

  p1.drawText(s('pdf.savingsRate'), { x: COV_M + 360, y: 76, size: 8, font: mono, color: mute2 });
  p1.drawText(`${savingsRate}%`, {
    x: COV_M + 360, y: 60, size: 11, font: monoBold, color: savingsRate >= 0 ? pos : neg,
  });

  // Page indicator
  const coverPn = `${String(pageNum).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`;
  p1.drawText(coverPn, { x: rx(coverPn, 9, mono, COV_M), y: 60, size: 9, font: mono, color: mute2 });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: VUE D'ENSEMBLE — statement-style 3-cell number row
  // ═══════════════════════════════════════════════════════════════════════════
  const p2 = pdfDoc.addPage([W, H]);
  pageNum++;
  drawSectionHeader(p2, s('pdf.s1'), s('pdf.s1sub'));

  const M = 50;
  const cellW = (W - 2 * M) / 3;
  const cellTopY = H - 130;
  const cellBotY = cellTopY - 110;

  // Single bordered card containing 3 cells, hairlines between.
  p2.drawRectangle({
    x: M, y: cellBotY, width: W - 2 * M, height: cellTopY - cellBotY,
    borderColor: line, borderWidth: 0.75, color: paper,
  });
  // Vertical dividers
  p2.drawRectangle({ x: M + cellW, y: cellBotY, width: 0.75, height: cellTopY - cellBotY, color: line });
  p2.drawRectangle({ x: M + 2 * cellW, y: cellBotY, width: 0.75, height: cellTopY - cellBotY, color: line });

  function drawCell(x: number, eyebrow: string, value: string, color: any, deltaPct?: number, deltaGood?: boolean) {
    p2.drawText(eyebrow.toUpperCase(), { x: x + 18, y: cellTopY - 26, size: 9, font: mono, color: mute });
    p2.drawText(value, { x: x + 18, y: cellTopY - 70, size: 26, font: monoBold, color });
    if (deltaPct !== undefined && deltaPct !== 0) {
      const arrow = deltaPct >= 0 ? '↑' : '↓';
      const tone = deltaGood ? pos : neg;
      const txt = `${arrow} ${Math.abs(deltaPct)}% ${s('pdf.vsPrev')}`;
      p2.drawText(txt, { x: x + 18, y: cellBotY + 14, size: 9.5, font: mono, color: tone });
    }
  }

  drawCell(M, s('pdf.income'), `${income} EUR`, pos, incomeChange, incomeChange >= 0);
  drawCell(M + cellW, s('pdf.expenses'), `${expenses} EUR`, neg, expenseChange, expenseChange <= 0);
  drawCell(M + 2 * cellW, s('pdf.net'), `${netStr} EUR`, net >= 0 ? pos : neg);

  // Total bar — set off by a 1px black rule above (matches the redesign).
  const totBarY = cellBotY - 60;
  p2.drawRectangle({ x: M, y: totBarY + 32, width: W - 2 * M, height: 1, color: ink });
  p2.drawText(s('pdf.totalBalance'), { x: M, y: totBarY + 12, size: 11, font: mono, color: ink2 });
  const balTxt = `${balance} EUR`;
  p2.drawText(balTxt, {
    x: rx(balTxt, 22, monoBold, M),
    y: totBarY + 8, size: 22, font: monoBold, color: parseFloat(balance) >= 0 ? ink : neg,
  });

  // Savings rate caption (small, mono, no card)
  const srLine = `${s('pdf.savingsRate')} ${savingsRate}%  -  ${txCount} ${s('pdf.transactions').toLowerCase()}  -  ${period}`;
  p2.drawText(srLine, { x: M, y: totBarY - 30, size: 10, font: mono, color: mute });

  drawPageFoot(p2, pageNum, totalPages);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: CATEGORIES — statement-style table with hairline rows + bar
  // ═══════════════════════════════════════════════════════════════════════════
  const topCats: any[] = data.topCategories || [];
  if (topCats.length > 0) {
    const p3 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawSectionHeader(p3, s('pdf.s2'), s('pdf.s2sub'));

    const tM = 50;
    const tW = W - 2 * tM;
    let curY = H - 120;

    // Column headers (mono uppercase, no fill)
    p3.drawText(s('pdf.colCategory'), { x: tM, y: curY, size: 9, font: mono, color: mute });
    p3.drawText(s('pdf.colAmount'), { x: tM + tW * 0.42, y: curY, size: 9, font: mono, color: mute });
    p3.drawText('%', { x: tM + tW * 0.58, y: curY, size: 9, font: mono, color: mute });
    p3.drawText(s('pdf.colShare'), { x: tM + tW * 0.66, y: curY, size: 9, font: mono, color: mute });
    curY -= 8;
    rule(p3, tM, curY, tW, ink2);
    curY -= 8;

    const rowH = 28;
    for (const cat of topCats) {
      if (curY - rowH < 60) break;
      curY -= rowH;

      const isOver = cat.budget != null && cat.spent > cat.budget;
      const catName = String(cat.name ?? '').substring(0, 36);
      p3.drawText(catName, { x: tM, y: curY + 8, size: 11, font: sansBold, color: ink });
      if (isOver) {
        p3.drawText(s('pdf.overTag'), {
          x: tM + sansBold.widthOfTextAtSize(catName, 11) + 10,
          y: curY + 8, size: 8, font: mono, color: neg,
        });
      }

      const amt = `${Number(cat.spent).toFixed(2)} EUR`;
      p3.drawText(amt, { x: tM + tW * 0.42, y: curY + 8, size: 11, font: monoBold, color: ink });

      p3.drawText(`${cat.pct}%`, { x: tM + tW * 0.58, y: curY + 8, size: 10, font: mono, color: mute });

      const barX = tM + tW * 0.66;
      const barMaxW = tW * 0.32;
      const barW = Math.max(2, Math.min(cat.pct, 100) / 100 * barMaxW);
      // 6px pill: a thin track + a fill, both rounded by being thin
      p3.drawRectangle({ x: barX, y: curY + 8, width: barMaxW, height: 4, color: line2 });
      p3.drawRectangle({ x: barX, y: curY + 8, width: barW, height: 4, color: isOver ? neg : ink });

      // Hairline between rows
      rule(p3, tM, curY, tW, line);
    }

    drawPageFoot(p3, pageNum, totalPages);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: COMPTES — flow + balance, total bar set off by a 1px ink rule
  // ═══════════════════════════════════════════════════════════════════════════
  const accounts: any[] = data.accounts || [];
  if (accounts.length > 0) {
    const p4 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawSectionHeader(p4, s('pdf.s3'), s('pdf.s3sub'));

    const tM = 50;
    const tW = W - 2 * tM;
    let curY = H - 120;

    p4.drawText(s('pdf.colAccount'), { x: tM, y: curY, size: 9, font: mono, color: mute });
    p4.drawText(s('pdf.colIncome'), { x: tM + tW * 0.45, y: curY, size: 9, font: mono, color: mute });
    p4.drawText(s('pdf.colExpenses'), { x: tM + tW * 0.62, y: curY, size: 9, font: mono, color: mute });
    p4.drawText(s('pdf.colBalance'), { x: rx(s('pdf.colBalance'), 9, mono, tM), y: curY, size: 9, font: mono, color: mute });
    curY -= 8;
    rule(p4, tM, curY, tW, ink2);
    curY -= 8;

    const rowH = 30;
    for (const acc of accounts) {
      if (curY - rowH < 100) break;
      curY -= rowH;

      const accName = String(acc.name ?? '').substring(0, 36);
      p4.drawText(accName, { x: tM, y: curY + 9, size: 11, font: sansBold, color: ink });

      const inc = `+${Number(acc.income || 0).toFixed(0)} EUR`;
      p4.drawText(inc, { x: tM + tW * 0.45, y: curY + 9, size: 11, font: mono, color: pos });

      const exp = `-${Number(acc.expense || 0).toFixed(0)} EUR`;
      p4.drawText(exp, { x: tM + tW * 0.62, y: curY + 9, size: 11, font: mono, color: neg });

      const balVal = Number(acc.balance);
      const bal = `${balVal.toFixed(2)} EUR`;
      p4.drawText(bal, {
        x: rx(bal, 12, monoBold, tM),
        y: curY + 9, size: 12, font: monoBold, color: balVal >= 0 ? ink : neg,
      });

      rule(p4, tM, curY, tW, line);
    }

    // Total — black hairline above + label/value row.
    const totalY = curY - 30;
    p4.drawRectangle({ x: tM, y: totalY + 22, width: tW, height: 1, color: ink });
    p4.drawText(s('pdf.totalBalance'), { x: tM, y: totalY + 4, size: 11, font: mono, color: ink2 });
    const balTotal = `${balance} EUR`;
    p4.drawText(balTotal, {
      x: rx(balTotal, 18, monoBold, tM),
      y: totalY, size: 18, font: monoBold, color: parseFloat(balance) >= 0 ? ink : neg,
    });

    drawPageFoot(p4, pageNum, totalPages);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5: BUDGETS DEPASSES (conditional) — pace bar with budget tick
  // ═══════════════════════════════════════════════════════════════════════════
  const budgetOverspent: any[] = data.budgetOverspent || [];
  if (budgetOverspent.length > 0) {
    const p5 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawSectionHeader(p5, s('pdf.s4'), s('pdf.s4sub'));

    const aM = 50;
    let curY = H - 130;
    const cardH = 70;

    for (const cat of budgetOverspent) {
      if (curY - cardH < 60) break;
      curY -= cardH + 12;

      const over = Number(cat.spent) - Number(cat.budget);
      const pctUsed = cat.budget > 0 ? Math.round((cat.spent / cat.budget) * 100) : 0;

      // Hairline-bordered card (no flat-fill panel — keeps statement aesthetic).
      p5.drawRectangle({
        x: aM, y: curY, width: W - 2 * aM, height: cardH,
        borderColor: line, borderWidth: 0.75, color: paper,
      });

      // Name + over chip
      p5.drawText(String(cat.name ?? ''), {
        x: aM + 18, y: curY + cardH - 24, size: 14, font: sansBold, color: ink,
      });
      const overTag = `+${over.toFixed(0)} EUR`;
      p5.drawText(overTag, {
        x: rx(overTag, 16, monoBold, aM + 18),
        y: curY + cardH - 26, size: 16, font: monoBold, color: neg,
      });

      // Sub line (used / budget · pct)
      const sub = `${Number(cat.spent).toFixed(2)} EUR / ${Number(cat.budget).toFixed(2)} EUR  -  ${pctUsed}%`;
      p5.drawText(sub, { x: aM + 18, y: curY + cardH - 44, size: 10, font: mono, color: mute });

      // Pace bar — 0..150% range so we can show overrun + budget tick at 100%.
      const barX = aM + 18;
      const barW = W - 2 * aM - 36;
      const barY = curY + 14;
      const fillW = Math.min(pctUsed, 150) / 150 * barW;
      const budgetTickX = barX + (100 / 150) * barW;
      p5.drawRectangle({ x: barX, y: barY, width: barW, height: 6, color: line2 });
      p5.drawRectangle({ x: barX, y: barY, width: fillW, height: 6, color: neg });
      // Black tick at the budget line.
      p5.drawRectangle({ x: budgetTickX - 0.5, y: barY - 2, width: 1, height: 10, color: ink });
    }

    drawPageFoot(p5, pageNum, totalPages);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 6: BUDGETS SPECIAUX (conditional) — event/trip envelopes for the period
  // ═══════════════════════════════════════════════════════════════════════════
  const specialBudgets: any[] = data.specialBudgets || [];
  if (specialBudgets.length > 0) {
    const p6 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawSectionHeader(p6, s('pdf.s5'), s('pdf.s5sub'));

    const sM = 50;
    let curY = H - 130;
    const cardH = 64;

    for (const sb of specialBudgets) {
      if (curY - cardH < 60) break;
      curY -= cardH + 12;

      const total = Number(sb.budget) || 0;
      const spent = Number(sb.spent) || 0;
      const pctUsed = total > 0 ? Math.round((spent / total) * 100) : 0;
      const over = !!sb.over;
      const isClosed = sb.status === 'closed';
      const accent = over ? neg : ink;

      // Hairline-bordered card.
      p6.drawRectangle({
        x: sM, y: curY, width: W - 2 * sM, height: cardH,
        borderColor: line, borderWidth: 0.75, color: paper,
      });

      // Name + optional CLOSED chip
      p6.drawText(String(sb.name ?? ''), {
        x: sM + 18, y: curY + cardH - 24, size: 14, font: sansBold, color: ink,
      });
      if (isClosed) {
        const nameW = sansBold.widthOfTextAtSize(String(sb.name ?? ''), 14);
        p6.drawText(s('pdf.closedTag'), {
          x: sM + 18 + nameW + 10, y: curY + cardH - 22, size: 8, font: mono, color: mute,
        });
      }

      // Right figure — period spend over the envelope total
      const fig = total > 0
        ? `${spent.toFixed(0)} / ${total.toFixed(0)} EUR`
        : `${spent.toFixed(0)} EUR`;
      p6.drawText(fig, {
        x: rx(fig, 15, monoBold, sM + 18),
        y: curY + cardH - 25, size: 15, font: monoBold, color: accent,
      });

      // Sub line
      const sub = total > 0
        ? `${pctUsed}% utilise  ·  ${sb.count ?? 0} transaction${(sb.count ?? 0) === 1 ? '' : 's'} sur la periode`
        : `${sb.count ?? 0} transaction${(sb.count ?? 0) === 1 ? '' : 's'} sur la periode`;
      p6.drawText(sub, { x: sM + 18, y: curY + cardH - 44, size: 10, font: mono, color: mute });

      // Pace bar (0..100% of the envelope) with a black tick at the total.
      const barX = sM + 18;
      const barW = W - 2 * sM - 36;
      const barY = curY + 14;
      const fillW = Math.min(pctUsed, 100) / 100 * barW;
      p6.drawRectangle({ x: barX, y: barY, width: barW, height: 6, color: line2 });
      p6.drawRectangle({ x: barX, y: barY, width: fillW, height: 6, color: accent });
      p6.drawRectangle({ x: barX + barW - 0.5, y: barY - 2, width: 1, height: 10, color: ink });
    }

    drawPageFoot(p6, pageNum, totalPages);
  }

  const pdfBytes = await pdfDoc.save();
  return uint8ToBase64(pdfBytes);
}

// ─── Main handler ───────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Two entry points:
  //   1. Cron — must present `x-cron-secret`. Processes every user whose
  //      cadence fires today.
  //   2. In-app test — authenticated user clicks "send now". The caller's
  //      JWT identifies the user, and we process only that row with the
  //      calendar gate bypassed.
  const cronHeader = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const isCron = !!cronHeader && cronHeader === expectedSecret;

  let testUserId: string | null = null;
  if (!isCron) {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization');
    const token = auth && auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    testUserId = userData.user.id;
  }

  try {
    console.log(isCron ? "Starting monthly reports generation (cron)..." : `Starting test report for user ${testUserId}...`);

    const now = new Date();
    const todayCadences: Array<'weekly' | 'monthly' | 'quarterly'> = [];
    if (isCron) {
      const dow = now.getDay();
      const dom = now.getDate();
      const month = now.getMonth();
      if (dow === 1) todayCadences.push('weekly');
      if (dom === 1) todayCadences.push('monthly');
      if (dom === 1 && (month === 0 || month === 3 || month === 6 || month === 9)) todayCadences.push('quarterly');
      if (todayCadences.length === 0) {
        console.log('No cadence triggers fire today; exiting.');
        return new Response(
          JSON.stringify({ message: 'No cadence triggers today', sent: 0 }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let query = supabaseAdmin
      .from('notification_preferences')
      .select('user_id, date_type, monthly_report_cadence, monthly_report_sections, monthly_report_attach_pdf, monthly_report_top_n, monthly_reports, email_language');
    if (isCron) {
      query = query.in('monthly_report_cadence', todayCadences);
    } else {
      query = query.eq('user_id', testUserId!);
    }
    const { data: usersWithNotifs, error: usersError } = await query;

    if (usersError) throw usersError;

    const usersWithEmails = await Promise.all(
      (usersWithNotifs || []).map(async (pref: any) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(pref.user_id);
        const rawCadence = (pref.monthly_report_cadence ?? (pref.monthly_reports ? 'monthly' : 'off')) as
          'off' | 'weekly' | 'monthly' | 'quarterly';
        const sections: string[] = Array.isArray(pref.monthly_report_sections) && pref.monthly_report_sections.length
          ? pref.monthly_report_sections
          : ['summary', 'categories', 'budgets', 'accounts', 'recurring'];
        const attachPdf: boolean = pref.monthly_report_attach_pdf !== false;
        const topN: number = Math.max(1, Math.min(20, Number(pref.monthly_report_top_n) || 6));
        // For test runs we want a preview even when cadence is "off"; we
        // fall through to a monthly window in that case so the user can
        // verify their setup.
        const cadence = (!isCron && rawCadence === 'off') ? 'monthly' : rawCadence;
        return {
          user_id: pref.user_id,
          email: authUser?.user?.email || null,
          date_type: pref.date_type === 'value' ? 'value' : 'accounting',
          cadence,
          sections,
          attachPdf,
          topN,
          lang: pref.email_language,
        };
      })
    );

    const validUsers = isCron
      ? usersWithEmails.filter((u: any) => u.email && u.cadence !== 'off')
      : usersWithEmails.filter((u: any) => u.email);
    console.log(`Found ${validUsers.length} users to process${isCron ? ` (cadences: ${todayCadences.join(', ')})` : ' (test)'}`);

    // Period helpers — choose the right window per user's cadence.
    const periodForCadence = (cadence: 'weekly' | 'monthly' | 'quarterly', lang: EmailLang) => {
      // Period labels are user-facing copy, so they follow the recipient's
      // email language rather than a hardcoded French locale.
      const dfLocale = lang === 'en' ? enGB : fr;
      if (cadence === 'weekly') {
        const lastWeek = subWeeks(now, 1);
        return {
          start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
          end: endOfWeek(lastWeek, { weekStartsOn: 1 }),
          prevStart: startOfWeek(subWeeks(lastWeek, 1), { weekStartsOn: 1 }),
          prevEnd: endOfWeek(subWeeks(lastWeek, 1), { weekStartsOn: 1 }),
          label: tr(lang, 'report.periodLabel.weekly', {
            date: format(startOfWeek(lastWeek, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: dfLocale }),
          }),
        };
      }
      if (cadence === 'quarterly') {
        const lastQuarter = subQuarters(now, 1);
        return {
          start: startOfQuarter(lastQuarter),
          end: endOfQuarter(lastQuarter),
          prevStart: startOfQuarter(subQuarters(lastQuarter, 1)),
          prevEnd: endOfQuarter(subQuarters(lastQuarter, 1)),
          label: `${lang === 'en' ? 'Q' : 'T'}${Math.floor(lastQuarter.getMonth() / 3) + 1} ${lastQuarter.getFullYear()}`,
        };
      }
      // monthly
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
        prevStart: startOfMonth(subMonths(lastMonth, 1)),
        prevEnd: endOfMonth(subMonths(lastMonth, 1)),
        label: format(lastMonth, 'MMMM yyyy', { locale: dfLocale }),
      };
    };

    for (const userPref of validUsers) {
      try {
        // Resolve the period window for this user's cadence.
        const lang = normalizeLang((userPref as any).lang);
        const period = periodForCadence(userPref.cadence as 'weekly' | 'monthly' | 'quarterly', lang);
        const monthStart = period.start;
        const monthEnd = period.end;
        const prevMonthStart = period.prevStart;
        const prevMonthEnd = period.prevEnd;
        const periodLabel = period.label;

        // Use the user's preferred date column (accounting vs value).
        const dateColumn = userPref.date_type === 'value' ? 'value_date' : 'transaction_date';
        // Net spend per transaction: amount minus any refunded portion (clamped to 0).
        const netExpense = (t: any) =>
          Math.max(0, Number(t.amount) - Number(t.refunded_amount || 0));

        // Fetch accounts
        const { data: accounts } = await supabaseAdmin
          .from('accounts')
          .select('id, name, balance')
          .eq('user_id', userPref.user_id);

        // Fetch last month transactions — pull every column we need to filter
        // out excluded transactions and net out refunds. Filter by the user's
        // preferred date column (`value_date` falling back to
        // `transaction_date`, mirroring the in-app `dateOf` helper).
        const { data: transactions } = await supabaseAdmin
          .from('transactions')
          .select('amount, type, category_id, account_id, description, transaction_date, value_date, include_in_stats, refunded_amount, refund_of_transaction_id, transfer_fee, special_budget_id')
          .eq('user_id', userPref.user_id)
          .gte(dateColumn, monthStart.toISOString().split('T')[0])
          .lte(dateColumn, monthEnd.toISOString().split('T')[0]);

        // Fetch previous month transactions for comparison
        const { data: prevTransactions } = await supabaseAdmin
          .from('transactions')
          .select('amount, type, include_in_stats, refunded_amount, refund_of_transaction_id, transfer_fee')
          .eq('user_id', userPref.user_id)
          .gte(dateColumn, prevMonthStart.toISOString().split('T')[0])
          .lte(dateColumn, prevMonthEnd.toISOString().split('T')[0]);

        // Fetch categories
        const { data: categories } = await supabaseAdmin
          .from('categories')
          .select('id, name, budget')
          .eq('user_id', userPref.user_id);

        // Fetch special (event/trip) budgets — surfaced on their own,
        // scoped to the period window below.
        const { data: specialBudgetsRaw } = await supabaseAdmin
          .from('special_budgets')
          .select('id, name, total_budget, start_date, end_date, status')
          .eq('user_id', userPref.user_id);

        // Drop transactions explicitly excluded from stats — same rule the
        // in-app analyses use so the email and the app agree on totals.
        const txList = (transactions || []).filter((t: any) => t.include_in_stats !== false);
        const prevTxList = (prevTransactions || []).filter((t: any) => t.include_in_stats !== false);
        const catList = categories || [];
        const accList = accounts || [];

        // Calculate totals — income excludes refund-typed entries (those are
        // already netted into the original expense), expenses use net amount
        // after refunds, and transfer fees count as expenses.
        const income = txList
          .filter((t: any) => t.type === 'income' && !t.refund_of_transaction_id)
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const expenses = txList
          .filter((t: any) => t.type === 'expense')
          .reduce((s: number, t: any) => s + netExpense(t), 0);
        const transferFees = txList
          .filter((t: any) => t.type === 'transfer')
          .reduce((s: number, t: any) => s + Number(t.transfer_fee || 0), 0);
        const totalBalance = accList.reduce((s: number, a: any) => s + Number(a.balance), 0);

        const prevIncome = prevTxList
          .filter((t: any) => t.type === 'income' && !t.refund_of_transaction_id)
          .reduce((s: number, t: any) => s + Number(t.amount), 0);
        const prevExpenses = prevTxList
          .filter((t: any) => t.type === 'expense')
          .reduce((s: number, t: any) => s + netExpense(t), 0);

        // Category breakdown — net of refunds. Transactions tagged to a
        // special (event/trip) budget are excluded: they belong to their
        // own envelope (surfaced separately below) and must not count
        // against a category's budget, mirroring the in-app aggregation.
        const catMap = new Map<string, { name: string; spent: number; budget: number | null }>();
        for (const cat of catList) {
          catMap.set(cat.id, { name: cat.name, spent: 0, budget: (cat as any).budget || null });
        }
        for (const tx of txList.filter((t: any) => t.type === 'expense' && t.category_id && !t.special_budget_id)) {
          const entry = catMap.get((tx as any).category_id);
          if (entry) entry.spent += netExpense(tx);
        }

        const allCategories = Array.from(catMap.values())
          .filter(c => c.spent > 0)
          .map(c => ({ ...c, pct: expenses > 0 ? Math.round((c.spent / expenses) * 100) : 0 }))
          .sort((a, b) => b.spent - a.spent);

        // User-configurable cap on the categories surfaced in the email.
        const topCategories = allCategories.slice(0, userPref.topN);
        // Strict over-budget: 100% exactly is on-target, only flag rows that
        // crossed the line (mirrors the in-app `BudgetAlertsCard` rule).
        const budgetOverspent = allCategories.filter(c => c.budget && c.spent > c.budget);

        // Special (event/trip) budgets relevant to this period. Spend is
        // scoped to the window and summed straight from the raw period
        // rows (refunds netted, excluded-from-stats rows kept — envelope
        // semantics). A budget shows up when it has tagged spend here or
        // its date range overlaps the window.
        const spbList = specialBudgetsRaw || [];
        const spendBySpb = new Map<string, { spent: number; count: number }>();
        for (const tx of (transactions || [])) {
          if (tx.type !== 'expense' || !tx.special_budget_id) continue;
          const amt = netExpense(tx);
          const e = spendBySpb.get(tx.special_budget_id) || { spent: 0, count: 0 };
          e.spent += amt;
          e.count += 1;
          spendBySpb.set(tx.special_budget_id, e);
        }
        const spbOverlaps = (sb: any): boolean => {
          const s = sb.start_date ? new Date(sb.start_date) : null;
          const e = sb.end_date ? new Date(sb.end_date) : null;
          if (s && s > monthEnd) return false;
          if (e && e < monthStart) return false;
          return s != null || e != null;
        };
        const specialBudgets = spbList
          .filter((sb: any) => spendBySpb.has(sb.id) || spbOverlaps(sb))
          .map((sb: any) => {
            const ps = spendBySpb.get(sb.id) || { spent: 0, count: 0 };
            const total = Number(sb.total_budget) || 0;
            return {
              name: sb.name,
              status: sb.status,
              spent: ps.spent,
              budget: total,
              remaining: total - ps.spent,
              over: total > 0 && ps.spent > total,
            };
          })
          .sort((a: any, b: any) => b.spent - a.spent);

        // Per-account breakdown — same refund-aware totals.
        const accountSummaries = accList.map((acc: any) => {
          const accTx = txList.filter((t: any) => t.account_id === acc.id);
          return {
            name: acc.name,
            balance: Number(acc.balance),
            income: accTx
              .filter((t: any) => t.type === 'income' && !t.refund_of_transaction_id)
              .reduce((s: number, t: any) => s + Number(t.amount), 0),
            expense: accTx
              .filter((t: any) => t.type === 'expense')
              .reduce((s: number, t: any) => s + netExpense(t), 0),
          };
        });

        // Savings rate uses the same net of (expenses + transfer fees) the
        // in-app stats use — keeps app and email totals in agreement.
        const savingsRate =
          income > 0 ? Math.round(((income - expenses - transferFees) / income) * 100) : 0;

        const reportData = {
          period: periodLabel,
          // Recipient's email language — the template also reads it from
          // notification_preferences, but passing it keeps the PDF and the
          // HTML body guaranteed in sync for a single send.
          lang,
          // Cadence — the email template uses this to switch the subject
          // line and footer copy ("monthly" vs "weekly" vs "quarterly").
          cadence: userPref.cadence,
          // Which body blocks the user opted into. The email template
          // gates each section on this list.
          sections: userPref.sections,
          income: income.toFixed(2),
          expenses: expenses.toFixed(2),
          balance: totalBalance.toFixed(2),
          savingsRate,
          topCategories,
          accounts: accountSummaries,
          transactionCount: txList.length,
          budgetOverspent,
          specialBudgets,
          prevMonthIncome: prevIncome.toFixed(2),
          prevMonthExpenses: prevExpenses.toFixed(2),
          incomeChange: prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0,
          expenseChange: prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) : 0,
        };

        // Generate slide-style PDF report — skipped entirely when the
        // user opted out of attaching it.
        let pdfBase64: string | null = null;
        if (userPref.attachPdf) {
          try {
            pdfBase64 = await generateSlidesPdf(reportData, lang);
            console.log(`PDF generated for user ${userPref.user_id} (${Math.round((pdfBase64?.length || 0) * 0.75 / 1024)} KB)`);
          } catch (pdfErr) {
            console.error(`PDF generation failed for user ${userPref.user_id}:`, pdfErr);
          }
        }

        console.log(`Sending ${userPref.cadence} report to user ${userPref.user_id}`);

        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              'x-function-secret': Deno.env.get("FUNCTION_SECRET") || "",
            },
            body: JSON.stringify({
              userId: userPref.user_id,
              type: 'monthly_report',
              data: reportData,
              pdfBase64,
            })
          }
        );

        if (!response.ok) {
          console.error(`Failed to send monthly report for user ${userPref.user_id}`);
        }
      } catch (error) {
        console.error(`Error processing user ${userPref.user_id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ message: "Monthly reports sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-monthly-reports function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
