// Sends email via Microsoft Graph (Outlook/Microsoft 365), using an Entra ID
// app registration with the Mail.Send application permission. Requires
// MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, and
// MS_GRAPH_SENDER_EMAIL (the mailbox to send as) as env vars — see the
// Recruiting setup notes for how to create the app registration.
export async function sendEmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const senderEmail = process.env.MS_GRAPH_SENDER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    return {
      ok: false,
      error:
        "Email sending isn't configured yet — missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET / MS_GRAPH_SENDER_EMAIL.",
    };
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  if (!tokenRes.ok) {
    return { ok: false, error: `Microsoft auth failed: ${await tokenRes.text()}` };
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    }
  );

  if (!sendRes.ok) {
    return { ok: false, error: `Microsoft Graph sendMail failed: ${await sendRes.text()}` };
  }
  return { ok: true };
}
