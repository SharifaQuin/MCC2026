import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { hashPassword } from "../src/lib/password";

// Extends the existing test-account-only impersonation (src/lib/
// impersonation.ts) to real, active dashboard users. The core guarantee:
// the main session cookie becomes the target's own identity (sub/role/
// name/language) — which is what makes every existing permission check and
// data-scoping query in the app apply the target's own access with no
// changes anywhere else — while the real Owner's identity rides alongside
// it (session.actingAs) for mutation attribution. A second cookie holds the
// Owner's own original signed token so returning needs no re-login, but
// only after re-verifying it's still a valid, unexpired, untampered,
// currently-active-Admin session — a forged/expired/tampered one is
// rejected outright rather than trusted to hand back a session.
//
// Local fake accounts only. No real candidate/lead is contacted and no
// production data is touched.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "dev-only-not-a-secret-abcdefghijklmnopqrstuvwxyz0123456789";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";
const SESSION_COOKIE = "mcc_session";
const STASH_COOKIE = "mcc_impersonation_stash";

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
    maxRedirects: 0,
  });
}

function getSecret() {
  return new TextEncoder().encode(AUTH_SECRET);
}

async function signRawToken(
  payload: Record<string, unknown>,
  opts: { expired?: boolean; wrongSecret?: boolean } = {}
): Promise<string> {
  const secret = opts.wrongSecret ? new TextEncoder().encode("not-the-real-secret") : getSecret();
  const jwt = new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  jwt.setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 60 : "30d");
  return jwt.sign(secret);
}

