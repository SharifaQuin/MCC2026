"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import {
  SCHEDULING_STAGES,
  createEmployeeAccountForHiredApplicant,
  scheduleInterviewCalendarEvent,
  sendInterviewConfirmationEmail,
  rejectionEmailTemplate,
} from "@/lib/recruiting";
import { zonedTimeToUtc } from "@/lib/timezone";
import type {
  ApplicantStage,
  ApplicantSource,
  PhoneScreenOutcome,
  InterviewRecommendation,
  ReferenceVerdict,
} from "@prisma/client";

const VALID_PHONE_SCREEN_OUTCOMES = new Set(["PROCEED", "HOLD", "DECLINE"]);
const VALID_RECOMMENDATIONS = new Set(["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"]);
const VALID_REFERENCE_VERDICTS = new Set([
  "STRONG_POSITIVE",
  "GENERALLY_POSITIVE",
  "MIXED",
  "NEGATIVE",
]);

const VALID_APPLICANT_SOURCES = new Set(["CAREERS_PAGE", "INDEED", "ZIPRECRUITER", "REFERRAL", "WALK_IN", "OTHER"]);

const STAGE_TIMESTAMP_FIELD: Partial<Record<ApplicantStage, "rejectedAt" | "benchedAt" | "hiredAt">> = {
  REJECTED: "rejectedAt",
  BENCH: "benchedAt",
  HIRED: "hiredAt",
};

// Phase 1 keeps stage changes manual — a manager reviews and moves the
// applicant forward themselves. Later phases will auto-advance most of
// this and only ask for a confirm click on reject/bench.
export async function setApplicantStageAction(
  applicantId: string,
  stage: ApplicantStage,
  scheduledAt?: string
) {
  const { session } = await requireRecruitingAccess();
  const timestampField = STAGE_TIMESTAMP_FIELD[stage];
  const scheduledAtDate =
    SCHEDULING_STAGES.includes(stage) && scheduledAt ? zonedTimeToUtc(scheduledAt) : undefined;

  const applicant = await prisma.applicant.update({
    where: { id: applicantId },
    data: {
      stage,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      ...(scheduledAtDate ? { scheduledAt: scheduledAtDate } : {}),
    },
    include: { jobPosting: { select: { titleEn: true } } },
  });

  if (stage === "HIRED") {
    await createEmployeeAccountForHiredApplicant(applicant, session.sub);
  }

  if (scheduledAtDate) {
    await scheduleInterviewCalendarEvent(applicant, applicant.jobPosting.titleEn, stage, scheduledAtDate);
    await sendInterviewConfirmationEmail(
      applicant,
      applicant.jobPosting.titleEn,
      stage,
      scheduledAtDate,
      session.sub
    );
  }

  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting/applicants");
  revalidatePath("/recruiting");
}

// Rejecting is the one stage move that optionally sends the candidate an
// email — everything else stays silent per Phase 1. sendEmail is false for
// spam applications, duplicates, or no-shows that were never real
// candidates to begin with.
export async function rejectApplicantAction(applicantId: string, sendEmailToApplicant: boolean) {
  const { session } = await requireRecruitingAccess();

  const applicant = await prisma.applicant.update({
    where: { id: applicantId },
    data: { stage: "REJECTED", rejectedAt: new Date() },
    include: { jobPosting: { select: { titleEn: true } } },
  });

  if (sendEmailToApplicant) {
    const { subject, body } = rejectionEmailTemplate(applicant.firstName, applicant.jobPosting.titleEn);
    const result = await sendEmail({ to: applicant.email, subject, body });

    await prisma.communicationLog.create({
      data: {
        applicantId,
        channel: "EMAIL",
        direction: "OUTBOUND",
        subject,
        body,
        status: result.ok ? "SENT" : "FAILED",
        errorMessage: result.ok ? null : result.error,
        sentById: session.sub,
      },
    });
  }

  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting/applicants");
  revalidatePath("/recruiting");
}

