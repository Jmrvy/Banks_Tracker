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

    const { userId, type, data, categoryId, alertMonth }: EmailRequest = await req.json();

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

      const dailyData: { date: string; cumulative: number }[] = data.dailyData || [];
      const recentTransactions: { date: string; description: string; amount: string }[] = data.recentTransactions || [];
      const budgetValue = parseFloat(data.budget);
      const spentValue = parseFloat(data.spent);
      const progressBar = buildSpendingProgressBar(budgetValue, spentValue);
      const dailyBars = buildDailyBarsHtml(dailyData, budgetValue, spentValue);

      const txRows = recentTransactions.map((t, i) => {
        const bgColor = i % 2 === 0 ? '#ffffff' : '#fafafa';
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${bgColor};white-space:nowrap;">${escapeHtml(t.date)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${bgColor};">${escapeHtml(t.description)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626;font-size:13px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:right;background:${bgColor};white-space:nowrap;">${escapeHtml(t.amount)}&euro;</td>
        </tr>`;
      }).join('');

      const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

      html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Budget d&eacute;pass&eacute;</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .wrapper { width:100% !important; padding:0 !important; }
      .content-pad { padding:20px 16px !important; }
      .header-pad { padding:20px 16px !important; }
      .stat-card { display:block !important; width:100% !important; margin-bottom:8px !important; }
      .stat-spacer { display:none !important; }
      .stat-table { width:100% !important; }
      .mobile-full { width:100% !important; }
      .mobile-hide { display:none !important; }
      .mobile-text-sm { font-size:11px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader (inbox preview text) -->
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(data.categoryName)}: ${escapeHtml(data.spent)}&euro; d&eacute;pens&eacute;s sur ${escapeHtml(data.budget)}&euro; (+${escapeHtml(data.overspent)}&euro;)
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!-- Email container -->
        <table role="presentation" class="wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td class="header-pad" style="background:linear-gradient(135deg,#dc2626,#b91c1c);background-color:#dc2626;padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${fontStack};font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
                    Budget d&eacute;pass&eacute;
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack};font-size:14px;color:rgba(255,255,255,0.85);padding-top:6px;line-height:1.4;">
                    Cat&eacute;gorie : <strong>${escapeHtml(data.categoryName)}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="content-pad" style="padding:28px 32px;">

              <!-- Greeting -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="font-family:${fontStack};font-size:15px;color:#374151;line-height:1.6;">
                    Bonjour,<br><br>
                    Votre budget pour la cat&eacute;gorie <strong style="color:#111827;">${escapeHtml(data.categoryName)}</strong> a &eacute;t&eacute; d&eacute;pass&eacute; ce mois-ci.
                  </td>
                </tr>
              </table>

              <!-- Stats cards -->
              <table role="presentation" class="stat-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td class="stat-card" style="width:32%;background:#f9fafb;border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
                    <div style="font-family:${fontStack};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Budget</div>
                    <div style="font-family:${fontStack};font-size:24px;font-weight:700;color:#111827;line-height:1.2;">${escapeHtml(data.budget)}&euro;</div>
                  </td>
                  <td class="stat-spacer" style="width:2%;">&nbsp;</td>
                  <td class="stat-card" style="width:32%;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
                    <div style="font-family:${fontStack};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">D&eacute;pens&eacute;</div>
                    <div style="font-family:${fontStack};font-size:24px;font-weight:700;color:#dc2626;line-height:1.2;">${escapeHtml(data.spent)}&euro;</div>
                  </td>
                  <td class="stat-spacer" style="width:2%;">&nbsp;</td>
                  <td class="stat-card" style="width:32%;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
                    <div style="font-family:${fontStack};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">D&eacute;passement</div>
                    <div style="font-family:${fontStack};font-size:24px;font-weight:700;color:#dc2626;line-height:1.2;">+${escapeHtml(data.overspent)}&euro;</div>
                  </td>
                </tr>
              </table>

              <!-- Progress bar -->
              ${progressBar}

              <!-- Daily spending bars -->
              ${dailyBars}

              <!-- Recent transactions -->
              ${txRows ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="font-family:${fontStack};font-size:14px;font-weight:600;color:#111827;padding-bottom:12px;">
                    Derni&egrave;res transactions
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                      <tr style="background:#f9fafb;">
                        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;font-family:${fontStack};border-bottom:1px solid #e5e7eb;">Date</th>
                        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;font-family:${fontStack};border-bottom:1px solid #e5e7eb;">Description</th>
                        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;font-family:${fontStack};border-bottom:1px solid #e5e7eb;">Montant</th>
                      </tr>
                      ${txRows}
                    </table>
                  </td>
                </tr>
              </table>` : ''}

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#dc2626,#b91c1c);background-color:#dc2626;border-radius:8px;padding:12px 28px;">
                          <span style="font-family:${fontStack};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;display:inline-block;">
                            G&eacute;rer mes budgets
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${fontStack};font-size:12px;color:#9ca3af;line-height:1.5;text-align:center;">
                    Vous recevez cet email car vous avez activ&eacute; les alertes de budget.<br>
                    Vous pouvez d&eacute;sactiver ces notifications dans les param&egrave;tres de l'application.
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
    } else if (type === 'monthly_report') {
      subject = `Rapport mensuel \u2013 ${escapeHtml(data.period)}`;
      const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
      const income = escapeHtml(String(data.income));
      const expenses = escapeHtml(String(data.expenses));
      const balance = escapeHtml(String(data.balance));
      const balanceNum = parseFloat(String(data.balance));
      const balanceColor = balanceNum >= 0 ? '#059669' : '#dc2626';

      html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Rapport mensuel</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .wrapper { width:100% !important; padding:0 !important; }
      .content-pad { padding:20px 16px !important; }
      .header-pad { padding:20px 16px !important; }
      .stat-card { display:block !important; width:100% !important; margin-bottom:8px !important; }
      .stat-spacer { display:none !important; }
      .stat-table { width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    R&eacute;sum&eacute; ${escapeHtml(data.period)} : ${income}&euro; de revenus, ${expenses}&euro; de d&eacute;penses
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <tr>
            <td class="header-pad" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);background-color:#2563eb;padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${fontStack};font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
                    Rapport mensuel
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack};font-size:14px;color:rgba(255,255,255,0.85);padding-top:6px;line-height:1.4;">
                    ${escapeHtml(data.period)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="content-pad" style="padding:28px 32px;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="font-family:${fontStack};font-size:15px;color:#374151;line-height:1.6;">
                    Bonjour,<br><br>
                    Voici votre r&eacute;sum&eacute; financier pour <strong>${escapeHtml(data.period)}</strong>.
                  </td>
                </tr>
              </table>

              <table role="presentation" class="stat-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td class="stat-card" style="width:32%;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
                    <div style="font-family:${fontStack};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Revenus</div>
                    <div style="font-family:${fontStack};font-size:24px;font-weight:700;color:#059669;line-height:1.2;">${income}&euro;</div>
                  </td>
                  <td class="stat-spacer" style="width:2%;">&nbsp;</td>
                  <td class="stat-card" style="width:32%;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
                    <div style="font-family:${fontStack};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">D&eacute;penses</div>
                    <div style="font-family:${fontStack};font-size:24px;font-weight:700;color:#dc2626;line-height:1.2;">${expenses}&euro;</div>
                  </td>
                  <td class="stat-spacer" style="width:2%;">&nbsp;</td>
                  <td class="stat-card" style="width:32%;background:#f9fafb;border-radius:8px;padding:16px;text-align:center;vertical-align:top;">
                    <div style="font-family:${fontStack};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Solde</div>
                    <div style="font-family:${fontStack};font-size:24px;font-weight:700;color:${balanceColor};line-height:1.2;">${balance}&euro;</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                <tr>
                  <td style="font-family:${fontStack};font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">
                    Les rapports PDF et Excel d&eacute;taill&eacute;s sont disponibles dans votre application.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${fontStack};font-size:12px;color:#9ca3af;line-height:1.5;text-align:center;">
                    Vous recevez cet email car vous avez activ&eacute; les rapports mensuels.<br>
                    Vous pouvez d&eacute;sactiver ces notifications dans les param&egrave;tres de l'application.
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

    const emailResponse = await resend.emails.send({
      from: "Budget App <onboarding@resend.dev>",
      to: [userEmail],
      subject: subject,
      html: html,
    });

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
