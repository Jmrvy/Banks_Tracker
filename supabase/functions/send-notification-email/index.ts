import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  type EmailLang,
  appUrl,
  money,
  monthName,
  moneyParts,
  monthYear,
  normalizeLang,
  shortDate,
  tr,
  trPlural,
} from "../_shared/emailI18n.ts";

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

function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Shared type stack. Geist + Geist Mono only — the statement direction
// (Reports v2) dropped the serif/italic accent, and both emails follow the
// same restraint.
const sansStack = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const monoStack = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

/**
 * A horizontal marker row rendered *under* the pace bar.
 *
 * Absolutely-positioned overlays don't survive Outlook, so the budget line
 * and the "today" tick are laid out as a spacer table on the same 0..140%
 * scale as the bar above: a run of empty cells, then a 2px coloured cell at
 * each mark position.
 */
function buildTickRow(marks: { pos: number; color: string }[]): string {
  const sorted = [...marks].sort((a, b) => a.pos - b.pos);
  let cursor = 0;
  const cells: string[] = [];
  for (const mark of sorted) {
    const gap = Math.max(0, mark.pos - cursor);
    if (gap > 0) {
      cells.push(`<td style="width:${gap.toFixed(2)}%;font-size:1px;line-height:1px;">&nbsp;</td>`);
    }
    cells.push(
      `<td style="width:2px;background:${mark.color};font-size:1px;line-height:1px;">&nbsp;</td>`,
    );
    cursor = mark.pos;
  }
  cells.push(`<td style="font-size:1px;line-height:1px;">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height:6px;">
    <tr style="height:6px;">${cells.join('')}</tr>
  </table>`;
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

    // Language for the whole message. Persisted per user because edge
    // functions can't see the browser's `i18nextLng`. The caller may
    // override (used by the "send test email" action in Settings, which
    // knows the live UI language before the user has saved).
    const lang: EmailLang = normalizeLang(
      data?.lang ?? (prefs as Record<string, unknown>).email_language,
    );
    const base = appUrl();
    const settingsUrl = `${base}/settings#notifications`;

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
      // `tag` is a stable key (not display copy) so this function owns the
      // translation — see check-budgets, which used to send "Récurrent".
      const recentTransactions: { date: string; description: string; amount: string; tag?: string }[] = data.recentTransactions || [];
      const categoryName = String(data.categoryName ?? '');
      const budgetValue = parseFloat(data.budget);
      const spentValue = parseFloat(data.spent);
      const overspentValue = parseFloat(data.overspent);
      const txCount = Number(data.transactionCount || recentTransactions.length);
      const dayOfMonth = Number(data.dayOfMonth || new Date().getDate());
      const daysInMonth = Number(data.daysInMonth || 30);
      const daysLeft = Math.max(0, daysInMonth - dayOfMonth);

      // Month context. `monthIso` is the locale-neutral form; `monthLabel`
      // is only read as a fallback for callers that predate it.
      const monthDate = data.monthIso ? new Date(String(data.monthIso)) : new Date();
      const monthLabel = data.monthIso
        ? monthYear(lang, monthDate)
        : String(data.monthLabel || monthYear(lang, monthDate));
      const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const nextMonthLabel = monthName(lang, nextMonthDate);

      const usedPct = budgetValue > 0 ? (spentValue / budgetValue) * 100 : 0;
      // Pace bar scale: 0..140% of budget, so an overrun still has room to
      // draw. Both the budget line and the "today" tick live on this scale.
      const SCALE = 140;
      const fillWidthPct = (Math.min(usedPct, SCALE) / SCALE) * 100;
      const budgetLineLeft = (100 / SCALE) * 100;
      const todayLineLeft = ((dayOfMonth / daysInMonth) * 100 / SCALE) * 100;

      const spentFmt = money(lang, spentValue);
      const budgetFmt = money(lang, budgetValue);
      const overFmt = money(lang, overspentValue, { sign: true });
      const maxFmt = money(lang, budgetValue * (SCALE / 100), { decimals: 0 });
      const txLabel = trPlural(lang, 'alert.transactions', txCount);

      subject = tr(lang, 'alert.subject', {
        category: categoryName,
        spent: spentFmt.replace(/&nbsp;/g, ' '),
        // Budget reads without decimals in the subject line — it's a round
        // figure the user set, and the spent value carries the precision.
        budget: money(lang, budgetValue, { decimals: 0 }).replace(/&nbsp;/g, ' '),
        pct: Math.round(usedPct),
        day: dayOfMonth,
        days: daysInMonth,
      });

      const driverItems = recentTransactions.map(t => {
        const tagLabel = t.tag === 'recurring'
          ? tr(lang, 'alert.tag.recurring')
          // Legacy callers sent display copy; render it rather than drop it.
          : t.tag;
        const tagPill = tagLabel
          ? `<span style="display:inline-block;font-family:${monoStack};font-size:9.5px;font-weight:600;color:#6e716c;background:#f3f1e9;border:1px solid #e7e5dd;border-radius:4px;padding:1px 6px;margin-left:8px;letter-spacing:.04em;text-transform:uppercase;vertical-align:1px;">${escapeHtml(tagLabel)}</span>`
          : '';
        return `
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:11.5px;color:#6e716c;width:64px;white-space:nowrap;">${escapeHtml(shortDate(lang, t.date))}</td>
          <td style="padding:11px 14px 11px 14px;border-bottom:1px solid #efece4;font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(t.description)}${tagPill}</td>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:13px;color:#0c0d0c;font-weight:500;text-align:right;white-space:nowrap;">${money(lang, parseFloat(t.amount))}</td>
        </tr>`;
      }).join('');

      // Deep links — every CTA used to be href="#".
      const categoryUrl = categoryId
        ? `${base}/budget?category=${encodeURIComponent(categoryId)}`
        : `${base}/budget`;
      const adjustUrl = categoryId
        ? `${base}/budget?category=${encodeURIComponent(categoryId)}&edit=1`
        : `${base}/budget`;

      html = `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(tr(lang, 'alert.title', { category: categoryName }))}</title>
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
    /* Phone column — the design's 332px inset. Drops the third CTA and
       tightens the hero so nothing collides at the narrowest width. */
    @media only screen and (max-width:380px) {
      .content-pad { padding:20px 16px !important; }
      .h1 { font-size:23px !important; }
      .figure { font-size:36px !important; }
      .drivers-tag { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f4f0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:${sansStack};color:#0c0d0c;">
  <div style="display:none;font-size:1px;color:#f5f4f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(tr(lang, 'alert.preheader', {
      category: categoryName,
      over: overFmt.replace(/&nbsp;/g, ' '),
      spent: spentFmt.replace(/&nbsp;/g, ' '),
      budget: budgetFmt.replace(/&nbsp;/g, ' '),
    }))}
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
                  <td style="font-family:${sansStack};font-size:13px;font-weight:600;color:#1f211f;letter-spacing:-0.005em;vertical-align:middle;padding-right:10px;">${tr(lang, 'brand')}</td>
                  <td style="vertical-align:middle;padding-right:8px;"><span style="display:inline-block;width:3px;height:3px;background:#9a9c97;border-radius:50%"></span></td>
                  <td style="font-family:${monoStack};font-size:11px;color:#6e716c;letter-spacing:.04em;text-transform:uppercase;font-weight:500;vertical-align:middle;">${tr(lang, 'alert.brandTag')}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Eyebrow + headline -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">
                ${escapeHtml(tr(lang, 'alert.eyebrow', { month: monthLabel }))}
              </div>
              <h1 class="h1" style="font-family:${sansStack};font-weight:600;font-size:32px;letter-spacing:-0.025em;line-height:1.08;margin:0 0 10px 0;color:#0c0d0c;">
                ${escapeHtml(tr(lang, 'alert.headline', { category: categoryName }))} <span style="color:#c83a2a;font-weight:600;">${money(lang, overspentValue)}.</span>
              </h1>
              <p style="font-family:${sansStack};font-size:14.5px;color:#6e716c;line-height:1.55;margin:0;max-width:480px;">
                ${escapeHtml(tr(lang, 'alert.sub', {
                  transactions: txLabel,
                  timeLeft: daysLeft > 0
                    ? trPlural(lang, 'alert.daysLeft', daysLeft)
                    : tr(lang, 'alert.lastDay'),
                }))}
              </p>
            </td>
          </tr>

          <!-- Hero number -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;">
                ${escapeHtml(tr(lang, 'alert.heroLabel', { category: categoryName, month: monthLabel }))}
              </div>
              <div class="figure" style="font-family:${monoStack};font-size:64px;font-weight:500;letter-spacing:-0.04em;line-height:1.05;margin:6px 0 0 0;color:#c83a2a;font-variant-numeric:tabular-nums lining-nums;">
                ${(() => {
                  const p = moneyParts(lang, spentValue);
                  const cur = `<span style="color:#9a9c97;font-size:0.55em;letter-spacing:0;">${p.symbol}</span>`;
                  return p.symbolFirst ? `${cur}${p.digits}` : `${p.digits}&nbsp;${cur}`;
                })()}
              </div>
              <div style="font-family:${sansStack};font-size:13px;color:#6e716c;margin-top:6px;">
                ${tr(lang, 'alert.heroSub', {
                  budget: `<b style="color:#1f211f;font-weight:500;">${budgetFmt}</b>`,
                  over: `<b style="color:#c83a2a;font-weight:500;">${overFmt}</b>`,
                  transactions: `<b style="color:#1f211f;font-weight:500;">${txLabel}</b>`,
                })}
              </div>
            </td>
          </tr>

          <!-- Pace bar — tight against the hero so they read as a single unit.
               The tick row below carries the budget line and the "today"
               marker on the same 0..140% scale as the fill. -->
          <tr>
            <td class="content-pad" style="padding:18px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:36px;background:#f6f4ec;border:1px solid #efece4;border-radius:8px;padding:0;">
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
                  <td style="padding-top:3px;">
                    ${buildTickRow([
                      { pos: budgetLineLeft, color: '#1f211f' },
                      { pos: todayLineLeft, color: '#9a9c97' },
                    ])}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:3px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:${budgetLineLeft.toFixed(2)}%;font-family:${monoStack};font-size:11.5px;color:#6e716c;text-align:left;">${money(lang, 0, { decimals: 0 })}</td>
                        <td style="width:${(100 - budgetLineLeft).toFixed(2)}%;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-family:${monoStack};font-size:11.5px;color:#1f211f;text-align:left;font-weight:500;">${money(lang, budgetValue, { decimals: 0 })}</td>
                              <td style="font-family:${monoStack};font-size:11.5px;color:#6e716c;text-align:right;">${maxFmt}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.04em;margin-top:4px;">
                      ${escapeHtml(tr(lang, 'alert.today', { day: dayOfMonth, days: daysInMonth }))}
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
                  <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">${escapeHtml(tr(lang, 'alert.driversTitle'))}</td>
                  <td class="drivers-tag" style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">${escapeHtml(tr(lang, 'alert.driversCount', { shown: recentTransactions.length, total: txCount }))}</td>
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
                    <a href="${categoryUrl}" style="display:inline-block;background:#0c0d0c;color:#fbfaf6;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;">
                      ${escapeHtml(tr(lang, 'alert.cta.open', { category: categoryName }))} <span style="font-family:${monoStack};margin-left:4px;">&rarr;</span>
                    </a>
                  </td>
                  <td class="btn" style="padding-right:10px;">
                    <a href="${adjustUrl}" style="display:inline-block;color:#1f211f;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;border:1px solid #e7e5dd;">
                      ${escapeHtml(tr(lang, 'alert.cta.adjust'))}
                    </a>
                  </td>
                  <td class="btn">
                    <a href="${settingsUrl}" style="display:inline-block;color:#1f211f;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;border:1px solid #e7e5dd;">
                      ${escapeHtml(tr(lang, 'alert.cta.mute', { month: nextMonthLabel }))}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer — opt-out actions first (audit pass), dunning copy after -->
          <tr>
            <td style="background:#fbfaf6;border-top:1px solid #e7e5dd;padding:22px 40px;font-family:${sansStack};font-size:11.5px;color:#6e716c;line-height:1.6;">
              <a href="${settingsUrl}" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">${escapeHtml(tr(lang, 'foot.manage'))}</a>
              &middot;
              <a href="${settingsUrl}" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">${escapeHtml(tr(lang, 'alert.foot.mute', { category: categoryName }))}</a>
              &middot;
              <a href="${settingsUrl}" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">${escapeHtml(tr(lang, 'foot.unsubscribe'))}</a><br>
              ${tr(lang, 'alert.foot.note', {
                category: `<b style="color:#1f211f;font-weight:500;">${escapeHtml(categoryName)}</b>`,
                month: escapeHtml(nextMonthLabel),
              })}
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
      const cadenceLabel = tr(lang, `report.cadence.${cadence}`);
      const periodLabel = String(data.period ?? '');

      // Section gate — opt-in list per user. Email blocks are rendered
      // only when listed here. Defaults to the full set for back-compat
      // (caller passes nothing → user sees everything, same as before).
      const includes = (section: string): boolean =>
        !Array.isArray(data.sections) || data.sections.length === 0 || data.sections.includes(section);

      const incomeNum = parseFloat(String(data.income));
      const expensesNum = parseFloat(String(data.expenses));
      const balanceNum = parseFloat(String(data.balance));
      const balanceColor = balanceNum >= 0 ? '#0c0d0c' : '#c83a2a';
      const net = incomeNum - expensesNum;
      const netColor = net >= 0 ? '#3a8a4d' : '#c83a2a';
      const savingsRate = data.savingsRate || 0;
      const incomeChange = data.incomeChange || 0;
      const expenseChange = data.expenseChange || 0;
      const vsPrev = tr(lang, `report.vsPrev.${cadence}`);

      // Category rows — bar table, refund-aware spent already netted upstream.
      const topCategories: any[] = data.topCategories || [];
      const categoryRows = topCategories.map((cat: any) => {
        const isOver = cat.budget != null && cat.spent > cat.budget;
        const barColor = isOver ? '#c83a2a' : '#0c0d0c';
        const barWidth = Math.min(100, Number(cat.pct) || 0);
        return `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:34%;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(cat.name)}${isOver ? ` <span style="display:inline-block;font-family:${monoStack};font-size:10px;color:#c83a2a;margin-left:6px;letter-spacing:.05em;text-transform:uppercase;font-weight:500;">${escapeHtml(tr(lang, 'report.overTag'))}</span>` : ''}</td>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:18%;font-family:${monoStack};font-size:13px;font-weight:500;color:#0c0d0c;text-align:right;white-space:nowrap;">${money(lang, Number(cat.spent))}</td>
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
          <td style="padding:10px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:12.5px;color:#6e716c;text-align:right;white-space:nowrap;">${money(lang, Number(cat.spent), { decimals: 0 })} / ${money(lang, Number(cat.budget), { decimals: 0 })} &middot; ${pctUsed}%</td>
          <td style="padding:10px 0 10px 14px;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:13px;color:#c83a2a;font-weight:500;text-align:right;white-space:nowrap;">${money(lang, overAmount, { decimals: 0, sign: true })}</td>
        </tr>`;
      }).join('');
      const breachHtml = budgetOverspent.length > 0 ? `
        <tr>
          <td class="content-pad" style="padding:32px 40px 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">${escapeHtml(tr(lang, 'report.breachTitle'))}</td>
                <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">${escapeHtml(trPlural(lang, 'report.breachCount', budgetOverspent.length))}</td>
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
          ? `${money(lang, spent, { decimals: 0 })} / ${money(lang, total, { decimals: 0 })} &middot; ${pctUsed}%`
          : money(lang, spent, { decimals: 0 });
        const barColor = over ? '#c83a2a' : '#0c0d0c';
        const barWidth = Math.min(100, pctUsed);
        return `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #efece4;width:36%;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(sb.name)}${isClosed ? ` <span style="display:inline-block;font-family:${monoStack};font-size:10px;color:#6e716c;margin-left:6px;letter-spacing:.05em;text-transform:uppercase;font-weight:500;">${escapeHtml(tr(lang, 'report.closedTag'))}</span>` : ''}</td>
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
                <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">${escapeHtml(tr(lang, 'report.specialTitle'))}</td>
                <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">${escapeHtml(trPlural(lang, 'report.specialCount', specialBudgets.length))}</td>
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
        return `<tr>
          <td style="padding:13px 0;border-bottom:1px solid #efece4;font-family:${sansStack};font-size:13.5px;color:#0c0d0c;font-weight:500;">${escapeHtml(acc.name)}</td>
          <td style="padding:13px 18px 13px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:12px;color:#6e716c;text-align:right;white-space:nowrap;">${money(lang, flow, { decimals: 0, sign: true })}</td>
          <td style="padding:13px 0;border-bottom:1px solid #efece4;font-family:${monoStack};font-size:13px;font-weight:500;text-align:right;white-space:nowrap;color:${Number(acc.balance) >= 0 ? '#0c0d0c' : '#c83a2a'};">${money(lang, Number(acc.balance))}</td>
        </tr>`;
      }).join('');

      // Verdict-first headline. The figure is baseline-aligned to the
      // surrounding text (audit pass) rather than set as its own block.
      const verdictHead = net >= 0
        ? `${escapeHtml(tr(lang, 'report.verdict.saved'))} <span style="color:#3a8a4d;font-weight:600;">${money(lang, Math.abs(net))}.</span>`
        : `${escapeHtml(tr(lang, 'report.verdict.overspentPre'))} <span style="color:#c83a2a;font-weight:600;">${money(lang, Math.abs(net))}</span> ${escapeHtml(tr(lang, 'report.verdict.overspentPost'))}`;

      const txCount = Number(data.transactionCount || 0);
      subject = tr(lang, 'report.subject', {
        period: periodLabel,
        net: money(lang, net, { sign: true }).replace(/&nbsp;/g, ' '),
        rate: savingsRate,
        breaches: budgetOverspent.length > 0
          ? trPlural(lang, 'report.subjectBreaches', budgetOverspent.length)
          : '',
      });

      html = `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(tr(lang, 'report.title', { cadence: cadenceLabel, period: periodLabel }))}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @media only screen and (max-width:620px) {
      .wrapper { width:100% !important; }
      .content-pad { padding:24px 20px !important; }
      .h1 { font-size:26px !important; }
      .stat-table .stat-card { display:block !important; width:100% !important; border-right:0 !important; border-bottom:1px solid #e7e5dd !important; }
      .stat-table .stat-card.last { border-bottom:0 !important; }
    }
    @media only screen and (max-width:380px) {
      .content-pad { padding:20px 16px !important; }
      .h1 { font-size:23px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f4f0;font-family:${sansStack};color:#0c0d0c;">
  <div style="display:none;font-size:1px;color:#f5f4f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(tr(lang, 'report.preheader', {
      period: periodLabel,
      income: money(lang, incomeNum).replace(/&nbsp;/g, ' '),
      expenses: money(lang, expensesNum).replace(/&nbsp;/g, ' '),
      balance: money(lang, balanceNum).replace(/&nbsp;/g, ' '),
    }))}
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
                  <td style="font-family:${sansStack};font-size:13px;font-weight:600;color:#1f211f;letter-spacing:-0.005em;vertical-align:middle;padding-right:10px;">${tr(lang, 'brand')}</td>
                  <td style="vertical-align:middle;padding-right:8px;"><span style="display:inline-block;width:3px;height:3px;background:#9a9c97;border-radius:50%"></span></td>
                  <td style="font-family:${monoStack};font-size:11px;color:#6e716c;letter-spacing:.04em;text-transform:uppercase;font-weight:500;vertical-align:middle;">${escapeHtml(tr(lang, `report.brandTag.${cadence}`))}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Verdict headline -->
          <tr>
            <td class="content-pad" style="padding:32px 40px 0 40px;">
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">
                ${escapeHtml(tr(lang, 'report.eyebrow', { period: periodLabel }))}
              </div>
              <h1 class="h1" style="font-family:${sansStack};font-weight:600;font-size:30px;letter-spacing:-0.025em;line-height:1.1;margin:0 0 10px 0;color:#0c0d0c;">
                ${verdictHead}
              </h1>
              <p style="font-family:${sansStack};font-size:14.5px;color:#6e716c;line-height:1.55;margin:0;max-width:480px;">
                ${escapeHtml(tr(lang, 'report.sub', { transactions: trPlural(lang, 'report.transactions', txCount) }))}${savingsRate ? ` ${tr(lang, 'report.savingsRate', { rate: `<b style="color:${savingsRate >= 0 ? '#3a8a4d' : '#c83a2a'};font-weight:500;">${savingsRate}</b>` })}` : ''}
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
                    <div style="font-family:${monoStack};font-size:9.5px;color:#6e716c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px;font-weight:500;">${escapeHtml(tr(lang, 'report.stat.income'))}</div>
                    <div style="font-family:${monoStack};font-size:18px;font-weight:500;letter-spacing:-0.02em;color:#3a8a4d;line-height:1;">${money(lang, incomeNum)}</div>
                    <div style="font-family:${monoStack};font-size:11px;margin-top:6px;color:${incomeChange === 0 ? '#9a9c97' : incomeChange >= 0 ? '#3a8a4d' : '#c83a2a'};font-weight:500;">${incomeChange === 0 ? '&mdash;' : `${incomeChange >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(incomeChange)}% ${escapeHtml(vsPrev)}`}</div>
                  </td>
                  <td class="stat-card" style="padding:12px 16px;border-right:1px solid #e7e5dd;vertical-align:top;width:33.33%;">
                    <div style="font-family:${monoStack};font-size:9.5px;color:#6e716c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px;font-weight:500;">${escapeHtml(tr(lang, 'report.stat.expenses'))}</div>
                    <div style="font-family:${monoStack};font-size:18px;font-weight:500;letter-spacing:-0.02em;color:#c83a2a;line-height:1;">${money(lang, expensesNum)}</div>
                    <div style="font-family:${monoStack};font-size:11px;margin-top:6px;color:${expenseChange === 0 ? '#9a9c97' : expenseChange <= 0 ? '#3a8a4d' : '#c83a2a'};font-weight:500;">${expenseChange === 0 ? '&mdash;' : `${expenseChange >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(expenseChange)}% ${escapeHtml(vsPrev)}`}</div>
                  </td>
                  <td class="stat-card last" style="padding:12px 16px;vertical-align:top;width:33.33%;">
                    <div style="font-family:${monoStack};font-size:9.5px;color:#6e716c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px;font-weight:500;">${escapeHtml(tr(lang, 'report.stat.net'))}</div>
                    <div style="font-family:${monoStack};font-size:18px;font-weight:500;letter-spacing:-0.02em;color:${netColor};line-height:1;">${money(lang, net, { sign: true })}</div>
                    <div style="font-family:${monoStack};font-size:11px;margin-top:6px;color:#6e716c;font-weight:500;">${savingsRate ? escapeHtml(tr(lang, 'report.stat.rate', { rate: savingsRate })) : '&nbsp;'}</div>
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
                  <td style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">${escapeHtml(tr(lang, 'report.categoriesTitle'))}</td>
                  <td style="font-family:${monoStack};font-size:10.5px;color:#1f211f;letter-spacing:.04em;padding-bottom:14px;text-align:right;font-weight:500;">${escapeHtml(tr(lang, 'report.categoriesCount', { count: topCategories.length }))}</td>
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
              <div style="font-family:${monoStack};font-size:10.5px;color:#6e716c;letter-spacing:.1em;text-transform:uppercase;padding-bottom:14px;">${escapeHtml(tr(lang, 'report.accountsTitle'))}</div>
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
                  <td style="padding:18px 0 4px 0;font-family:${monoStack};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1f211f;font-weight:500;">${escapeHtml(tr(lang, 'report.totalBalance'))}</td>
                  <td style="padding:18px 0 4px 0;font-family:${monoStack};font-size:22px;font-weight:500;letter-spacing:-0.02em;text-align:right;color:${balanceColor};">${money(lang, balanceNum)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td class="content-pad" style="padding:24px 40px 0 40px;">
              <a href="${base}/" style="display:inline-block;background:#0c0d0c;color:#fbfaf6;text-decoration:none;font-family:${sansStack};font-size:13.5px;font-weight:500;padding:10px 18px;border-radius:8px;">
                ${escapeHtml(tr(lang, 'report.cta.dashboard'))} <span style="font-family:${monoStack};margin-left:4px;">&rarr;</span>
              </a>
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
                    <a href="${settingsUrl}" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">${escapeHtml(tr(lang, 'foot.manage'))}</a>
                    &middot;
                    <a href="${settingsUrl}" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">${escapeHtml(tr(lang, 'report.foot.cadence'))}</a>
                    &middot;
                    <a href="${settingsUrl}" style="color:#1f211f;text-decoration:underline;text-decoration-color:#e7e5dd;">${escapeHtml(tr(lang, 'foot.unsubscribe'))}</a><br>
                    ${escapeHtml(tr(lang, 'report.foot.note', {
                      cadence: cadenceLabel.toLowerCase(),
                      pdf: pdfBase64 ? tr(lang, 'report.foot.pdf') : '',
                      schedule: tr(lang, `report.schedule.${cadence}`),
                    }))}
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
      const periodSlug = String(data.period || tr(lang, 'pdf.filename'))
        .replace(/\s+/g, '-')
        .toLowerCase();
      emailPayload.attachments = [
        {
          filename: `${tr(lang, 'pdf.filename')}-${periodSlug}.pdf`,
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
