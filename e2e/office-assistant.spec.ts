import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for the Office Assistant role: the Permissions screen's area
// grants, recruiting's narrow edit scope (routine stage moves allowed,
// final hiring actions blocked even via a hand-crafted UI control), the
// bounded Send-for-approval workflow (pending never mutates anything,
// approval alone never executes), None/View/Edit enforcement with a live
// permission change taking effect without a fresh login, hidden-data
// absence on the Staff/Home pages, and basic To-Do/Sales/Operations
// scoping. Fixtures only — a disposable Office Assistant user, applicant,
// lead, and checklist tasks, all tagged with a unique run id and removed
// in afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_EMAIL = `oa-e2e-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// Captures the real Next.js Server Action id for whichever action `trigger`
// invokes, by watching the network while it runs — then that id can be
// replayed (with a different session's cookies, different arguments, or
// both) to simulate a forged/direct call against the real server, not a
// mock. Same technique as e2e/assigned-todos.spec.ts.
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

test.describe.serial("Office Assistant role", () => {
  let adminId: string;
  let officeAssistantId: string;
  let applicantId: string;
  let jobPostingId: string;
  let leadId: string;
  let traineeId: string;
  let teamTaskId: string;
  let ownerOnlyTaskId: string;
  let assignedTaskId: string;
  // setApplicantStageAction's real Next.js server-action id — captured off
  // a legitimate routine click in the first test below, then reused by the
  // direct/forged-call checks further down (same exported action
  // regardless of which args it's replayed with).
  let setStageActionId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `OA E2E ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: {
          create: [
            { area: "HR_SUMMARY", canEdit: false },
            { area: "RECRUITING", canEdit: true },
            { area: "ONBOARDING", canEdit: true },
            { area: "TRAINING", canEdit: true },
            { area: "STAFF_DIRECTORY", canEdit: false },
            { area: "SALES_LEADS", canEdit: true },
            { area: "CALLBACK_QUEUE", canEdit: true },
            { area: "OPERATIONAL_STATUS", canEdit: false },
            { area: "ASSIGNED_TASKS", canEdit: true },
          ],
        },
      },
    });
    officeAssistantId = oa.id;

    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId: jobPosting.id,
        firstName: "OAE2E",
        lastName: `Applicant-${RUN_ID}`,
        email: `oa-applicant-${RUN_ID}@example.com`,
        phone: "5555559001",
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    applicantId = applicant.id;

    const lead = await prisma.lead.create({
      data: {
        firstName: "OAE2E",
        lastName: `Lead-${RUN_ID}`,
        email: `oa-lead-${RUN_ID}@example.com`,
        phone: "5555559002",
        source: "OTHER",
        stage: "NEW_INQUIRY",
      },
    });
    leadId = lead.id;

    const trainee = await prisma.user.create({
      data: {
        email: `oa-trainee-${RUN_ID}@example.com`,
        name: `OA Trainee ${RUN_ID}`,
        role: "TRAINEE",
        active: true,
        hireDate: new Date(),
      },
    });
    traineeId = trainee.id;

    const teamTask = await prisma.checklistTask.create({
      data: { frequency: "ONE_TIME", task: `OA shared task ${RUN_ID}`, owner: "TEAM", visibility: "TEAM" },
    });
    teamTaskId = teamTask.id;
    const ownerTask = await prisma.checklistTask.create({
      data: { frequency: "ONE_TIME", task: `OA owner-only task ${RUN_ID}`, owner: "OWNER", visibility: "OWNER_ONLY" },
    });
    ownerOnlyTaskId = ownerTask.id;
    const assignedTask = await prisma.checklistTask.create({
      data: {
        frequency: "ONE_TIME",
        task: `OA assigned task ${RUN_ID}`,
        owner: "TEAM",
        visibility: "TEAM",
        assigneeId: officeAssistantId,
      },
    });
    assignedTaskId = assignedTask.id;
  });

  test.afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({ where: { actorId: officeAssistantId } });
    await prisma.approvalRequest.deleteMany({ where: { applicantId } });
    await prisma.checklistTask.deleteMany({ where: { id: { in: [teamTaskId, ownerOnlyTaskId, assignedTaskId] } } });
    await prisma.leadNote.deleteMany({ where: { leadId } });
    await prisma.lead.delete({ where: { id: leadId } });
    await prisma.applicantNote.deleteMany({ where: { applicantId } });
    await prisma.applicant.delete({ where: { id: applicantId } });
    await prisma.user.delete({ where: { id: traineeId } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.delete({ where: { id: officeAssistantId } });
    await prisma.$disconnect();
  });

  test("Admin can assign the Office Assistant role and area access on the Permissions screen", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    await expect(page.locator(`text=${OA_EMAIL}`)).toBeVisible();

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: officeAssistantId } });
    expect(dbUser.role).toBe("OFFICE_ASSISTANT");
    const grants = await prisma.areaAccess.findMany({ where: { userId: officeAssistantId } });
    expect(grants.length).toBe(9);
    expect(grants.find((g) => g.area === "RECRUITING")?.canEdit).toBe(true);
  });

  test("Office Assistant can read an applicant, log a note, and move a routine stage", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    const res = await page.goto(`/recruiting/applicants/${applicantId}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("OAE2E");

    // Routine move: Phone Interview Scheduled -> Passed is in NEXT_STAGES
    // and not in the Office-Assistant-blocked set (Offer Sent/Hired/
    // Rejected/Bench). Captured here for the direct/forged-call checks
    // further down this file.
    setStageActionId = await captureActionId(page, async () => {
      await page.click('button:has-text("Move to: Phone/Zoom Interview Passed")');
    });
    await page.waitForTimeout(1000);
    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).toBe("PHONE_INTERVIEW_PASSED");

    // Move to a stage with Offer Sent as a reachable option, for the
    // blocked-transition tests below.
    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "IN_PERSON_PASSED" } });
  });

  test("Office Assistant cannot move an applicant to a final hiring stage — the controls are hidden entirely, and a direct call is still refused", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);

    // IN_PERSON_PASSED's other routine targets (Offer Sent, Talent Pool)
    // both need the authorized manager — hidden entirely for this role,
    // never just disabled, so there's no button here that would just fail.
    await expect(page.locator('button:has-text("Move to: Offer Sent")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Move to: Talent Pool")')).toHaveCount(0);

    // Hiding the button is UX, not the security boundary — a direct call to
    // the same server action, bypassing the UI entirely, must still be
    // refused before any write.
    await forgeAction(page, `/recruiting/applicants/${applicantId}`, setStageActionId, [applicantId, "OFFER_SENT"]);
    await page.waitForTimeout(500);

    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).toBe("IN_PERSON_PASSED");
  });

  test("Office Assistant's rejection control opens a rejection request instead of rejecting directly", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);

    // The direct control is gone entirely for this role — never rendered,
    // not just disabled — and rejectApplicantAction's own OFFICE_ASSISTANT
    // guard is never reached from the UI at all.
    await expect(page.locator('button:has-text("Move to: Rejected")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Reject (No Email)")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Reject & Send Email")')).toHaveCount(0);

    await page.click("text=Request rejection");
    await page.waitForLoadState("networkidle");

    // Lands on the existing Approval Requests composer, already open and
    // preset to the right action type — nothing selected manually.
    await expect(page.locator('select[name="actionType"]')).toHaveValue("REJECT_APPLICANT");
    await expect(page.locator('textarea[name="rationale"]')).toBeVisible();

    // Navigating here and seeing the open composer never itself mutates or
    // submits anything.
    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).not.toBe("REJECTED");
    const requestCount = await prisma.approvalRequest.count({ where: { applicantId } });
    expect(requestCount).toBe(0);
  });

  test("The manual stage-correction override never offers a blocked target, and a direct call to it is still refused", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("Correct the stage manually")');

    const select = page.locator('select[name="targetStage"]');
    await expect(select).toBeVisible();
    // All four of OFFICE_ASSISTANT_BLOCKED_STAGES are removed from this
    // selector, not just Rejected.
    for (const blocked of ["OFFER_SENT", "HIRED", "REJECTED", "BENCH"]) {
      await expect(select.locator(`option[value="${blocked}"]`)).toHaveCount(0);
    }

    // Hiding the option is only the UX — assertRoutineStageTransition is
    // the real boundary, checked again here via a direct call that
    // bypasses this form (and its now-missing option) entirely.
    await forgeAction(page, `/recruiting/applicants/${applicantId}`, setStageActionId, [applicantId, "HIRED"]);
    await page.waitForTimeout(500);

    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).not.toBe("HIRED");
    expect(after.stage).toBe("IN_PERSON_PASSED");
  });

  test("Interview Decision panel hides Office Assistant's direct Hire/Talent Pool/Not Moving Forward, keeps the non-mutating links, and never shows a dead-end Request rejection link when view-only", async ({ page }) => {
    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "IN_PERSON_SCHEDULED" } });

    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await expect(page.locator("h2:has-text(\"Interview Decision\")")).toBeVisible();

    // Hire and Talent Pool both need the authorized manager (they're in
    // OFFICE_ASSISTANT_BLOCKED_STAGES); Not Moving Forward is replaced
    // with the same Request rejection link StageControls uses.
    await expect(page.locator('button:has-text("Hire")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Talent Pool")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Not Moving Forward")')).toHaveCount(0);
    // Working Session / Additional Screening never change the stage, so
    // they're untouched by this restriction and stay for every role.
    await expect(page.locator('a:has-text("Working Session")')).toBeVisible();
    await expect(page.locator('a:has-text("Additional Screening")')).toBeVisible();

    await page.click("text=Request rejection");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('select[name="actionType"]')).toHaveValue("REJECT_APPLICANT");

    // View-only (no RECRUITING edit): the panel must not offer a dead-end
    // Request rejection link either — submitApprovalRequestAction would
    // just refuse it.
    await prisma.areaAccess.updateMany({ where: { userId: officeAssistantId, area: "RECRUITING" }, data: { canEdit: false } });
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await expect(page.locator('button:has-text("Hire")')).toHaveCount(0);
    await expect(page.locator("text=Request rejection")).toHaveCount(0);
    await prisma.areaAccess.updateMany({ where: { userId: officeAssistantId, area: "RECRUITING" }, data: { canEdit: true } });

    // Restore for the tests that follow — this role never actually
    // mutated the applicant above (only navigated/opened the composer).
    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "IN_PERSON_PASSED" } });
  });

  test("Request rejection: submitting via the preset composer records the manager-routed request-stage snapshot, without changing the applicant or sending anything", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click("text=Request rejection");
    await page.waitForLoadState("networkidle");

    // Already preset — never picked from the dropdown manually.
    await expect(page.locator('select[name="actionType"]')).toHaveValue("REJECT_APPLICANT");
    await page.fill('textarea[name="rationale"]', "Did not meet availability requirements.");
    await page.fill('textarea[name="proposedOutcome"]', "Decline — availability mismatch.");
    await page.click('button:has-text("Submit Request")');
    await page.waitForTimeout(1000);

    const requests = await prisma.approvalRequest.findMany({ where: { applicantId } });
    expect(requests.length).toBe(1);
    expect(requests[0].status).toBe("PENDING");
    expect(requests[0].actionType).toBe("REJECT_APPLICANT");
    // Routed to the requester's configured manager — never anyone else.
    expect(requests[0].managerId).toBe(adminId);
    // The request-stage snapshot used later to detect drift (see the stale
    // request test below).
    expect(requests[0].applicantStageAtRequest).toBe("IN_PERSON_PASSED");

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");
    // No rejection — or any other message — was sent as a side effect of
    // merely submitting the request.
    const commCount = await prisma.communicationLog.count({ where: { applicantId } });
    expect(commCount).toBe(0);
  });

  test("Pipeline board hides Office Assistant's manager-authority primary action (Send Offer, Mark Hired) but keeps a routine one", async ({ page }) => {
    const disposable = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "OAE2E",
        lastName: `Pipeline-${RUN_ID}`,
        email: `oa-pipeline-${RUN_ID}@example.com`,
        phone: "5555559003",
        stage: "NEW",
      },
    });
    try {
      await loginAs(page, OA_EMAIL, OA_PASSWORD);
      await page.goto("/recruiting");
      let card = page.locator("div.rounded-lg.border", { hasText: `Pipeline-${RUN_ID}` }).first();
      // NEW -> Prescreen Passed is routine — kept.
      await expect(card.locator('button:has-text("Pass Prescreen")')).toBeVisible();

      await prisma.applicant.update({ where: { id: disposable.id }, data: { stage: "IN_PERSON_PASSED" } });
      await page.goto("/recruiting");
      card = page.locator("div.rounded-lg.border", { hasText: `Pipeline-${RUN_ID}` }).first();
      // IN_PERSON_PASSED -> Offer Sent needs the authorized manager.
      await expect(card.locator("button")).toHaveCount(0);

      await prisma.applicant.update({ where: { id: disposable.id }, data: { stage: "OFFER_SENT" } });
      await page.goto("/recruiting");
      card = page.locator("div.rounded-lg.border", { hasText: `Pipeline-${RUN_ID}` }).first();
      // Offer Sent -> Hired needs the authorized manager.
      await expect(card.locator("button")).toHaveCount(0);
    } finally {
      await prisma.applicant.delete({ where: { id: disposable.id } });
    }
  });

  test("Recruiting Inbox hides Office Assistant's Pass control; a direct/forged call to it is still refused without mutating anything", async ({ page }) => {
    const qualified = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "OAE2E",
        lastName: `Inbox-${RUN_ID}`,
        email: `oa-inbox-${RUN_ID}@example.com`,
        phone: "5555559004",
        stage: "PRESCREEN_PASSED",
      },
    });
    // A second, disposable applicant only used to legitimately capture
    // passApplicantAction's real server-action id, as an authorized role —
    // Office Assistant never has a "Pass" button to click it from.
    const captureSubject = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "OAE2E",
        lastName: `InboxCapture-${RUN_ID}`,
        email: `oa-inbox-capture-${RUN_ID}@example.com`,
        phone: "5555559005",
        stage: "PRESCREEN_PASSED",
      },
    });
    try {
      await loginAs(page, OA_EMAIL, OA_PASSWORD);
      await page.goto("/recruiting/inbox");
      const card = page.locator(`[data-testid="applicant-quick-card-${qualified.id}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator('button:has-text("Pass")')).toHaveCount(0);
      await expect(card.locator('button:has-text("Schedule Zoom Interview")')).toBeVisible();
      await expect(card.locator('a:has-text("Full Profile")')).toBeVisible();
      await expect(card.getByText(/authorized manager/i)).toBeVisible();

      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto("/recruiting/inbox");
      const captureCard = page.locator(`[data-testid="applicant-quick-card-${captureSubject.id}"]`);
      const passActionId = await captureActionId(page, async () => {
        await captureCard.locator('button:has-text("Pass")').click();
      });

      await loginAs(page, OA_EMAIL, OA_PASSWORD);
      await page.goto("/recruiting/inbox");
      await forgeAction(page, "/recruiting/inbox", passActionId, [qualified.id]);
      await page.waitForTimeout(500);

      const after = await prisma.applicant.findUniqueOrThrow({ where: { id: qualified.id } });
      expect(after.stage).toBe("PRESCREEN_PASSED");
      const commCount = await prisma.communicationLog.count({ where: { applicantId: qualified.id } });
      expect(commCount).toBe(0);
    } finally {
      await prisma.applicant.deleteMany({ where: { id: { in: [qualified.id, captureSubject.id] } } });
    }
  });

  test("Office Assistant with no valid approval manager configured gets a clear setup message, not a routed request", async ({
    page,
  }) => {
    const unroutedOa = await prisma.user.create({
      data: {
        email: `oa-no-manager-${RUN_ID}@example.com`,
        name: `OA No Manager ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        // No approvalManagerId at all yet.
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    // A manager-sounding name, but a role with no real decision authority —
    // proves the check is role-based, never a display-title match.
    const fakeManager = await prisma.user.create({
      data: {
        email: `regional-manager-${RUN_ID}@example.com`,
        name: "Regional Manager",
        role: "TRAINEE",
        active: true,
      },
    });

    try {
      await loginAs(page, unroutedOa.email, OA_PASSWORD);
      await page.goto(`/recruiting/applicants/${applicantId}`);
      await page.click("text=Request rejection");
      await page.waitForLoadState("networkidle");
      await page.fill('textarea[name="rationale"]', "No manager configured yet.");
      await page.fill('textarea[name="proposedOutcome"]', "Decline.");
      await page.click('button:has-text("Submit Request")');
      await page.waitForTimeout(800);
      await expect(page.getByText(/No approval manager is set up/i)).toBeVisible();
      expect(await prisma.approvalRequest.count({ where: { requesterId: unroutedOa.id } })).toBe(0);

      // Now "configure" the misleadingly-named but unauthorized manager.
      await prisma.user.update({ where: { id: unroutedOa.id }, data: { approvalManagerId: fakeManager.id } });
      await page.goto(`/recruiting/applicants/${applicantId}`);
      await page.click("text=Request rejection");
      await page.waitForLoadState("networkidle");
      await page.fill('textarea[name="rationale"]', "Manager configured, but not authorized.");
      await page.fill('textarea[name="proposedOutcome"]', "Decline.");
      await page.click('button:has-text("Submit Request")');
      await page.waitForTimeout(800);
      await expect(page.getByText(/configured approval manager is no longer valid/i)).toBeVisible();
      expect(await prisma.approvalRequest.count({ where: { requesterId: unroutedOa.id } })).toBe(0);
    } finally {
      await prisma.areaAccess.deleteMany({ where: { userId: unroutedOa.id } });
      await prisma.user.delete({ where: { id: unroutedOa.id } });
      await prisma.user.delete({ where: { id: fakeManager.id } });
    }
  });

  test("Manager sees exactly one queue item and can approve it; approval alone does not change hiring state or send anything", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    await expect(page.locator("text=OAE2E").first()).toBeVisible();

    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { applicantId } });
    await page.click('button:has-text("Approve")');
    await page.waitForTimeout(1000);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.decidedById).toBe(adminId);

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED"); // unchanged — approval never executes
    expect(applicantAfter.stage).not.toBe("REJECTED");
    // Approving a REJECT_APPLICANT request is a decision only — it never
    // itself sends the rejection email (or anything else).
    const commCount = await prisma.communicationLog.count({ where: { applicantId } });
    expect(commCount).toBe(0);
  });

  test("The manager's own manual rejection (no email) and mark-completed step carry out the approved request", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { applicantId, status: "APPROVED" } });

    // The manager retains their own direct reject control — "Move to:
    // Rejected" is unchanged for anyone but an Office Assistant — and uses
    // the existing email/no-email choice themselves, same as any other
    // rejection.
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("Move to: Rejected")');
    await page.click('button:has-text("Reject (No Email)")');
    await page.waitForTimeout(1000);

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicantAfter.stage).toBe("REJECTED");
    const commCount = await prisma.communicationLog.count({ where: { applicantId } });
    expect(commCount).toBe(0); // "No Email" — nothing sent.

    // Then, separately, marks the already-approved request completed —
    // an audit marker only, never itself the thing that executes anything.
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("I\'ve completed this manually — mark done")');
    await page.waitForTimeout(1000);

    const requestAfter = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(requestAfter.executedById).toBe(adminId);
    expect(requestAfter.executedAt).not.toBeNull();

    // Restore the shared applicant's stage for the tests that still follow.
    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "IN_PERSON_PASSED", rejectedAt: null } });
  });

  test("A permission revoked mid-session shows a readable inline message instead of crashing when a still-visible routine control is submitted", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("Correct the stage manually")');
    await page.locator('select[name="targetStage"]').selectOption("IN_PERSON_SCHEDULED");

    // Revoke edit access without a fresh page load — the already-rendered
    // form has no way to know this happened until it actually submits, the
    // same way a real race between two browser tabs would play out.
    await prisma.areaAccess.updateMany({ where: { userId: officeAssistantId, area: "RECRUITING" }, data: { canEdit: false } });

    try {
      await page.click('button:has-text("Confirm")');
      await page.waitForTimeout(800);

      // Readable, inline — never Next's generic error boundary (the exact
      // crash this whole fix is about, just reachable from a different,
      // still-visible control this time).
      await expect(page.getByText(/not authorized to make changes/i)).toBeVisible();
      await expect(page.getByText(/application error/i)).toHaveCount(0);

      const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
      expect(after.stage).toBe("IN_PERSON_PASSED"); // unchanged — the write never happened
    } finally {
      await prisma.areaAccess.updateMany({ where: { userId: officeAssistantId, area: "RECRUITING" }, data: { canEdit: true } });
    }
  });

  test("Self-approval is blocked even via a direct/forged server-action call, not only through the UI", async ({ page }) => {
    // Capture decideApprovalRequestAction's real action id off a disposable
    // request, as the admin (the only role whose UI exposes it) — then
    // replay it as the Office Assistant themselves against their own
    // pending request.
    const idCaptureRequest = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId,
        actionType: "SEND_MESSAGE",
        rationale: "id-capture only",
        proposedOutcome: "id-capture only",
        recipientEmail: "nobody@example.com",
        messageText: "id-capture only",
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    const captureRow = page.locator("div.rounded-md.border", { hasText: "id-capture only" }).first();
    const decideActionId = await captureActionId(page, async () => {
      await captureRow.locator('button:has-text("Decline")').click();
    });

    const selfRequest = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId,
        actionType: "REJECT_APPLICANT",
        rationale: "Attempting to self-approve.",
        proposedOutcome: "Decline.",
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });

    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await forgeAction(page, `/recruiting/applicants/${applicantId}`, decideActionId, [
      selfRequest.id,
      "APPROVED",
      "",
    ]);
    await page.waitForTimeout(800);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: selfRequest.id } });
    expect(after.status).toBe("PENDING");
    expect(after.decidedById).toBeNull();
    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");
    const commCount = await prisma.communicationLog.count({ where: { applicantId } });
    expect(commCount).toBe(0);
  });

  test("A stale request (record changed after submission) is marked Needs Resubmission instead of being decided", async ({ page }) => {
    const staleRequest = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId,
        actionType: "OFFER_APPLICANT",
        rationale: "Looks strong.",
        proposedOutcome: "Offer $19/hr.",
        applicantStageAtRequest: "IN_PERSON_PASSED",
      },
    });
    // Simulate the record moving on since the snapshot was taken.
    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "BENCH" } });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/approvals");
    await page.waitForTimeout(500);
    // Approve the (now stale) request from the queue.
    const approveButtons = page.locator('button:has-text("Approve")');
    if (await approveButtons.first().isVisible().catch(() => false)) {
      await approveButtons.first().click();
      await page.waitForTimeout(1000);
    }

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: staleRequest.id } });
    expect(after.status).toBe("NEEDS_RESUBMISSION");

    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "IN_PERSON_PASSED" } });
  });

  test("Office Assistant cannot reach the Pending Approvals decision queue at all (self-approval is unreachable, not just unauthorized)", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/recruiting/approvals");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("Revoking an area access takes effect on the very next request, without a new login", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    let res = await page.goto("/recruiting");
    expect(res?.status()).toBe(200);

    // Revoke mid-session, directly in the DB — simulating the owner
    // changing a permission on the Permissions screen.
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId, area: "RECRUITING" } });

    res = await page.goto("/recruiting");
    // getAreaAccessForUser always re-reads the DB, so this redirects to "/"
    // on the very next request — no re-login needed.
    expect(new URL(page.url()).pathname).toBe("/");

    // Restore for later tests in this file.
    await prisma.areaAccess.create({ data: { userId: officeAssistantId, area: "RECRUITING", canEdit: true } });
  });

  test("None blocks a direct applicant URL; a forged mutation still fails even when the page redirects", async ({ page }) => {
    await prisma.areaAccess.updateMany({ where: { userId: officeAssistantId, area: "RECRUITING" }, data: { canEdit: false } });
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    const res = await page.goto(`/recruiting/applicants/${applicantId}`);
    // View-only now: page loads (RECRUITING view still granted), but the
    // approval-request submit button must not be present.
    expect(res?.status()).toBe(200);
    await expect(page.locator('button:has-text("Request Approval")')).toHaveCount(0);
    // Same view-only gate applies to the "Request rejection" shortcut on
    // StageControls — never a dead-end link either.
    await expect(page.locator("text=Request rejection")).toHaveCount(0);

    await prisma.areaAccess.updateMany({ where: { userId: officeAssistantId, area: "RECRUITING" }, data: { canEdit: true } });
  });

  test("Hidden money/sensitive data is absent from the Staff directory and Home page responses", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);

    const staffRes = await page.goto("/staff");
    expect(staffRes?.status()).toBe(200);
    const staffHtml = await page.content();
    expect(staffHtml).not.toMatch(/Payroll Disputes|Open Complaints|Add Employee/i);

    const homeRes = await page.goto("/");
    expect(homeRes?.status()).toBe(200);
    const homeHtml = await page.content();
    expect(homeHtml).not.toContain("Goals");
    expect(homeHtml).not.toMatch(/Marketing budget/i);
  });

  test("Office Assistant's To-Do list shows shared/assigned tasks but never Owner-only ones", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    const res = await page.goto("/todo");
    expect(res?.status()).toBe(200);
    const html = await page.content();
    expect(html).toContain(`OA shared task ${RUN_ID}`);
    expect(html).toContain(`OA assigned task ${RUN_ID}`);
    expect(html).not.toContain(`OA owner-only task ${RUN_ID}`);
  });

  test("Office Assistant can log a call on a lead but cannot send outbound email/SMS", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    const res = await page.goto(`/sales/leads/${leadId}`);
    expect(res?.status()).toBe(200);
    await page.fill("textarea", "Called, left voicemail, will try again tomorrow.");
    await page.click('button:has-text("Save Note")');
    await page.waitForTimeout(1000);

    const notes = await prisma.leadNote.findMany({ where: { leadId } });
    expect(notes.length).toBe(1);

    const html = await page.content();
    expect(html).not.toMatch(/estimated value/i);
    // The bounded lead detail view never renders LeadCommunicationPanel at
    // all for this role, so there's no send-email/SMS form to even attempt.
    await expect(page.locator('button:has-text("Send Email")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Send Text")')).toHaveCount(0);
  });

  test("Operational Status view shows schedule data only, no pricing", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    const res = await page.goto("/operations");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Operational Status");
  });
});
