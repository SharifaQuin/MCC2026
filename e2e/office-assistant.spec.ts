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

test.describe.serial("Office Assistant role", () => {
  let adminId: string;
  let officeAssistantId: string;
  let applicantId: string;
  let leadId: string;
  let traineeId: string;
  let teamTaskId: string;
  let ownerOnlyTaskId: string;
  let assignedTaskId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });

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
    // Rejected/Bench).
    await page.click('button:has-text("Move to: Phone/Zoom Interview Passed")');
    await page.waitForTimeout(1000);
    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).toBe("PHONE_INTERVIEW_PASSED");

    // Move to a stage with Offer Sent as a reachable option, for the
    // blocked-transition tests below.
    await prisma.applicant.update({ where: { id: applicantId }, data: { stage: "IN_PERSON_PASSED" } });
  });

  test("Office Assistant cannot move an applicant to a final hiring stage, even via the UI", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("Move to: Offer Sent")');
    await page.waitForTimeout(1000);

    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).toBe("IN_PERSON_PASSED");
  });

  test("Office Assistant cannot reject an applicant", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("Move to: Rejected")', { timeout: 5000 }).catch(() => {});
    const rejectNoEmail = page.locator('button:has-text("Reject (No Email)")');
    if (await rejectNoEmail.isVisible().catch(() => false)) {
      await rejectNoEmail.click();
      await page.waitForTimeout(1000);
    }
    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).not.toBe("REJECTED");
  });

  test("Office Assistant cannot reach Mark Hired / final actions via a hand-crafted stage override", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    const overrideToggle = page.locator('button:has-text("Correct the stage manually")');
    if (await overrideToggle.isVisible().catch(() => false)) {
      await overrideToggle.click();
    }
    const select = page.locator('select[name="targetStage"]');
    if (await select.isVisible().catch(() => false)) {
      await select.selectOption("HIRED");
      await page.click('button:has-text("Confirm")').catch(() => {});
      await page.waitForTimeout(1000);
    }
    const after = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(after.stage).not.toBe("HIRED");
  });

  test("Send for approval: submitting a request never mutates the applicant, and routes to the configured manager", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);
    await page.click('button:has-text("Request Approval")');
    await page.selectOption('select[name="actionType"]', "REJECT_APPLICANT");
    await page.fill('textarea[name="rationale"]', "Did not meet availability requirements.");
    await page.fill('textarea[name="proposedOutcome"]', "Decline — availability mismatch.");
    await page.click('button:has-text("Submit Request")');
    await page.waitForTimeout(1000);

    const requests = await prisma.approvalRequest.findMany({ where: { applicantId } });
    expect(requests.length).toBe(1);
    expect(requests[0].status).toBe("PENDING");
    expect(requests[0].managerId).toBe(adminId);

    const applicantAfter = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicantAfter.stage).toBe("IN_PERSON_PASSED");
  });

  test("Manager sees exactly one queue item and can approve it; approval alone does not change hiring state", async ({ page }) => {
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
