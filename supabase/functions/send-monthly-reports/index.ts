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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 842; // A4 landscape in points
  const H = 595;

  // Colors
  const dark = rgb(0.118, 0.161, 0.231);       // #1e293b
  const darkAlt = rgb(0.2, 0.255, 0.333);       // #334155
  const white = rgb(1, 1, 1);
  const green = rgb(0.02, 0.588, 0.412);         // #059669
  const red = rgb(0.863, 0.149, 0.149);          // #dc2626
  const blue = rgb(0.231, 0.51, 0.965);          // #3b82f6
  const gray = rgb(0.392, 0.455, 0.545);         // #64748b
  const subtle = rgb(0.58, 0.639, 0.722);        // #94a3b8
  const lightGray = rgb(0.945, 0.961, 0.976);    // #f1f5f9
  const lightGreen = rgb(0.941, 0.992, 0.957);   // #f0fdf4
  const lightRed = rgb(0.996, 0.949, 0.949);     // #fef2f2
  const divider = rgb(0.933, 0.937, 0.953);      // #eeeaf3
  const textDark = rgb(0.067, 0.094, 0.153);     // #111827

  // Helpers
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
  const periodUpper = period.toUpperCase();
  const savingsRate = data.savingsRate ?? 0;
  const txCount = data.transactionCount ?? 0;
  const incomeChange = data.incomeChange ?? 0;
  const expenseChange = data.expenseChange ?? 0;

  // Helper to draw slide header bar
  function drawHeader(page: any, title: string) {
    page.drawRectangle({ x: 0, y: H - 65, width: W, height: 65, color: dark });
    page.drawText(title, { x: 50, y: H - 42, size: 18, font: fontBold, color: white });
    page.drawText(period, { x: rx(period, 12, font, 50), y: H - 42, size: 12, font, color: subtle });
    // Accent line under header
    page.drawRectangle({ x: 50, y: H - 66, width: 80, height: 3, color: blue });
  }

  // Helper to draw page number
  function drawPageNum(page: any, num: number, total: number) {
    const txt = `${num} / ${total}`;
    page.drawText(txt, { x: rx(txt, 9, font, 30), y: 20, size: 9, font, color: subtle });
    page.drawText('Gestion des comptes CB', { x: 30, y: 20, size: 9, font, color: subtle });
  }

  const totalPages = 2 + (data.topCategories?.length > 0 ? 1 : 0) + (data.accounts?.length > 0 ? 1 : 0) + (data.budgetOverspent?.length > 0 ? 1 : 0);
  let pageNum = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: COVER
  // ═══════════════════════════════════════════════════════════════════════════
  const p1 = pdfDoc.addPage([W, H]);
  pageNum++;

  // Full dark background
  p1.drawRectangle({ x: 0, y: 0, width: W, height: H, color: dark });

  // Blue accent line
  p1.drawRectangle({ x: 0, y: H * 0.52, width: W, height: 4, color: blue });

  // App name
  let txt = 'GESTION DES COMPTES CB';
  p1.drawText(txt, { x: cx(txt, 12, font), y: H * 0.72, size: 12, font, color: subtle });

  // Main title
  txt = 'RAPPORT MENSUEL';
  p1.drawText(txt, { x: cx(txt, 40, fontBold), y: H * 0.58, size: 40, font: fontBold, color: white });

  // Period
  p1.drawText(periodUpper, { x: cx(periodUpper, 26, fontBold), y: H * 0.40, size: 26, font: fontBold, color: white });

  // Badges row
  const badgeY = 100;
  const txBadgeText = `${txCount} transactions`;
  const txBadgeW = font.widthOfTextAtSize(txBadgeText, 11) + 28;
  const srBadgeText = `Epargne : ${savingsRate}%`;
  const srBadgeW = font.widthOfTextAtSize(srBadgeText, 11) + 28;
  const totalBadgeW = txBadgeW + 14 + srBadgeW;
  const badgeStartX = (W - totalBadgeW) / 2;

  // Tx count badge
  p1.drawRectangle({ x: badgeStartX, y: badgeY - 5, width: txBadgeW, height: 24, color: darkAlt });
  p1.drawText(txBadgeText, { x: badgeStartX + 14, y: badgeY + 2, size: 11, font, color: subtle });

  // Savings badge
  const srBgColor = savingsRate >= 0 ? rgb(0.024, 0.306, 0.231) : rgb(0.498, 0.114, 0.114);
  const srTxtColor = savingsRate >= 0 ? rgb(0.431, 0.906, 0.718) : rgb(0.988, 0.647, 0.647);
  p1.drawRectangle({ x: badgeStartX + txBadgeW + 14, y: badgeY - 5, width: srBadgeW, height: 24, color: srBgColor });
  p1.drawText(srBadgeText, { x: badgeStartX + txBadgeW + 14 + 14, y: badgeY + 2, size: 11, font, color: srTxtColor });

  drawPageNum(p1, pageNum, totalPages);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: FINANCIAL OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  const p2 = pdfDoc.addPage([W, H]);
  pageNum++;
  drawHeader(p2, 'VUE D\'ENSEMBLE');

  const boxW = 210;
  const boxH = 110;
  const boxGap = 22;
  const boxStartX = (W - (3 * boxW + 2 * boxGap)) / 2;
  const boxTopY = H - 65 - 30; // top edge of boxes (in top-down thinking)
  const boxY = boxTopY - boxH; // pdf-lib y = bottom edge

  // Revenue box
  p2.drawRectangle({ x: boxStartX, y: boxY, width: boxW, height: boxH, color: lightGreen });
  txt = 'REVENUS';
  p2.drawText(txt, { x: boxStartX + (boxW - fontBold.widthOfTextAtSize(txt, 11)) / 2, y: boxY + boxH - 28, size: 11, font: fontBold, color: gray });
  txt = `${income} EUR`;
  p2.drawText(txt, { x: boxStartX + (boxW - fontBold.widthOfTextAtSize(txt, 24)) / 2, y: boxY + boxH - 60, size: 24, font: fontBold, color: green });
  if (incomeChange !== 0) {
    const arrow = incomeChange >= 0 ? '+' : '';
    const clr = incomeChange >= 0 ? green : red;
    txt = `${arrow}${incomeChange}% vs mois prec.`;
    p2.drawText(txt, { x: boxStartX + (boxW - font.widthOfTextAtSize(txt, 10)) / 2, y: boxY + 14, size: 10, font, color: clr });
  }

  // Expenses box
  const expX = boxStartX + boxW + boxGap;
  p2.drawRectangle({ x: expX, y: boxY, width: boxW, height: boxH, color: lightRed });
  txt = 'DEPENSES';
  p2.drawText(txt, { x: expX + (boxW - fontBold.widthOfTextAtSize(txt, 11)) / 2, y: boxY + boxH - 28, size: 11, font: fontBold, color: gray });
  txt = `${expenses} EUR`;
  p2.drawText(txt, { x: expX + (boxW - fontBold.widthOfTextAtSize(txt, 24)) / 2, y: boxY + boxH - 60, size: 24, font: fontBold, color: red });
  if (expenseChange !== 0) {
    const arrow = expenseChange >= 0 ? '+' : '';
    const clr = expenseChange <= 0 ? green : red;
    txt = `${arrow}${expenseChange}% vs mois prec.`;
    p2.drawText(txt, { x: expX + (boxW - font.widthOfTextAtSize(txt, 10)) / 2, y: boxY + 14, size: 10, font, color: clr });
  }

  // Net box
  const netBoxX = expX + boxW + boxGap;
  const netClr = net >= 0 ? green : red;
  p2.drawRectangle({ x: netBoxX, y: boxY, width: boxW, height: boxH, color: lightGray });
  txt = 'NET';
  p2.drawText(txt, { x: netBoxX + (boxW - fontBold.widthOfTextAtSize(txt, 11)) / 2, y: boxY + boxH - 28, size: 11, font: fontBold, color: gray });
  txt = `${netStr} EUR`;
  p2.drawText(txt, { x: netBoxX + (boxW - fontBold.widthOfTextAtSize(txt, 24)) / 2, y: boxY + boxH - 60, size: 24, font: fontBold, color: netClr });

  // Balance bar
  const balBarW = 3 * boxW + 2 * boxGap;
  const balBarY = boxY - 55;
  p2.drawRectangle({ x: boxStartX, y: balBarY, width: balBarW, height: 40, color: dark });
  txt = 'SOLDE TOTAL';
  p2.drawText(txt, { x: boxStartX + 22, y: balBarY + 14, size: 11, font, color: subtle });
  txt = `${balance} EUR`;
  p2.drawText(txt, { x: boxStartX + balBarW - 22 - fontBold.widthOfTextAtSize(txt, 22), y: balBarY + 11, size: 22, font: fontBold, color: white });

  // Savings rate indicator
  const srBoxY = balBarY - 45;
  p2.drawRectangle({ x: boxStartX, y: srBoxY, width: balBarW, height: 32, color: savingsRate >= 0 ? lightGreen : lightRed });
  txt = `Taux d'epargne : ${savingsRate}%`;
  p2.drawText(txt, { x: boxStartX + (balBarW - fontBold.widthOfTextAtSize(txt, 13)) / 2, y: srBoxY + 10, size: 13, font: fontBold, color: savingsRate >= 0 ? green : red });

  drawPageNum(p2, pageNum, totalPages);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: CATEGORY BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  const topCats: any[] = data.topCategories || [];
  if (topCats.length > 0) {
    const p3 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawHeader(p3, 'REPARTITION DES DEPENSES');

    const tX = 50;
    const tW = W - 100;
    const rowH = 34;
    let curY = H - 65 - 18;

    // Table header
    curY -= rowH;
    p3.drawRectangle({ x: tX, y: curY, width: tW, height: rowH, color: lightGray });
    p3.drawText('CATEGORIE', { x: tX + 14, y: curY + 12, size: 9, font: fontBold, color: gray });
    p3.drawText('MONTANT', { x: tX + tW * 0.42, y: curY + 12, size: 9, font: fontBold, color: gray });
    p3.drawText('%', { x: tX + tW * 0.60, y: curY + 12, size: 9, font: fontBold, color: gray });
    p3.drawText('REPARTITION', { x: tX + tW * 0.70, y: curY + 12, size: 9, font: fontBold, color: gray });

    for (const cat of topCats) {
      curY -= rowH;
      if (curY < 50) break;

      // Row separator
      p3.drawRectangle({ x: tX, y: curY + rowH - 0.5, width: tW, height: 0.5, color: divider });

      // Alternating row bg
      const rowBg = topCats.indexOf(cat) % 2 === 1 ? rgb(0.98, 0.98, 0.99) : white;
      p3.drawRectangle({ x: tX, y: curY, width: tW, height: rowH - 0.5, color: rowBg });

      // Category name
      const catName = String(cat.name ?? '').substring(0, 30);
      p3.drawText(catName, { x: tX + 14, y: curY + 12, size: 11, font, color: textDark });

      // Amount
      txt = `${Number(cat.spent).toFixed(2)} EUR`;
      p3.drawText(txt, { x: tX + tW * 0.42, y: curY + 12, size: 11, font: fontBold, color: textDark });

      // Percentage
      p3.drawText(`${cat.pct}%`, { x: tX + tW * 0.60, y: curY + 12, size: 10, font, color: gray });

      // Bar
      const barX = tX + tW * 0.70;
      const barMaxW = tW * 0.26;
      const barW = Math.max(2, Math.min(cat.pct, 100) / 100 * barMaxW);

      // Bar background
      p3.drawRectangle({ x: barX, y: curY + 11, width: barMaxW, height: 10, color: rgb(0.898, 0.906, 0.922) });

      // Bar fill
      const isOver = cat.budget && cat.spent > cat.budget;
      p3.drawRectangle({ x: barX, y: curY + 11, width: barW, height: 10, color: isOver ? red : blue });
    }

    drawPageNum(p3, pageNum, totalPages);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════
  const accounts: any[] = data.accounts || [];
  if (accounts.length > 0) {
    const p4 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawHeader(p4, 'SOLDES PAR COMPTE');

    const tX = 50;
    const tW = W - 100;
    const rowH = 36;
    let curY = H - 65 - 18;

    // Header row
    curY -= rowH;
    p4.drawRectangle({ x: tX, y: curY, width: tW, height: rowH, color: lightGray });
    p4.drawText('COMPTE', { x: tX + 14, y: curY + 13, size: 9, font: fontBold, color: gray });
    p4.drawText('REVENUS', { x: tX + tW * 0.38, y: curY + 13, size: 9, font: fontBold, color: gray });
    p4.drawText('DEPENSES', { x: tX + tW * 0.56, y: curY + 13, size: 9, font: fontBold, color: gray });
    txt = 'SOLDE';
    p4.drawText(txt, { x: tX + tW - 14 - fontBold.widthOfTextAtSize(txt, 9), y: curY + 13, size: 9, font: fontBold, color: gray });

    for (const acc of accounts) {
      curY -= rowH;
      if (curY < 50) break;

      p4.drawRectangle({ x: tX, y: curY + rowH - 0.5, width: tW, height: 0.5, color: divider });

      const rowBg = accounts.indexOf(acc) % 2 === 1 ? rgb(0.98, 0.98, 0.99) : white;
      p4.drawRectangle({ x: tX, y: curY, width: tW, height: rowH - 0.5, color: rowBg });

      const accName = String(acc.name ?? '').substring(0, 30);
      p4.drawText(accName, { x: tX + 14, y: curY + 13, size: 11, font: fontBold, color: textDark });

      txt = `+${Number(acc.income).toFixed(2)}`;
      p4.drawText(txt, { x: tX + tW * 0.38, y: curY + 13, size: 11, font, color: green });

      txt = `-${Number(acc.expense).toFixed(2)}`;
      p4.drawText(txt, { x: tX + tW * 0.56, y: curY + 13, size: 11, font, color: red });

      const balClr = Number(acc.balance) >= 0 ? green : red;
      txt = `${Number(acc.balance).toFixed(2)} EUR`;
      p4.drawText(txt, { x: tX + tW - 14 - fontBold.widthOfTextAtSize(txt, 12), y: curY + 13, size: 12, font: fontBold, color: balClr });
    }

    // Total row
    curY -= rowH + 4;
    const totalW = tW;
    p4.drawRectangle({ x: tX, y: curY, width: totalW, height: rowH, color: dark });
    p4.drawText('TOTAL', { x: tX + 14, y: curY + 13, size: 11, font: fontBold, color: white });
    txt = `${balance} EUR`;
    p4.drawText(txt, { x: tX + totalW - 14 - fontBold.widthOfTextAtSize(txt, 14), y: curY + 12, size: 14, font: fontBold, color: white });

    drawPageNum(p4, pageNum, totalPages);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5: BUDGET ALERTS (conditional)
  // ═══════════════════════════════════════════════════════════════════════════
  const budgetOverspent: any[] = data.budgetOverspent || [];
  if (budgetOverspent.length > 0) {
    const p5 = pdfDoc.addPage([W, H]);
    pageNum++;
    drawHeader(p5, 'ALERTES BUDGET');

    let curY = H - 65 - 30;

    for (const cat of budgetOverspent) {
      const over = (cat.spent - cat.budget).toFixed(2);
      const pctUsed = cat.budget > 0 ? Math.round((cat.spent / cat.budget) * 100) : 0;

      curY -= 70;
      if (curY < 50) break;

      // Alert card
      p5.drawRectangle({ x: 50, y: curY, width: W - 100, height: 60, color: lightRed });

      // Left red accent bar
      p5.drawRectangle({ x: 50, y: curY, width: 5, height: 60, color: red });

      // Name
      p5.drawText(String(cat.name ?? ''), { x: 70, y: curY + 38, size: 15, font: fontBold, color: textDark });

      // Details
      txt = `${Number(cat.spent).toFixed(2)} / ${Number(cat.budget).toFixed(2)} EUR (${pctUsed}%)`;
      p5.drawText(txt, { x: 70, y: curY + 16, size: 11, font, color: gray });

      // Overspend
      txt = `+${over} EUR`;
      p5.drawText(txt, {
        x: W - 50 - 20 - fontBold.widthOfTextAtSize(txt, 18),
        y: curY + 28, size: 18, font: fontBold, color: red,
      });

      // Progress bar
      const barX = 70;
      const barMaxW = W - 300;
      const barFillW = Math.min(pctUsed, 150) / 150 * barMaxW;
      const budgetLineX = barX + (100 / 150) * barMaxW;

      p5.drawRectangle({ x: barX, y: curY + 4, width: barMaxW, height: 6, color: rgb(0.898, 0.906, 0.922) });
      p5.drawRectangle({ x: barX, y: curY + 4, width: Math.min(barFillW, barMaxW), height: 6, color: red });
      // Budget limit line
      p5.drawRectangle({ x: budgetLineX, y: curY + 2, width: 1.5, height: 10, color: textDark });
    }

    drawPageNum(p5, pageNum, totalPages);
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
      .select('user_id')
      .eq('monthly_reports', true);

    if (usersError) throw usersError;

    const usersWithEmails = await Promise.all(
      (usersWithNotifs || []).map(async (pref: any) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(pref.user_id);
        return { user_id: pref.user_id, email: authUser?.user?.email || null };
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
        // Fetch accounts
        const { data: accounts } = await supabaseAdmin
          .from('accounts')
          .select('id, name, balance')
          .eq('user_id', userPref.user_id);

        // Fetch last month transactions with categories
        const { data: transactions } = await supabaseAdmin
          .from('transactions')
          .select('amount, type, category_id, account_id, description, transaction_date')
          .eq('user_id', userPref.user_id)
          .gte('transaction_date', monthStart.toISOString().split('T')[0])
          .lte('transaction_date', monthEnd.toISOString().split('T')[0]);

        // Fetch previous month transactions for comparison
        const { data: prevTransactions } = await supabaseAdmin
          .from('transactions')
          .select('amount, type')
          .eq('user_id', userPref.user_id)
          .gte('transaction_date', prevMonthStart.toISOString().split('T')[0])
          .lte('transaction_date', prevMonthEnd.toISOString().split('T')[0]);

        // Fetch categories
        const { data: categories } = await supabaseAdmin
          .from('categories')
          .select('id, name, budget')
          .eq('user_id', userPref.user_id);

        const txList = transactions || [];
        const prevTxList = prevTransactions || [];
        const catList = categories || [];
        const accList = accounts || [];

        // Calculate totals
        const income = txList.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
        const expenses = txList.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
        const totalBalance = accList.reduce((s: number, a: any) => s + Number(a.balance), 0);

        const prevIncome = prevTxList.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
        const prevExpenses = prevTxList.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

        // Category breakdown
        const catMap = new Map<string, { name: string; spent: number; budget: number | null }>();
        for (const cat of catList) {
          catMap.set(cat.id, { name: cat.name, spent: 0, budget: (cat as any).budget || null });
        }
        for (const tx of txList.filter((t: any) => t.type === 'expense' && t.category_id)) {
          const entry = catMap.get((tx as any).category_id);
          if (entry) entry.spent += Number(tx.amount);
        }

        const allCategories = Array.from(catMap.values())
          .filter(c => c.spent > 0)
          .map(c => ({ ...c, pct: expenses > 0 ? Math.round((c.spent / expenses) * 100) : 0 }))
          .sort((a, b) => b.spent - a.spent);

        const topCategories = allCategories.slice(0, 8);
        const budgetOverspent = allCategories.filter(c => c.budget && c.spent > c.budget);

        // Per-account breakdown
        const accountSummaries = accList.map((acc: any) => {
          const accTx = txList.filter((t: any) => t.account_id === acc.id);
          return {
            name: acc.name,
            balance: Number(acc.balance),
            income: accTx.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0),
            expense: accTx.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0),
          };
        });

        const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

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
