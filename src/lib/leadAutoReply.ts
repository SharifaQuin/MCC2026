import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { getBusinessHours, isWithinBusinessHours } from "@/lib/businessHours";
import { normalizePhoneDigits } from "@/lib/formatPhone";

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
  // file) or an employee. Email matches on an indexed, cheap query first;
  // phone only falls back to pulling the (small-business-sized) candidate
  // list because comparing it needs digit-normalization — "(555) 123-4567"
  // vs "5551234567" vs "+15551234567" should all match — which isn't
  // something a plain column equality check can do.
  const { existingClient, employee } = await findExistingClientOrEmployee(lead.email, lead.phone, lead.id);
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

// Email match is tried first via a cheap, indexed query — most matches
// resolve there. Phone only falls back to pulling the candidate list (every
// Won lead and every User) because comparing it needs digit-normalization,
// which a plain column equality check can't do. Fine at this app's scale;
// revisit if either table ever gets large enough for that fallback fetch to
// matter.
async function findExistingClientOrEmployee(
  email: string,
  phone: string,
  excludeLeadId: string
): Promise<{ existingClient: boolean; employee: boolean }> {
  const [clientByEmail, employeeByEmail] = await Promise.all([
    prisma.lead.findFirst({
      where: { id: { not: excludeLeadId }, stage: "WON", email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (clientByEmail || employeeByEmail) {
    return { existingClient: !!clientByEmail, employee: !!employeeByEmail };
  }

  const phoneDigits = normalizePhoneDigits(phone);
  if (phoneDigits.size === 0) return { existingClient: false, employee: false };

  const matchesPhone = (candidate: string | null) =>
    !!candidate && [...normalizePhoneDigits(candidate)].some((d) => phoneDigits.has(d));

  const [clientCandidates, employeeCandidates] = await Promise.all([
    prisma.lead.findMany({
      where: { id: { not: excludeLeadId }, stage: "WON" },
      select: { phone: true },
    }),
    prisma.user.findMany({ select: { phone: true } }),
  ]);

  return {
    existingClient: clientCandidates.some((c) => matchesPhone(c.phone)),
    employee: employeeCandidates.some((u) => matchesPhone(u.phone)),
  };
}
