import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { startOfMonth, endOfMonth, subMonths, format } from "https://esm.sh/date-fns@3.6.0";
import { fr } from "https://esm.sh/date-fns@3.6.0/locale";
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

async function generateSlidesPdf(data: any): Promise<string> {
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
  const generatedOn = format(new Date(), "d MMMM yyyy", { locale: fr });

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
    page.drawText('SPENDING TRACKER · RAPPORT MENSUEL', { x: M, y: 22, size: 8, font: mono, color: mute2 });
    const pn = `${String(num).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    page.drawText(pn, { x: rx(pn, 8, mono, M), y: 22, size: 8, font: mono, color: mute2 });
  }

  const totalPages = 2 + (data.topCategories?.length > 0 ? 1 : 0) + (data.accounts?.length > 0 ? 1 : 0) + (data.budgetOverspent?.length > 0 ? 1 : 0);
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
  p1.drawText('RAPPORT MENSUEL', {
    x: rx('RAPPORT MENSUEL', 10, mono, COV_M),
    y: H - COV_M - 16, size: 10, font: mono, color: mute,
  });

  // Hairline rule across the cover, ~52% down the page (matches the redesign).
  rule(p1, COV_M, H * 0.52, W - 2 * COV_M, line);

  // Eyebrow above the headline
  p1.drawText('Bilan financier', {
    x: COV_M, y: H * 0.55 + 14, size: 11, font: mono, color: mute,
  });

  // Big serif period — magazine headline.
  const periodTitle = period;
  p1.drawText(periodTitle, {
    x: COV_M, y: H * 0.42, size: 56, font: serif, color: ink,
  });

  // Subline — verdict-first, italic accent on the sign of the net.
  const verdict = net >= 0
    ? `Vous avez mis de cote ${Math.abs(net).toFixed(0)} EUR.`
    : `Vous avez depense ${Math.abs(net).toFixed(0)} EUR de plus que vos revenus.`;
  p1.drawText(verdict, {
    x: COV_M, y: H * 0.42 - 26, size: 14, font: serifItalic, color: mute,
  });

  // Bottom meta row — generated date + tx count + savings rate, mono.
  rule(p1, COV_M, 96, W - 2 * COV_M, line);
  p1.drawText('GENERE', { x: COV_M, y: 76, size: 8, font: mono, color: mute2 });
  p1.drawText(generatedOn, { x: COV_M, y: 60, size: 11, font: sans, color: ink2 });

  p1.drawText('TRANSACTIONS', { x: COV_M + 220, y: 76, size: 8, font: mono, color: mute2 });
  p1.drawText(String(txCount), { x: COV_M + 220, y: 60, size: 11, font: monoBold, color: ink2 });

  p1.drawText('TAUX D\'EPARGNE', { x: COV_M + 360, y: 76, size: 8, font: mono, color: mute2 });
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
  drawSectionHeader(p2, '01 · Vue d\'ensemble', 'Bilan du mois');

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
      const txt = `${arrow} ${Math.abs(deltaPct)}% vs mois precedent`;
      p2.drawText(txt, { x: x + 18, y: cellBotY + 14, size: 9.5, font: mono, color: tone });
    }
  }

  drawCell(M, 'Revenus', `${income} EUR`, pos, incomeChange, incomeChange >= 0);
  drawCell(M + cellW, 'Depenses', `${expenses} EUR`, neg, expenseChange, expenseChange <= 0);
  drawCell(M + 2 * cellW, 'Net du mois', `${netStr} EUR`, net >= 0 ? pos : neg);

  // Total bar — set off by a 1px black rule above (matches the redesign).
  const totBarY = cellBotY - 60;
  p2.drawRectangle({ x: M, y: totBarY + 32, width: W - 2 * M, height: 1, color: ink });
  p2.drawText('SOLDE TOTAL', { x: M, y: totBarY + 12, size: 11, font: mono, color: ink2 });
  const balTxt = `${balance} EUR`;
  p2.drawText(balTxt, {
    x: rx(balTxt, 22, monoBold, M),
    y: totBarY + 8, size: 22, font: monoBold, color: parseFloat(balance) >= 0 ? ink : neg,
  });

  // Savings rate caption (small, mono, no card)
  const srLine = `Taux d'epargne ${savingsRate}%  ·  ${txCount} transactions  ·  ${period}`;
  p2.drawText(srLine, { x: M, y: totBarY - 30, size: 10, font: mono, color: mute });

  drawPageFoot(p2, pageNum, totalPages);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: CATEGORIES — statement-style table with hairline rows + bar
  // ═══════════════════════════════════════════════════════════════════════════
  const topCats: any[] = data.topCategories || [];
  if (topCats.length > 0) {
    const p3 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawSectionHeader(p3, '02 · Repartition', 'Categories');

    const tM = 50;
    const tW = W - 2 * tM;
    let curY = H - 120;

    // Column headers (mono uppercase, no fill)
    p3.drawText('CATEGORIE', { x: tM, y: curY, size: 9, font: mono, color: mute });
    p3.drawText('MONTANT', { x: tM + tW * 0.42, y: curY, size: 9, font: mono, color: mute });
    p3.drawText('%', { x: tM + tW * 0.58, y: curY, size: 9, font: mono, color: mute });
    p3.drawText('REPARTITION', { x: tM + tW * 0.66, y: curY, size: 9, font: mono, color: mute });
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
        p3.drawText('AU-DESSUS', {
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
    drawSectionHeader(p4, '03 · Comptes', 'Soldes par compte');

    const tM = 50;
    const tW = W - 2 * tM;
    let curY = H - 120;

    p4.drawText('COMPTE', { x: tM, y: curY, size: 9, font: mono, color: mute });
    p4.drawText('REVENUS', { x: tM + tW * 0.45, y: curY, size: 9, font: mono, color: mute });
    p4.drawText('DEPENSES', { x: tM + tW * 0.62, y: curY, size: 9, font: mono, color: mute });
    p4.drawText('SOLDE', { x: rx('SOLDE', 9, mono, tM), y: curY, size: 9, font: mono, color: mute });
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
    p4.drawText('SOLDE TOTAL', { x: tM, y: totalY + 4, size: 11, font: mono, color: ink2 });
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
    drawSectionHeader(p5, '04 · Alertes', 'Budgets depasses');

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
      const sub = `${Number(cat.spent).toFixed(2)} EUR / ${Number(cat.budget).toFixed(2)} EUR  ·  ${pctUsed}% utilise`;
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

  const pdfBytes = await pdfDoc.save();
  return uint8ToBase64(pdfBytes);
}

// ─── Main handler ───────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!authHeader || authHeader !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    console.log("Starting monthly reports generation...");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: usersWithNotifs, error: usersError } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, date_type')
      .eq('monthly_reports', true);

    if (usersError) throw usersError;

    const usersWithEmails = await Promise.all(
      (usersWithNotifs || []).map(async (pref: any) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(pref.user_id);
        return {
          user_id: pref.user_id,
          email: authUser?.user?.email || null,
          date_type: pref.date_type === 'value' ? 'value' : 'accounting',
        };
      })
    );

    const validUsers = usersWithEmails.filter((u: any) => u.email);
    console.log(`Found ${validUsers.length} users with monthly reports enabled`);

    const now = new Date();
    const lastMonth = subMonths(now, 1);
    const monthStart = startOfMonth(lastMonth);
    const monthEnd = endOfMonth(lastMonth);
    const periodLabel = format(lastMonth, 'MMMM yyyy', { locale: fr });

    // Previous month for comparison
    const twoMonthsAgo = subMonths(now, 2);
    const prevMonthStart = startOfMonth(twoMonthsAgo);
    const prevMonthEnd = endOfMonth(twoMonthsAgo);

    for (const userPref of validUsers) {
      try {
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
          .select('amount, type, category_id, account_id, description, transaction_date, value_date, include_in_stats, refunded_amount, refund_of_transaction_id, transfer_fee')
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

        // Category breakdown — net of refunds.
        const catMap = new Map<string, { name: string; spent: number; budget: number | null }>();
        for (const cat of catList) {
          catMap.set(cat.id, { name: cat.name, spent: 0, budget: (cat as any).budget || null });
        }
        for (const tx of txList.filter((t: any) => t.type === 'expense' && t.category_id)) {
          const entry = catMap.get((tx as any).category_id);
          if (entry) entry.spent += netExpense(tx);
        }

        const allCategories = Array.from(catMap.values())
          .filter(c => c.spent > 0)
          .map(c => ({ ...c, pct: expenses > 0 ? Math.round((c.spent / expenses) * 100) : 0 }))
          .sort((a, b) => b.spent - a.spent);

        const topCategories = allCategories.slice(0, 8);
        // Strict over-budget: 100% exactly is on-target, only flag rows that
        // crossed the line (mirrors the in-app `BudgetAlertsCard` rule).
        const budgetOverspent = allCategories.filter(c => c.budget && c.spent > c.budget);

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
          income: income.toFixed(2),
          expenses: expenses.toFixed(2),
          balance: totalBalance.toFixed(2),
          savingsRate,
          topCategories,
          accounts: accountSummaries,
          transactionCount: txList.length,
          budgetOverspent,
          prevMonthIncome: prevIncome.toFixed(2),
          prevMonthExpenses: prevExpenses.toFixed(2),
          incomeChange: prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0,
          expenseChange: prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) : 0,
        };

        // Generate slide-style PDF report
        let pdfBase64: string | null = null;
        try {
          pdfBase64 = await generateSlidesPdf(reportData);
          console.log(`PDF generated for user ${userPref.user_id} (${Math.round((pdfBase64?.length || 0) * 0.75 / 1024)} KB)`);
        } catch (pdfErr) {
          console.error(`PDF generation failed for user ${userPref.user_id}:`, pdfErr);
        }

        console.log(`Sending monthly report to user ${userPref.user_id}`);

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
