// Checked every 60s by the interval set up in src/instrumentation.ts. Unlike
// the other tick modules (which fire at a fixed clock time), each applicant
// has their own target time — their interview's scheduledAt — so instead of
// an in-memory "did we already fire this minute" key, the "already sent"
// state is persisted per applicant (interviewReminderDaySentAt /
// interviewReminderHourSentAt) so it survives a server restart and never
// double-sends. Best-effort throughout: sendInterviewReminder never throws.
import { prisma } from "@/lib/prisma";
import { SCHEDULING_STAGES, sendInterviewReminder } from "@/lib/recruiting";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export async function runInterviewReminderSchedulerTick(now: Date = new Date()): Promise<void> {
  const dayCandidates = await prisma.applicant.findMany({
    where: {
      stage: { in: SCHEDULING_STAGES },
      scheduledAt: { gt: now, lte: new Date(now.getTime() + DAY_MS) },
      interviewReminderDaySentAt: null,
    },
    include: { jobPosting: { select: { titleEn: true, titleEs: true } } },
  });

  for (const applicant of dayCandidates) {
    await sendInterviewReminder(
      applicant,
      applicant.jobPosting.titleEn,
      applicant.stage,
      applicant.scheduledAt!,
      "day",
      applicant.jobPosting.titleEs
    );
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { interviewReminderDaySentAt: new Date() },
    });
  }

  const hourCandidates = await prisma.applicant.findMany({
    where: {
      stage: { in: SCHEDULING_STAGES },
      scheduledAt: { gt: now, lte: new Date(now.getTime() + HOUR_MS) },
      interviewReminderHourSentAt: null,
    },
    include: { jobPosting: { select: { titleEn: true, titleEs: true } } },
  });

  for (const applicant of hourCandidates) {
    await sendInterviewReminder(
      applicant,
      applicant.jobPosting.titleEn,
      applicant.stage,
      applicant.scheduledAt!,
      "hour",
      applicant.jobPosting.titleEs
    );
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { interviewReminderHourSentAt: new Date() },
    });
  }
}
