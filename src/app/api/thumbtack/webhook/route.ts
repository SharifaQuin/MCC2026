import {
  verifyThumbtackWebhookSecret,
  THUMBTACK_SECRET_HEADER,
  getThumbtackEventType,
  parseThumbtackLeadBody,
  ingestThumbtackLead,
  logThumbtackDelivery,
  logThumbtackAuthRejectedDiagnostics,
  logThumbtackBodyDiagnostics,
  maybeAlertOwnerOfThumbtackSaveFailure,
} from "@/lib/thumbtackLeads";

// Thumbtack's webhook form only offers Authorization None/Basic/Custom
// Header (per its own docs) and documents no request signing — a
// shared-secret Custom Header, compared in constant time, is the strongest
// check available. Public (added to middleware.ts's PUBLIC_PATHS): the
// secret header IS the authorization here, there's no session cookie to
// check and none is expected.
export const dynamic = "force-dynamic";

// The link is one-way (Thumbtack never reads a response body back), but a
// 2xx/non-2xx status still matters: it's what Thumbtack's own delivery log
// shows as success/failure, and — undocumented — may or may not drive a
// retry. Every branch below responds only once the work for that event is
// actually done (including a duplicate or an ignored event), per item 9.
export async function POST(request: Request) {
  const negotiationIdForLogging = (body: unknown): string | null => {
    if (!body || typeof body !== "object") return null;
    const id = (body as Record<string, unknown>).negotiationID;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  };

  // Nothing about the body is read, parsed, or logged below this check —
  // only the secret header's presence/length and the request's own
  // Content-Length header, never the header's value.
  const headerValue = request.headers.get(THUMBTACK_SECRET_HEADER);
  if (!verifyThumbtackWebhookSecret(headerValue)) {
    logThumbtackDelivery("rejected", null);
    logThumbtackAuthRejectedDiagnostics({
      headerPresent: headerValue !== null,
      headerLength: headerValue?.length ?? 0,
      contentLength: request.headers.get("content-length"),
    });
    return new Response("Not authorized", { status: 401 });
  }

  // Read once, as text, then parsed here (not via request.json()) so a
  // parse failure can be diagnosed — transport details and byte length —
  // without a second, impossible read of an already-consumed stream.
  const contentType = request.headers.get("content-type");
  const contentEncoding = request.headers.get("content-encoding");
  const rawText = await request.text();
  const byteLength = new TextEncoder().encode(rawText).length;

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch (err) {
    logThumbtackDelivery("failed", null);
    logThumbtackBodyDiagnostics({
      contentType,
      contentEncoding,
      byteLength,
      parseOk: false,
      parseErrorClass: err instanceof Error ? err.constructor.name : "UnknownError",
    });
    await maybeAlertOwnerOfThumbtackSaveFailure("malformed_json");
    return new Response("Malformed JSON body", { status: 400 });
  }

  const negotiationID = negotiationIdForLogging(body);
  const eventType = getThumbtackEventType(body);

  if (eventType === "MESSAGE") {
    logThumbtackDelivery("ignored", negotiationID);
    return new Response("Ignored", { status: 200 });
  }

  if (eventType === "UNKNOWN") {
    // A shape this receiver doesn't recognize at all (a Review event, or
    // anything else) — never a silent 2xx. Thumbtack's own delivery log
    // should show this as a failure so it actually gets noticed and this
    // file gets taught the real shape, rather than quietly losing what
    // might be a real Lead event that fell through the cracks.
    logThumbtackDelivery("failed", negotiationID);
    logThumbtackBodyDiagnostics({ contentType, contentEncoding, byteLength, parseOk: true, parsedBody: body });
    await maybeAlertOwnerOfThumbtackSaveFailure("unrecognized_shape");
    return new Response("Unrecognized event shape", { status: 422 });
  }

  const parsed = parseThumbtackLeadBody(body);
  if (!parsed) {
    logThumbtackDelivery("failed", negotiationID);
    logThumbtackBodyDiagnostics({ contentType, contentEncoding, byteLength, parseOk: true, parsedBody: body });
    await maybeAlertOwnerOfThumbtackSaveFailure("missing_negotiation_id");
    return new Response("Missing negotiationID", { status: 400 });
  }

  try {
    const result = await ingestThumbtackLead(parsed);
    logThumbtackDelivery(result.outcome, parsed.negotiationID);
    return new Response(result.outcome === "created" ? "Created" : "Duplicate", { status: 200 });
  } catch (err) {
    // A real save failure — never swallowed. Thumbtack's delivery log must
    // show this as a failure, never a silent 2xx (item 9's own rule).
    logThumbtackDelivery("failed", parsed.negotiationID);
    logThumbtackBodyDiagnostics({ contentType, contentEncoding, byteLength, parseOk: true, parsedBody: body });
    console.error("[thumbtack-webhook] failed to save lead:", err instanceof Error ? err.message : err);
    await maybeAlertOwnerOfThumbtackSaveFailure("save_failed");
    return new Response("Failed to save lead", { status: 500 });
  }
}
