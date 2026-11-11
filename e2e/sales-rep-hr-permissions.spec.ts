import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getNewLeadAlertBccEmails } from "../src/lib/leads";

// Covers individually granting a Sales Rep narrow HR-adjacent areas
// (HR_SUMMARY, RECRUITING, ONBOARDING, TRAINING) via the existing
// AreaAccess/Permissions-screen model — the same mechanism Office
// Assistant already uses — WITHOUT changing her role, and without
// touching her existing full Sales access. Mirrors e2e/office-assistant.spec.ts's
// conventions (captureActionId/forgeAction for proving the server-side
// gate holds even when a UI control is hidden, direct prisma fixture
// seeding rather than driving every Permissions-screen control).
//
// Three fixtures:
//   - a plain Sales Rep with NO area grants (today's behavior must be
//     completely unchanged);
//   - a Sales Rep granted RECRUITING edit only (narrowest useful grant —
//     proves one area's access never leaks into another, and that the
//     same final-hiring-stage/approval restrictions an Office Assistant
//     has also bind here);
//   - a Sales Rep granted Melissa's full intended set (HR_SUMMARY view,
//     RECRUITING/ONBOARDING edit, TRAINING view-only, an approval manager)
//     — proves her complete Sales access survives untouched alongside
//     every granted HR area actually working, including after a fresh
//     sign-in, and that Training being view-only (not edit) still lets
//     her see modules but blocks assigning/ending a training assignment
//     server-side — that stays with the owner/admin, with no Sales Rep
//     assignment screen needed.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const REP_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  await page.goto("/account");
  const logoutButton = page.getByRole("button", { name: /log ?out|sign ?out/i }).first();
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
    await page.waitForURL((url) => url.pathname.startsWith("/login"));
  } else {
    // Fall back to clearing the session cookie directly if there's no
    // visible logout control in this viewport/layout.
    await page.context().clearCookies();
  }
}

// Same technique as e2e/office-assistant.spec.ts and e2e/assigned-todos.spec.ts:
// capture the real Next.js Server Action id for whichever action `trigger`
// invokes by watching the network while it runs, then replay it later
// (different session cookies, different args, or both) against the real
// server — proving a restriction is enforced server-side, not just by a
// hidden/disabled UI control.
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

