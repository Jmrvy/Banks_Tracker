import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InlineSpinner } from "@/components/LoadingSpinner";

/**
 * OAuth 2.1 consent screen. Supabase redirects here with an
 * `authorization_id` when an MCP client (ChatGPT, Claude, Cursor…) asks to
 * connect to this app as the signed-in user.
 *
 * `supabase.auth.oauth` only exists from @supabase/supabase-js 2.78.0 —
 * that is the floor package.json pins, and it is why it does. On an older
 * client the property is simply absent, which used to surface as a spinner
 * that never resolved.
 */
type Details = {
  authorization_id: string;
  /** Present when the user already consented: redirect instead of re-asking. */
  redirect_uri?: string;
  client: { client_id: string; client_name: string; client_uri?: string; logo_uri?: string };
  scope: string;
};

export default function OAuthConsent() {
  const { t } = useTranslation();
  const [params] = useSearchParams();

  /** What went wrong, in terms the person looking at the screen can act on. */
  const describe = (e: unknown) => {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return t("oauth.unexpected", { defaultValue: "Unexpected error" });
  };
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!authorizationId) {
          setError(
            t("oauth.missingId", {
              defaultValue:
                "This link is missing its authorization_id. Start the connection again from the app that requested it.",
            }),
          );
          return;
        }

        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          const next = window.location.pathname + window.location.search;
          window.location.href = `/auth?next=${encodeURIComponent(next)}`;
          return;
        }

        const { data, error: err } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (err) {
          setError(err.message);
          return;
        }

        // Already consented once — Supabase hands back the redirect target
        // rather than asking again.
        if (data?.redirect_uri) {
          window.location.href = data.redirect_uri;
          return;
        }
        setDetails(data);
      } catch (e) {
        // Without this the page renders a spinner for ever: nothing else
        // clears the loading state, so a throw here is indistinguishable
        // from a request that never comes back.
        if (active) setError(describe(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      // Redirect explicitly rather than letting the SDK navigate, so the
      // failure path stays on this page with a message on it.
      const { data, error: err } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (err) {
        setBusy(false);
        setError(err.message);
        return;
      }
      if (!data?.redirect_url) {
        setBusy(false);
        setError(
          t("oauth.noRedirect", {
            defaultValue: "The authorization server did not return a redirect target.",
          }),
        );
        return;
      }
      window.location.href = data.redirect_url;
    } catch (e) {
      setBusy(false);
      setError(describe(e));
    }
  };

  const clientName =
    details?.client?.client_name?.trim() ||
    t("oauth.anApplication", { defaultValue: "An application" });
  const scopes = (details?.scope ?? "").split(" ").filter(Boolean);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="ft-card w-full max-w-md p-6 sm:p-8 relative">
        {error ? (
          <>
            <div className="ft-eyebrow mb-1">
              {t("oauth.eyebrow", { defaultValue: "Connection request" })}
            </div>
            <h1 className="ft-page-title text-xl sm:text-2xl">
              {t("oauth.failedTitle", { defaultValue: "Connection request failed" })}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 mb-5">{error}</p>
            <Button variant="outline" className="h-10" onClick={() => window.location.reload()}>
              {t("common.retry", { defaultValue: "Try again" })}
            </Button>
          </>
        ) : !details ? (
          <div className="py-10 flex justify-center">
            <InlineSpinner />
          </div>
        ) : (
          <>
            <div className="ft-eyebrow mb-1">
              {t("oauth.eyebrow", { defaultValue: "Connection request" })}
            </div>
            <h1 className="ft-page-title text-xl sm:text-2xl">
              {t("oauth.title", {
                defaultValue: "Connect {{name}} to your account",
                name: clientName,
              })}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t("oauth.body", {
                defaultValue:
                  "{{name}} will be able to read your accounts, transactions, budgets and savings goals, and to record new transactions — acting as you.",
                name: clientName,
              })}
            </p>

            <div className="flex flex-col gap-4 mt-6">
              {details.client.client_uri && (
                <p className="text-xs text-muted-foreground break-all">
                  {details.client.client_uri}
                </p>
              )}
              {scopes.length > 0 && (
                <div className="rounded-lg border border-line bg-bg-subtle p-4">
                  <p className="ft-eyebrow mb-2">
                    {t("oauth.permissions", { defaultValue: "Requested permissions" })}
                  </p>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {scopes.map((s) => (
                      <li key={s} className="font-mono">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  className="flex-1 h-10 font-semibold"
                  onClick={() => decide(true)}
                >
                  {t("oauth.approve", { defaultValue: "Approve" })}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  className="flex-1 h-10"
                  onClick={() => decide(false)}
                >
                  {t("oauth.deny", { defaultValue: "Deny" })}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
