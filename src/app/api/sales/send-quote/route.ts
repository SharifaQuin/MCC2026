import { prisma } from "@/lib/prisma";
import { requireSalesApiAccess } from "@/lib/requireSalesApiAccess";
import { sendEmail } from "@/lib/email";

// Sends a saved quote to its client by email (Microsoft Graph), reusing the
// same branded HTML-with-signature wrapping used for Recruiting emails. The
// recipient address and reply-to mailbox are read from the stored quote
// record (not trusted from the request body) so the tool's client-side JS
// can only ever send to the email address that was actually saved with it.
export const dynamic = "force-dynamic";

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

  const result = await sendEmail({
    to: clientEmail,
    subject,
    body,
    replyTo: typeof quote.mailbox === "string" && quote.mailbox ? quote.mailbox : undefined,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  quote.sentAt = sentAt;
  await prisma.salesToolData.update({ where: { key: `quote:${id}` }, data: { value: JSON.stringify(quote) } });

  return Response.json({ ok: true, sentAt });
}
