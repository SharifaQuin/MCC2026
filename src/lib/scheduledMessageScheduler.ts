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
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

export async function runScheduledMessageSchedulerTick(now: Date = new Date()): Promise<void> {
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    include: {
      lead: { select: { email: true, phone: true } },
      applicant: { select: { email: true, phone: true } },
    },
  });

  for (const msg of due) {
    // Claim it before sending — if another tick somehow already claimed
    // (or an edit/cancel raced in) this row, count is 0 and we skip it
    // rather than risk sending the same message twice.
    const claim = await prisma.scheduledMessage.updateMany({
      where: { id: msg.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;

    const recipient = msg.lead ?? msg.applicant;
    if (!recipient) {
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: "FAILED", errorMessage: "Recipient no longer exists." },
      });
      continue;
    }

    const result =
      msg.channel === "EMAIL"
        ? await sendEmail({ to: recipient.email, subject: msg.subject ?? "", body: msg.body })
        : await sendSms({ to: recipient.phone, text: msg.body });

    await prisma.scheduledMessage.update({
      where: { id: msg.id },
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
  }
}
