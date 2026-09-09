import { getGraphAccessToken } from "@/lib/msGraph";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wraps a plain-text message body in branded HTML with a signature, so every
// outbound email — applicant correspondence and internal notifications
// alike — looks like it actually came from a company, not an unformatted
// automated script.
function toHtmlBody(text: string): string {
  const paragraphs = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#14213A;line-height:1.5;">
      ${paragraphs}
      <div style="margin-top:24px;padding-top:16px;border-top:2px solid #C9A227;">
        <p style="margin:0;font-weight:bold;font-size:15px;color:#14213A;">Mama&rsquo;s Cleaning Crew</p>
        <p style="margin:4px 0 0;font-size:12px;color:#4F6B96;">Great People. Premium Service. Real Impact.</p>
        <p style="margin:8px 0 0;font-size:12px;">
          <a href="https://mamascleaningcrew.com" style="color:#1B2A4A;">mamascleaningcrew.com</a>
        </p>
      </div>
    </div>
  `;
}

// Sends email via Microsoft Graph (Outlook/Microsoft 365), using an Entra ID
// app registration with the Mail.Send application permission. Requires
// MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, and
// MS_GRAPH_SENDER_EMAIL (the mailbox to send as) as env vars — see the
// Recruiting setup notes for how to create the app registration.
export async function sendEmail({
  to,
  subject,
  body,
  replyTo,
  from,
  bcc,
}: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  // Mailbox to send as — defaults to MS_GRAPH_SENDER_EMAIL. Sending as a
  // different mailbox (e.g. sales@) requires the Graph app registration to
  // have Mail.Send permission on that mailbox too.
  from?: string;
  bcc?: string | string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await getGraphAccessToken();
  if (!token.ok) return token;

  const sendAsMailbox = from || token.senderEmail;
  const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sendAsMailbox)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: toHtmlBody(body) },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
          ...(bccList.length ? { bccRecipients: bccList.map((address) => ({ emailAddress: { address } })) } : {}),
        },
      }),
    }
  );

  if (!sendRes.ok) {
    return { ok: false, error: `Microsoft Graph sendMail failed: ${await sendRes.text()}` };
  }
  return { ok: true };
}
