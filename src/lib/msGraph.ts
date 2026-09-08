// Shared OAuth2 client-credentials token fetch for Microsoft Graph — used by
// both email sending and calendar event creation, since they authenticate
// as the same app registration against the same mailbox.
export async function getGraphAccessToken(): Promise<
  { ok: true; accessToken: string; senderEmail: string } | { ok: false; error: string }
> {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const senderEmail = process.env.MS_GRAPH_SENDER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    return {
      ok: false,
      error:
        "Microsoft Graph isn't configured yet — missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET / MS_GRAPH_SENDER_EMAIL.",
    };
  }

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!tokenRes.ok) {
    return { ok: false, error: `Microsoft auth failed: ${await tokenRes.text()}` };
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  return { ok: true, accessToken: access_token, senderEmail };
}
