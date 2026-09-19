import { prisma } from "@/lib/prisma";
import type { ApplicantStage, Prisma } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { generateInviteToken } from "@/lib/tokens";
import { generateNextEmployeeId } from "@/lib/employeeId";
import { createCalendarEvent } from "@/lib/calendar";
import { formatInBusinessTimezone } from "@/lib/timezone";

// Auto-scores an applicant's prescreen answers against the question bank's
// point values and returns whether they cleared the posting's threshold.
export async function scorePrescreenAnswers(
  jobPostingId: string,
  answers: { questionId: string; optionId: string }[]
) {
  const posting = await prisma.jobPosting.findUniqueOrThrow({
    where: { id: jobPostingId },
    include: { prescreenQuestions: { include: { options: true } } },
  });

  let score = 0;
  let maxScore = 0;
  for (const question of posting.prescreenQuestions) {
    const maxForQuestion = Math.max(0, ...question.options.map((o) => o.points));
    maxScore += maxForQuestion;
    const answer = answers.find((a) => a.questionId === question.id);
    const option = answer && question.options.find((o) => o.id === answer.optionId);
    if (option) score += option.points;
  }

  const scorePct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = scorePct >= posting.passThresholdPct;

  return { score, maxScore, scorePct, passed };
}

const APPLICANT_SOURCE_ALIASES: Record<string, "INDEED" | "ZIPRECRUITER" | "REFERRAL" | "WALK_IN"> = {
  indeed: "INDEED",
  zip: "ZIPRECRUITER",
  ziprecruiter: "ZIPRECRUITER",
  referral: "REFERRAL",
  walkin: "WALK_IN",
  "walk-in": "WALK_IN",
};

// Job-board postings (Indeed, ZipRecruiter) all point at the same shared
// /apply/[slug] link, so a query param (?src=indeed) is the only way to tell
// them apart from direct careers-page traffic.
export function parseApplicantSource(raw: string | null | undefined): "CAREERS_PAGE" | "INDEED" | "ZIPRECRUITER" | "REFERRAL" | "WALK_IN" {
  const key = (raw ?? "").trim().toLowerCase();
  return APPLICANT_SOURCE_ALIASES[key] ?? "CAREERS_PAGE";
}

// Pings the recruiting inbox whenever a new applicant lands in the pipeline —
// from the careers page, Indeed/ZipRecruiter (once those postings point at
// the shared /apply/[slug] link), or a manual entry — so nobody has to keep
// refreshing the pipeline board to notice. Best-effort: never blocks or
// throws, since a missed notification shouldn't fail the application itself.
export async function notifyNewApplicant(
  applicant: { id: string; firstName: string; lastName: string; email: string; phone: string },
  jobPostingTitle: string
) {
  const notifyEmail = process.env.RECRUITING_NOTIFY_EMAIL || process.env.MS_GRAPH_SENDER_EMAIL;
  if (!notifyEmail) return;

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    await sendEmail({
      to: notifyEmail,
      subject: `New applicant: ${applicant.firstName} ${applicant.lastName} — ${jobPostingTitle}`,
      body: [
        `${applicant.firstName} ${applicant.lastName} just applied for ${jobPostingTitle}.`,
        "",
        `Email: ${applicant.email}`,
        `Phone: ${applicant.phone}`,
        "",
        `View their profile: ${appUrl}/recruiting/applicants/${applicant.id}`,
      ].join("\n"),
    });
  } catch {
    // Swallow — a notification failure should never break the apply flow.
  }
}

// The one rejection email template — kept simple on purpose (one warm,
// generic message) rather than a per-stage variant. Applied whenever a
// recruiter chooses "Reject & Send Email" instead of typing something by
// hand each time.
export function rejectionEmailTemplate(firstName: string, jobPostingTitle: string) {
  return {
    subject: "Update on your application to Mama's Cleaning Crew",
    body: [
      `Hi ${firstName},`,
      "",
      `Thank you so much for taking the time to apply for the ${jobPostingTitle} position with Mama's Cleaning Crew, and for sharing more about yourself with us.`,
      "",
      "After careful consideration, we've decided to move forward with other candidates whose experience more closely matches what we're looking for right now.",
      "",
      "We really appreciate the time you invested in the process, and we'd love to keep your information on file for future openings that might be a better fit.",
      "",
      "Wishing you the best in your job search!",
      "",
      "Warmly,",
      "Mama's Cleaning Crew",
    ].join("\n"),
  };
}

// The two stages that represent an actual scheduled meeting rather than just
// a pipeline state — moving into either of these should capture a real date
// and time instead of just flipping a label.
export const SCHEDULING_STAGES: ApplicantStage[] = [
  "PHONE_INTERVIEW_SCHEDULED",
  "IN_PERSON_SCHEDULED",
];

export interface InterviewLogistics {
  address: string;
  phone: string;
  arrivalInstructionsEn: string;
  arrivalInstructionsEs: string;
}

const INTERVIEW_LOGISTICS_KEY = "recruiting:interviewLogistics";

// The office's address/phone/arrival instructions are the same for every
// in-person interview regardless of which posting it's for — only the
// position name in the email body changes per posting. Admin-editable (see
// /recruiting/settings) rather than hardcoded, so it doesn't need a code
// change if the office ever moves.
const DEFAULT_INTERVIEW_LOGISTICS: InterviewLogistics = {
  address: "1504 Brookhollow Dr. #120\nSanta Ana, CA 92705",
  phone: "949-485-4440",
  arrivalInstructionsEn:
    "When you arrive, you'll see building 1504. Our office door is directly in the middle and you'll see our company sign in the window. Please ring the door bell and someone will be with you momentarily.",
  arrivalInstructionsEs:
    "Al llegar, verá el edificio 1504. La puerta de nuestra oficina se encuentra justo en el centro y verá el letrero de la empresa en el escaparate; por favor, toque el timbre y alguien le atenderá en un momento.",
};

