import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
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

/** Renders an inline SVG line chart showing cumulative spending vs the budget threshold. */
function buildSpendingChartSvg(
  dailyData: { date: string; cumulative: number }[],
  budget: number,
  totalSpent: number
): string {
  if (dailyData.length === 0) return '';

  const W = 540, H = 180, PAD = { top: 16, right: 16, bottom: 32, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxY = Math.max(budget * 1.1, totalSpent * 1.05);

  // Use day-of-month as x axis
  const days = dailyData.map(d => parseInt(d.date.split('-')[2], 10));
  const maxDay = Math.max(...days, 28);

  const toX = (day: number) => PAD.left + (day / maxDay) * innerW;
  const toY = (val: number) => PAD.top + innerH - (val / maxY) * innerH;

  // Build polyline points
  const points = dailyData.map(d => `${toX(parseInt(d.date.split('-')[2], 10)).toFixed(1)},${toY(d.cumulative).toFixed(1)}`).join(' ');

  // Budget line Y
  const budgetY = toY(budget).toFixed(1);

  // Y axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const val = maxY * ratio;
    const y = toY(val);
    return `<text x="${PAD.left - 6}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#718096">${val.toFixed(0)}€</text>`;
  }).join('');

  // X axis ticks (every 7 days)
  const xLabels = [1, 8, 15, 22, maxDay].filter(d => d <= maxDay).map(d => {
    const x = toX(d);
    return `<text x="${x.toFixed(1)}" y="${(PAD.top + innerH + 16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#718096">${d}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="max-width:100%;display:block;background:#f7fafc;border-radius:6px;">
  <!-- Grid -->
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + innerH}" stroke="#e2e8f0" stroke-width="1"/>
  <line x1="${PAD.left}" y1="${PAD.top + innerH}" x2="${PAD.left + innerW}" y2="${PAD.top + innerH}" stroke="#e2e8f0" stroke-width="1"/>
  <!-- Budget threshold -->
  <line x1="${PAD.left}" y1="${budgetY}" x2="${PAD.left + innerW}" y2="${budgetY}" stroke="#e53e3e" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="${PAD.left + innerW - 2}" y="${parseFloat(budgetY) - 5}" text-anchor="end" font-size="10" fill="#e53e3e">Budget ${budget.toFixed(0)}€</text>
  <!-- Spending area fill -->
  <polygon points="${PAD.left},${PAD.top + innerH} ${points} ${toX(days[days.length-1]).toFixed(1)},${PAD.top + innerH}" fill="#e53e3e" fill-opacity="0.12"/>
  <!-- Spending line -->
  <polyline points="${points}" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linejoin="round"/>
  <!-- Axes labels -->
  ${yLabels}
  ${xLabels}
</svg>`;
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
      subject = `⚠️ Budget dépassé - ${escapeHtml(data.categoryName)}`;

      // Build inline SVG chart from dailyData
      const dailyData: { date: string; cumulative: number }[] = data.dailyData || [];
      const recentTransactions: { date: string; description: string; amount: string }[] = data.recentTransactions || [];
      const budgetValue = parseFloat(data.budget);
      const spentValue = parseFloat(data.spent);
      const chartSvg = buildSpendingChartSvg(dailyData, budgetValue, spentValue);

      // Recent transactions table rows
      const txRows = recentTransactions.map(t => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#555;font-size:13px;">${escapeHtml(t.date)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#333;font-size:13px;">${escapeHtml(t.description)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#e53e3e;font-size:13px;text-align:right;">${escapeHtml(t.amount)}€</td>
        </tr>`).join('');

      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#e53e3e;padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:20px;">⚠️ Budget dépassé</h1>
          </div>
          <div style="padding:24px 32px;">
            <p style="margin:0 0 16px;color:#333;">Bonjour,</p>
            <p style="margin:0 0 24px;color:#333;">
              Votre budget pour la catégorie <strong>${escapeHtml(data.categoryName)}</strong> a été dépassé ce mois-ci.
            </p>

            <!-- Stats summary -->
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="background:#f7fafc;border-radius:6px;padding:14px 18px;text-align:center;width:33%;">
                  <div style="font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:.05em;">Budget</div>
                  <div style="font-size:22px;font-weight:700;color:#2d3748;">${escapeHtml(data.budget)}€</div>
                </td>
                <td style="width:2%;"></td>
                <td style="background:#fff5f5;border-radius:6px;padding:14px 18px;text-align:center;width:33%;">
                  <div style="font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:.05em;">Dépensé</div>
                  <div style="font-size:22px;font-weight:700;color:#e53e3e;">${escapeHtml(data.spent)}€</div>
                </td>
                <td style="width:2%;"></td>
                <td style="background:#fff5f5;border-radius:6px;padding:14px 18px;text-align:center;width:33%;">
                  <div style="font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:.05em;">Dépassement</div>
                  <div style="font-size:22px;font-weight:700;color:#e53e3e;">+${escapeHtml(data.overspent)}€</div>
                </td>
              </tr>
            </table>

            <!-- SVG Chart -->
            ${chartSvg ? `
            <div style="margin-bottom:24px;">
              <h3 style="margin:0 0 12px;color:#2d3748;font-size:15px;">Évolution des dépenses ce mois</h3>
              ${chartSvg}
            </div>` : ''}

            <!-- Recent transactions -->
            ${txRows ? `
            <div>
              <h3 style="margin:0 0 12px;color:#2d3748;font-size:15px;">Dernières transactions</h3>
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#f7fafc;">
                    <th style="padding:8px;text-align:left;font-size:12px;color:#718096;font-weight:600;text-transform:uppercase;">Date</th>
                    <th style="padding:8px;text-align:left;font-size:12px;color:#718096;font-weight:600;text-transform:uppercase;">Description</th>
                    <th style="padding:8px;text-align:right;font-size:12px;color:#718096;font-weight:600;text-transform:uppercase;">Montant</th>
                  </tr>
                </thead>
                <tbody>${txRows}</tbody>
              </table>
            </div>` : ''}

            <p style="margin:24px 0 0;color:#718096;font-size:13px;">
              Connectez-vous à votre application pour gérer vos budgets.
            </p>
          </div>
        </div>
      `;
    } else if (type === 'monthly_report') {
      subject = `📊 Rapport mensuel - ${escapeHtml(data.period)}`;
      html = `
        <h2>Rapport Mensuel</h2>
        <p>Bonjour,</p>
        <p>Voici votre rapport financier pour ${escapeHtml(data.period)}.</p>
        <h3>Résumé</h3>
        <ul>
          <li>Revenus : ${escapeHtml(String(data.income))}€</li>
          <li>Dépenses : ${escapeHtml(String(data.expenses))}€</li>
          <li>Solde final : ${escapeHtml(String(data.balance))}€</li>
        </ul>
        <p>Les rapports PDF et Excel détaillés sont disponibles dans votre application.</p>
      `;
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
