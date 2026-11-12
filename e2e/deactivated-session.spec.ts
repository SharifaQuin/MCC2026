import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Covers the stale-session gap: getSession() (src/lib/session.ts) now
// re-checks User.active against the database on every call, not just the
// JWT's own signature/expiry — so a cookie issued before an account was
// deactivated stops working immediately, instead of staying trusted for
// up to the full 30-day cookie lifetime. The fix applies to any
// deactivated account (checked generically by User.active), not a
// Pedro-Paez-specific exception — these fixtures are fresh, isolated test
// accounts, never the real production record.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// Same technique as e2e/office-assistant.spec.ts and
// e2e/sales-rep-hr-permissions.spec.ts: capture the real Next.js Server
// Action id for whichever action `trigger` invokes by watching the network
// while it runs, then replay it later (different account state, different
// args, or both) against the real server.
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

test.describe.serial("Deactivated account's existing session cookie is rejected", () => {
  let jobPostingId: string;
  let applicantId: string;

  const OA_EMAIL = `deactivation-oa-${RUN_ID}@example.com`;
  let oaUserId: string;

  const SALES_REP_EMAIL = `deactivation-salesrep-${RUN_ID}@example.com`;
  let salesRepUserId: string;

  test.beforeAll(async () => {
    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });
    jobPostingId = jobPosting.id;

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `Deactivation OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        areaAccess: { create: [{ area: "RECRUITING", canEdit: true }] },
      },
    });
    oaUserId = oa.id;

    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Deactivation SalesRep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepUserId = salesRep.id;

    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId,
        firstName: "Deactivation",
        lastName: `Applicant-${RUN_ID}`,
        email: `deactivation-applicant-${RUN_ID}@example.com`,
        phone: "5555559001",
        stage: "PHONE_INTERVIEW_SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    applicantId = applicant.id;
  });

  test.afterAll(async () => {
    await prisma.applicantNote.deleteMany({ where: { applicantId } });
    await prisma.applicant.deleteMany({ where: { id: applicantId } });
    await prisma.auditLogEntry.deleteMany({ where: { actorId: { in: [oaUserId, salesRepUserId] } } });
    await prisma.areaAccess.deleteMany({ where: { userId: oaUserId } });
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepUserId } });
    await prisma.user.deleteMany({ where: { id: { in: [oaUserId, salesRepUserId] } } });
    await prisma.$disconnect();
  });

  test("A deactivated user's previously issued cookie cannot open a protected page — redirects to /login", async ({
    page,
  }) => {
    await loginAs(page, OA_EMAIL, PASSWORD);

    // The cookie works before deactivation.
    let res = await page.goto("/recruiting");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");

    // Deactivate the account directly — same effect as the owner UI's
    // deactivate action (sets User.active to false) — without touching the
    // browser's existing cookie at all.
    await prisma.user.update({ where: { id: oaUserId }, data: { active: false } });

    res = await page.goto("/recruiting");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");

    // The portal layout itself (wrapping every protected page) is where
    // this is enforced — confirm the home route redirects too, not just
    // one page's own check.
    res = await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/login");

    await prisma.user.update({ where: { id: oaUserId }, data: { active: true } });
  });

  test("A deactivated user's cookie cannot execute a previously permitted server action — no data changes", async ({
    page,
  }) => {
    await loginAs(page, OA_EMAIL, PASSWORD);
    await page.goto(`/recruiting/applicants/${applicantId}`);

    const setStageActionId = await captureActionId(page, async () => {
      await page.click('button:has-text("Move to: Phone/Zoom Interview Passed")');
    });
    await page.waitForTimeout(500);
    let applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicant.stage).toBe("PHONE_INTERVIEW_PASSED"); // the real action worked while active

    await prisma.user.update({ where: { id: oaUserId }, data: { active: false } });

    await forgeAction(page, `/recruiting/applicants/${applicantId}`, setStageActionId, [
      applicantId,
      "IN_PERSON_PASSED",
    ]);
    await page.waitForTimeout(500);
    applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
    expect(applicant.stage).toBe("PHONE_INTERVIEW_PASSED"); // unchanged — the forged call was refused

    await prisma.user.update({ where: { id: oaUserId }, data: { active: true } });
  });

  test("Correct-password login for a deactivated account still shows the deactivated-account message", async ({
    page,
  }) => {
    await prisma.user.update({ where: { id: oaUserId }, data: { active: false } });

    await page.goto("/login");
    await page.fill('input[name="email"]', OA_EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator("body")).toContainText(
      "This account has been deactivated. Contact your administrator."
    );
    expect(page.url()).toContain("/login"); // never let her in

    await prisma.user.update({ where: { id: oaUserId }, data: { active: true } });
  });

  test("Active owner (ADMIN), Office Assistant, and Sales Rep accounts keep working normally with their existing cookies", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    let res = await page.goto("/admin/permissions");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");

    // Office Assistant — reinstated (active again) by the earlier tests.
    await loginAs(page, OA_EMAIL, PASSWORD);
    res = await page.goto("/recruiting");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");

    // Sales Rep
    await loginAs(page, SALES_REP_EMAIL, PASSWORD);
    res = await page.goto("/sales");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Not authorized");
  });
});
