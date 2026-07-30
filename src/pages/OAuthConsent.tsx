import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

/** What went wrong, in terms the person looking at the screen can act on. */
const describe = (e: unknown) => {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "Unexpected error";
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!authorizationId) {
          setError("This link is missing its authorization_id. Start the connection again from the app that requested it.");
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
        setError("The authorization server did not return a redirect target.");
        return;
      }
      window.location.href = data.redirect_url;
    } catch (e) {
      setBusy(false);
      setError(describe(e));
    }
  };

  const clientName = details?.client?.client_name?.trim() || "An application";
  const scopes = (details?.scope ?? "").split(" ").filter(Boolean);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {error ? (
          <>
            <CardHeader>
              <CardTitle>Connection request failed</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </CardContent>
          </>
        ) : !details ? (
          <CardContent className="py-10 flex justify-center">
            <InlineSpinner />
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Connect {clientName} to your account</CardTitle>
              <CardDescription>
                {clientName} will be able to read your accounts, transactions, budgets and
                savings goals, and to record new transactions — acting as you.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {details.client.client_uri && (
                <p className="text-xs text-muted-foreground break-all">
                  {details.client.client_uri}
                </p>
              )}
              {scopes.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Requested permissions</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {scopes.map((s) => (
                      <li key={s} className="font-mono">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => decide(true)}>
                  Approve
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
                  Deny
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
