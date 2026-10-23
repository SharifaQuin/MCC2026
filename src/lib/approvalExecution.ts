// Executes an APPROVED SCHEDULE_IN_PERSON_INTERVIEW or
// SCHEDULE_WORKING_SESSION ApprovalRequest's approved details — the one
// piece of this feature where approval genuinely does something, unlike
// the three pre-existing action types (REJECT/OFFER/SEND_MESSAGE), which
// only ever record a decision for the manager to carry out manually.
//
// Callers (decideApprovalRequestAction and retryApprovalExecutionAction in
// src/app/actions/approvals.ts) are responsible for the exactly-once
// guard: claimExecutionAttempt below does the actual atomic claim, and
// every caller must check its result before doing anything else — never
// call executeInPersonInterview/executeWorkingSession without having won
// that claim first, or a double-click/retry race could book (or email)
// twice.
import { prisma } from "@/lib/prisma";
import {
  claimSlotAtomically,
  updateOrCreateInterviewCalendarEvent,
  sendInterviewConfirmationEmail,
} from "@/lib/recruiting";
import { getAvailabilityForInterviewer } from "@/lib/interviewerAvailability";
import { generateInviteToken } from "@/lib/tokens";
import type { ApprovalExecutionStatus } from "@prisma/client";

export interface ExecutionOutcome {
  status: ApprovalExecutionStatus;
  error: string | null;
}

// Atomic claim: only the caller that actually flips a row from "nothing in
// progress" to IN_PROGRESS may proceed to execute it. A concurrent second
// attempt (a double-click of Approve, or two Retry clicks) always sees
// count === 0 and must not execute anything. Matches this row from either
// its pre-execution state (executionStatus still null, right after the
// decide transaction) or a prior FAILED/PARTIAL attempt (a deliberate
// retry) — never from SUCCEEDED or an already-IN_PROGRESS attempt.
export async function claimExecutionAttempt(requestId: string): Promise<boolean> {
  const claimed = await prisma.approvalRequest.updateMany({
    where: {
      id: requestId,
      status: "APPROVED",
      OR: [{ executionStatus: null }, { executionStatus: "FAILED" }, { executionStatus: "PARTIAL" }],
    },
    data: { executionStatus: "IN_PROGRESS" },
  });
  return claimed.count > 0;
}

// Writes back whatever the attempt actually produced — called exactly
// once per successful claimExecutionAttempt, win or lose.
async function recordExecutionOutcome(
  requestId: string,
  executedById: string,
  outcome: ExecutionOutcome
): Promise<void> {
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      executionStatus: outcome.status,
      executionError: outcome.error,
      executedById,
      executedAt: new Date(),
    },
  });
}

// Books the approved in-person interview through the exact same
// slot-claim + calendar-sync + confirmation-email sequence
// setApplicantStageAction (recruiting/applicants/actions.ts) uses for a
// manager's own direct booking — never a Zoom link (format is always
// IN_PERSON here, so isZoomConfigured/the Zoom branch never applies). The
// deciding manager becomes the interviewer, the same "whoever's booking it
// is the default interviewer" convention that function already uses. A
// slot conflict fails cleanly before anything is written (claimSlotAtomically
// is itself transactional), so a conflict can never send a confirmation.
// A calendar-sync failure after the slot is claimed does NOT block the
// confirmation email (same behavior setApplicantStageAction already has) —
// that's the PARTIAL outcome, recoverable with the existing "Retry
// calendar sync" button on the applicant page, never by re-running this.
// calendarFn/emailFn default to the real recruiting.ts implementations and
// are only ever overridden by tests — the same dependency-injection
// pattern src/lib/problemReports.ts's resolveProblemReport already uses
// for sendEmailFn, so a test can deterministically force (and assert on) a
// calendar-sync failure without a live network call, which the real
// updateOrCreateInterviewCalendarEvent can only otherwise exhibit when
// Microsoft Graph is actually configured and actually fails.
export async function executeApprovedInPersonInterview(
  requestId: string,
  applicantId: string,
  decidedScheduledAt: Date,
  interviewerId: string,
  calendarFn: typeof updateOrCreateInterviewCalendarEvent = updateOrCreateInterviewCalendarEvent,
  emailFn: typeof sendInterviewConfirmationEmail = sendInterviewConfirmationEmail
): Promise<void> {
  const outcome = await runInPersonExecution(applicantId, decidedScheduledAt, interviewerId, calendarFn, emailFn);
  await recordExecutionOutcome(requestId, interviewerId, outcome);
}