// For walk-ins, referrals, or anyone recruited outside the public
// application form (a call, an in-person conversation) — added directly
// by a manager, skipping the prescreen questions since none were asked.
export async function createManualApplicantAction(formData: FormData) {
  await requireRecruitingAccess();

  const jobPostingId = String(formData.get("jobPostingId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const resumeDataUrl = String(formData.get("resumeDataUrl") ?? "") || null;
  const resumeFileName = String(formData.get("resumeFileName") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const sourceRaw = String(formData.get("source") ?? "");
  const source = VALID_APPLICANT_SOURCES.has(sourceRaw) ? (sourceRaw as ApplicantSource) : "REFERRAL";

  if (!jobPostingId || !firstName || !lastName || !email || !phone) return;

  const existing = await prisma.applicant.findFirst({
    where: { jobPostingId, email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    redirect(`/recruiting/applicants/${existing.id}?duplicate=1`);
  }

  const applicant = await prisma.applicant.create({
    data: {
      jobPostingId,
      firstName,
      lastName,
      email,
      phone,
      resumeDataUrl,
      resumeFileName,
      notes,
      source,
      stage: "NEW",
    },
  });

  revalidatePath("/recruiting");
  revalidatePath("/recruiting/applicants");
  redirect(`/recruiting/applicants/${applicant.id}`);
}

// Timestamped, authored internal-notes log — mirrors addLeadNoteAction so
// recruiting notes behave the same way the email/text thread does
// (append-only, who-said-it-and-when) instead of the old single
// Applicant.notes field that silently overwrote itself on every edit.
export async function addApplicantNoteAction(applicantId: string, formData: FormData) {
  const { session } = await requireRecruitingAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.applicantNote.create({ data: { applicantId, authorId: session.sub, body } });
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

// ── Phone Screen tab ──
// One combined save: the fixed question-bank answers, the pass/fail
// criteria checklist, and the outcome/red-flags notes all submit together
// from a single "Save Phone Screen" button.
export async function savePhoneScreenAction(
  applicantId: string,
  questionIds: string[],
  criteriaLabels: string[],
  formData: FormData
) {
  const { session } = await requireRecruitingAccess();

  await Promise.all(
    questionIds.map((questionId) => {
      const responseText = String(formData.get(`answer_${questionId}`) ?? "").trim() || null;
      return prisma.phoneScreenAnswer.upsert({
        where: { applicantId_questionId: { applicantId, questionId } },
        create: { applicantId, questionId, responseText },
        update: { responseText },
      });
    })
  );

  const criteriaChecklist = criteriaLabels.map((label, i) => ({
    label,
    checked: formData.get(`criteria_${i}`) === "on",
  }));
  const languageNote = String(formData.get("languageNote") ?? "").trim() || null;
  const outcomeRaw = String(formData.get("outcome") ?? "");
  const outcome = (VALID_PHONE_SCREEN_OUTCOMES.has(outcomeRaw) ? outcomeRaw : null) as PhoneScreenOutcome | null;
  const redFlagsNotes = String(formData.get("redFlagsNotes") ?? "").trim() || null;

  await prisma.phoneScreenResult.upsert({
    where: { applicantId },
    create: {
      applicantId,
      criteriaChecklist,
      languageNote,
      outcome,
      redFlagsNotes,
      completedById: session.sub,
      completedAt: new Date(),
    },
    update: {
      criteriaChecklist,
      languageNote,
      outcome,
      redFlagsNotes,
      completedById: session.sub,
      completedAt: new Date(),
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

// ── In-Person Interview tab ──
// The fixed question-bank answers save separately from the scorecard —
// staff can log what was said during the interview itself, then complete
// the scorecard afterward (the toolkit calls for scoring within 1 hour,
// before any panel discussion).
export async function saveInterviewAnswersAction(
  applicantId: string,
  questionIds: string[],
  formData: FormData
) {
  await requireRecruitingAccess();

  await Promise.all(
    questionIds.map((questionId) => {
      const responseText = String(formData.get(`answer_${questionId}`) ?? "").trim() || null;
      return prisma.interviewQuestionAnswer.upsert({
        where: { applicantId_questionId: { applicantId, questionId } },
        create: { applicantId, questionId, responseText },
        update: { responseText },
      });
    })
  );

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

// Multiple scorecards per applicant are allowed on purpose — each panelist
// scores independently before a calibration discussion, rather than
// averaging scores from one shared form. Pass an existing scorecardId to
// update it in place (e.g. the same evaluator correcting their own entry).
export async function saveInterviewScorecardAction(
  applicantId: string,
  scorecardId: string | null,
  competencies: string[],
  formData: FormData
) {
  const { session } = await requireRecruitingAccess();

  const recommendationRaw = String(formData.get("recommendation") ?? "");
  const recommendation = (VALID_RECOMMENDATIONS.has(recommendationRaw)
    ? recommendationRaw
    : null) as InterviewRecommendation | null;
  const rationale = String(formData.get("rationale") ?? "").trim() || null;
  const concerns = String(formData.get("concerns") ?? "").trim() || null;

  const scorecard = scorecardId
    ? await prisma.interviewScorecard.update({
        where: { id: scorecardId },
        data: { recommendation, rationale, concerns },
      })
    : await prisma.interviewScorecard.create({
        data: { applicantId, evaluatorId: session.sub, recommendation, rationale, concerns },
      });

  await Promise.all(
    competencies.map(async (competency, i) => {
      const scoreRaw = String(formData.get(`score_${i}`) ?? "");
      const score = scoreRaw ? Number(scoreRaw) || null : null;
      const evidence = String(formData.get(`evidence_${i}`) ?? "").trim() || null;

      if (scorecardId) {
        const existing = await prisma.interviewCompetencyScore.findFirst({
          where: { scorecardId, competency },
        });
        if (existing) {
          await prisma.interviewCompetencyScore.update({
            where: { id: existing.id },
            data: { score, evidence },
          });
          return;
        }
      }
      await prisma.interviewCompetencyScore.create({
        data: { scorecardId: scorecard.id, competency, score, evidence },
      });
    })
  );

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function deleteInterviewScorecardAction(applicantId: string, scorecardId: string) {
  await requireRecruitingAccess();
  await prisma.interviewScorecard.delete({ where: { id: scorecardId } });
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

// ── Working Session tab ──
// One combined save for the pre-day checklist + the Lead's end-of-session
// observation scores and written assessment — one record per applicant,
// completed once by the Lead who ran the session.
export async function saveWorkingSessionAction(
  applicantId: string,
  checklistLabels: string[],
  formData: FormData
) {
  const { session } = await requireRecruitingAccess();

  const preSessionChecklist = checklistLabels.map((label, i) => ({
    label,
    checked: formData.get(`checklist_${i}`) === "on",
  }));

  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const housesToVisit = String(formData.get("housesToVisit") ?? "").trim() || null;

  const scoreFields = [
    "technical",
    "paceStamina",
    "attentionDetail",
    "clientHome",
    "coachability",
    "pairDynamic",
    "safety",
  ] as const;

  const scoreData: Record<string, number | string | null> = {};
  for (const field of scoreFields) {
    const scoreRaw = String(formData.get(`${field}Score`) ?? "");
    scoreData[`${field}Score`] = scoreRaw ? Number(scoreRaw) || null : null;
    scoreData[`${field}Notes`] = String(formData.get(`${field}Notes`) ?? "").trim() || null;
  }

  const recommendationRaw = String(formData.get("recommendation") ?? "");
  const recommendation = (VALID_RECOMMENDATIONS.has(recommendationRaw)
    ? recommendationRaw
    : null) as InterviewRecommendation | null;

  const data = {
    scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw) : null,
    housesToVisit,
    preSessionChecklist,
    leadEvaluatorId: session.sub,
    ...scoreData,
    honestAssessment: String(formData.get("honestAssessment") ?? "").trim() || null,
    concernsRaised: String(formData.get("concernsRaised") ?? "").trim() || null,
    recommendation,
  };

  await prisma.workingSessionRecord.upsert({
    where: { applicantId },
    create: { applicantId, ...data },
    update: data,
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

// ── Reference Check tab ──
// At least two calls are recommended per finalist, so each call is its own
// row rather than a single record — "Add Reference Check" appends a new one.
export async function addReferenceCheckAction(applicantId: string, formData: FormData) {
  const { session } = await requireRecruitingAccess();

  const verdictRaw = String(formData.get("verdict") ?? "");
  const verdict = (VALID_REFERENCE_VERDICTS.has(verdictRaw) ? verdictRaw : null) as ReferenceVerdict | null;
  const calledAtRaw = String(formData.get("calledAt") ?? "");

  await prisma.referenceCheck.create({
    data: {
      applicantId,
      referenceName: String(formData.get("referenceName") ?? "").trim() || null,
      referenceRelationship: String(formData.get("referenceRelationship") ?? "").trim() || null,
      durationKnown: String(formData.get("durationKnown") ?? "").trim() || null,
      referencePhone: String(formData.get("referencePhone") ?? "").trim() || null,
      calledAt: calledAtRaw ? new Date(calledAtRaw) : null,
      capacityDuration: String(formData.get("capacityDuration") ?? "").trim() || null,
      responsibilities: String(formData.get("responsibilities") ?? "").trim() || null,
      strengths: String(formData.get("strengths") ?? "").trim() || null,
      growthAreas: String(formData.get("growthAreas") ?? "").trim() || null,
      customerFacing: String(formData.get("customerFacing") ?? "").trim() || null,
      handledFeedback: String(formData.get("handledFeedback") ?? "").trim() || null,
      wouldRehire: String(formData.get("wouldRehire") ?? "").trim() || null,
      anythingElse: String(formData.get("anythingElse") ?? "").trim() || null,
      verdict,
      redFlagsSurfaced: String(formData.get("redFlagsSurfaced") ?? "").trim() || null,
      completedById: session.sub,
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function deleteReferenceCheckAction(applicantId: string, referenceCheckId: string) {
  await requireRecruitingAccess();
  await prisma.referenceCheck.delete({ where: { id: referenceCheckId } });
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function sendApplicantEmailAction(applicantId: string, formData: FormData) {
  const { session } = await requireRecruitingAccess();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) return;

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  const result = await sendEmail({ to: applicant.email, subject, body });

  await prisma.communicationLog.create({
    data: {
      applicantId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      subject,
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: session.sub,
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

// Applicant replies land in the staff member's own inbox/phone, not in our
// system — this lets them manually record what was said so it shows up
// alongside the outbound history instead of living only in Outlook/RingCentral.
export async function logApplicantReplyAction(
  applicantId: string,
  channel: "EMAIL" | "SMS",
  formData: FormData
) {
  const { session } = await requireRecruitingAccess();
  const subject = channel === "EMAIL" ? String(formData.get("subject") ?? "").trim() || null : null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await prisma.communicationLog.create({
    data: {
      applicantId,
      channel,
      direction: "INBOUND",
      subject,
      body,
      sentById: session.sub,
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function sendApplicantTextAction(applicantId: string, formData: FormData) {
  const { session } = await requireRecruitingAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  const result = await sendSms({ to: applicant.phone, text: body });

  await prisma.communicationLog.create({
    data: {
      applicantId,
      channel: "SMS",
      direction: "OUTBOUND",
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: session.sub,
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}
