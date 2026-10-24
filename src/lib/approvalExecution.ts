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
  releaseBookedInterviewSlot,
  updateOrCreateInterviewCalendarEvent,
  sendInterviewConfirmationEmail,
} from "@/lib/recruiting";
import { getAvailabilityForInterviewer } from "@/lib/interviewerAvailability";
import { generateInviteToken } from "@/lib/tokens";
import { Prisma, type ApplicantStage, type ApprovalExecutionStatus } from "@prisma/client";

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

// The applicant moved to a different stage since this request was
// submitted (someone rejected them, hired them, or otherwise advanced
// things through a completely different control) between approval and
// execution — most plausibly during the window a FAILED/PARTIAL attempt
// sat waiting for a manual Retry. Executing anyway would silently drag
// them back to IN_PERSON_SCHEDULED (or stamp working-session scheduling
// details) against a record that's since moved on, exactly the kind of
// stale decision decideApprovalRequestAction's own staleness check
// already refuses to act on at decision time — this is that same
// protection, re-applied right before the actual write, since real time
// elapses between an approval and its (possibly retried) execution.
// Supersedes any IN_PROGRESS marker claimExecutionAttempt just set: the
// whole request goes back to NEEDS_RESUBMISSION, with execution state
// cleared rather than left showing a misleading FAILED/PARTIAL from an
// attempt that was never really executable in the first place.
async function markRequestStale(requestId: string): Promise<void> {
  await prisma.approvalRequest.updateMany({
    where: { id: requestId, status: "APPROVED" },
    data: { status: "NEEDS_RESUBMISSION", executionStatus: null, executionError: null },
  });
}

// True only if the applicant's CURRENT stage still matches what this
// request was approved against, taking a row lock for the duration of the
// surrounding transaction so a concurrent stage change (any other control
// updating this exact Applicant row) is forced to wait until this check
// — and the write that depends on it — has completed, rather than racing
// in between the read and the write.
async function stageStillMatchesLocked(
  tx: Prisma.TransactionClient,
  applicantId: string,
  expectedStage: ApplicantStage
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ stage: ApplicantStage }[]>`
    SELECT "stage" FROM "Applicant" WHERE "id" = ${applicantId} FOR UPDATE
  `;
  return rows.length > 0 && rows[0].stage === expectedStage;
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
//
// applicantStageAtRequest is the stage this request was approved
// against — re-verified twice: once up front (so a plainly stale request
// never even claims a slot), and once more, atomically with a row lock,
// immediately before the stage-changing write (closing the narrow race
// where the applicant's stage changes in the gap between the first check
// and the slot claim finishing). A failure at either point is reported as
// NEEDS_RESUBMISSION, never a FAILED/PARTIAL execution outcome, and never
// books anything or sends a message.
export async function executeApprovedInPersonInterview(
  requestId: string,
  applicantId: string,
  decidedScheduledAt: Date,
  interviewerId: string,
  applicantStageAtRequest: ApplicantStage,
  calendarFn: typeof updateOrCreateInterviewCalendarEvent = updateOrCreateInterviewCalendarEvent,
  emailFn: typeof sendInterviewConfirmationEmail = sendInterviewConfirmationEmail
): Promise<{ stale: boolean }> {
  const stillCurrent = await prisma.$transaction((tx) => stageStillMatchesLocked(tx, applicantId, applicantStageAtRequest));
  if (!stillCurrent) {
    await markRequestStale(requestId);
    return { stale: true };
  }

  const outcome = await runInPersonExecution(
    applicantId,
    decidedScheduledAt,
    interviewerId,
    applicantStageAtRequest,
    calendarFn,
    emailFn
  );
  if (outcome === "STALE") {
    await markRequestStale(requestId);
    return { stale: true };
  }
  await recordExecutionOutcome(requestId, interviewerId, outcome);
  return { stale: false };
}

async function runInPersonExecution(
  applicantId: string,
  decidedScheduledAt: Date,
  interviewerId: string,
  applicantStageAtRequest: ApplicantStage,
  calendarFn: typeof updateOrCreateInterviewCalendarEvent,
  emailFn: typeof sendInterviewConfirmationEmail
): Promise<ExecutionOutcome | "STALE"> {
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

  // Closes the race the up-front check above can't: the applicant's stage
  // could still have changed in the time claimSlotAtomically's own
  // transaction took to run. The write itself is the second, final check
  // — conditioned on the stage being exactly what it was re-verified as a
  // moment ago, inside the SAME row lock that guarded that re-check.
  const stillCurrentAtWrite = await prisma.$transaction(async (tx) => {
    const matches = await stageStillMatchesLocked(tx, applicantId, applicantStageAtRequest);
    if (!matches) return false;
    await tx.applicant.update({
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
    });
    return true;
  });
  if (!stillCurrentAtWrite) {
    // The slot was already claimed above — release it rather than leave a
    // booking behind for a decision that's no longer valid. Never a
    // partial "slot held but nothing else happened" state.
    await releaseBookedInterviewSlot(applicantId);
    return "STALE";
  }

  const applicant = await prisma.applicant.findUniqueOrThrow({
    where: { id: applicantId },
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
//
// applicantStageAtRequest is re-verified, with a row lock, in the SAME
// transaction as the upsert — the applicant's stage can't change out from
// under this between the check and the write, the same guarantee the
// in-person path above gets from its two-step check. A mismatch writes
// nothing and the request is reported NEEDS_RESUBMISSION instead.
export async function executeApprovedWorkingSession(
  requestId: string,
  applicantId: string,
  decidedScheduledAt: Date,
  executedById: string,
  applicantStageAtRequest: ApplicantStage
): Promise<{ stale: boolean }> {
  try {
    const stillCurrent = await prisma.$transaction(async (tx) => {
      const matches = await stageStillMatchesLocked(tx, applicantId, applicantStageAtRequest);
      if (!matches) return false;
      await tx.workingSessionRecord.upsert({
        where: { applicantId },
        create: { applicantId, scheduledAt: decidedScheduledAt },
        update: { scheduledAt: decidedScheduledAt },
      });
      return true;
    });
    if (!stillCurrent) {
      await markRequestStale(requestId);
      return { stale: true };
    }
    await recordExecutionOutcome(requestId, executedById, { status: "SUCCEEDED", error: null });
    return { stale: false };
  } catch (err) {
    await recordExecutionOutcome(requestId, executedById, {
      status: "FAILED",
      error: err instanceof Error ? err.message : "Couldn't save the working session's scheduled time.",
    });
    return { stale: false };
  }
}