async function runInPersonExecution(
  applicantId: string,
  decidedScheduledAt: Date,
  interviewerId: string,
  calendarFn: typeof updateOrCreateInterviewCalendarEvent,
  emailFn: typeof sendInterviewConfirmationEmail
): Promise<ExecutionOutcome> {
  const previous = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { bookedSlot: true },
  });
  if (!previous) return { status: "FAILED", error: "Applicant no longer exists." };

  const availability = await getAvailabilityForInterviewer(interviewerId);
  const durationMins = availability?.durationMins ?? previous.bookedSlot?.durationMins ?? 30;

  const claim = await claimSlotAtomically({
    applicantId,
    interviewerId,
    format: "IN_PERSON",
    startsAt: decidedScheduledAt,
    durationMins,
    bufferBeforeMins: availability?.bufferBeforeMins ?? 0,
    bufferAfterMins: availability?.bufferAfterMins ?? 0,
    createdById: interviewerId,
    releaseSlotId: previous.bookedSlot?.id ?? null,
  });
  if (!claim.ok) return { status: "FAILED", error: claim.error };

  const applicant = await prisma.applicant.update({
    where: { id: applicantId },
    data: {
      stage: "IN_PERSON_SCHEDULED",
      scheduledAt: decidedScheduledAt,
      interviewerId,
      interviewFormat: "IN_PERSON",
      interviewConfirmToken: generateInviteToken(),
      interviewConfirmedAt: null,
      interviewCantMakeItAt: null,
      interviewReminderDaySentAt: null,
      interviewReminderHourSentAt: null,
    },
    include: { jobPosting: { select: { titleEn: true, titleEs: true } } },
  });

  const sync = await calendarFn(
    applicant,
    applicant.jobPosting.titleEn,
    "IN_PERSON_SCHEDULED",
    decidedScheduledAt,
    "IN_PERSON",
    durationMins,
    previous.bookedSlot?.calendarEventId ?? null
  );
  await prisma.interviewAvailabilitySlot.update({
    where: { id: claim.slotId },
    data: { calendarEventId: sync.eventId, calendarSyncFailedAt: sync.syncFailed ? new Date() : null },
  });

  // Matches the existing manager-direct-booking path's own behavior
  // exactly: a calendar-sync failure never blocks the candidate
  // confirmation email — the two are independently-tracked outcomes (see
  // CalendarSyncResult's own comment in recruiting.ts), which is exactly
  // what makes PARTIAL (slot+email succeeded, calendar didn't) a real,
  // recoverable state rather than an all-or-nothing failure.
  await emailFn(
    applicant,
    applicant.jobPosting.titleEn,
    "IN_PERSON_SCHEDULED",
    decidedScheduledAt,
    interviewerId,
    applicant.jobPosting.titleEs,
    "IN_PERSON"
  );

  return sync.syncFailed
    ? {
        status: "PARTIAL",
        error:
          "Interview booked and the candidate was emailed a confirmation, but the shared calendar sync failed — use \"Retry calendar sync\" on the applicant's page to finish that part.",
      }
    : { status: "SUCCEEDED", error: null };
}

// Saves ONLY the approved scheduling details to the applicant's
// WorkingSessionRecord — scheduledAt, under an upsert that touches nothing
// else on the row. Deliberately narrow: this must never touch
// leadEvaluatorId, any of the six score/notes pairs, preSessionChecklist,
// honestAssessment, concernsRaised, or recommendation — the existing
// saveWorkingSessionAction (recruiting/applicants/actions.ts) overwrites
// ALL of those together on every save, so reusing it (or copying its
// shape) here would silently wipe out a lead evaluator's already-entered
// scores the moment a scheduling request is approved. No calendar event,
// no email, no SMS — this record has never sent any of those and this PR
// doesn't start; candidate communication for a working session stays
// manual, exactly as today.
export async function executeApprovedWorkingSession(
  requestId: string,
  applicantId: string,
  decidedScheduledAt: Date,
  executedById: string
): Promise<void> {
  try {
    await prisma.workingSessionRecord.upsert({
      where: { applicantId },
      create: { applicantId, scheduledAt: decidedScheduledAt },
      update: { scheduledAt: decidedScheduledAt },
    });
    await recordExecutionOutcome(requestId, executedById, { status: "SUCCEEDED", error: null });
  } catch (err) {
    await recordExecutionOutcome(requestId, executedById, {
      status: "FAILED",
      error: err instanceof Error ? err.message : "Couldn't save the working session's scheduled time.",
    });
  }
}