test.describe.serial("Owner View/Act As mode", () => {
  let adminId: string;
  let oaId: string;
  let oa2Id: string;
  let traineeId: string;
  let jobPostingId: string;
  const applicantIds: string[] = [];
  let actAsActionId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const oa = await prisma.user.create({
      data: {
        email: `act-as-oa-${RUN_ID}@example.com`,
        name: `Act As OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    oaId = oa.id;

    const oa2 = await prisma.user.create({
      data: {
        email: `act-as-oa2-${RUN_ID}@example.com`,
        name: `Act As OA2 ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    oa2Id = oa2.id;

    const trainee = await prisma.user.create({
      data: {
        email: `act-as-nonowner-${RUN_ID}@example.com`,
        name: `Act As Non Owner ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    traineeId = trainee.id;

    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;
  });

  test.afterAll(async () => {
    await prisma.communicationLog.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.auditLogEntry.deleteMany({
      where: { recordType: "User", recordId: { in: [oaId, oa2Id] } },
    });
    await prisma.areaAccess.deleteMany({ where: { userId: oaId } });
    await prisma.user.deleteMany({ where: { id: { in: [oaId, oa2Id, traineeId] } } });
    await prisma.$disconnect();
  });

  test("Owner can start acting as a real Office Assistant and the banner names them", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    await page.waitForLoadState("networkidle");

    const row = page.getByTestId(`act-as-row-${oaId}`);
    actAsActionId = await captureActionId(page, async () => {
      await row.getByRole("button", { name: "Act As" }).click();
    });
    await page.waitForURL("/");

    const banner = page.locator("span", { hasText: "viewing and acting as" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`Act As OA ${RUN_ID}`);
    await expect(banner).toContainText("Office Assistant");

    const auditRow = await prisma.auditLogEntry.findFirst({
      where: { action: "ACTING_AS_STARTED", recordId: oaId },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow?.actorId).toBe(adminId);
  });

  test("Target's own permissions apply — Owner-only routes/UI are unreachable while acting as", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    const row = page.getByTestId(`act-as-row-${oaId}`);
    await row.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");

    // Owner-only middleware-gated route — must bounce, not just hide a link.
    await page.goto("/test-accounts");
    await expect(page).toHaveURL("/");
    await page.goto("/financials");
    await expect(page).toHaveURL("/");

    // The "View / Act As" admin-only panel itself must not render for the
    // Office Assistant's own effective view of /staff.
    await page.goto("/staff");
    await expect(page.getByText("View / Act As")).toHaveCount(0);

    // Return to Owner View so later tests start from a clean slate.
    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForURL("/");
    await expect(page.getByText("Viewing and acting as")).toHaveCount(0);
  });

  test("A mutation made while acting as records the Owner as the true actor, never the employee", async ({
    page,
  }) => {
    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Fake",
        lastName: `act-as-email-${RUN_ID}`,
        email: `fake-act-as-email-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "NEW",
      },
    });
    applicantIds.push(applicant.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    const row = page.getByTestId(`act-as-row-${oaId}`);
    await row.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");

    await page.goto(`/recruiting/applicants/${applicant.id}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Communication")');
    await page.click('button:has-text("Send Email")');
    await page.fill('input[name="subject"]', "Test subject");
    await page.fill('textarea[name="body"]', "Test body");
    await page.click('button[type="submit"]:has-text("Send Email")');
    await page.waitForTimeout(500);

    const comm = await prisma.communicationLog.findFirst({ where: { applicantId: applicant.id } });
    expect(comm).not.toBeNull();
    expect(comm!.sentById).toBe(adminId);
    expect(comm!.sentById).not.toBe(oaId);

    const auditRow = await prisma.auditLogEntry.findFirst({
      where: { action: "APPLICANT_EMAIL_SENT", recordId: applicant.id },
    });
    expect(auditRow?.actorId).toBe(adminId);

    await page.goto("/");
    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForURL("/");
  });

  test("No nested impersonation — starting a second act-as session while already acting as one is rejected", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    const row = page.getByTestId(`act-as-row-${oaId}`);
    await row.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");
    await expect(page.locator("span", { hasText: "viewing and acting as" })).toContainText(
      `Act As OA ${RUN_ID}`
    );

    const auditCountBefore = await prisma.auditLogEntry.count({
      where: { action: "ACTING_AS_STARTED", recordId: oa2Id },
    });

    // Replay the real actAsStaffMemberAction server action, now using the
    // *current* (already-acting-as) cookies, targeting a second user.
    const res = await forgeAction(page, "/staff", actAsActionId, [oa2Id]);
    expect(res.status()).toBeGreaterThanOrEqual(400);

    const auditCountAfter = await prisma.auditLogEntry.count({
      where: { action: "ACTING_AS_STARTED", recordId: oa2Id },
    });
    expect(auditCountAfter).toBe(auditCountBefore);

    // Still acting as the original target, not switched to the second.
    await page.reload();
    const bannerAfterReplay = page.locator("span", { hasText: "viewing and acting as" });
    await expect(bannerAfterReplay).toContainText(`Act As OA ${RUN_ID}`);
    await expect(bannerAfterReplay).not.toContainText(`Act As OA2 ${RUN_ID}`);

    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForURL("/");
  });

  test("A non-owner cannot start acting as another user, even by replaying the real server action", async ({
    page,
  }) => {
    await loginAs(page, `act-as-nonowner-${RUN_ID}@example.com`, PASSWORD);

    const auditCountBefore = await prisma.auditLogEntry.count({
      where: { action: "ACTING_AS_STARTED", recordId: oa2Id },
    });

    // Not asserting a specific HTTP status here — what matters is the
    // real-world effect: no acting-as session was created, and the
    // non-owner's own identity is unaffected.
    await forgeAction(page, "/staff", actAsActionId, [oa2Id]);

    const auditCountAfter = await prisma.auditLogEntry.count({
      where: { action: "ACTING_AS_STARTED", recordId: oa2Id },
    });
    expect(auditCountAfter).toBe(auditCountBefore);

    // The non-owner's own session is unaffected — reloading still shows
    // their own name, not the target's, and no "acting as" banner appears.
    await page.goto("/");
    await expect(page.getByText(`Act As Non Owner ${RUN_ID}`)).toBeVisible();
    await expect(page.locator("span", { hasText: "viewing and acting as" })).toHaveCount(0);
  });

  test("Returning to Owner rejects a forged (wrong-signature) stash instead of restoring it", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    const row = page.getByTestId(`act-as-row-${oaId}`);
    await row.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");

    const forgedStash = await signRawToken(
      { sub: adminId, role: "ADMIN", name: "Forged Owner", language: "EN" },
      { wrongSecret: true }
    );
    await page.context().addCookies([
      {
        name: STASH_COOKIE,
        value: forgedStash,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ]);

    await page.goto("/");
    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForTimeout(500);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
    expect(cookies.find((c) => c.name === STASH_COOKIE)).toBeUndefined();

    // Rejected: cookies are cleared entirely rather than restoring a forged
    // owner session, so a fresh request lands back at the login screen
    // rather than anywhere inside the app.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Returning to Owner rejects an expired stash instead of restoring it", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    const row = page.getByTestId(`act-as-row-${oaId}`);
    await row.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");

    const expiredStash = await signRawToken(
      { sub: adminId, role: "ADMIN", name: "Shar", language: "EN" },
      { expired: true }
    );
    await page.context().addCookies([
      { name: STASH_COOKIE, value: expiredStash, domain: "localhost", path: "/", httpOnly: true },
    ]);

    await page.goto("/");
    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForTimeout(500);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Document signing is unavailable while acting as another user", async ({ page }) => {
    const doc = await prisma.onboardingDocument.create({
      data: { title: `Act As Test Document ${RUN_ID}`, contentText: "Test onboarding document content." },
    });

    const assignment = await prisma.onboardingAssignment.create({
      data: { userId: traineeId, documentId: doc.id },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    // The trainee fixture has no complaint/payroll flags and is a normal
    // STAFF_ROLES member, so it's reachable from the main directory's own
    // rows too — but the dedicated Act As panel is simplest and consistent
    // with the rest of this suite.
    const traineeRow = page.getByTestId(`act-as-row-${traineeId}`);
    await traineeRow.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");

    await page.goto(`/documents/${assignment.id}`);
    await expect(page.getByText("Document signing is unavailable")).toBeVisible();
    await expect(page.locator('input[name="signedName"]')).toHaveCount(0);

    const stillUnsigned = await prisma.onboardingAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(stillUnsigned.signedAt).toBeNull();

    await prisma.onboardingAssignment.delete({ where: { id: assignment.id } });
    await prisma.onboardingDocument.delete({ where: { id: doc.id } });
    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForURL("/");
  });
});