test.describe.serial("Sales Rep individual HR permissions", () => {
  let adminId: string;
  let jobPostingId: string;

  const NO_GRANT_EMAIL = `sr-nogrant-${RUN_ID}@example.com`;
  let noGrantRepId: string;

  const PARTIAL_EMAIL = `sr-partial-${RUN_ID}@example.com`;
  let partialRepId: string;
  let partialApplicantId: string;

  const FULL_EMAIL = `sr-full-${RUN_ID}@example.com`;
  let fullRepId: string;
  let fullApplicantId: string;

  // The Onboarding Checklist tab (and getOnboardingChecklist's real rows)
  // only populate once an applicant has a linked hiredUserId, not merely
  // stage:"HIRED" — a minimal placeholder employee account for each
  // applicant tested that way below.
  let partialHiredUserId: string;
  let fullHiredUserId: string;

  // Fixtures for proving a Training view-only grant still blocks the
  // assign/end-assignment server actions (src/app/actions/trainingAssignments.ts)
  // — a throwaway trainee/trainer pair and one active TrainingAssignment row,
  // used only by the forged-call test below.
  let trainingTraineeId: string;
  let trainingTrainerId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;

    const noGrant = await prisma.user.create({
      data: {
        email: NO_GRANT_EMAIL,
        name: `SR NoGrant ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    noGrantRepId = noGrant.id;

    const partial = await prisma.user.create({
      data: {
        email: PARTIAL_EMAIL,
        name: `SR Partial ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    partialRepId = partial.id;

    const full = await prisma.user.create({
      data: {
        email: FULL_EMAIL,
        name: `SR Full ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
        areaAccess: {
          create: [
            { area: "HR_SUMMARY", canEdit: false },
            { area: "RECRUITING", canEdit: true },
            { area: "ONBOARDING", canEdit: true },
            { area: "TRAINING", canEdit: false },
          ],
        },
      },
    });
    fullRepId = full.id;

    const partialApplicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "SRPartial",
        lastName: `Applicant-${RUN_ID}`,
        email: `sr-partial-applicant-${RUN_ID}@example.com`,
        phone: "5555558001",
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    partialApplicantId = partialApplicant.id;

    const fullApplicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "SRFull",
        lastName: `Applicant-${RUN_ID}`,
        email: `sr-full-applicant-${RUN_ID}@example.com`,
        phone: "5555558002",
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    fullApplicantId = fullApplicant.id;

    const trainingTrainer = await prisma.user.create({
      data: { email: `sr-training-trainer-${RUN_ID}@example.com`, name: `Training Trainer ${RUN_ID}`, role: "TRAINER", active: true },
    });
    trainingTrainerId = trainingTrainer.id;
    const trainingTrainee = await prisma.user.create({
      data: { email: `sr-training-trainee-${RUN_ID}@example.com`, name: `Training Trainee ${RUN_ID}`, role: "TRAINEE", active: true },
    });
    trainingTraineeId = trainingTrainee.id;
  });

  test.afterAll(async () => {
    const applicantIds = [partialApplicantId, fullApplicantId];
    const repIds = [noGrantRepId, partialRepId, fullRepId];
    await prisma.approvalRequest.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.onboardingChecklistItem.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicantNote.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    const hiredUserIds = [partialHiredUserId, fullHiredUserId].filter((id): id is string => !!id);
    if (hiredUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: hiredUserIds } } });
    await prisma.trainingAssignment.deleteMany({ where: { traineeId: trainingTraineeId } });
    await prisma.user.deleteMany({ where: { id: { in: [trainingTraineeId, trainingTrainerId] } } });
    await prisma.auditLogEntry.deleteMany({ where: { actorId: { in: repIds } } });
    await prisma.areaAccess.deleteMany({ where: { userId: { in: repIds } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: repIds } } });
    await prisma.user.deleteMany({ where: { id: { in: repIds } } });
    await prisma.$disconnect();
  });

  // ────────────────────────────────────────────────────────────────────
  // Scenario A: no grants at all — today's behavior must be unchanged.
  // ────────────────────────────────────────────────────────────────────

  test("Sales Rep with no HR grants: recruiting/HR/training all stay closed, direct URLs included, Sales access is completely unaffected", async ({
    page,
  }) => {
    await loginAs(page, NO_GRANT_EMAIL, REP_PASSWORD);

    await page.goto("/recruiting");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");

    await page.goto("/hr");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");

    await page.goto("/modules");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");

    await page.goto("/staff");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");

    const res = await page.goto("/sales");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");
    await expect(page.locator("text=HR Summary")).toHaveCount(0);
    await expect(page.locator("text=Recruiting").first()).toHaveCount(0);
  });

  // ────────────────────────────────────────────────────────────────────
  // The Permissions screen's own controls, driven for real (not just
  // seeded via prisma) — proves the owner can actually grant a Sales Rep
  // these areas and an approval manager through the UI itself, and that
  // the grant takes effect immediately for that rep.
  // ────────────────────────────────────────────────────────────────────

  test("Admin can grant a Sales Rep HR Summary (view) + Recruiting (edit) + an approval manager from the real Permissions screen controls", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    await page.waitForLoadState("networkidle");

    const panelRow = page.locator(`tr:has-text("Sales Rep HR Areas — SR NoGrant ${RUN_ID}")`);
    await expect(panelRow).toBeVisible();

    const hrSummaryRow = panelRow.locator('span:text-is("HR Summary")').locator("..");
    await hrSummaryRow.locator("select").selectOption("VIEW");

    const recruitingRow = panelRow.locator('span:text-is("Recruiting / Applicants")').locator("..");
    await recruitingRow.locator("select").selectOption("EDIT");

    const managerSelect = panelRow.locator('div:has-text("Approval manager")').locator("select");
    await managerSelect.selectOption({ value: adminId });

    // Give the three fire-and-forget server actions a moment to land.
    await page.waitForTimeout(1000);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: noGrantRepId },
      include: { areaAccess: true },
    });
    expect(updated.approvalManagerId).toBe(adminId);
    const hrGrant = updated.areaAccess.find((a) => a.area === "HR_SUMMARY");
    const recruitingGrant = updated.areaAccess.find((a) => a.area === "RECRUITING");
    expect(hrGrant?.canEdit).toBe(false);
    expect(recruitingGrant?.canEdit).toBe(true);

    // Confirm it actually took effect for her, not just in the DB.
    await loginAs(page, NO_GRANT_EMAIL, REP_PASSWORD);
    const hrRes = await page.goto("/hr");
    expect(hrRes?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("HR Summary");
    const recruitingRes = await page.goto("/recruiting");
    expect(recruitingRes?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");
    // Still no Training/Onboarding grant — stays closed.
    await page.goto("/modules");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");
  });

  // ────────────────────────────────────────────────────────────────────
  // Scenario B: Recruiting edit only.
  // ────────────────────────────────────────────────────────────────────

  test("Sales Rep granted Recruiting edit only: can use recruiting, but final hiring stages and Onboarding stay blocked", async ({
    page,
  }) => {
    await loginAs(page, PARTIAL_EMAIL, REP_PASSWORD);

    const res = await page.goto(`/recruiting/applicants/${partialApplicantId}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("SRPartial");

    // Routine move allowed.
    const setStageActionId = await captureActionId(page, async () => {
      await page.click('button:has-text("Move to: Phone/Zoom Interview Passed")');
    });
    await page.waitForTimeout(500);
    let after = await prisma.applicant.findUniqueOrThrow({ where: { id: partialApplicantId } });
    expect(after.stage).toBe("PHONE_INTERVIEW_PASSED");

    await prisma.applicant.update({ where: { id: partialApplicantId }, data: { stage: "IN_PERSON_PASSED" } });

    // Final-hiring-stage controls hidden entirely, same as Office
    // Assistant — "Request rejection" in their place.
    await page.goto(`/recruiting/applicants/${partialApplicantId}`);
    await expect(page.locator('button:has-text("Move to: Offer Sent")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Move to: Rejected")')).toHaveCount(0);
    await expect(page.locator("text=Request rejection")).toBeVisible();

    // Hiding the control is UX only — a direct/forged call to the same
    // server action must still be refused before any write.
    await forgeAction(page, `/recruiting/applicants/${partialApplicantId}`, setStageActionId, [
      partialApplicantId,
      "OFFER_SENT",
    ]);
    await page.waitForTimeout(500);
    after = await prisma.applicant.findUniqueOrThrow({ where: { id: partialApplicantId } });
    expect(after.stage).toBe("IN_PERSON_PASSED");

    // Approval request flow still works (approval manager IS configured
    // for this fixture) — submitting routes to the manager without
    // mutating the applicant or sending anything.
    await page.click("text=Request rejection");
    await page.waitForLoadState("networkidle");
    await page.fill('textarea[name="rationale"]', "Candidate withdrew verbally on the phone.");
    await page.fill('textarea[name="proposedOutcome"]', "Decline — candidate withdrew.");
    await page.click('button:has-text("Submit Request")');
    await page.waitForTimeout(500);
    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { applicantId: partialApplicantId } });
    expect(request.managerId).toBe(adminId);
    expect(request.status).toBe("PENDING");
    const stillUnchanged = await prisma.applicant.findUniqueOrThrow({ where: { id: partialApplicantId } });
    expect(stillUnchanged.stage).toBe("IN_PERSON_PASSED");
  });

  test("Sales Rep granted Recruiting edit only: Onboarding is its own area grant — a checklist checkbox is refused even though she reached this applicant via Recruiting", async ({
    page,
  }) => {
    // The Onboarding Checklist tab only exists for a HIRED applicant — set
    // that directly (fixture setup, not something this role could ever do
    // herself) so the tab/checkbox actually renders.
    const hiredUser = await prisma.user.create({
      data: { email: `sr-partial-hired-${RUN_ID}@example.com`, name: `Partial Hired ${RUN_ID}`, role: "TRAINEE", active: true },
    });
    partialHiredUserId = hiredUser.id;
    await prisma.applicant.update({
      where: { id: partialApplicantId },
      data: { stage: "HIRED", hiredUserId: partialHiredUserId },
    });
    await loginAs(page, PARTIAL_EMAIL, REP_PASSWORD);
    await page.goto(`/recruiting/applicants/${partialApplicantId}?tab=onboarding`);
    await expect(page.locator('label:has-text("Uniform ordered")')).toBeVisible();

    await captureActionId(page, async () => {
      await page.click('label:has-text("Uniform ordered") input[type="checkbox"]');
    });
    await page.waitForTimeout(500);
    const item = await prisma.onboardingChecklistItem.findUnique({
      where: { applicantId_itemKey: { applicantId: partialApplicantId, itemKey: "uniform" } },
    });
    expect(item?.completed ?? false).toBe(false);
  });

  test("Sales Rep granted Recruiting edit only: HR Summary, Training, Staff Directory, and Operational Status all stay closed — including a stray grant row for the two that must never open", async ({
    page,
  }) => {
    await loginAs(page, PARTIAL_EMAIL, REP_PASSWORD);

    await page.goto("/hr");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");

    await page.goto("/modules");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/sales");

    // Defense in depth: even if a Staff Directory / Operational Status
    // grant row existed for this role (e.g. left over from some other
    // path, or written directly against the database), the server-side
    // allowlist must still ignore it for a Sales Rep.
    await prisma.areaAccess.createMany({
      data: [
        { userId: partialRepId, area: "STAFF_DIRECTORY", canEdit: true },
        { userId: partialRepId, area: "OPERATIONAL_STATUS", canEdit: true },
      ],
    });
    try {
      await page.goto("/staff");
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("/sales");

      await page.goto("/operations");
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/operations");
    } finally {
      await prisma.areaAccess.deleteMany({
        where: { userId: partialRepId, area: { in: ["STAFF_DIRECTORY", "OPERATIONAL_STATUS"] } },
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Scenario C: Melissa's full intended grant set.
  // ────────────────────────────────────────────────────────────────────

  test("Sales Rep with Melissa's full grant set: complete Sales access, notification routing, and every granted HR area all work — before AND after a fresh sign-in", async ({
    page,
  }) => {
    await loginAs(page, FULL_EMAIL, REP_PASSWORD);

    // Existing Sales access is completely untouched.
    for (const path of ["/sales", "/sales/leads", "/sales/pricing-tool", "/sales/quotes", "/sales/open-slots"]) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should load for a full Sales Rep`).toBe(200);
      await expect(page.locator("body")).not.toContainText("Not authorized");
    }

    // Existing sales lead-notification routing is unaffected — she's
    // matched purely by role === SALES_REP, independent of any AreaAccess
    // row her new HR grants added.
    const bccEmails = await getNewLeadAlertBccEmails();
    expect(bccEmails.map((e) => e.toLowerCase())).toContain(FULL_EMAIL.toLowerCase());

    // Nav shows the granted HR areas (HR Summary, Recruiting) and the
    // Training group, alongside her existing Sales nav — never Staff,
    // Leads/Callbacks duplicated, or Operations.
    await page.goto("/sales");
    await expect(page.locator("nav, aside").getByText("HR Summary", { exact: true }).first()).toBeVisible();
    await expect(page.locator("nav, aside").getByText("Recruiting", { exact: true }).first()).toBeVisible();
    await expect(page.locator("nav, aside").getByText("Operations", { exact: true })).toHaveCount(0);
    await expect(page.locator("nav, aside").getByText("Staff", { exact: true })).toHaveCount(0);

    // HR Summary: view-only, safe counts only.
    const hrRes = await page.goto("/hr");
    expect(hrRes?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("HR Summary");
    await expect(page.locator("text=Payroll Disputes")).toHaveCount(0);
    await expect(page.locator("text=View Staff Directory")).toHaveCount(0);

    // Recruiting: can edit, routine move works, final hiring stage still
    // blocked with the approval-request path still available.
    await page.goto(`/recruiting/applicants/${fullApplicantId}`);
    const setStageActionId = await captureActionId(page, async () => {
      await page.click('button:has-text("Move to: Phone/Zoom Interview Passed")');
    });
    await page.waitForTimeout(500);
    let afterApplicant = await prisma.applicant.findUniqueOrThrow({ where: { id: fullApplicantId } });
    expect(afterApplicant.stage).toBe("PHONE_INTERVIEW_PASSED");
    await prisma.applicant.update({ where: { id: fullApplicantId }, data: { stage: "IN_PERSON_PASSED" } });
    await page.goto(`/recruiting/applicants/${fullApplicantId}`);
    await expect(page.locator('button:has-text("Move to: Offer Sent")')).toHaveCount(0);
    await forgeAction(page, `/recruiting/applicants/${fullApplicantId}`, setStageActionId, [
      fullApplicantId,
      "OFFER_SENT",
    ]);
    await page.waitForTimeout(500);
    afterApplicant = await prisma.applicant.findUniqueOrThrow({ where: { id: fullApplicantId } });
    expect(afterApplicant.stage).toBe("IN_PERSON_PASSED");

    // Onboarding: granted, so a routine item succeeds — but the blocked
    // items (proxies for an Offer Sent / hiring-adjacent action) still
    // need the authorized manager, exactly like Office Assistant. The
    // checklist tab only populates for an applicant with a linked
    // hiredUserId — set that directly (fixture setup, not something this
    // role could ever do herself).
    const fullHiredUser = await prisma.user.create({
      data: { email: `sr-full-hired-${RUN_ID}@example.com`, name: `Full Hired ${RUN_ID}`, role: "TRAINEE", active: true },
    });
    fullHiredUserId = fullHiredUser.id;
    await prisma.applicant.update({
      where: { id: fullApplicantId },
      data: { stage: "HIRED", hiredUserId: fullHiredUserId },
    });
    await page.goto(`/recruiting/applicants/${fullApplicantId}?tab=onboarding`);
    await expect(page.locator('label:has-text("Uniform ordered")')).toBeVisible();
    const toggleActionId = await captureActionId(page, async () => {
      await page.click('label:has-text("Uniform ordered") input[type="checkbox"]');
    });
    await page.waitForTimeout(500);
    let uniformItem = await prisma.onboardingChecklistItem.findUnique({
      where: { applicantId_itemKey: { applicantId: fullApplicantId, itemKey: "uniform" } },
    });
    expect(uniformItem?.completed).toBe(true);

    await forgeAction(page, `/recruiting/applicants/${fullApplicantId}`, toggleActionId, [
      fullApplicantId,
      "offer_letter",
      true,
    ]);
    await page.waitForTimeout(500);
    const offerLetterItem = await prisma.onboardingChecklistItem.findUnique({
      where: { applicantId_itemKey: { applicantId: fullApplicantId, itemKey: "offer_letter" } },
    });
    expect(offerLetterItem?.completed ?? false).toBe(false);

    // Training: granted, so the listing page and the lesson-watched API
    // (direct-URL-equivalent server boundary) both work.
    const modulesRes = await page.goto("/modules");
    expect(modulesRes?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");

    // Financials, Staff Directory, Operational Status, and Training
    // Content Editing all stay closed regardless of these grants.
    await page.goto("/financials");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/financials");
    await page.goto("/staff");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/staff");
    await page.goto("/operations");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/operations");
    await page.goto("/training/content-editor");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/training/content-editor");

    // Fresh sign-in: log out, log back in, and re-confirm the same grants
    // still work exactly the same way — nothing here is session-cached.
    await logout(page);
    await loginAs(page, FULL_EMAIL, REP_PASSWORD);

    const salesAfterRelogin = await page.goto("/sales");
    expect(salesAfterRelogin?.status()).toBe(200);
    const hrAfterRelogin = await page.goto("/hr");
    expect(hrAfterRelogin?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("HR Summary");
    const recruitingAfterRelogin = await page.goto(`/recruiting/applicants/${fullApplicantId}`);
    expect(recruitingAfterRelogin?.status()).toBe(200);
    const modulesAfterRelogin = await page.goto("/modules");
    expect(modulesAfterRelogin?.status()).toBe(200);
  });

  // ────────────────────────────────────────────────────────────────────
  // Training is view-only for Melissa's grant set — assigning/ending who
  // trains whom stays with the owner/admin. requireHrAccess() (src/app/
  // actions/trainingAssignments.ts) checks canEdit, so this is already
  // enforced for any grant-based role whose Training grant isn't canEdit —
  // proved here with a forged direct call using her real session cookies,
  // the same technique as every other server-side-enforcement test above.
  // No Sales Rep assignment screen exists or is needed: she never sees an
  // "Assign Trainer"/"End Assignment" control in the first place (that UI
  // only renders inside the Staff Directory employee page, which stays
  // closed to this role), so this proves the server-side gate holds even
  // if that boundary were ever bypassed.
  // ────────────────────────────────────────────────────────────────────

  test("Sales Rep with Training view-only (not edit) can see modules, but a forged end-assignment call is refused — assigning/ending training stays owner/admin-only", async ({
    page,
  }) => {
    // AreaAccess has no stored canView column — a row's mere existence IS
    // "can view" (see getAreaAccessForUser); canEdit is the only flag.
    const access = await prisma.areaAccess.findUniqueOrThrow({
      where: { userId_area: { userId: fullRepId, area: "TRAINING" } },
    });
    expect(access.canEdit).toBe(false);

    // Seed one active assignment and capture a real "End Assignment"
    // click's Server Action id as ADMIN (who does have this control on
    // the Staff Directory employee page) — the id itself isn't tied to
    // who calls it; requireHrAccess() decides that at call time.
    const assignmentForCapture = await prisma.trainingAssignment.create({
      data: { trainerId: trainingTrainerId, traineeId: trainingTraineeId, startDate: new Date(), createdById: adminId },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/staff/${trainingTraineeId}`);
    await page.waitForLoadState("networkidle");
    page.once("dialog", (d) => d.accept());
    const endActionId = await captureActionId(page, async () => {
      await page.click('button:has-text("End Assignment")');
    });
    await page.waitForTimeout(500);
    const afterAdminEnd = await prisma.trainingAssignment.findUniqueOrThrow({ where: { id: assignmentForCapture.id } });
    expect(afterAdminEnd.active).toBe(false); // the real admin action worked

    // Re-seed an active assignment, then attempt the SAME action id as the
    // Training-view-only Sales Rep — this is the forged/bypass attempt.
    const assignmentToProtect = await prisma.trainingAssignment.create({
      data: { trainerId: trainingTrainerId, traineeId: trainingTraineeId, startDate: new Date(), createdById: adminId },
    });
    await logout(page);
    await loginAs(page, FULL_EMAIL, REP_PASSWORD);

    // She still has module access via the same grant (canView:true).
    const modulesRes = await page.goto("/modules");
    expect(modulesRes?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");

    await forgeAction(page, `/staff/${trainingTraineeId}`, endActionId, [
      assignmentToProtect.id,
      trainingTraineeId,
      trainingTrainerId,
    ]);
    await page.waitForTimeout(500);
    const afterForgedAttempt = await prisma.trainingAssignment.findUniqueOrThrow({ where: { id: assignmentToProtect.id } });
    expect(afterForgedAttempt.active).toBe(true); // refused — still active

    await prisma.trainingAssignment.deleteMany({ where: { traineeId: trainingTraineeId } });
  });

  test("View-only HR Summary grant cannot edit anything there, same restriction whether reached by nav or a direct URL", async ({
    page,
  }) => {
    // HR_SUMMARY is canEdit:false for the full-grant fixture — the page
    // itself has no edit controls at all (just counts and read-only
    // links), so "cannot edit" here means: no admin-only actions
    // (document templates, Send HR Digest) are present, matching exactly
    // what an Office Assistant with the same view-only grant also lacks.
    await loginAs(page, FULL_EMAIL, REP_PASSWORD);
    await page.goto("/hr");
    await expect(page.locator("text=Send HR Digest")).toHaveCount(0);
    await expect(page.locator("text=Manage Document Templates")).toHaveCount(0);
  });

  test("Existing Office Assistant and other-role behavior is unaffected by this change", async ({ page }) => {
    // Admin keeps full, unrestricted access everywhere this change touches.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const recruitingRes = await page.goto("/recruiting");
    expect(recruitingRes?.status()).toBe(200);
    const hrRes = await page.goto("/hr");
    expect(hrRes?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("HR");
    await expect(page.locator("h1")).not.toContainText("HR Summary");
  });
});
