import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { getBusinessHours, isWithinBusinessHours } from "@/lib/businessHours";

export const AFTER_HOURS_AUTO_REPLY_SUBJECT = "Thanks for reaching out — Mama's Cleaning Crew";
export const AFTER_HOURS_AUTO_REPLY_MESSAGE =
  "Hi, thank you for contacting Mama's Cleaning Crew! We're currently closed, but someone " +
  "will be with you during our normal business hours, Monday through Friday, 8am to 5pm " +
  "Pacific. We look forward to helping you.";

// Fires once per Lead, only called from the public lead-form submission path
// (submitLeadAction) — never from a staff-entered lead (createManualLeadAction)
// or one auto-created from a quote a staffer just built (syncLeadFromQuote),
// since a human is already in the loop for both of those the moment they're
// created. Text if a phone number was given, email otherwise (both are
// required on the public form today, so in practice this is always a text —
// the email branch only matters if that ever changes, or for some other
// future caller of this function).
//
// Never repeats for the same lead: Lead.autoReplySentAt is claimed with a
// conditional update *before* the send attempt, so even calling this twice
// for the same row can't double-send — the second call's claim affects zero
// rows and returns immediately, success or failure of the first attempt
// notwithstanding (this fires once, it does not retry a failed attempt).
export async function maybeSendAfterHoursAutoReply(
  lead: { id: string; email: string; phone: string },
  now: Date = new Date()
): Promise<void> {
  const config = await getBusinessHours();
  if (isWithinBusinessHours(now, config)) return;

  const claim = await prisma.lead.updateMany({
    where: { id: lead.id, autoReplySentAt: null },
    data: { autoReplySentAt: now },
  });
  if (claim.count === 0) return; // already handled (or somehow already claimed)

  // Never send to an existing client (someone with a prior Won lead on
  // file) or an employee — matched by exact email/phone string equality
  // against Lead/User records. This is a best-effort match, not a
  // normalized one: a phone typed in a different format than what's on
  // file for that person won't match.
  const [existingClient, employee] = await Promise.all([
    prisma.lead.findFirst({
      where: {
        id: { not: lead.id },
        stage: "WON",
        OR: [
          { email: { equals: lead.email, mode: "insensitive" } },
          ...(lead.phone.trim() ? [{ phone: lead.phone }] : []),
        ],
      },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: lead.email, mode: "insensitive" } },
          ...(lead.phone.trim() ? [{ phone: lead.phone }] : []),
        ],
      },
      select: { id: true },
    }),
  ]);
  if (existingClient || employee) return; // claimed above, so this still never fires again

  const hasPhone = !!lead.phone.trim();
  const hasEmail = !!lead.email.trim();
  const channel: "SMS" | "EMAIL" | null = hasPhone ? "SMS" : hasEmail ? "EMAIL" : null;
  if (!channel) return;

  const result =
    channel === "SMS"
      ? await sendSms({ to: lead.phone, text: AFTER_HOURS_AUTO_REPLY_MESSAGE })
      : await sendEmail({
          to: lead.email,
          subject: AFTER_HOURS_AUTO_REPLY_SUBJECT,
          body: AFTER_HOURS_AUTO_REPLY_MESSAGE,
        });

  // Logged on the lead record (LeadCommunication) same as every other
  // outbound message to this lead — sentById is null since no staff member
  // sent this one.
  await prisma.leadCommunication.create({
    data: {
      leadId: lead.id,
      channel,
      direction: "OUTBOUND",
      subject: channel === "EMAIL" ? AFTER_HOURS_AUTO_REPLY_SUBJECT : null,
      body: AFTER_HOURS_AUTO_REPLY_MESSAGE,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: null,
    },
  });
}
