// Checked every 60s by the interval set up in src/instrumentation.ts.
// Sends every ScheduledMessage whose sendAt has arrived, then logs the
// outcome onto the same Lead/Applicant communication history the
// instant-send actions already write to (LeadCommunication /
// CommunicationLog) — so a scheduled send looks identical to a manual one
// once it's gone out.
//
// A failed send is terminal: status moves to FAILED and this tick's own
// query (status: "PENDING") never looks at that row again. Nothing here
// retries a failed send — a human notices it on the Scheduled list and
// decides whether to send it again by hand.
import { prisma } from "@/lib/prisma";
import { DEFAULT_SENDERS, type MessageSenders } from "@/lib/messageSenders";

// A row only sits in SENDING for as long as one claim's own send call takes
// — normally well under a second. Nothing else ever moves a row out of
// SENDING, so one still there this much later was orphaned by a crash or
// restart mid-send, not a slow send in progress. Reconciled to FAILED (see
// reconcileStaleSendingRows) rather than left invisible forever or
// auto-resent.
const STALE_SENDING_MS = 5 * 60 * 1000;

export async function runScheduledMessageSchedulerTick(
  now: Date = new Date(),
  senders: MessageSenders = DEFAULT_SENDERS
): Promise<void> {
  await reconcileStaleSendingRows(now);

  // Only ids here — every field actually used to send is re-read fresh at
  // claim time in processScheduledMessage, so nothing about the payload can
  // go stale between this query and that claim.
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    select: { id: true },
  });

  for (const { id } of due) {
    await processScheduledMessage(id, now, senders);
  }
}

async function reconcileStaleSendingRows(now: Date): Promise<void> {
  const staleCutoff = new Date(now.getTime() - STALE_SENDING_MS);
  const stale = await prisma.scheduledMessage.findMany({
    where: { status: "SENDING", updatedAt: { lte: staleCutoff } },
    select: { id: true },
  });
  for (const { id } of stale) {
    // Guard on status: "SENDING" so this can't clobber a row a concurrent,
    // still-legitimately-in-flight send just finished.
    await prisma.scheduledMessage.updateMany({
      where: { id, status: "SENDING" },
      data: {
        status: "FAILED",
        errorMessage: "Send was interrupted (likely a server restart) and was not retried automatically.",
      },
    });
  }
}

// Claims and sends exactly one message. Exported so tests can exercise the
// claim/send/record sequence for a single id directly — including the
// "edited or rescheduled between the outer query and this claim" race,
// which needs to mutate the row in that exact gap, something a test can't
// reliably force by calling the tick function alone.
export async function processScheduledMessage(id: string, now: Date, senders: MessageSenders = DEFAULT_SENDERS): Promise<void> {
  try {
    // Atomic claim, re-checked against the row's *current* sendAt, not the
    // value read by the tick's outer query — if an edit pushed sendAt into
    // the future (or a cancel landed) after that query but before this
    // claim, this WHERE no longer matches, claim.count is 0, and the
    // message is correctly skipped rather than sent with stale data.
    const claim = await prisma.scheduledMessage.updateMany({
      where: { id, status: "PENDING", sendAt: { lte: now } },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) return;

    // Re-read *after* the claim, not before — editScheduledMessageAction and
    // cancelScheduledMessageAction both guard on status: "PENDING", so once
    // the claim above has moved this row to SENDING, neither can touch it
    // anymore. This read is guaranteed to be the final payload.
    const msg = await prisma.scheduledMessage.findUniqueOrThrow({
      where: { id },
      include: {
        lead: { select: { email: true, phone: true } },
        applicant: { select: { email: true, phone: true } },
      },
    });

    const recipient = msg.lead ?? msg.applicant;
    if (!recipient) {
      await prisma.scheduledMessage.update({
        where: { id },
        data: { status: "FAILED", errorMessage: "Recipient no longer exists." },
      });
      return;
    }

    let result: { ok: true } | { ok: false; error: string };
    try {
      result =
        msg.channel === "EMAIL"
          ? await senders.sendEmail({ to: recipient.email, subject: msg.subject ?? "", body: msg.body })
          : await senders.sendSms({ to: recipient.phone, text: msg.body });
    } catch (err) {
      // sendEmail/sendSms threw instead of returning { ok: false } (e.g. an
      // unexpected network error) — treated exactly like a graceful
      // failure from here on: visible on the Scheduled list, terminal,
      // never retried.
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: {
        status: result.ok ? "SENT" : "FAILED",
        sentAt: result.ok ? new Date() : null,
        errorMessage: result.ok ? null : result.error,
      },
    });

    if (msg.leadId) {
      await prisma.leadCommunication.create({
        data: {
          leadId: msg.leadId,
          channel: msg.channel,
          direction: "OUTBOUND",
          subject: msg.subject,
          body: msg.body,
          status: result.ok ? "SENT" : "FAILED",
          errorMessage: result.ok ? null : result.error,
          sentById: msg.createdById,
        },
      });
    } else if (msg.applicantId) {
      await prisma.communicationLog.create({
        data: {
          applicantId: msg.applicantId,
          channel: msg.channel,
          direction: "OUTBOUND",
          subject: msg.subject,
          body: msg.body,
          status: result.ok ? "SENT" : "FAILED",
          errorMessage: result.ok ? null : result.error,
          sentById: msg.createdById,
        },
      });
    }
  } catch (err) {
    // Anything else unexpected for this one message (a DB hiccup, etc.) —
    // never let it abort the rest of the tick's batch. Best-effort mark it
    // failed so it doesn't sit invisible; if even this update fails, the
    // stale-SENDING reconciliation above will catch it on a later tick.
    console.error(`[scheduledMessageScheduler] message ${id} failed unexpectedly:`, err);
    await prisma.scheduledMessage
      .updateMany({
        where: { id, status: "SENDING" },
        data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) },
      })
      .catch(() => {});
  }
}
