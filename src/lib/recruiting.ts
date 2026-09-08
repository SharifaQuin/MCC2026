import { prisma } from "@/lib/prisma";
import type { ApplicantStage } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { generateInviteToken } from "@/lib/tokens";

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

// The two stages that represent an actual scheduled meeting rather than just
// a pipeline state — moving into either of these should capture a real date
// and time instead of just flipping a label.
export const SCHEDULING_STAGES: ApplicantStage[] = [
  "PHONE_INTERVIEW_SCHEDULED",
  "IN_PERSON_SCHEDULED",
];

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
  const user = await prisma.user.create({
    data: {
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
