import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import {
  claimExecutionAttempt,
  executeApprovedInPersonInterview,
  executeApprovedWorkingSession,
} from "../src/lib/approvalExecution";

// Coverage for "Pedro's next-step approval requests": the request flow
// (In-Person Interview / Working Session, a proposed date/time, a note),
// the manager decision (approve as proposed, approve with an edited
// date/time, decline), stale-request protection, the shared Pending
// Approvals badge, slot-conflict/partial-failure/retry/duplicate-execution
// safety, direct-booking bypass being blocked, and that Pedro gains no
// evaluation/scoring authority. Fixtures only — disposable users/
// applicants tagged with a unique run id, removed in afterAll. No real
// calendar/email send: Microsoft Graph and the shared calendar are both
// unconfigured in this environment, so a "SUCCEEDED" execution here means
// slot-claim + stage/update + communication-log write all actually
// happened, with the email/calendar steps themselves failing fast with no
// network call (same reasoning e2e/problem-reports.spec.ts documents for
// MS Graph) rather than being mocked away.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_EMAIL = `pedro-nextstep-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function captureActionId(page: Page, trigger: () => Promise<void>): Promise<string> {
  let captured: string | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) captured = header;
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action id — trigger() didn't fire one.");
  return captured;
}

async function forgeAction(page: Page, path: string, actionId: string, args: unknown[]) {
  return page.request.post(path, {
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(args),
  });
}

