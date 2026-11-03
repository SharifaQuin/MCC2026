import { prisma } from "@/lib/prisma";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { sendEmail } from "@/lib/email";
import { evaluateQuoteMarginHold, describeMarginHold } from "@/lib/pricingMargin";

// Sends a saved quote to its client by email (Microsoft Graph), reusing the
// same branded HTML-with-signature wrapping used for Recruiting emails. The
// recipient address and reply-to mailbox are read from the stored quote
// record (not trusted from the request body) so the tool's client-side JS
// can only ever send to the email address that was actually saved with it.
//
// Always sent as (and BCC'd to) the Sales team mailbox rather than the
// shared MS_GRAPH_SENDER_EMAIL used elsewhere, so every quote email lands in
// Sales' own Sent Items as a running thread. This mailbox needs Mail.Send
// permission on the same Graph app registration as MS_GRAPH_SENDER_EMAIL.
export const dynamic = "force-dynamic";

const SALES_MAILBOX = process.env.SALES_SENDER_EMAIL || "sales@mamascleaningcrew.com";

interface SendQuoteBody {
  id: string;
  subject: string;
  body: string;
}

export async function POST(request: Request) {
  const session = await requireSalesApiAccess();
  if (!session) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id, subject, body } = (await request.json()) as SendQuoteBody;
  if (!id || !subject || !body) {
    return Response.json({ error: "Missing id, subject, or body" }, { status: 400 });
  }

  const row = await prisma.salesToolData.findUnique({ where: { key: `quote:${id}` } });
  if (!row) {
    return Response.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = JSON.parse(row.value);
  const clientEmail = typeof quote.clientEmail === "string" ? quote.clientEmail.trim() : "";
  if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return Response.json({ error: "This quote has no valid client email saved" }, { status: 400 });
  }

  // Item 3: recompute the margin hold FRESH, server-side, right here —
  // never trust whatever `quote.marginHold` says was stored at the last
  // save (same "never cached" principle as the Lead-Scam send-block on the
  // sibling claude/pricing-calculator-and-scam-classification branch: a
  // stale/already-open tab, or a quote re-saved with different inputs
  // elsewhere, can't be trusted — this is the actual enforcement point).
  // "Held quotes may be saved for review but cannot be sent" is enforced
  // here, not by the client's disabled Send button, which can be bypassed
  // (see the e2e tests that call sendQuoteToClient() directly).
  const marginEvaluation = evaluateQuoteMarginHold(quote);
  if (marginEvaluation.held) {
    // marginHold: true rides along on the error response (still no dollar
    // figures for a non-ADMIN caller) so the client can tell "held, don't
    // bother retrying until this is re-saved differently" apart from a
    // transient failure (e.g. email transport) worth letting the rep retry.
    if (session.role === "ADMIN") {
      return Response.json(
        { error: `Held — below the 10% margin floor. ${describeMarginHold(marginEvaluation)}`, marginHold: true },
        { status: 403 },
      );
    }
    return Response.json(
      { error: "This quote needs owner review before it can be sent.", marginHold: true },
      { status: 403 },
    );
  }

  const result = await sendEmail({
    to: clientEmail,
    subject,
    body,
    from: SALES_MAILBOX,
    bcc: SALES_MAILBOX,
    // Always the Sales mailbox — a per-quote "mailbox" value saved by an
    // older client, or left blank, must never produce a quote email with
    // nowhere for the client's Accept/Decline reply to go.
    replyTo: SALES_MAILBOX,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  quote.sentAt = sentAt;
  await prisma.salesToolData.update({ where: { key: `quote:${id}` }, data: { value: JSON.stringify(quote) } });

  return Response.json({ ok: true, sentAt });
}