export async function getInterviewLogistics(): Promise<InterviewLogistics> {
  const row = await prisma.ownerSetting.findUnique({ where: { key: INTERVIEW_LOGISTICS_KEY } });
  if (!row) return DEFAULT_INTERVIEW_LOGISTICS;
  return { ...DEFAULT_INTERVIEW_LOGISTICS, ...(row.value as Partial<InterviewLogistics>) };
}

export async function saveInterviewLogistics(logistics: InterviewLogistics): Promise<void> {
  const value = { ...logistics } as unknown as Prisma.InputJsonValue;
  await prisma.ownerSetting.upsert({
    where: { key: INTERVIEW_LOGISTICS_KEY },
    create: { key: INTERVIEW_LOGISTICS_KEY, value },
    update: { value },
  });
}

// Puts the interview on the shared Outlook calendar and emails the applicant
// a calendar invite, so the interview shows up automatically instead of
// someone having to re-enter it by hand. Best-effort: never blocks or
// throws, since a calendar failure shouldn't undo the stage move.
export async function scheduleInterviewCalendarEvent(
  applicant: { firstName: string; lastName: string; email: string; phone: string },
  jobPostingTitle: string,
  stage: ApplicantStage,
  scheduledAt: Date
) {
  const calendarMailbox = process.env.RECRUITING_CALENDAR_MAILBOX;
  if (!calendarMailbox) return;

  const bodyLines = [
    `Interview with ${applicant.firstName} ${applicant.lastName} for ${jobPostingTitle}.`,
    "",
    `Phone: ${applicant.phone}`,
    `Email: ${applicant.email}`,
  ];

  // Zoom only makes sense for the phone/video stage, not an in-person one.
  if (stage === "PHONE_INTERVIEW_SCHEDULED") {
    const zoomPmi = process.env.RECRUITING_ZOOM_PMI;
    const zoomLink = zoomPmi
      ? `https://zoom.us/j/${zoomPmi.replace(/\D/g, "")}`
      : process.env.RECRUITING_ZOOM_LINK;
    if (zoomLink) {
      bodyLines.push("", `Join Zoom: ${zoomLink}`);
      const zoomPasscode = process.env.RECRUITING_ZOOM_PASSCODE;
      if (zoomPasscode) bodyLines.push(`Passcode: ${zoomPasscode}`);
    }
  }

  try {
    await createCalendarEvent({
      mailbox: calendarMailbox,
      subject: `${STAGE_LABELS[stage]} — ${applicant.firstName} ${applicant.lastName}`,
      startsAt: scheduledAt,
      body: bodyLines.join("\n"),
      attendeeEmail: applicant.email,
      attendeeName: `${applicant.firstName} ${applicant.lastName}`,
    });
  } catch {
    // Swallow — a calendar failure shouldn't block the stage move.
  }
}

// Emails the applicant a warm confirmation the moment an interview is
// scheduled — separate from the Outlook calendar invite, and specifically
// so it lands as a tracked entry in their communication thread, letting
// staff see (and search) that this went out without having to check Outlook.
// Best-effort: never blocks or throws, since an email failure shouldn't
// undo the stage move.
export async function sendInterviewConfirmationEmail(
  applicant: { id: string; firstName: string; lastName: string; email: string },
  jobPostingTitle: string,
  stage: ApplicantStage,
  scheduledAt: Date,
  loggedById: string,
  jobPostingTitleEs?: string | null
) {
  const whenText = `${formatInBusinessTimezone(scheduledAt)} Pacific Time`;

  let subject: string;
  let body: string;

  if (stage === "PHONE_INTERVIEW_SCHEDULED") {
    const bodyLines = [
      `Hi ${applicant.firstName},`,
      "",
      `We're so excited to see you for your phone interview for the ${jobPostingTitle} position!`,
      "",
      `When: ${whenText}`,
    ];

    const zoomPmi = process.env.RECRUITING_ZOOM_PMI;
    const zoomLink = zoomPmi
      ? `https://zoom.us/j/${zoomPmi.replace(/\D/g, "")}`
      : process.env.RECRUITING_ZOOM_LINK;
    if (zoomLink) {
      bodyLines.push(`Zoom link: ${zoomLink}`);
      const zoomPasscode = process.env.RECRUITING_ZOOM_PASSCODE;
      if (zoomPasscode) bodyLines.push(`Passcode: ${zoomPasscode}`);
    }

    bodyLines.push("", "See you soon!", "", "Mama's Cleaning Crew");

    subject = `Your interview with Mama's Cleaning Crew — ${whenText}`;
    body = bodyLines.join("\n");
  } else {
    // In-person invite — bilingual (English then Spanish) so it works
    // regardless of which language the applicant prefers, since there's no
    // stored language preference for applicants. Logistics (address/phone/
    // arrival instructions) are admin-editable and generic across every
    // posting; only the position name changes per job.
    const logistics = await getInterviewLogistics();
    const titleEs = jobPostingTitleEs || jobPostingTitle;

    body = [
      `Hi ${applicant.firstName},`,
      "",
      "Thank you for taking the time to speak with us! We're excited to invite you for an in-person interview for the " +
        `${jobPostingTitle} position at Mama's Cleaning Crew.`,
      "",
      `When: ${whenText}`,
      "",
      "Interview Details:",
      "",
      "📍 Location:",
      logistics.address,
      "",
      `📞 Contact: ${logistics.phone}`,
      "",
      "Arrival Instructions:",
      "",
      logistics.arrivalInstructionsEn,
      "",
      "Please arrive on time and come professionally dressed. If you have any questions or need to reschedule, feel free to reach out.",
      "",
      "We look forward to meeting you and learning more about how you can be a great addition to our team!",
      "",
      "—",
      "",
      "¡Gracias por tomarse el tiempo de hablar con nosotros! Nos entusiasma invitarle a una entrevista presencial " +
        `para el puesto de ${titleEs} en Mama's Cleaning Crew.`,
      "",
      "Detalles de la entrevista:",
      "",
      "📍 Ubicación:",
      logistics.address,
      "",
      `📞 Contacto: ${logistics.phone}`,
      "",
      "Instrucciones de llegada:",
      "",
      logistics.arrivalInstructionsEs,
      "",
      "Por favor, llegue a tiempo y vístase de manera profesional. Si tiene alguna pregunta o necesita reprogramar la entrevista, no dude en ponerse en contacto con nosotros.",
      "",
      "¡Esperamos conocerle y saber más sobre cómo podría ser una gran incorporación a nuestro equipo!",
      "",
      "Mama's Cleaning Crew",
    ].join("\n");

    subject = `Your in-person interview with Mama's Cleaning Crew — ${whenText}`;
  }

  try {
    const result = await sendEmail({ to: applicant.email, subject, body });
    await prisma.communicationLog.create({
      data: {
        applicantId: applicant.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        subject,
        body,
        status: result.ok ? "SENT" : "FAILED",
        errorMessage: result.ok ? null : result.error,
        sentById: loggedById,
      },
    });
  } catch (error) {
    await prisma.communicationLog.create({
      data: {
        applicantId: applicant.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        subject,
        body,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        sentById: loggedById,
      },
    });
  }
}

