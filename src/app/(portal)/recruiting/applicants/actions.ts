"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import {
  SCHEDULING_STAGES,
  createEmployeeAccountForHiredApplicant,
  scheduleInterviewCalendarEvent,
  sendInterviewConfirmationEmail,
  rejectionEmailTemplate,
  setOnboardingChecklistItem,
} from "@/lib/recruiting";
import { generateInviteToken } from "@/lib/tokens";
import { zonedTimeToUtc } from "@/lib/timezone";
import { logAudit } from "@/lib/auditLog";
import { getTrueActorId } from "@/lib/impersonation";
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

function requireEdit(canEdit: boolean) {
  if (!canEdit) throw new Error("Not authorized to make changes here.");
}

// Final hiring-pipeline moves an Office Assistant must never make directly
// — even with an approved "Send for approval" request, the designated
// manager carries these out themselves, manually, in this same UI (see
// src/app/actions/approvals.ts). Approval never grants this role a new
// permission; it only produces a decision for the manager to act on.
const OFFICE_ASSISTANT_BLOCKED_STAGES = new Set<ApplicantStage>(["OFFER_SENT", "HIRED", "REJECTED", "BENCH"]);

function assertRoutineStageTransition(role: string, stage: ApplicantStage) {
  if (role === "OFFICE_ASSISTANT" && OFFICE_ASSISTANT_BLOCKED_STAGES.has(stage)) {
    throw new Error(
      "This stage change needs the authorized manager — submit a Send for approval request instead."
    );
  }
}

// "offer_letter"/"payroll" checklist items read as proxies for an Offer
// Sent / hiring-adjacent action, so they're withheld even though the rest
// of the onboarding checklist is routine for this role.
const OFFICE_ASSISTANT_BLOCKED_ONBOARDING_ITEMS = new Set(["offer_letter", "payroll"]);

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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  assertRoutineStageTransition(session.role, stage);
  const timestampField = STAGE_TIMESTAMP_FIELD[stage];
  const scheduledAtDate =
    SCHEDULING_STAGES.includes(stage) && scheduledAt ? zonedTimeToUtc(scheduledAt) : undefined;

  // Moving an applicant OFF of Hired (whether via the dedicated "Undo
  // Hire" button or the manual stage override) needs to walk back the one
  // real side effect Hired has: a training account gets created for them.
  // Only ever remove that account if it's provably never been touched
  // (no login, no password set) — an account someone has actually started
  // using is real activity this can't silently erase.
  const previous = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { stage: true, hiredUserId: true },
  });
  const leavingHired = previous?.stage === "HIRED" && stage !== "HIRED" && previous.hiredUserId;
  let clearHiredUser = false;
  if (leavingHired) {
    const hiredUser = await prisma.user.findUnique({ where: { id: previous!.hiredUserId! } });
    if (hiredUser && !hiredUser.lastLoginAt && !hiredUser.passwordHash) {
      clearHiredUser = true;
    }
  }

  const applicant = await prisma.applicant.update({
    where: { id: applicantId },
    data: {
      stage,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      ...(leavingHired ? { hiredAt: null, ...(clearHiredUser ? { hiredUserId: null } : {}) } : {}),
      // A fresh (or rescheduled) interview time gets its own confirm token
      // and starts unconfirmed with no reminders sent yet — a stale
      // confirmation or an already-sent reminder from a previous time
      // should never carry over to a new one.
      ...(scheduledAtDate
        ? {
            scheduledAt: scheduledAtDate,
            interviewConfirmToken: generateInviteToken(),
            interviewConfirmedAt: null,
            interviewCantMakeItAt: null,
            interviewReminderDaySentAt: null,
            interviewReminderHourSentAt: null,
          }
        : {}),
    },
    include: { jobPosting: { select: { titleEn: true, titleEs: true } } },
  });

  if (clearHiredUser) {
    await prisma.user.delete({ where: { id: previous!.hiredUserId! } });
  }

  if (stage === "HIRED") {
    await createEmployeeAccountForHiredApplicant(applicant, getTrueActorId(session));
  }

  // The automatic candidate-facing confirmation (both the Outlook calendar
  // invite and the email) embeds Shar's real Zoom passcode for a phone
  // interview (see RECRUITING_ZOOM_PASSCODE in scheduleInterviewCalendarEvent
  // / sendInterviewConfirmationEmail). An Office Assistant booking a Zoom
  // interview sets a real stage/date — that part is fine — but must never
  // trigger that automatic send: it would hand out her private passcode to
  // a candidate with no review step. Holding it back here, rather than only
  // in the newer "Schedule Zoom interview" action, also closes the same gap
  // on this exact form for an Office Assistant who reaches it directly.
  // An in-person booking has no passcode to leak, so it's unaffected.
  const suppressAutoSendForOfficeAssistant = session.role === "OFFICE_ASSISTANT" && stage === "PHONE_INTERVIEW_SCHEDULED";
  if (scheduledAtDate && !suppressAutoSendForOfficeAssistant) {
    await scheduleInterviewCalendarEvent(applicant, applicant.jobPosting.titleEn, stage, scheduledAtDate);
    await sendInterviewConfirmationEmail(
      applicant,
      applicant.jobPosting.titleEn,
      stage,
      scheduledAtDate,
      getTrueActorId(session),
      applicant.jobPosting.titleEs
    );
  }

  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "APPLICANT_STAGE_CHANGED",
      recordType: "Applicant",
      recordId: applicantId,
      changedFields: { stage: { from: previous?.stage, to: stage } },
    });
  }

  revalidatePath(`/recruiting/applicants/${applicantId}`);
  revalidatePath("/recruiting/applicants");
  revalidatePath("/recruiting");
  revalidatePath("/recruiting/inbox");
}

