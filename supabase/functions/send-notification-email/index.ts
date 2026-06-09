import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  userId: string;
  type: 'budget_alert' | 'monthly_report';
  data: any;
  categoryId?: string;
  alertMonth?: string;
  pdfBase64?: string | null;
}

/** Builds an email-compatible progress bar using tables (works in all email clients). */
function buildSpendingProgressBar(budget: number, totalSpent: number): string {
  const pct = Math.min(Math.round((totalSpent / budget) * 100), 100);
  const overPct = Math.round((totalSpent / budget) * 100);

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#fee2e2;border-radius:8px;padding:0;height:12px;">
                <table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:linear-gradient(90deg,#ef4444,#dc2626);background-color:#ef4444;border-radius:8px;height:12px;font-size:1px;line-height:1px;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#6b7280;" align="left">${overPct}% du budget utilis&eacute;</td>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#6b7280;" align="right">Budget: ${budget.toFixed(0)}&euro;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** Builds a daily spending mini-bar chart using tables (email-compatible). */
function buildDailyBarsHtml(
  dailyData: { date: string; cumulative: number }[],
  budget: number,
  totalSpent: number
): string {
  if (dailyData.length === 0) return '';

  // Calculate per-day increments from cumulative data
  const dailyAmounts: { day: number; amount: number }[] = [];
  for (let i = 0; i < dailyData.length; i++) {
    const day = parseInt(dailyData[i].date.split('-')[2], 10);
    const prev = i > 0 ? dailyData[i - 1].cumulative : 0;
    const amount = dailyData[i].cumulative - prev;
    if (amount > 0) dailyAmounts.push({ day, amount });
  }

  if (dailyAmounts.length === 0) return '';

  const maxAmount = Math.max(...dailyAmounts.map(d => d.amount));
  const maxBarH = 60;

  const barCells = dailyAmounts.map(d => {
    const h = Math.max(4, Math.round((d.amount / maxAmount) * maxBarH));
    const isOver = d.amount > (budget / 30);
    const color = isOver ? '#ef4444' : '#f87171';
    return `<td style="vertical-align:bottom;text-align:center;padding:0 1px;" width="${Math.floor(100 / dailyAmounts.length)}%">
      <div style="background:${color};width:100%;height:${h}px;border-radius:3px 3px 0 0;min-width:6px;"></div>
      <div style="font-size:9px;color:#9ca3af;padding-top:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${d.day}</div>
    </td>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#fef2f2;border-radius:8px;padding:16px;">
          <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#374151;">D&eacute;penses par jour</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${barCells}</tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate shared secret for inter-function calls
    const authHeader = req.headers.get('x-function-secret');
    const expectedSecret = Deno.env.get('FUNCTION_SECRET');
    
    if (!authHeader || !expectedSecret || authHeader !== expectedSecret) {
      console.error('Unauthorized: Invalid or missing function secret');
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, type, data, categoryId, alertMonth, pdfBase64 }: EmailRequest = await req.json();

    console.log(`Processing email request for user ${userId}, type: ${type}`);

    // Initialize Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user notification preferences
    const { data: prefs, error: prefsError } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError || !prefs) {
      console.log(`No notification preferences found for user ${userId}`);
      return new Response(
        JSON.stringify({ error: "No notification preferences found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch email from auth.users (not stored in notification_preferences for security)
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (authError || !authUser?.user?.email) {
      console.log(`Could not fetch email for user ${userId}`);
      return new Response(
        JSON.stringify({ error: "Could not fetch user email" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userEmail = authUser.user.email;

    // Check if user wants this type of notification
    if (type === 'budget_alert' && !prefs.budget_alerts) {
      console.log(`User ${userId} has budget alerts disabled`);
      return new Response(
        JSON.stringify({ message: "Budget alerts disabled for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === 'monthly_report' && !prefs.monthly_reports) {
      console.log(`User ${userId} has monthly reports disabled`);
      return new Response(
        JSON.stringify({ message: "Monthly reports disabled for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let subject = '';
    let html = '';

    if (type === 'budget_alert') {
      subject = `Budget d\u00e9pass\u00e9 \u2013 ${escapeHtml(data.categoryName)}`;

      // `tag` is optional and is rendered as a small monospace pill next
      // to the description so the user can scan recurring vs. one-off
      // drivers at a glance (audit pass #1.3).
      const recentTransactions: { date: string; description: string; amount: string; tag?: string }[] = data.recentTransactions || [];
      const budgetValue = parseFloat(data.budget);
      const spentValue = parseFloat(data.spent);
      const overspentValue = parseFloat(data.overspent);
      const txCount = Number(data.transactionCount || recentTransactions.length);
      const dayOfMonth = Number(data.dayOfMonth || new Date().getDate());
      const daysInMonth = Number(data.daysInMonth || 30);
      const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
      const monthLabel = String(data.monthLabel || '');
      const usedPct = budgetValue > 0 ? (spentValue / budgetValue) * 100 : 0;
      const ratioCapped = Math.min(usedPct, 140);
      // Pace bar layout: total bar = 0..140% of budget (gives room to show overrun).
      const fillWidthPct = (ratioCapped / 140) * 100;
      const budgetLineLeft = (100 / 140) * 100; // budget at 100% mark within the 0..140 range
      const todayLineLeft = ((dayOfMonth / daysInMonth) * 100 / 140) * 100;

      // Format date strings into short day labels for the drivers list.
      const fmtDriverDate = (d: string) => {
        try {
          const dt = new Date(d);
          if (isNaN(dt.getTime())) return d;
          return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        } catch { return d; }
      };
      const driverItems = recentTransactions.map(t => {
        const tagPill = t.tag
          ? `<span style="display:inline-block;font-family:'Geist Mono',ui-monospace,monospace;font-size:9.5px;font-weight:600;color:#6e716c;background:#f3f1e9;border:1px solid #e7e5dd;border-radius:4px;padding:1px 6px;margin-left:8px;letter-spacing:.04em;text-transform:uppercase;vertical-align:1px;">${escapeHtml(t.tag)}</span>`
          : '';
        return `
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;font-family:'Geist Mono',ui-monospace,monospace;font-size:11.5px;color:#6e716c;width:64px;white-space:nowrap;">${escapeHtml(fmtDriverDate(t.date))}</td>
          <td style="padding:11px 14px 11px 14px;border-bottom:1px solid #efece4;font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(t.description)}${tagPill}</td>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;font-family:'Geist Mono',ui-monospace,monospace;font-size:13px;color:#0c0d0c;font-weight:500;text-align:right;white-space:nowrap;">${escapeHtml(t.amount)}&nbsp;\u20ac</td>
        </tr>`;
      }).join('');

      // Audit pass: dropped Fraunces serif + italic accent. The
      // statement direction (Reports v2) is Geist + Geist Mono only;
      // the budget alert email follows the same restraint.
      const sansStack = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
      const monoStack = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

      html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(data.categoryName)} d&eacute;passe le budget</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @media only screen and (max-width:620px) {
      .wrapper { width:100% !important; }
      .content-pad { padding:24px 20px !important; }
      .h1 { font-size:26px !important; }
      .figure { font-size:42px !important; }
      .btn-row { display:block !important; }
      .btn-row .btn { display:block !important; margin:0 0 8px 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f4f0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:${sansStack};color:#0c0d0c;">
  <div style="display:none;font-size:1px;color:#f5f4f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(data.categoryName)} d&eacute;passe le budget de ${escapeHtml(data.overspent)}&nbsp;\u20ac \u2014 ${escapeHtml(data.spent)}&nbsp;\u20ac sur ${escapeHtml(data.budget)}&nbsp;\u20ac
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f4f0;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="wrapper" width="620" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e7e5dd;border-radius:14px;overflow:hidden;">

          <!-- Brand strip -->
          <tr>
            <td class="content-pad" style="padding:28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <div style="width:22px;height:22px;border-radius:6px;background:#0c0d0c;"></div>
                  </td>
                  <td style="font-family:${sansStack};font-size:13px;font-weight:600;color:#1f211f;letter-spacing:-0.005em;vertical-align:middle;padding-right:10px;">Spending Tracker</td>
                  <td style="vertical-align:middle;padding-right:8px;"><span style="display:inline-block;width:3px;height:3px;background:#9a9c97;border-radius:50%"></span></td>
                  <td style="font-family:${monoStack};font-size:11px;color:#6e716c;letter-spacing:.04em;text-transform:uppercase;font-weight:500;vertical-align:middle;">Alerte budget</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Eyebrow + headline -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">
                Alerte &middot; ${escapeHtml(monthLabel)}
              </div>
              <h1 class="h1" style="font-family:${sansStack};font-weight:600;font-size:32px;letter-spacing:-0.025em;line-height:1.08;margin:0 0 10px 0;color:#0c0d0c;">
                ${escapeHtml(data.categoryName)} d&eacute;passe de <span style="color:#c83a2a;font-weight:600;">${escapeHtml(data.overspent)}&nbsp;\u20ac.</span>
              </h1>
              <p style="font-family:${sansStack};font-size:14.5px;color:#6e716c;line-height:1.55;margin:0;max-width:480px;">
                ${txCount} transaction${txCount > 1 ? 's' : ''}, ${daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''} dans le mois` : 'dernier jour du mois'}.
              </p>
            </td>
          </tr>

          <!-- Hero number -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;">
                D&eacute;pens&eacute; &middot; ${escapeHtml(data.categoryName)} &middot; ${escapeHtml(monthLabel)}
              </div>
              <div class="figure" style="font-family:${monoStack};font-size:64px;font-weight:500;letter-spacing:-0.04em;line-height:1.05;margin:6px 0 0 0;color:#c83a2a;font-variant-numeric:tabular-nums lining-nums;">
                <span style="color:#9a9c97;font-size:0.55em;margin-right:8px;letter-spacing:0;">\u20ac</span>${escapeHtml(data.spent)}
              </div>
              <div style="font-family:${sansStack};font-size:13px;color:#6e716c;margin-top:6px;">
                sur <b style="color:#1f211f;font-weight:500;">${escapeHtml(data.budget)}&nbsp;\u20ac</b> budg&eacute;t&eacute;s &middot;
                <b style="color:#c83a2a;font-weight:500;">+${escapeHtml(data.overspent)}&nbsp;\u20ac</b> au-del&agrave; &middot;
                <b style="color:#1f211f;font-weight:500;">${txCount}</b> transaction${txCount > 1 ? 's' : ''}
              </div>
            </td>
          </tr>

          <!-- Pace bar — tight against the hero so they read as a single unit -->
          <tr>
            <td class="content-pad" style="padding:18px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:36px;background:#f6f4ec;border:1px solid #efece4;border-radius:8px;padding:0;position:relative;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0;width:${fillWidthPct.toFixed(2)}%;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#c83a2a;height:36px;border-radius:8px 0 0 8px;font-family:${monoStack};font-size:11px;font-weight:500;color:#ffffff;padding-right:10px;text-align:right;">${Math.round(usedPct)}%</td>
                            </tr>
                          </table>
                        </td>
                        <td style="width:${(100 - fillWidthPct).toFixed(2)}%;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-family:${monoStack};font-size:11.5px;color:#6e716c;text-align:left;">\u20ac0</td>
                        <td style="font-family:${monoStack};font-size:11.5px;color:#1f211f;text-align:center;">\u20ac${escapeHtml(data.budget)}</td>
                        <td style="font-family:${monoStack};font-size:11.5px;color:#6e716c;text-align:right;">\u20ac${escapeHtml(data.spent)}</td>
                      </tr>
                    </table>
                    <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.04em;margin-top:4px;">
                      Aujourd'hui &middot; jour ${dayOfMonth} sur ${daysInMonth}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${driverItems ? `
          <!-- Drivers -->
          <tr>
            <td class="content-pad" style="padding:36px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">Ce qui pousse le total</td>
                  <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">Top ${recentTransactions.length} sur ${txCount}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${driverItems}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- CTA row -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 32px 40px;">
              <table role="presentation" class="btn-row" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="btn" style="padding-right:10px;">
                    <a href="#" style="display:inline-block;background:#0c0d0c;color:#fbfaf6;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;">
                      Ouvrir ${escapeHtml(data.categoryName)} <span style="font-family:${monoStack};margin-left:4px;">&rarr;</span>
                    </a>
                  </td>
                  <td class="btn" style="padding-right:10px;">
                    <a href="#" style="display:inline-block;color:#1f211f;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;border:1px solid #e7e5dd;">
                      Ajuster le budget
                    </a>
                  </td>
                  <td class="btn">
                    <a href="#" style="display:inline-block;color:#1f211f;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;border:1px solid #e7e5dd;">
                      Mettre en pause ce mois-ci
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer — opt-out actions first (audit pass), dunning copy after -->
          <tr>
            <td style="background:#fbfaf6;border-top:1px solid #e7e5dd;padding:22px 40px;font-family:${sansStack};font-size:11.5px;color:#6e716c;line-height:1.6;">
              <a href="#" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">G&eacute;rer les notifications</a>
              &middot;
              <a href="#" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">D&eacute;sactiver pour ${escapeHtml(data.categoryName)}</a>
              &middot;
              <a href="#" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">Se d&eacute;sinscrire</a><br>
              Vous recevez cet email car les alertes budget sont actives pour <b style="color:#1f211f;font-weight:500;">${escapeHtml(data.categoryName)}</b>. Une seule alerte par cat&eacute;gorie et par mois &middot; Spending Tracker.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    } else if (type === 'monthly_report') {
      // Cadence determines the subject line and a few copy bits in the
      // footer. Defaults to monthly for back-compat with legacy callers
      // that don't pass `cadence`.
      const cadence: 'weekly' | 'monthly' | 'quarterly' =
        data.cadence === 'weekly' ? 'weekly'
        : data.cadence === 'quarterly' ? 'quarterly'
        : 'monthly';
      const cadenceLabel =
        cadence === 'weekly' ? 'hebdomadaire'
        : cadence === 'quarterly' ? 'trimestriel'
        : 'mensuel';
      subject = `Rapport ${cadenceLabel} \u2013 ${escapeHtml(data.period)}`;

      // Section gate \u2014 opt-in list per user. Email blocks are rendered
      // only when listed here. Defaults to the full set for back-compat
      // (caller passes nothing \u2192 user sees everything, same as before).
      const includes = (section: string): boolean =>
        !Array.isArray(data.sections) || data.sections.length === 0 || data.sections.includes(section);

      const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
      const income = escapeHtml(String(data.income));
      const expenses = escapeHtml(String(data.expenses));
      const balance = escapeHtml(String(data.balance));
      const balanceNum = parseFloat(String(data.balance));
      const balanceColor = balanceNum >= 0 ? '#059669' : '#dc2626';
      const net = parseFloat(String(data.income)) - parseFloat(String(data.expenses));
      const netColor = net >= 0 ? '#059669' : '#dc2626';
      const netSign = net >= 0 ? '+' : '';
      const savingsRate = data.savingsRate || 0;
      const incomeChange = data.incomeChange || 0;
      const expenseChange = data.expenseChange || 0;
      const trendArrowUp = '&#9650;';
      const trendArrowDown = '&#9660;';

      // Audit pass: dropped Fraunces serif + italic accent. Verdict
      // headline now reads as Geist semibold so the figure is baseline-
      // aligned to the surrounding text instead of visually floating.
      const sansStack = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
      const monoStack = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

      // Category rows — bar table, refund-aware spent already netted upstream.
      const topCategories: any[] = data.topCategories || [];
      const categoryRows = topCategories.map((cat: any) => {
        const isOver = cat.budget != null && cat.spent > cat.budget;
        const barColor = isOver ? '#c83a2a' : '#0c0d0c';
        const barWidth = Math.min(100, Number(cat.pct) || 0);
        return `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:34%;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(cat.name)}${isOver ? ` <span style="display:inline-block;font-family:${monoStack};font-size:10px;color:#c83a2a;margin-left:6px;letter-spacing:.05em;text-transform:uppercase;font-weight:500;">au-dessus</span>` : ''}</td>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:18%;font-family:${monoStack};font-size:13px;font-weight:500;color:#0c0d0c;text-align:right;white-space:nowrap;">${Number(cat.spent).toFixed(2)}&nbsp;€</td>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:10%;font-family:${monoStack};font-size:12px;color:#6e716c;text-align:right;">${cat.pct}%</td>
          <td style="padding:11px 0 11px 18px;border-bottom:1px solid #efece4;width:38%;">
            <div style="height:6px;background:#efece4;border-radius:99px;overflow:hidden;">
              <div style="height:100%;width:${barWidth}%;background:${barColor};border-radius:99px;"></div>
            </div>
          </td>
        </tr>`;
      }).join('');

      // Breach strip — surfaced *above* the category breakdown per the redesign.
      const budgetOverspent: any[] = data.budgetOverspent || [];
      const breachRows = budgetOverspent.map((cat: any) => {
        const overAmount = Math.max(0, Number(cat.spent) - Number(cat.budget));
        const pctUsed = cat.budget > 0 ? Math.round((cat.spent / cat.budget) * 100) : 0;
        return `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #efece4;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(cat.name)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:12.5px;color:#6e716c;text-align:right;white-space:nowrap;">${Number(cat.spent).toFixed(0)}&nbsp;€ / ${Number(cat.budget).toFixed(0)}&nbsp;€ &middot; ${pctUsed}%</td>
          <td style="padding:10px 0 10px 14px;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:13px;color:#c83a2a;font-weight:500;text-align:right;white-space:nowrap;">+${overAmount.toFixed(0)}&nbsp;€</td>
        </tr>`;
      }).join('');
      const breachHtml = budgetOverspent.length > 0 ? `
        <tr>
          <td class="content-pad" style="padding:32px 40px 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">Budgets d&eacute;pass&eacute;s</td>
                <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">${budgetOverspent.length} cat&eacute;gorie${budgetOverspent.length > 1 ? 's' : ''}</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${breachRows}
            </table>
          </td>
        </tr>` : '';

      // Special (event/trip) budgets — their own envelope bracket, scoped
      // to the period. Spend never counted against the category budgets,
      // so it gets a distinct strip.
      const specialBudgets: any[] = data.specialBudgets || [];
      const specialRows = specialBudgets.map((sb: any) => {
        const total = Number(sb.budget) || 0;
        const spent = Number(sb.spent) || 0;
        const pctUsed = total > 0 ? Math.round((spent / total) * 100) : 0;
        const over = !!sb.over;
        const isClosed = sb.status === 'closed';
        const fig = total > 0
          ? `${spent.toFixed(0)}&nbsp;€ / ${total.toFixed(0)}&nbsp;€ &middot; ${pctUsed}%`
          : `${spent.toFixed(0)}&nbsp;€`;
        const barColor = over ? '#c83a2a' : '#0c0d0c';
        const barWidth = Math.min(100, pctUsed);
        return `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:36%;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(sb.name)}${isClosed ? ` <span style="display:inline-block;font-family:${monoStack};font-size:10px;color:#6e716c;margin-left:6px;letter-spacing:.05em;text-transform:uppercase;font-weight:500;">cl&ocirc;tur&eacute;</span>` : ''}</td>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:30%;font-family:${monoStack};font-size:12.5px;color:${over ? '#c83a2a' : '#6e716c'};text-align:right;white-space:nowrap;">${fig}</td>
          <td style="padding:11px 0 11px 18px;border-bottom:1px solid #efece4;width:34%;">
            <div style="height:6px;background:#efece4;border-radius:99px;overflow:hidden;">
              <div style="height:100%;width:${barWidth}%;background:${barColor};border-radius:99px;"></div>
            </div>
          </td>
        </tr>`;
      }).join('');
      const specialHtml = specialBudgets.length > 0 ? `
        <tr>
          <td class="content-pad" style="padding:36px 40px 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">Budgets sp&eacute;ciaux</td>
                <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">${specialBudgets.length} enveloppe${specialBudgets.length > 1 ? 's' : ''}</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${specialRows}
            </table>
          </td>
        </tr>` : '';

      // Account rows
      const accountsList: any[] = data.accounts || [];
      const accountRows = accountsList.map((acc: any) => {
        const flow = (Number(acc.income) || 0) - (Number(acc.expense) || 0);
        const flowSign = flow >= 0 ? '+' : '−';
        return `<tr>
          <td style="padding:13px 0;border-bottom:1px solid #efece4;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(acc.name)}</td>
          <td style="padding:13px 18px 13px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:12px;color:#6e716c;text-align:right;white-space:nowrap;">${flowSign}${Math.abs(flow).toFixed(0)}&nbsp;€</td>
          <td style="padding:13px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:13px;font-weight:500;text-align:right;white-space:nowrap;color:${Number(acc.balance) >= 0 ? '#0c0d0c' : '#c83a2a'};">${Number(acc.balance).toFixed(2)}&nbsp;€</td>
        </tr>`;
      }).join('');

      // Verdict — verdict-first headline. Pick a phrase based on actual deltas.
      const netAmount = parseFloat(String(data.income)) - parseFloat(String(data.expenses));
      const savedAbs = Math.abs(netAmount).toFixed(0);
      let verdictHead: string;
      let verdictAccent: string;
      if (netAmount >= 0) {
        verdictHead = `Vous avez mis de c&ocirc;t&eacute; <span style="color:#3a8a4d;font-weight:600;">${savedAbs}&nbsp;€.</span>`;
        verdictAccent = '#3a8a4d';
      } else {
        verdictHead = `Vous avez d&eacute;pens&eacute; <span style="color:#c83a2a;font-weight:600;">${savedAbs}&nbsp;€</span> de plus que vos revenus.`;
        verdictAccent = '#c83a2a';
      }
      const expenseChangeAbs = Math.abs(expenseChange);
      const incomeChangeAbs = Math.abs(incomeChange);

      html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Rapport mensuel &ndash; ${escapeHtml(data.period)}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @media only screen and (max-width:620px) {
      .wrapper { width:100% !important; }
      .content-pad { padding:24px 20px !important; }
      .h1 { font-size:26px !important; }
      .stat-table .stat-card { display:block !important; width:100% !important; margin-bottom:10px !important; }
      .stat-table .stat-spacer { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f4f0;font-family:${sansStack};color:#0c0d0c;">
  <div style="display:none;font-size:1px;color:#f5f4f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(data.period)} &middot; ${income}&nbsp;€ revenus, ${expenses}&nbsp;€ d&eacute;penses, solde ${balance}&nbsp;€
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f4f0;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="wrapper" width="620" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e7e5dd;border-radius:14px;overflow:hidden;">

          <!-- Brand strip -->
          <tr>
            <td class="content-pad" style="padding:28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <div style="width:22px;height:22px;border-radius:6px;background:#0c0d0c;"></div>
                  </td>
                  <td style="font-family:${sansStack};font-size:13px;font-weight:600;color:#1f211f;letter-spacing:-0.005em;vertical-align:middle;padding-right:10px;">Spending Tracker</td>
                  <td style="vertical-align:middle;padding-right:8px;"><span style="display:inline-block;width:3px;height:3px;background:#9a9c97;border-radius:50%"></span></td>
                  <td style="font-family:${monoStack};font-size:11px;color:#6e716c;letter-spacing:.04em;text-transform:uppercase;font-weight:500;vertical-align:middle;">Rapport mensuel</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Verdict headline -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">
                Bilan &middot; ${escapeHtml(data.period)}
              </div>
              <h1 class="h1" style="font-family:${sansStack};font-weight:600;font-size:30px;letter-spacing:-0.025em;line-height:1.1;margin:0 0 10px 0;color:#0c0d0c;">
                ${verdictHead}
              </h1>
              <p style="font-family:${sansStack};font-size:14.5px;color:#6e716c;line-height:1.55;margin:0;max-width:480px;">
                ${data.transactionCount || 0} transaction${(data.transactionCount || 0) > 1 ? 's' : ''} comptabilis&eacute;es ce mois.${savingsRate ? ` Taux d&apos;&eacute;pargne : <b style="color:${savingsRate >= 0 ? '#3a8a4d' : '#c83a2a'};font-weight:500;">${savingsRate}&nbsp;%</b>.` : ''}
              </p>
            </td>
          </tr>

          ${includes('summary') ? `
          <!-- Single delta strip (audit pass: replaces the 3-card grid).
               Same data — income, expenses, net + deltas — in one tighter
               horizontal row. Cells stack on mobile via the
               .stat-table .stat-card { display:block } media rule. -->
          <tr>
            <td class="content-pad" style="padding:24px 40px 0 40px;">
              <table role="presentation" class="stat-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e7e5dd;border-radius:10px;overflow:hidden;background:#fff;">
                <tr>
                  <td class="stat-card" style="padding:12px 16px;border-right:1px solid #e7e5dd;vertical-align:top;width:33.33%;">
                    <div style="font-family:${monoStack};font-size:9.5px;color:#6e716c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px;font-weight:500;">Revenus</div>
                    <div style="font-family:${monoStack};font-size:18px;font-weight:500;letter-spacing:-0.02em;color:#3a8a4d;line-height:1;">${income}&nbsp;€</div>
                    <div style="font-family:${monoStack};font-size:11px;margin-top:6px;color:${incomeChange === 0 ? '#9a9c97' : incomeChange >= 0 ? '#3a8a4d' : '#c83a2a'};font-weight:500;">${incomeChange === 0 ? '—' : `${incomeChange >= 0 ? '↑' : '↓'} ${incomeChangeAbs}% vs mois pr&eacute;c.`}</div>
                  </td>
                  <td class="stat-card" style="padding:12px 16px;border-right:1px solid #e7e5dd;vertical-align:top;width:33.33%;">
                    <div style="font-family:${monoStack};font-size:9.5px;color:#6e716c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px;font-weight:500;">D&eacute;penses</div>
                    <div style="font-family:${monoStack};font-size:18px;font-weight:500;letter-spacing:-0.02em;color:#c83a2a;line-height:1;">${expenses}&nbsp;€</div>
                    <div style="font-family:${monoStack};font-size:11px;margin-top:6px;color:${expenseChange === 0 ? '#9a9c97' : expenseChange <= 0 ? '#3a8a4d' : '#c83a2a'};font-weight:500;">${expenseChange === 0 ? '—' : `${expenseChange >= 0 ? '↑' : '↓'} ${expenseChangeAbs}% vs mois pr&eacute;c.`}</div>
                  </td>
                  <td class="stat-card" style="padding:12px 16px;vertical-align:top;width:33.33%;">
                    <div style="font-family:${monoStack};font-size:9.5px;color:#6e716c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px;font-weight:500;">Net &middot; &eacute;pargne</div>
                    <div style="font-family:${monoStack};font-size:18px;font-weight:500;letter-spacing:-0.02em;color:${netColor};line-height:1;">${netSign}${Math.abs(net).toFixed(0)}&nbsp;€</div>
                    <div style="font-family:${monoStack};font-size:11px;margin-top:6px;color:#6e716c;font-weight:500;">${savingsRate ? `Taux ${savingsRate}%` : '&nbsp;'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          ${includes('budgets') ? breachHtml : ''}

          ${includes('categories') && topCategories.length > 0 ? `
          <!-- Categories breakdown -->
          <tr>
            <td class="content-pad" style="padding:36px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">R&eacute;partition des d&eacute;penses</td>
                  <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">Top ${topCategories.length}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${categoryRows}
              </table>
            </td>
          </tr>` : ''}

          ${includes('budgets') ? specialHtml : ''}

          ${includes('accounts') && accountsList.length > 0 ? `
          <!-- Accounts -->
          <tr>
            <td class="content-pad" style="padding:36px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">Soldes par compte</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${accountRows}
              </table>
            </td>
          </tr>` : ''}

          <!-- Total bar -->
          <tr>
            <td class="content-pad" style="padding:18px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #0c0d0c;margin-top:6px;">
                <tr>
                  <td style="padding:18px 0 4px 0;font-family:${monoStack};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1f211f;font-weight:500;">Solde total</td>
                  <td style="padding:18px 0 4px 0;font-family:${monoStack};font-size:22px;font-weight:500;letter-spacing:-0.02em;text-align:right;color:${balanceColor};">${balance}&nbsp;€</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer — audit pass: PDF mention folded into the footer
               line (it's an attachment, not an action), opt-out actions
               first, dunning copy after. -->
          <tr>
            <td style="padding-top:32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#fbfaf6;border-top:1px solid #e7e5dd;padding:22px 40px;font-family:${sansStack};font-size:11.5px;color:#6e716c;line-height:1.6;">
                    <a href="#" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">G&eacute;rer les notifications</a>
                    &middot;
                    <a href="#" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">Changer la cadence</a>
                    &middot;
                    <a href="#" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">Se d&eacute;sinscrire</a><br>
                    Vous recevez cet email car les rapports ${cadenceLabel}s sont activ&eacute;s.${pdfBase64 ? ' Rapport PDF en pi&egrave;ce jointe.' : ''} ${cadence === 'weekly' ? 'Envoy&eacute; chaque lundi' : cadence === 'quarterly' ? 'Envoy&eacute; chaque d&eacute;but de trimestre' : 'Envoy&eacute; le 1er de chaque mois'} &middot; Spending Tracker.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    }

    // Build email payload with optional PDF attachment
    const emailPayload: any = {
      from: "Budget App <onboarding@resend.dev>",
      to: [userEmail],
      subject: subject,
      html: html,
    };

    if (type === 'monthly_report' && pdfBase64) {
      const periodSlug = String(data.period || 'rapport').replace(/\s+/g, '-').toLowerCase();
      emailPayload.attachments = [
        {
          filename: `rapport-mensuel-${periodSlug}.pdf`,
          content: pdfBase64,
        },
      ];
      console.log('PDF attachment included in email');
    }

    const emailResponse = await resend.emails.send(emailPayload);

    console.log("Email sent successfully:", emailResponse);

    // Log notification
    await supabaseAdmin
      .from('notification_logs')
      .insert({
        user_id: userId,
        notification_type: type,
        status: 'sent',
        category_id: categoryId || null,
        alert_month: alertMonth || null
      });

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