// Fired by interviewReminderScheduler one day before and again one hour
// before a scheduled interview — both by email and text, since either one
// might get missed. Includes a "Yes, I'll be there" link (the applicant's
// interviewConfirmToken) so staff can see who's confirmed without having to
// wait for a reply. Best-effort per channel: an SMS failure shouldn't block
// the email or vice versa, and neither should ever throw (called from the
// background scheduler tick, which must keep running regardless).
export async function sendInterviewReminder(
  applicant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    interviewConfirmToken: string | null;
  },
  jobPostingTitle: string,
  stage: ApplicantStage,
  scheduledAt: Date,
  reminderType: "day" | "hour",
  jobPostingTitleEs?: string | null
) {
  const whenText = `${formatInBusinessTimezone(scheduledAt)} Pacific Time`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const confirmLink = applicant.interviewConfirmToken
    ? `${appUrl}/interview-confirm/${applicant.interviewConfirmToken}`
    : null;
  const timeframeEn = reminderType === "day" ? "tomorrow" : "in about an hour";
  const timeframeEs = reminderType === "day" ? "mañana" : "en aproximadamente una hora";

  let subject: string;
  let emailBody: string;
  let smsBody: string;

  if (stage === "PHONE_INTERVIEW_SCHEDULED") {
    const bodyLines = [
      `Hi ${applicant.firstName},`,
      "",
      `Just a reminder — your phone interview with Mama's Cleaning Crew for the ${jobPostingTitle} position is ${timeframeEn}!`,
      "",
      `When: ${whenText}`,
    ];
    const zoomPmi = process.env.RECRUITING_ZOOM_PMI;
    const zoomLink = zoomPmi
      ? `https://zoom.us/j/${zoomPmi.replace(/\D/g, "")}`
      : process.env.RECRUITING_ZOOM_LINK;
    if (zoomLink) {
      bodyLines.push(`Zoom link: ${zoomLink}`);
      const zoomPasscode = process.env.RECRUITING_ZOOM_PASSCODE;
      if (zoomPasscode) bodyLines.push(`Passcode: ${zoomPasscode}`);
    }
    if (confirmLink) bodyLines.push("", `Please confirm you'll be joining: ${confirmLink}`);
    bodyLines.push("", "See you soon!", "", "Mama's Cleaning Crew");

    subject = `Reminder: your interview is ${timeframeEn} — ${whenText}`;
    emailBody = bodyLines.join("\n");

    const smsLines = [
      `Mama's Cleaning Crew: reminder that your phone interview for ${jobPostingTitle} is ${timeframeEn} (${whenText}).`,
    ];
    if (confirmLink) smsLines.push(`Please confirm: ${confirmLink}`);
    smsBody = smsLines.join(" ");
  } else {
    // In-person — bilingual (English then Spanish), matching
    // sendInterviewConfirmationEmail, for both the email and the text.
    const logistics = await getInterviewLogistics();
    const titleEs = jobPostingTitleEs || jobPostingTitle;

    const bodyLines = [
      `Hi ${applicant.firstName},`,
      "",
      `Just a reminder — your in-person interview with Mama's Cleaning Crew for the ${jobPostingTitle} position is ${timeframeEn}!`,
      "",
      `When: ${whenText}`,
      "",
      "📍 Location:",
      logistics.address,
      "",
      `📞 Contact: ${logistics.phone}`,
    ];
    if (confirmLink) bodyLines.push("", `Please confirm you'll be arriving: ${confirmLink}`);
    bodyLines.push(
      "",
      "We look forward to meeting you!",
      "",
      "—",
      "",
      `Hola ${applicant.firstName},`,
      "",
      `Solo un recordatorio — su entrevista presencial con Mama's Cleaning Crew para el puesto de ${titleEs} es ${timeframeEs}!`,
      "",
      `Cuándo: ${whenText}`,
      "",
      "📍 Ubicación:",
      logistics.address,
      "",
      `📞 Contacto: ${logistics.phone}`
    );
    if (confirmLink) bodyLines.push("", `Por favor confirme que llegará: ${confirmLink}`);
    bodyLines.push("", "¡Esperamos conocerle!", "", "Mama's Cleaning Crew");

    subject = `Reminder: your interview is ${timeframeEn} — ${whenText}`;
    emailBody = bodyLines.join("\n");

    const smsLines = [
      `Mama's Cleaning Crew: reminder — your in-person interview for ${jobPostingTitle} is ${timeframeEn} (${whenText}) at ${logistics.address.split("\n")[0]}.`,
    ];
    if (confirmLink) smsLines.push(`Please confirm / confirme: ${confirmLink}`);
    smsBody = smsLines.join(" ");
  }

  try {
    const result = await sendEmail({ to: applicant.email, subject, body: emailBody });
    await prisma.communicationLog.create({
      data: {
        applicantId: applicant.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        subject,
        body: emailBody,
        status: result.ok ? "SENT" : "FAILED",
        errorMessage: result.ok ? null : result.error,
      },
    });
  } catch (error) {
    await prisma.communicationLog.create({
      data: {
        applicantId: applicant.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        subject,
        body: emailBody,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }

  try {
    const result = await sendSms({ to: applicant.phone, text: smsBody });
    await prisma.communicationLog.create({
      data: {
        applicantId: applicant.id,
        channel: "SMS",
        direction: "OUTBOUND",
        body: smsBody,
        status: result.ok ? "SENT" : "FAILED",
        errorMessage: result.ok ? null : result.error,
      },
    });
  } catch (error) {
    await prisma.communicationLog.create({
      data: {
        applicantId: applicant.id,
        channel: "SMS",
        direction: "OUTBOUND",
        body: smsBody,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

// When an applicant is marked Hired, automatically create their training
// account and email them an invite — closes the loop between Recruiting and
// Training instead of leaving HR to separately invite them by hand. Safe to
// call more than once: does nothing once hiredUserId is already set.
export async function createEmployeeAccountForHiredApplicant(
  applicant: {
    id: string;
    hiredUserId: string | null;
    firstName: string;
    lastName: string;
    email: string;
  },
  invitedBy: string
) {
  if (applicant.hiredUserId) return;

  const existingUser = await prisma.user.findUnique({ where: { email: applicant.email } });
  if (existingUser) {
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { hiredUserId: existingUser.id },
    });
    return;
  }

  const inviteToken = generateInviteToken();
  const employeeId = await generateNextEmployeeId();
  const user = await prisma.user.create({
    data: {
      employeeId,
      email: applicant.email,
      name: `${applicant.firstName} ${applicant.lastName}`,
      role: "TRAINEE",
      inviteToken,
      inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      invitedBy,
    },
  });

  await prisma.applicant.update({
    where: { id: applicant.id },
    data: { hiredUserId: user.id },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  try {
    await sendEmail({
      to: applicant.email,
      subject: "Welcome to Mama's Cleaning Crew — set up your training account",
      body: [
        `Hi ${applicant.firstName},`,
        "",
        "Congratulations, and welcome to the team! To get started with your onboarding training, set up your account here:",
        "",
        `${appUrl}/invite/${inviteToken}`,
        "",
        "This link expires in 7 days — reach out if you need a new one.",
      ].join("\n"),
    });
  } catch {
    // Swallow — the account is created either way; the email is a convenience.
  }
}

// KPIs for the HR overview page and the top of the recruiting pipeline board.
export async function loadRecruitingDashboard() {
  const byStage = await prisma.applicant.groupBy({ by: ["stage"], _count: true });
  const counts = Object.fromEntries(byStage.map((s) => [s.stage, s._count])) as Record<
    string,
    number
  >;
  const total = byStage.reduce((sum, s) => sum + s._count, 0);
  const hired = counts.HIRED ?? 0;
  const rejected = counts.REJECTED ?? 0;
  const benched = counts.BENCH ?? 0;

  return {
    total,
    active: total - hired - rejected - benched,
    awaitingScheduling: counts.PRESCREEN_PASSED ?? 0,
    scheduledInterviews: (counts.PHONE_INTERVIEW_SCHEDULED ?? 0) + (counts.IN_PERSON_SCHEDULED ?? 0),
    offersOut: counts.OFFER_SENT ?? 0,
    hired,
    rejected,
    benched,
    counts,
  };
}

export const APPLICANT_SOURCE_LABELS: Record<string, string> = {
  CAREERS_PAGE: "Careers Page",
  INDEED: "Indeed",
  ZIPRECRUITER: "ZipRecruiter",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  OTHER: "Other",
};

// Applicant.stage only holds the CURRENT stage, not a history of every stage
// reached — so this can't reconstruct "how many from Indeed made it to an
// in-person interview before being rejected." What it can show honestly:
// where each source's applicants currently sit, and how many of them
// ultimately got hired — still useful for judging which sources are worth
// the spend.
export async function getApplicantFunnelBySource() {
  const rows = await prisma.applicant.groupBy({ by: ["source", "stage"], _count: true });

  const bySource = new Map<string, { total: number; hired: number; rejected: number; benched: number }>();
  for (const row of rows) {
    const entry = bySource.get(row.source) ?? { total: 0, hired: 0, rejected: 0, benched: 0 };
    entry.total += row._count;
    if (row.stage === "HIRED") entry.hired += row._count;
    if (row.stage === "REJECTED") entry.rejected += row._count;
    if (row.stage === "BENCH") entry.benched += row._count;
    bySource.set(row.source, entry);
  }

  return Array.from(bySource.entries())
    .map(([source, stats]) => ({
      source,
      label: APPLICANT_SOURCE_LABELS[source] ?? source,
      total: stats.total,
      active: stats.total - stats.hired - stats.rejected - stats.benched,
      hired: stats.hired,
      rejected: stats.rejected,
      benched: stats.benched,
      hireRatePct: stats.total > 0 ? Math.round((stats.hired / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export const STAGE_LABELS: Record<string, string> = {
  NEW: "New Applicant",
  PRESCREEN_FAILED: "Prescreen — Not a Fit",
  PRESCREEN_PASSED: "Prescreen Passed",
  PHONE_INTERVIEW_SCHEDULED: "Phone/Zoom Interview Scheduled",
  PHONE_INTERVIEW_PASSED: "Phone/Zoom Interview Passed",
  PHONE_INTERVIEW_FAILED: "Phone/Zoom Interview — Not Advancing",
  IN_PERSON_SCHEDULED: "In-Person Interview Scheduled",
  IN_PERSON_PASSED: "In-Person Interview Passed",
  IN_PERSON_FAILED: "In-Person Interview — Not Advancing",
  OFFER_SENT: "Offer Sent (via Gusto)",
  HIRED: "Hired",
  REJECTED: "Rejected",
  BENCH: "Benched for Future Openings",
};

export const STAGE_TONE: Record<string, string> = {
  NEW: "bg-neutral-100 text-neutral-600",
  PRESCREEN_FAILED: "bg-red-100 text-red-700",
  PRESCREEN_PASSED: "bg-green-100 text-green-700",
  PHONE_INTERVIEW_SCHEDULED: "bg-amber-100 text-amber-700",
  PHONE_INTERVIEW_PASSED: "bg-green-100 text-green-700",
  PHONE_INTERVIEW_FAILED: "bg-red-100 text-red-700",
  IN_PERSON_SCHEDULED: "bg-amber-100 text-amber-700",
  IN_PERSON_PASSED: "bg-green-100 text-green-700",
  IN_PERSON_FAILED: "bg-red-100 text-red-700",
  OFFER_SENT: "bg-brand-100 text-brand-700",
  HIRED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  BENCH: "bg-neutral-100 text-neutral-600",
};

// The main forward-moving columns for the pipeline board. REJECTED/BENCH/
// *_FAILED are shown in a separate "Needs a Decision" strip instead of as
// board columns, since they're off-ramps rather than the happy path.
export const PIPELINE_COLUMNS: { stage: string; label: string }[] = [
  { stage: "NEW", label: "New" },
  { stage: "PRESCREEN_PASSED", label: "Prescreen Passed" },
  { stage: "PHONE_INTERVIEW_SCHEDULED", label: "Phone/Zoom Scheduled" },
  { stage: "PHONE_INTERVIEW_PASSED", label: "Phone/Zoom Passed" },
  { stage: "IN_PERSON_SCHEDULED", label: "In-Person Scheduled" },
  { stage: "IN_PERSON_PASSED", label: "In-Person Passed" },
  { stage: "OFFER_SENT", label: "Offer Sent" },
  { stage: "HIRED", label: "Hired" },
];

export const NEEDS_DECISION_STAGES: ApplicantStage[] = [
  "PRESCREEN_FAILED",
  "PHONE_INTERVIEW_FAILED",
  "IN_PERSON_FAILED",
];
export const ARCHIVED_STAGES: ApplicantStage[] = ["REJECTED", "BENCH"];

// The one obvious "move it forward" action for each pipeline-board column,
// shown as a single quick-action button on each card. Anything else (fail,
// reject, bench) still lives on the applicant's own detail page.
export const PRIMARY_NEXT_STAGE: Record<string, { stage: string; label: string } | undefined> = {
  NEW: { stage: "PRESCREEN_PASSED", label: "Pass Prescreen" },
  PRESCREEN_PASSED: { stage: "PHONE_INTERVIEW_SCHEDULED", label: "Schedule Phone/Zoom" },
  PHONE_INTERVIEW_SCHEDULED: { stage: "PHONE_INTERVIEW_PASSED", label: "Mark Passed" },
  PHONE_INTERVIEW_PASSED: { stage: "IN_PERSON_SCHEDULED", label: "Schedule In-Person" },
  IN_PERSON_SCHEDULED: { stage: "IN_PERSON_PASSED", label: "Mark Passed" },
  IN_PERSON_PASSED: { stage: "OFFER_SENT", label: "Send Offer (Gusto)" },
  OFFER_SENT: { stage: "HIRED", label: "Mark Hired" },
};

// ── Hiring Toolkit content (Lead/Assistant Cleaning Technician track) ──
// Sourced directly from the Mama's Cleaning Crew Hiring & Onboarding Toolkit
// (Part 4.1, Part 4.3, Form 3/4, Form 5) — the standard bilingual phone-
// screen script, structured-interview question bank, and scorecards. Seeded
// onto every new job posting so every candidate for the same posting gets
// the same questions in the same order (the toolkit's core "consistency is
// fairness" principle); editable per posting afterward.

export const DEFAULT_PHONE_SCREEN_QUESTIONS: { textEn: string; textEs: string }[] = [
  {
    textEn: "Tell me about your cleaning experience over the last two years.",
    textEs: "Cuénteme sobre su experiencia en limpieza en los últimos dos años.",
  },
  {
    textEn: "What's drawing you to Mama's Cleaning Crew specifically?",
    textEs: "¿Qué le atrae de Mama's Cleaning Crew específicamente?",
  },
  {
    textEn: "Do you have a reliable vehicle, valid California driver's license, and active insurance?",
    textEs: "¿Tiene un vehículo confiable, licencia de conducir válida de California y seguro activo?",
  },
  {
    textEn: "Our service area runs from Long Beach to San Clemente. Are you able to travel the full area?",
    textEs: "Nuestra área de servicio va desde Long Beach hasta San Clemente. ¿Puede viajar a toda el área?",
  },
  {
    textEn: "This role means working the same partner every day, in clients' homes. How does that sound to you?",
    textEs: "Este puesto significa trabajar con el mismo compañero todos los días, en casas de clientes. ¿Cómo le suena eso?",
  },
  { textEn: "What hourly pay are you looking for?", textEs: "¿Qué salario por hora está buscando?" },
  { textEn: "When could you start if we moved forward?", textEs: "¿Cuándo podría empezar si avanzamos?" },
  { textEn: "What questions do you have for me?", textEs: "¿Qué preguntas tiene para mí?" },
];

// The Phone Screen Form's pass/fail hard-requirement checklist — stored as
// [{label, checked}] on PhoneScreenResult.criteriaChecklist rather than
// fixed columns, so wording can be tweaked without a migration.
export const DEFAULT_PHONE_SCREEN_CRITERIA: string[] = [
  "Available Monday through Friday from 8am to 6pm",
  "Has reliable transportation to office and job sites",
  "Comfortable working in customers' homes",
  "Work authorization confirmed",
  "Compensation expectations align with role",
];

export const PHONE_SCREEN_OUTCOME_LABELS: Record<string, string> = {
  PROCEED: "Proceed to In-Person Interview",
  HOLD: "Hold — Request Additional Information",
  DECLINE: "Decline — Does Not Meet Screening Criteria",
};

interface DefaultInterviewQuestion {
  competency: string;
  textEn: string;
  textEs: string;
  whatToListenFor: string;
  roleScope: "ALL" | "LEAD_ONLY" | "ASSISTANT_ONLY";
}

// 6 core questions (asked of every candidate) + 2 Lead-differentiated + 2
// Assistant-differentiated (Part 4.3). For a Track B posting (roleTrack
// OTHER — role not yet decided), the UI shows both differentiated sets, per
// the toolkit's own instruction: "If unsure (Track B), ask both sets."
export const DEFAULT_INTERVIEW_QUESTIONS: DefaultInterviewQuestion[] = [
  {
    competency: "Attention to Detail / Task Execution",
    textEn:
      "Tell me about a time you caught something in a cleaning job that almost got missed. What was it, and how did you catch it?",
    textEs:
      "Cuénteme de una vez que encontró algo en un trabajo de limpieza que casi se le pasaba. ¿Qué fue, y cómo lo notó?",
    whatToListenFor:
      "Specific example. Describes the detail (not generic). Shows self-check habits. Bonus: describes what they now do differently.",
    roleScope: "ALL",
  },
  {
    competency: "Integrity & Trust",
    textEn:
      "You're cleaning alone in a client's home and you accidentally break something — something that wasn't expensive, and no one would know. Walk me through what you do.",
    textEs:
      "Está limpiando solo en casa de un cliente y accidentalmente rompe algo — algo que no era caro, y nadie se daría cuenta. Cuénteme qué hace.",
    whatToListenFor:
      "Immediate report. No hesitation. Specific about whom they would tell (Lead, Service Manager, client).",
    roleScope: "ALL",
  },
  {
    competency: "Partner Compatibility",
    textEn:
      "Tell me about a coworker you didn't naturally click with but had to work closely with. How did you handle it?",
    textEs:
      "Cuénteme de un compañero de trabajo con quien no se llevaba naturalmente bien pero con quien tuvo que trabajar de cerca. ¿Cómo lo manejó?",
    whatToListenFor:
      "No blame. Describes what they did, not what the other person should have done. Signs of perspective-taking.",
    roleScope: "ALL",
  },
  {
    competency: "Customer Orientation",
    textEn:
      "A client is home while you're cleaning, and they keep asking you to add small things to what you're already doing. How do you handle it?",
    textEs:
      "Un cliente está en casa mientras usted limpia, y le sigue pidiendo que haga cositas extras fuera del servicio acordado. ¿Cómo lo maneja?",
    whatToListenFor:
      "Warmth without overcommitting. Knows when to say yes, when to check. Doesn't get flustered. Doesn't complain about clients.",
    roleScope: "ALL",
  },
  {
    competency: "Reliability",
    textEn:
      "Walk me through what a normal morning looks like for you before work — getting up, getting ready, getting to the office on time.",
    textEs:
      "Cuénteme cómo es una mañana normal suya antes del trabajo — levantarse, prepararse, llegar a la oficina a tiempo.",
    whatToListenFor: "A real routine. Thought about contingencies (traffic, childcare). Not 'I just wake up and come in.'",
    roleScope: "ALL",
  },
  {
    competency: "Physical Stamina",
    textEn:
      "This work is physical — 8 hours of being on your feet, bending, lifting. Tell me about your experience with that kind of work and how you take care of your body.",
    textEs:
      "Este trabajo es físico — 8 horas de estar de pie, agachándose, levantando cosas. Cuénteme de su experiencia con ese tipo de trabajo y cómo cuida su cuerpo.",
    whatToListenFor:
      "Realistic understanding. Mentions stretching, hydration, rest, pacing. Not dismissive ('I can handle anything').",
    roleScope: "ALL",
  },
  {
    competency: "Ownership / On-Site Judgment",
    textEn:
      "You arrive at a home and the condition is much worse than expected — maybe double the work you were scheduled for. Your partner is looking to you. What do you do first, and what happens next?",
    textEs:
      "Llega a una casa y la condición es mucho peor de lo esperado — quizás el doble de trabajo del que estaba programado. Su compañero le mira esperando. ¿Qué hace primero, y qué sigue?",
    whatToListenFor:
      "Assesses first, communicates (client + office), adjusts plan, doesn't panic, doesn't shortcut. Good answer: 'I'd look it over, call the office to check the scope, tell my partner what we're doing, and then get moving.'",
    roleScope: "LEAD_ONLY",
  },
  {
    competency: "Coaching",
    textEn:
      "You notice your partner has been rushing through bathrooms and leaving small things undone. It's been happening for a couple of days. How do you bring it up?",
    textEs:
      "Nota que su compañero ha estado apurándose en los baños y dejando cositas sin terminar. Ha pasado por un par de días. ¿Cómo se lo habla?",
    whatToListenFor:
      "Direct but respectful. Timing (not in front of a client). Specific (not 'you're doing a bad job'). Problem-solving tone. Shows rather than just tells.",
    roleScope: "LEAD_ONLY",
  },
  {
    competency: "Coachability",
    textEn:
      "Tell me about a time someone corrected how you were doing something at work. What happened, and how did you respond?",
    textEs:
      "Cuénteme de una vez que alguien le corrigió cómo estaba haciendo algo en el trabajo. ¿Qué pasó, y cómo respondió?",
    whatToListenFor:
      "Doesn't get defensive. Can name what they learned. Thanks the person or acknowledges it helped. Applies the correction.",
    roleScope: "ASSISTANT_ONLY",
  },
  {
    competency: "Initiative",
    textEn: "You finish your assigned tasks early at a home and your Lead is still working. What do you do?",
    textEs: "Termina sus tareas asignadas temprano en una casa y su Lead sigue trabajando. ¿Qué hace?",
    whatToListenFor:
      "Asks what to do next, looks for what else needs attention, helps with Lead's area, doesn't sit or check phone. Lead-readiness signal: proactively identifies something useful.",
    roleScope: "ASSISTANT_ONLY",
  },
];

// Creates the standard phone-screen + structured-interview question banks
// on a newly created job posting. Best-effort in the sense that it's only
// ever called once, right after posting creation — staff can freely edit,
// reorder, or delete questions afterward per posting.
export async function seedDefaultHiringQuestions(jobPostingId: string) {
  await prisma.phoneScreenQuestion.createMany({
    data: DEFAULT_PHONE_SCREEN_QUESTIONS.map((q, i) => ({
      jobPostingId,
      order: i + 1,
      textEn: q.textEn,
      textEs: q.textEs,
    })),
  });
  await prisma.interviewQuestion.createMany({
    data: DEFAULT_INTERVIEW_QUESTIONS.map((q, i) => ({
      jobPostingId,
      order: i + 1,
      competency: q.competency,
      textEn: q.textEn,
      textEs: q.textEs,
      whatToListenFor: q.whatToListenFor,
      roleScope: q.roleScope,
    })),
  });
}

// Structured Interview Scorecard's competency list (Form 3 for Lead, Form 4
// for Assistant) — differs by role, hence a lookup rather than fixed
// columns. Track B (roleTrack OTHER, role not yet decided) defaults to the
// Lead list: it's the closer superset of generic professional competencies,
// and role assignment itself happens via the Lead vs. Assistant
// Differentiation Worksheet before the working session, not this scorecard.
export const INTERVIEW_SCORECARD_COMPETENCIES: Record<string, string[]> = {
  LEAD_TECHNICIAN: [
    "Integrity & Trust",
    "Reliability & Punctuality",
    "Customer Orientation",
    "Quality & Attention to Detail",
    "Pair Leadership",
    "Judgment & Problem-Solving",
  ],
  ASSISTANT_TECHNICIAN: [
    "Integrity & Trust",
    "Reliability & Punctuality",
    "Customer Orientation",
    "Coachability",
    "Work Ethic & Pace",
    "Pair Compatibility",
  ],
  OTHER: [
    "Integrity & Trust",
    "Reliability & Punctuality",
    "Customer Orientation",
    "Quality & Attention to Detail",
    "Pair Leadership",
    "Judgment & Problem-Solving",
  ],
};

export const INTERVIEW_RECOMMENDATION_LABELS: Record<string, string> = {
  STRONG_HIRE: "Strong Hire",
  HIRE: "Hire",
  NO_HIRE: "No Hire",
  STRONG_NO_HIRE: "Strong No Hire",
};

// Working Session Pre-Day Checklist (Form 5), condensed to the items a
// recruiter actually checks off before the session — stored as
// [{label, checked}] on WorkingSessionRecord.preSessionChecklist.
export const WORKING_SESSION_CHECKLIST_ITEMS: string[] = [
  "Client(s) notified that an additional person will be observing/participating",
  "Client(s) given option to opt out (some clients prefer not to have observers)",
  "Confirm scope of work for the day",
  "Candidate confidentiality agreement signed",
  "Candidate provided with company shirt or identifier",
  "Candidate has reliable transportation to office or first home",
  "Candidate aware of timing, dress code, and what to bring",
  "Candidate informed they will be paid at standard hourly rate",
  "Lead briefed on evaluation criteria",
  "Lead understands their role: observe, coach as needed, NOT supervise the entire day",
  "Paid hours arranged in payroll system",
  "Debrief time scheduled with candidate after session",
];

export const REFERENCE_VERDICT_LABELS: Record<string, string> = {
  STRONG_POSITIVE: "Strong positive — supports hiring",
  GENERALLY_POSITIVE: "Generally positive — minor concerns to discuss",
  MIXED: "Mixed — significant concerns to weigh",
  NEGATIVE: "Negative — supports not hiring",
};

// The standard post-Hire onboarding checklist — shown once an applicant
// reaches the Hired stage. Items marked autoDetectable get checked off on
// their own the moment the underlying data says they're done (see
// syncOnboardingChecklist); everything else is a plain manual checkbox.
export const ONBOARDING_CHECKLIST_ITEMS: { key: string; label: string; autoDetectable: boolean }[] = [
  { key: "offer_letter", label: "Offer letter signed", autoDetectable: true },
  { key: "references", label: "Background/references checked", autoDetectable: true },
  { key: "onboarding_docs", label: "Onboarding paperwork signed (I-9, policies, etc.)", autoDetectable: true },
  { key: "payroll", label: "Added to payroll system", autoDetectable: false },
  { key: "uniform", label: "Uniform ordered", autoDetectable: false },
  { key: "first_day", label: "First day scheduled", autoDetectable: true },
  { key: "pair_assigned", label: "Trainer/pair assigned", autoDetectable: true },
];

// Checks each auto-detectable item against the data that already tracks it
// and marks it completed the moment it's satisfied — never un-completes an
// item, so a manual override always sticks until the item is unchecked by
// hand again. No-op for an applicant who isn't hired yet (hiredUserId null).
async function syncOnboardingChecklist(applicantId: string) {
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: {
      hiredUserId: true,
      referenceChecks: { select: { id: true } },
    },
  });
  if (!applicant?.hiredUserId) return;
  const hiredUserId = applicant.hiredUserId;

  const [hiredUser, onboardingAssignments, offerLetterSigned, activePair, existingRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: hiredUserId }, select: { hireDate: true } }),
    prisma.onboardingAssignment.findMany({ where: { userId: hiredUserId }, select: { signedAt: true } }),
    prisma.signedDocument.findFirst({
      where: {
        employeeId: hiredUserId,
        signedAt: { not: null },
        template: { title: { contains: "offer", mode: "insensitive" } },
      },
      select: { id: true },
    }),
    prisma.pair.findFirst({
      where: { active: true, OR: [{ leadId: hiredUserId }, { assistantId: hiredUserId }] },
      select: { id: true },
    }),
    prisma.onboardingChecklistItem.findMany({ where: { applicantId }, select: { itemKey: true, completed: true } }),
  ]);

  const alreadyCompleted = new Set(existingRows.filter((r) => r.completed).map((r) => r.itemKey));

  const autoSatisfied: Record<string, boolean> = {
    offer_letter: !!offerLetterSigned,
    references: applicant.referenceChecks.length >= 2,
    onboarding_docs: onboardingAssignments.length > 0 && onboardingAssignments.every((a) => a.signedAt),
    first_day: !!hiredUser?.hireDate,
    pair_assigned: !!activePair,
  };

  for (const item of ONBOARDING_CHECKLIST_ITEMS) {
    if (!item.autoDetectable) continue;
    if (alreadyCompleted.has(item.key)) continue;
    if (!autoSatisfied[item.key]) continue;

    await prisma.onboardingChecklistItem.upsert({
      where: { applicantId_itemKey: { applicantId, itemKey: item.key } },
      create: { applicantId, itemKey: item.key, completed: true, completedAt: new Date() },
      update: { completed: true, completedAt: new Date() },
    });
  }
}

export interface OnboardingChecklistItemView {
  key: string;
  label: string;
  autoDetectable: boolean;
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
}

// Syncs auto-detectable items, then returns the full checklist (auto items
// plus manual-only items) in a fixed display order for the applicant's
// Onboarding tab. Returns an empty array for an applicant who isn't hired.
export async function getOnboardingChecklist(applicantId: string): Promise<OnboardingChecklistItemView[]> {
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { hiredUserId: true },
  });
  if (!applicant?.hiredUserId) return [];

  await syncOnboardingChecklist(applicantId);

  const rows = await prisma.onboardingChecklistItem.findMany({
    where: { applicantId },
    include: { completedBy: { select: { name: true } } },
  });
  const rowsByKey = new Map(rows.map((r) => [r.itemKey, r]));

  return ONBOARDING_CHECKLIST_ITEMS.map((item) => {
    const row = rowsByKey.get(item.key);
    return {
      key: item.key,
      label: item.label,
      autoDetectable: item.autoDetectable,
      completed: row?.completed ?? false,
      completedAt: row?.completedAt ? row.completedAt.toISOString() : null,
      completedByName: row?.completedBy?.name ?? null,
    };
  });
}

export async function setOnboardingChecklistItem(
  applicantId: string,
  itemKey: string,
  completed: boolean,
  completedById: string
) {
  if (!ONBOARDING_CHECKLIST_ITEMS.some((item) => item.key === itemKey)) return;

  await prisma.onboardingChecklistItem.upsert({
    where: { applicantId_itemKey: { applicantId, itemKey } },
    create: {
      applicantId,
      itemKey,
      completed,
      completedAt: completed ? new Date() : null,
      completedById: completed ? completedById : null,
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
      completedById: completed ? completedById : null,
    },
  });
}