// Rejecting is the one stage move that optionally sends the candidate an
// email — everything else stays silent per Phase 1. sendEmail is false for
// spam applications, duplicates, or no-shows that were never real
// candidates to begin with.
export async function rejectApplicantAction(applicantId: string, sendEmailToApplicant: boolean) {
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  if (session.role === "OFFICE_ASSISTANT") {
    throw new Error(
      "Rejecting an applicant needs the authorized manager — submit a Send for approval request instead."
    );
  }

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
        sentById: getTrueActorId(session),
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
  const { canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);

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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.applicantNote.create({ data: { applicantId, authorId: getTrueActorId(session), body } });
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "APPLICANT_NOTE_ADDED",
      recordType: "Applicant",
      recordId: applicantId,
    });
  }
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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);

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
      completedById: getTrueActorId(session),
      completedAt: new Date(),
    },
    update: {
      criteriaChecklist,
      languageNote,
      outcome,
      redFlagsNotes,
      completedById: getTrueActorId(session),
      completedAt: new Date(),
    },
  });

  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "PHONE_SCREEN_SAVED",
      recordType: "Applicant",
      recordId: applicantId,
    });
  }

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
  const { canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);

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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);

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
        data: { applicantId, evaluatorId: getTrueActorId(session), recommendation, rationale, concerns },
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

  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "INTERVIEW_SCORECARD_SAVED",
      recordType: "Applicant",
      recordId: applicantId,
    });
  }

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function deleteInterviewScorecardAction(applicantId: string, scorecardId: string) {
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  if (session.role === "OFFICE_ASSISTANT") {
    throw new Error("Deleting a scorecard isn't available for this role.");
  }
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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  if (session.role === "OFFICE_ASSISTANT") {
    throw new Error("Working session evaluations aren't available for this role.");
  }

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
    leadEvaluatorId: getTrueActorId(session),
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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  if (session.role === "OFFICE_ASSISTANT") {
    throw new Error("Reference checks aren't available for this role.");
  }

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
      completedById: getTrueActorId(session),
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function deleteReferenceCheckAction(applicantId: string, referenceCheckId: string) {
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
  if (session.role === "OFFICE_ASSISTANT") {
    throw new Error("Reference checks aren't available for this role.");
  }
  await prisma.referenceCheck.delete({ where: { id: referenceCheckId } });
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function toggleOnboardingChecklistItemAction(
  applicantId: string,
  itemKey: string,
  completed: boolean
) {
  const { session, canEdit: recruitingCanEdit } = await requireRecruitingAccess();
  // Onboarding has its own owner-configurable area, distinct from Recruiting
  // (the Permissions screen shows them as separate rows) — Office
  // Assistant's edit right here comes from the ONBOARDING grant, not from
  // RECRUITING edit, even though reaching this applicant at all still needs
  // RECRUITING view.
  const canEdit =
    session.role === "OFFICE_ASSISTANT"
      ? (await getAreaAccessForUser(session.sub, "ONBOARDING")).canEdit
      : recruitingCanEdit;
  requireEdit(canEdit);
  if (session.role === "OFFICE_ASSISTANT" && OFFICE_ASSISTANT_BLOCKED_ONBOARDING_ITEMS.has(itemKey)) {
    throw new Error("This onboarding item needs the authorized manager.");
  }
  await setOnboardingChecklistItem(applicantId, itemKey, completed, getTrueActorId(session));
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "ONBOARDING_CHECKLIST_TOGGLED",
      recordType: "Applicant",
      recordId: applicantId,
      changedFields: { [itemKey]: { to: completed } },
    });
  }
  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function sendApplicantEmailAction(applicantId: string, formData: FormData) {
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
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
      sentById: getTrueActorId(session),
    },
  });

  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "APPLICANT_EMAIL_SENT",
      recordType: "Applicant",
      recordId: applicantId,
    });
  }

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
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
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
      sentById: getTrueActorId(session),
    },
  });

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}

export async function sendApplicantTextAction(applicantId: string, formData: FormData) {
  const { session, canEdit } = await requireRecruitingAccess();
  requireEdit(canEdit);
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
      sentById: getTrueActorId(session),
    },
  });

  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "APPLICANT_TEXT_SENT",
      recordType: "Applicant",
      recordId: applicantId,
    });
  }

  revalidatePath(`/recruiting/applicants/${applicantId}`);
}
