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
      html = `
        <h2>Alerte Budget</h2>
        <p>Bonjour,</p>
        <p>Votre budget pour la catégorie <strong>${escapeHtml(data.categoryName)}</strong> a été dépassé.</p>
        <ul>
          <li>Budget mensuel : ${escapeHtml(String(data.budget))}€</li>
          <li>Dépensé : ${escapeHtml(String(data.spent))}€</li>
          <li>Dépassement : ${escapeHtml(String(data.overspent))}€</li>
        </ul>
        <p>Connectez-vous à votre application pour plus de détails.</p>
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