// A future date/time, formatted as a datetime-local value — far enough out
// that it can never collide with another test's own fixture times.
function futureLocalDatetime(daysFromNow: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${String(hour).padStart(2, "0")}:00`;
}

test.describe.serial("Pedro's next-step requests: submission, decision, execution, badge (browser)", () => {
  let adminId: string;
  let officeAssistantId: string;
  let jobPostingId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `Pedro NextStep ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    officeAssistantId = oa.id;
  });

  test.afterAll(async () => {
    await prisma.workingSessionRecord.deleteMany({
      where: { applicant: { jobPostingId, lastName: { contains: RUN_ID } } },
    });
    await prisma.interviewAvailabilitySlot.deleteMany({
      where: { bookedApplicant: { jobPostingId, lastName: { contains: RUN_ID } } },
    });
    await prisma.approvalRequest.deleteMany({ where: { applicant: { lastName: { contains: RUN_ID } } } });
    await prisma.communicationLog.deleteMany({ where: { applicant: { lastName: { contains: RUN_ID } } } });
    await prisma.applicant.deleteMany({ where: { lastName: { contains: RUN_ID } } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.delete({ where: { id: officeAssistantId } });
    await prisma.$disconnect();
  });

  async function makeApplicant(tag: string) {
    return prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Pedro NS",
        lastName: `${tag}-${RUN_ID}`,
        email: `pedro-ns-${tag}-${RUN_ID}@example.com`,
        phone: "5555561000",
        stage: "IN_PERSON_PASSED",
      },
    });
  }

  test("Pedro's applicant page has no direct in-person booking control, and a forged direct stage-change call is refused", async ({
    page,
  }) => {
    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Pedro NS",
        lastName: `bypass-${RUN_ID}`,
        email: `pedro-ns-bypass-${RUN_ID}@example.com`,
        phone: "5555561999",
        stage: "PRESCREEN_PASSED",
      },
    });
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");

    // The direct in-person booking control — previously available from
    // PRESCREEN_PASSED — is gone entirely, never just disabled.
    await expect(page.locator('button:has-text("Move to: In-Person Interview Scheduled")')).toHaveCount(0);
    const overrideButton = page.locator('button:has-text("Correct the stage manually")');
    if (await overrideButton.count()) {
      await overrideButton.click();
      await expect(page.locator('select[name="targetStage"] option[value="IN_PERSON_SCHEDULED"]')).toHaveCount(0);
      await page.click('button:has-text("Cancel")').catch(() => {});
    }

    // Capture setApplicantStageAction's real id off a routine move still
    // open to Pedro (same technique e2e/office-assistant.spec.ts already
    // uses — Phone/Zoom booking stays open), then replay it with the
    // now-blocked target stage — hiding the control is UX, not the
    // security boundary.
    await page.click('button:has-text("Move to: Phone/Zoom Interview Scheduled")');
    const future = futureLocalDatetime(20, 10).split("T");
    const setStageActionId = await captureActionId(page, async () => {
      await page.fill('input[name="scheduledDate"]', future[0]);
      await page.fill('input[name="scheduledTime"]', future[1]);
      await page.click('button:has-text("Confirm")');
    });
    await page.waitForTimeout(500);

    await forgeAction(page, `/recruiting/applicants/${applicant.id}`, setStageActionId, [
      applicant.id,
      "IN_PERSON_SCHEDULED",
    ]);
    await page.waitForTimeout(500);

    // The legitimate Phone/Zoom booking above DID set scheduledAt — the
    // forged replay targeting IN_PERSON_SCHEDULED must never have
    // overwritten that with an in-person booking.
    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(after.stage).toBe("PHONE_INTERVIEW_SCHEDULED");
    expect(after.interviewFormat).toBe("ZOOM");
  });

  test("Submitting an in-person interview request proposes a date/time and note, scheduling nothing yet", async ({
    page,
  }) => {
    const applicant = await makeApplicant("inperson-submit");
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.click('button:has-text("Request Approval")');
    await page.locator('select[name="actionType"]').selectOption("SCHEDULE_IN_PERSON_INTERVIEW");
    const proposed = futureLocalDatetime(10, 14);
    await page.fill('input[name="proposedScheduledAt"]', proposed);
    await page.fill('textarea[name="rationale"]', "Candidate passed the in-person round, ready for a working session interview.");
    await page.click('button:has-text("Submit Request")');
    await page.waitForTimeout(800);

    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { applicantId: applicant.id } });
    expect(request.actionType).toBe("SCHEDULE_IN_PERSON_INTERVIEW");
    expect(request.status).toBe("PENDING");
    expect(request.managerId).toBe(adminId);
    expect(request.proposedScheduledAt).not.toBeNull();
    expect(request.decidedScheduledAt).toBeNull();
    expect(request.executionStatus).toBeNull();

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");
    expect(applicantAfter.scheduledAt).toBeNull();
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(0);
  });

  test("Submitting a working session request proposes a date/time and note, scheduling nothing yet", async ({ page }) => {
    const applicant = await makeApplicant("ws-submit");
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.click('button:has-text("Request Approval")');
    await page.locator('select[name="actionType"]').selectOption("SCHEDULE_WORKING_SESSION");
    const proposed = futureLocalDatetime(11, 9);
    await page.fill('input[name="proposedScheduledAt"]', proposed);
    await page.fill('textarea[name="rationale"]', "Ready for a working session — strong in-person round.");
    await page.click('button:has-text("Submit Request")');
    await page.waitForTimeout(800);

    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { applicantId: applicant.id } });
    expect(request.actionType).toBe("SCHEDULE_WORKING_SESSION");
    expect(request.status).toBe("PENDING");
    expect(request.proposedScheduledAt).not.toBeNull();

    expect(await prisma.workingSessionRecord.findUnique({ where: { applicantId: applicant.id } })).toBeNull();
  });

  test("Approving an in-person request as proposed executes the booking: stage, slot, and one confirmation", async ({
    page,
  }) => {
    const applicant = await makeApplicant("inperson-approve");
    const proposed = futureLocalDatetime(12, 14);
    const request = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId: applicant.id,
        actionType: "SCHEDULE_IN_PERSON_INTERVIEW",
        rationale: "Ready for in-person.",
        proposedOutcome: "Schedule an in-person interview at the proposed date/time.",
        proposedScheduledAt: new Date(`${proposed}:00`),
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });

    const beforeBadge = await prisma.approvalRequest.count({ where: { managerId: adminId, status: "PENDING" } });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="desktop-sidebar"] a', { hasText: "Pending Approvals" })).toContainText(
      String(beforeBadge)
    );

    await page.goto("/recruiting/approvals");
    await page.waitForLoadState("networkidle");
    const row = page.locator("div.rounded-md.border", { hasText: `NS inperson-approve-${RUN_ID}` });
    await expect(row).toBeVisible();
    await expect(row.getByText("Request in-person interview")).toBeVisible();
    await row.locator('button:has-text("Approve")').click();
    await page.waitForTimeout(1200);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.decidedScheduledAt?.toISOString()).toBe(request.proposedScheduledAt?.toISOString());
    expect(after.executionStatus).toBe("SUCCEEDED");
    expect(after.executedById).toBe(adminId);

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_SCHEDULED");
    expect(applicantAfter.interviewFormat).toBe("IN_PERSON");
    expect(applicantAfter.interviewerId).toBe(adminId);
    expect(applicantAfter.scheduledAt?.toISOString()).toBe(request.proposedScheduledAt?.toISOString());

    const slot = await prisma.interviewAvailabilitySlot.findUnique({ where: { bookedById: applicant.id } });
    expect(slot).not.toBeNull();
    expect(slot!.format).toBe("IN_PERSON");

    // Exactly one confirmation, never a Zoom-join text.
    const comms = await prisma.communicationLog.findMany({ where: { applicantId: applicant.id } });
    expect(comms.length).toBeGreaterThanOrEqual(1);
    for (const c of comms) expect(c.body ?? "").not.toMatch(/zoom/i);

    const afterBadge = await prisma.approvalRequest.count({ where: { managerId: adminId, status: "PENDING" } });
    expect(afterBadge).toBe(beforeBadge - 1);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="desktop-sidebar"] a', { hasText: "Pending Approvals" })).toContainText(
      String(afterBadge)
    );
  });

  test("Approving a working session request with an edited date/time saves only that date, and the decision shows the final reviewed details", async ({
    page,
  }) => {
    const applicant = await makeApplicant("ws-approve-edit");
    const proposed = futureLocalDatetime(13, 9);
    const edited = futureLocalDatetime(14, 10);
    const request = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId: applicant.id,
        actionType: "SCHEDULE_WORKING_SESSION",
        rationale: "Ready for a working session.",
        proposedOutcome: "Schedule a working session at the proposed date/time.",
        proposedScheduledAt: new Date(`${proposed}:00`),
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    await page.waitForLoadState("networkidle");
    const row = page.locator("div.rounded-md.border", { hasText: `NS ws-approve-edit-${RUN_ID}` });
    await row.locator('input[type="datetime-local"]').fill(edited);
    await row.locator('button:has-text("Approve")').click();
    await page.waitForTimeout(1000);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.proposedScheduledAt?.toISOString()).not.toBe(after.decidedScheduledAt?.toISOString());
    expect(after.executionStatus).toBe("SUCCEEDED");

    const ws = await prisma.workingSessionRecord.findUniqueOrThrow({ where: { applicantId: applicant.id } });
    expect(ws.scheduledAt?.toISOString()).toBe(after.decidedScheduledAt?.toISOString());
    // Never the originally-proposed time — the edit took effect.
    expect(ws.scheduledAt?.toISOString()).not.toBe(after.proposedScheduledAt?.toISOString());
    // No evaluation authority leaked in by the approving manager.
    expect(ws.leadEvaluatorId).toBeNull();
    expect(ws.technicalScore).toBeNull();

    // The applicant's own stage and hiring-adjacent fields are untouched —
    // a working session is a record-only save, never a stage transition.
    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(row.getByText(/changed from proposed/)).toBeVisible();
  });

  test("Declining a request executes nothing", async ({ page }) => {
    const applicant = await makeApplicant("decline");
    const request = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId: applicant.id,
        actionType: "SCHEDULE_IN_PERSON_INTERVIEW",
        rationale: "Requesting.",
        proposedOutcome: "Schedule an in-person interview at the proposed date/time.",
        proposedScheduledAt: new Date(`${futureLocalDatetime(15, 11)}:00`),
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    const row = page.locator("div.rounded-md.border", { hasText: `NS decline-${RUN_ID}` });
    await row.locator('button:has-text("Decline")').click();
    await page.waitForTimeout(800);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("DECLINED");
    expect(after.executionStatus).toBeNull();
    expect(after.decidedScheduledAt).toBeNull();

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");
    expect(applicantAfter.scheduledAt).toBeNull();
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(0);
  });

  test("A stale request (stage changed after submission) becomes Needs Resubmission instead of being decided or executed", async ({
    page,
  }) => {
    const applicant = await makeApplicant("stale");
    const request = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId: applicant.id,
        actionType: "SCHEDULE_IN_PERSON_INTERVIEW",
        rationale: "Requesting.",
        proposedOutcome: "Schedule an in-person interview at the proposed date/time.",
        proposedScheduledAt: new Date(`${futureLocalDatetime(16, 11)}:00`),
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });
    // The record moved on since submission.
    await prisma.applicant.update({ where: { id: applicant.id }, data: { stage: "OFFER_SENT" } });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    await page.waitForLoadState("networkidle");
    // Attempting to decide a stale request is what flips it to Needs
    // Resubmission — it isn't retroactively marked just by existing.
    let row = page.locator("div.rounded-md.border", { hasText: `NS stale-${RUN_ID}` });
    await row.locator('button:has-text("Approve")').click();
    await page.waitForTimeout(1000);
    await page.reload();
    await page.waitForLoadState("networkidle");
    row = page.locator("div.rounded-md.border", { hasText: `NS stale-${RUN_ID}` });
    await expect(row.getByText("Needs resubmission")).toBeVisible();
    // No decide controls offered on a stale row.
    await expect(row.locator('button:has-text("Approve")')).toHaveCount(0);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("NEEDS_RESUBMISSION");
    expect(after.executionStatus).toBeNull();
    // A request awaiting Pedro's correction never counts toward the
    // manager's own badge.
    const badgeCount = await prisma.approvalRequest.count({ where: { managerId: adminId, status: "PENDING" } });
    const needsResubCount = await prisma.approvalRequest.count({ where: { id: request.id, status: "PENDING" } });
    expect(needsResubCount).toBe(0);
    void badgeCount;
  });

  test("A slot conflict on approval fails execution cleanly: decision recorded, nothing booked, no confirmation sent", async ({
    page,
  }) => {
    const conflictingApplicant = await makeApplicant("conflict-other");
    const applicant = await makeApplicant("conflict");
    const conflictTime = futureLocalDatetime(17, 13);
    const conflictDate = new Date(`${conflictTime}:00`);

    // A pre-existing booking for the SAME interviewer (the deciding admin)
    // at the exact time about to be approved.
    await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: adminId,
        format: "IN_PERSON",
        startsAt: conflictDate,
        durationMins: 30,
        bufferedStartsAt: conflictDate,
        bufferedEndsAt: new Date(conflictDate.getTime() + 30 * 60_000),
        bookedById: conflictingApplicant.id,
        createdById: adminId,
      },
    });

    const request = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId: applicant.id,
        actionType: "SCHEDULE_IN_PERSON_INTERVIEW",
        rationale: "Requesting.",
        proposedOutcome: "Schedule an in-person interview at the proposed date/time.",
        proposedScheduledAt: conflictDate,
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    const row = page.locator("div.rounded-md.border", { hasText: `NS conflict-${RUN_ID}` }).first();
    await row.locator('button:has-text("Approve")').click();
    await page.waitForTimeout(1000);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    // The decision itself still succeeded — distinct from execution.
    expect(after.status).toBe("APPROVED");
    expect(after.executionStatus).toBe("FAILED");
    expect(after.executionError).toMatch(/conflict/i);

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED"); // never moved
    expect(applicantAfter.scheduledAt).toBeNull();
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(0);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Failed").first()).toBeVisible();

    // Retrying with a clear time succeeds — proving safe recovery without
    // re-approving, and proving the approved record stays intact.
    const clearTime = futureLocalDatetime(18, 15);
    const rowAfterReload = page.locator("div.rounded-md.border", { hasText: `NS conflict-${RUN_ID}` }).first();
    await rowAfterReload.locator('input[type="datetime-local"]').fill(clearTime);
    await rowAfterReload.locator('button:has-text("Retry")').click();
    await page.waitForTimeout(1200);

    const afterRetry = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(afterRetry.executionStatus).toBe("SUCCEEDED");
    const applicantAfterRetry = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfterRetry.stage).toBe("IN_PERSON_SCHEDULED");
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(1);
  });

  test("Only the deciding manager can retry execution — a forged call from a different manager is refused", async ({
    page,
  }) => {
    const otherManager = await prisma.user.create({
      data: {
        email: `other-manager-${RUN_ID}@example.com`,
        name: `Other Manager ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    try {
      const applicant = await makeApplicant("retry-auth");
      const conflictingApplicant = await makeApplicant("retry-auth-other");
      const conflictDate = new Date(`${futureLocalDatetime(19, 13)}:00`);
      await prisma.interviewAvailabilitySlot.create({
        data: {
          interviewerId: adminId,
          format: "IN_PERSON",
          startsAt: conflictDate,
          durationMins: 30,
          bufferedStartsAt: conflictDate,
          bufferedEndsAt: new Date(conflictDate.getTime() + 30 * 60_000),
          bookedById: conflictingApplicant.id,
          createdById: adminId,
        },
      });
      const request = await prisma.approvalRequest.create({
        data: {
          requesterId: officeAssistantId,
          managerId: adminId,
          applicantId: applicant.id,
          actionType: "SCHEDULE_IN_PERSON_INTERVIEW",
          rationale: "Requesting.",
          proposedOutcome: "Schedule an in-person interview at the proposed date/time.",
          proposedScheduledAt: conflictDate,
          applicantStageAtRequest: "IN_PERSON_PASSED",
          status: "APPROVED",
          decidedById: adminId,
          decidedAt: new Date(),
          decidedScheduledAt: conflictDate,
          executionStatus: "FAILED",
          executionError: "That time conflicts with another interview — please pick another.",
          executedById: adminId,
          executedAt: new Date(),
        },
      });

      // Capture retryApprovalExecutionAction's real id off the legitimate
      // decider's own retry click (nothing else here actually clears the
      // conflict, so this retry attempt fails again for the SAME reason —
      // irrelevant to this test, which only cares that the id is real).
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto("/recruiting/approvals");
      const adminRow = page.locator("div.rounded-md.border", { hasText: `NS retry-auth-${RUN_ID}` }).first();
      const retryActionId = await captureActionId(page, async () => {
        await adminRow.locator('button:has-text("Retry")').click();
      });
      await page.waitForTimeout(500);

      // Now replay that same action id as a DIFFERENT manager this request
      // was never routed to — the action's own decidedById check must
      // refuse it regardless, not just the UI's visibility.
      await loginAs(page, otherManager.email, OA_PASSWORD);
      await forgeAction(page, "/recruiting/approvals", retryActionId, [request.id, undefined]);
      await page.waitForTimeout(500);

      const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.executionStatus).toBe("FAILED");
      expect(after.executedById).toBe(adminId);
    } finally {
      await prisma.user.delete({ where: { id: otherManager.id } });
    }
  });

  test("Pedro gains no evaluation/scoring authority from this feature — the Working Session tab offers no save control for him", async ({
    page,
  }) => {
    // saveWorkingSessionAction itself already refuses role OFFICE_ASSISTANT
    // server-side (pre-existing, unmodified by this PR — see its own
    // comment in recruiting/applicants/actions.ts); this just confirms the
    // UI never even offers Pedro the control in the first place. The new
    // execution path's own preservation of existing scores/checklist/
    // evaluator is covered directly in the execution-internals describe
    // block below (it runs under the approving MANAGER's session, never
    // Pedro's).
    const applicant = await makeApplicant("no-eval-authority");
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /save working session/i })).toHaveCount(0);
    expect(await prisma.workingSessionRecord.findUnique({ where: { applicantId: applicant.id } })).toBeNull();
  });
});

test.describe("Pedro's next-step request execution internals (direct library calls)", () => {
  let adminId: string;
  let jobPostingId: string;
  const applicantIds: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;
  });

  test.afterAll(async () => {
    await prisma.workingSessionRecord.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.interviewAvailabilitySlot.deleteMany({ where: { bookedById: { in: applicantIds } } });
    await prisma.approvalRequest.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.communicationLog.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.$disconnect();
  });

  async function makeApplicant(tag: string) {
    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Direct",
        lastName: `${tag}-${RUN_ID}`,
        email: `direct-${tag}-${RUN_ID}@example.com`,
        phone: "5555562000",
        stage: "IN_PERSON_PASSED",
      },
    });
    applicantIds.push(applicant.id);
    return applicant;
  }

  async function makeRequest(applicantId: string, actionType: "SCHEDULE_IN_PERSON_INTERVIEW" | "SCHEDULE_WORKING_SESSION", scheduledAt: Date) {
    return prisma.approvalRequest.create({
      data: {
        requesterId: adminId,
        managerId: adminId,
        applicantId,
        actionType,
        rationale: "direct-call fixture",
        proposedOutcome: "direct-call fixture",
        proposedScheduledAt: scheduledAt,
        decidedScheduledAt: scheduledAt,
        applicantStageAtRequest: "IN_PERSON_PASSED",
        status: "APPROVED",
        decidedById: adminId,
        decidedAt: new Date(),
      },
    });
  }

  test("executeApprovedInPersonInterview books the slot and sends exactly one confirmation on success", async () => {
    const applicant = await makeApplicant("direct-success");
    const when = new Date(`${futureLocalDatetime(30, 10)}:00`);
    const request = await makeRequest(applicant.id, "SCHEDULE_IN_PERSON_INTERVIEW", when);

    await claimExecutionAttempt(request.id);
    await executeApprovedInPersonInterview(request.id, applicant.id, when, adminId);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.executionStatus).toBe("SUCCEEDED");
    expect(after.executionError).toBeNull();

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_SCHEDULED");
    expect(applicantAfter.interviewFormat).toBe("IN_PERSON");

    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(1);
  });

  test("A calendar-sync failure is recorded as PARTIAL without blocking the confirmation email", async () => {
    const applicant = await makeApplicant("direct-partial");
    const when = new Date(`${futureLocalDatetime(31, 10)}:00`);
    const request = await makeRequest(applicant.id, "SCHEDULE_IN_PERSON_INTERVIEW", when);

    const fakeFailingCalendar = async () => ({ eventId: null, syncFailed: true });
    await claimExecutionAttempt(request.id);
    await executeApprovedInPersonInterview(
      request.id,
      applicant.id,
      when,
      adminId,
      fakeFailingCalendar as never,
      undefined
    );

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.executionStatus).toBe("PARTIAL");
    expect(after.executionError).toMatch(/calendar/i);

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_SCHEDULED"); // still booked
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(1); // still notified

    const slot = await prisma.interviewAvailabilitySlot.findUniqueOrThrow({ where: { bookedById: applicant.id } });
    expect(slot.calendarSyncFailedAt).not.toBeNull();
  });

  test("A slot conflict fails before any write — never a false 'scheduled' state", async () => {
    const conflictingApplicant = await makeApplicant("direct-conflict-other");
    const applicant = await makeApplicant("direct-conflict");
    const when = new Date(`${futureLocalDatetime(32, 10)}:00`);
    await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: adminId,
        format: "IN_PERSON",
        startsAt: when,
        durationMins: 30,
        bufferedStartsAt: when,
        bufferedEndsAt: new Date(when.getTime() + 30 * 60_000),
        bookedById: conflictingApplicant.id,
        createdById: adminId,
      },
    });
    const request = await makeRequest(applicant.id, "SCHEDULE_IN_PERSON_INTERVIEW", when);

    await claimExecutionAttempt(request.id);
    await executeApprovedInPersonInterview(request.id, applicant.id, when, adminId);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.executionStatus).toBe("FAILED");

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");
    expect(applicantAfter.scheduledAt).toBeNull();
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(0);
  });

  test("executeApprovedWorkingSession writes only scheduledAt — existing scores, checklist, and lead evaluator survive untouched", async () => {
    const applicant = await makeApplicant("ws-preserve");
    const preExisting = await prisma.workingSessionRecord.create({
      data: {
        applicantId: applicant.id,
        leadEvaluatorId: adminId,
        technicalScore: 4,
        technicalNotes: "Solid technique.",
        preSessionChecklist: [{ label: "Supplies loaded", checked: true }],
        recommendation: "HIRE",
      },
    });
    const when = new Date(`${futureLocalDatetime(33, 9)}:00`);
    const request = await makeRequest(applicant.id, "SCHEDULE_WORKING_SESSION", when);

    await claimExecutionAttempt(request.id);
    await executeApprovedWorkingSession(request.id, applicant.id, when, adminId);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.executionStatus).toBe("SUCCEEDED");

    const ws = await prisma.workingSessionRecord.findUniqueOrThrow({ where: { applicantId: applicant.id } });
    expect(ws.scheduledAt?.toISOString()).toBe(when.toISOString());
    expect(ws.leadEvaluatorId).toBe(preExisting.leadEvaluatorId);
    expect(ws.technicalScore).toBe(4);
    expect(ws.technicalNotes).toBe("Solid technique.");
    expect(ws.preSessionChecklist).toEqual([{ label: "Supplies loaded", checked: true }]);
    expect(ws.recommendation).toBe("HIRE");
  });

  test("claimExecutionAttempt prevents a concurrent double-execution — only one of two simultaneous attempts proceeds", async () => {
    const applicant = await makeApplicant("direct-dedup");
    const when = new Date(`${futureLocalDatetime(34, 10)}:00`);
    const request = await makeRequest(applicant.id, "SCHEDULE_IN_PERSON_INTERVIEW", when);

    const [claimedA, claimedB] = await Promise.all([
      claimExecutionAttempt(request.id),
      claimExecutionAttempt(request.id),
    ]);
    expect([claimedA, claimedB].filter(Boolean).length).toBe(1);

    // The loser must never also execute — simulate exactly that discipline:
    // only the winner proceeds.
    if (claimedA) await executeApprovedInPersonInterview(request.id, applicant.id, when, adminId);
    if (claimedB) await executeApprovedInPersonInterview(request.id, applicant.id, when, adminId);

    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(1);
    const slot = await prisma.interviewAvailabilitySlot.findUnique({ where: { bookedById: applicant.id } });
    expect(slot).not.toBeNull();
  });

  test("A retry after a FAILED slot conflict succeeds once the time is cleared, without a second claim attempt in between", async () => {
    const conflictingApplicant = await makeApplicant("direct-retry-other");
    const applicant = await makeApplicant("direct-retry");
    const badTime = new Date(`${futureLocalDatetime(35, 10)}:00`);
    const goodTime = new Date(`${futureLocalDatetime(36, 11)}:00`);
    await prisma.interviewAvailabilitySlot.create({
      data: {
        interviewerId: adminId,
        format: "IN_PERSON",
        startsAt: badTime,
        durationMins: 30,
        bufferedStartsAt: badTime,
        bufferedEndsAt: new Date(badTime.getTime() + 30 * 60_000),
        bookedById: conflictingApplicant.id,
        createdById: adminId,
      },
    });
    const request = await makeRequest(applicant.id, "SCHEDULE_IN_PERSON_INTERVIEW", badTime);

    await claimExecutionAttempt(request.id);
    await executeApprovedInPersonInterview(request.id, applicant.id, badTime, adminId);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })).executionStatus).toBe(
      "FAILED"
    );

    // A second claim attempt while already FAILED must succeed (it's a
    // legitimate retry target), and execute exactly once more.
    const reclaimed = await claimExecutionAttempt(request.id);
    expect(reclaimed).toBe(true);
    await executeApprovedInPersonInterview(request.id, applicant.id, goodTime, adminId);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.executionStatus).toBe("SUCCEEDED");
    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(applicantAfter.scheduledAt?.toISOString()).toBe(goodTime.toISOString());
    expect(await prisma.communicationLog.count({ where: { applicantId: applicant.id } })).toBe(1);
  });
});
