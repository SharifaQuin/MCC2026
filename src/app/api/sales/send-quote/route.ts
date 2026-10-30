import { prisma } from "@/lib/prisma";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { sendEmail } from "@/lib/email";

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

  // A quote linked (by Lead.quoteKey) to a Scam-classified lead must never
  // be sent — this is the one real gap the Section A client-side identity
  // fix doesn't close on its own: a stale/already-open tab could otherwise
  // still send to a scam lead's stored recipient even after classification
  // happens in another tab, since the client never re-checks Lead stage.
  // Checked fresh here, server-side, every time — never cached.
  //
  // Lead.quoteKey is NOT a unique field — findMany, not findFirst/findUnique.
  // Two Lead rows can share the same quoteKey (e.g. a duplicate created some
  // other way), and a findFirst here could silently return the non-Scam one
  // while the actual Scam-linked lead goes unchecked. Block if ANY matching
  // lead is Scam, regardless of which one a naive findFirst would surface.
  const linkedLeads = await prisma.lead.findMany({ where: { quoteKey: id }, select: { stage: true } });
  if (linkedLeads.some((l) => l.stage === "SCAM")) {
    return Response.json({ error: "This quote is linked to a lead classified as Scam — sending is blocked." }, { status: 403 });
  }

  const quote = JSON.parse(row.value);
  if (quote.sentAt) {
    return Response.json({ error: "This quote was already sent." }, { status: 409 });
  }
  if (quote.sendState === "SENDING") {
    return Response.json({ error: "This quote is already being sent." }, { status: 409 });
  }
  const clientEmail = typeof quote.clientEmail === "string" ? quote.clientEmail.trim() : "";
  if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return Response.json({ error: "This quote has no valid client email saved" }, { status: 400 });
  }

  // Atomic claim before dispatching — a compare-and-swap on the exact prior
  // stored value (mirrors this codebase's Prisma-backed stale-write guards
  // elsewhere, applied here to this KV-stored record instead of a typed
  // column). A second concurrent or replayed POST for the same quote id
  // reads a row.value that no longer matches once this succeeds, so at
  // most one request's updateMany can ever claim it.
  const claimedQuote = { ...quote, sendState: "SENDING" };
  const claim = await prisma.salesToolData.updateMany({
    where: { key: `quote:${id}`, value: row.value },
    data: { value: JSON.stringify(claimedQuote) },
  });
  if (claim.count === 0) {
    return Response.json({ error: "This quote is already being sent or was already sent." }, { status: 409 });
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
    // Release the claim so a genuine retry after a transport failure isn't
    // permanently blocked by this one failed attempt.
    await prisma.salesToolData.update({ where: { key: `quote:${id}` }, data: { value: JSON.stringify(quote) } });
    return Response.json({ error: result.error }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  const sentQuote = { ...quote, sentAt };
  await prisma.salesToolData.update({ where: { key: `quote:${id}` }, data: { value: JSON.stringify(sentQuote) } });

  return Response.json({ ok: true, sentAt });
}
