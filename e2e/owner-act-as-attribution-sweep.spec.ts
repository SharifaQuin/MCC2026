import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Follow-up to e2e/owner-act-as-mode.spec.ts's single attribution test
// (an applicant email send). This sweeps the other areas named in review:
// payroll, promotions/certification, problem reports, and the three
// signature/credential actions that are blocked outright rather than
// attributed (payroll self-sign, personnel document signing, changing a
// password). Every selector below was verified against the real component
// source (CertificationPanel, PromotionPanel, PayrollRowsTable,
// ReportProblemForm, ChangePasswordForm) rather than guessed, and no
// assertion is allowed to pass vacuously if a UI step didn't actually fire —
// each test fails loudly if a button/field it depends on isn't there.
// Local fake accounts only; nothing here sends a real message or touches
// production data.
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

async function actAs(page: Page, targetId: string) {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/account");
  await page.getByTestId(`act-as-row-${targetId}`).getByRole("button", { name: "Act As" }).click();
  await page.waitForURL("/");
}

async function returnToOwner(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Return to Owner View" }).click();
  await page.waitForURL("/");
}

test.describe.serial("Owner act-as mode — attribution sweep across HR/payroll/sales", () => {
  let adminId: string;
  let svcMgrId: string;
  let oaId: string;
  let traineeId: string;
  let subjectId: string;
  const cleanupUserIds: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const svcMgr = await prisma.user.create({
      data: {
        email: `attr-svcmgr-${RUN_ID}@example.com`,
        name: `Attr SvcMgr ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    svcMgrId = svcMgr.id;
    cleanupUserIds.push(svcMgrId);

    const oa = await prisma.user.create({
      data: {
        email: `attr-oa-${RUN_ID}@example.com`,
        name: `Attr OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    oaId = oa.id;
    cleanupUserIds.push(oaId);

    const trainee = await prisma.user.create({
      data: {
        email: `attr-trainee-${RUN_ID}@example.com`,
        name: `Attr Trainee ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    traineeId = trainee.id;
    cleanupUserIds.push(traineeId);

    const subject = await prisma.user.create({
      data: {
        email: `attr-subject-${RUN_ID}@example.com`,
        name: `Attr Subject ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    subjectId = subject.id;
    cleanupUserIds.push(subjectId);
  });

  test.afterAll(async () => {
    await prisma.promotionAssessment.deleteMany({ where: { employeeId: subjectId } });
    await prisma.problemReport.deleteMany({ where: { description: { contains: RUN_ID } } });
    await prisma.signedDocument.deleteMany({ where: { employeeId: traineeId } });
    await prisma.documentTemplate.deleteMany({ where: { title: `Attr Sweep Template ${RUN_ID}` } });
    await prisma.user.updateMany({ where: { id: subjectId }, data: { certRecommendedById: null, certDecidedById: null } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.$disconnect();
  });

  test("Certification recommendation while acting as a Service Manager records the Owner", async ({ page }) => {
    await actAs(page, svcMgrId);
    await page.goto(`/staff/${subjectId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Recommend for Certification" }).click();
    await page.fill('textarea[name="notes"]', `Ready — attribution sweep ${RUN_ID}`);
    await page.getByRole("button", { name: "Submit Recommendation" }).click();
    await page.waitForTimeout(500);

    await returnToOwner(page);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: subjectId },
      select: { certRecommendedById: true, certificationStatus: true },
    });
    expect(updated.certificationStatus).toBe("PENDING");
    expect(updated.certRecommendedById).toBe(adminId);
    expect(updated.certRecommendedById).not.toBe(svcMgrId);
  });

  test("A promotion assessment created while acting as a Service Manager attributes the Owner", async ({ page }) => {
    await actAs(page, svcMgrId);
    await page.goto(`/staff/${subjectId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "+ New Assessment" }).click();
    await page.getByRole("button", { name: "Save Assessment" }).click();
    await page.waitForTimeout(500);

    await returnToOwner(page);

    const created = await prisma.promotionAssessment.findFirstOrThrow({
      where: { employeeId: subjectId },
      orderBy: { createdAt: "desc" },
    });
    expect(created.assessedById).toBe(adminId);
    expect(created.assessedById).not.toBe(svcMgrId);
  });

  test("A payroll override recorded while acting as a Service Manager attributes the Owner, never the acted-as manager", async ({
    page,
  }) => {
    const payPeriod = await prisma.payPeriod.create({
      data: {
        label: `Attr Sweep ${RUN_ID}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-07"),
      },
    });
    const entry = await prisma.payrollEntry.create({
      data: { payPeriodId: payPeriod.id, employeeId: subjectId, regularHours: 40 },
    });

    await actAs(page, svcMgrId);
    await page.goto(`/staff/payroll/${payPeriod.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Manager Override" }).click();
    await page.fill('input[name="signedName"]', `Attr Subject ${RUN_ID}`);
    await page.getByRole("button", { name: "Record Override" }).click();
    await page.waitForTimeout(500);

    await returnToOwner(page);

    const updated = await prisma.payrollEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.signedViaOverride).toBe(true);
    expect(updated.overriddenById).toBe(adminId);
    expect(updated.overriddenById).not.toBe(svcMgrId);

    await prisma.payrollEntry.delete({ where: { id: entry.id } });
    await prisma.payPeriod.delete({ where: { id: payPeriod.id } });
  });

  test("Payroll self-signing is refused while acting as the employee, and the entry stays unsigned", async ({
    page,
  }) => {
    const payPeriod = await prisma.payPeriod.create({
      data: {
        label: `Attr Sweep Self ${RUN_ID}`,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-07"),
      },
    });
    const entry = await prisma.payrollEntry.create({
      data: { payPeriodId: payPeriod.id, employeeId: traineeId, regularHours: 40 },
    });

    await actAs(page, traineeId);
    await page.goto(`/payroll/${entry.id}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Signing payroll hours is unavailable while viewing and acting as another user.")
    ).toBeVisible();
    await expect(page.locator('input[name="signedName"]')).toHaveCount(0);

    const stillPending = await prisma.payrollEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stillPending.status).toBe("PENDING");
    expect(stillPending.signedAt).toBeNull();

    await returnToOwner(page);
    await prisma.payrollEntry.delete({ where: { id: entry.id } });
    await prisma.payPeriod.delete({ where: { id: payPeriod.id } });
  });

  test("A problem report filed while acting as an Office Assistant is attributed to the Owner, not the employee", async ({
    page,
  }) => {
    await actAs(page, oaId);
    await page.goto("/report-a-problem");
    await page.waitForLoadState("networkidle");

    await page.selectOption('select[name="category"]', "OTHER");
    await page.fill('textarea[name="description"]', `Attribution sweep test report ${RUN_ID}`);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);

    await returnToOwner(page);

    const report = await prisma.problemReport.findFirstOrThrow({
      where: { description: { contains: RUN_ID } },
      orderBy: { createdAt: "desc" },
    });
    expect(report.reporterId).toBe(adminId);
    expect(report.reporterRole).toBe("ADMIN");
    expect(report.reporterId).not.toBe(oaId);
  });

  test("Changing a password is refused while acting as another user", async ({ page }) => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: traineeId },
      select: { passwordHash: true },
    });

    await actAs(page, traineeId);
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Changing a password is unavailable while viewing and acting as another user.")
    ).toBeVisible();
    await expect(page.locator('input[name="currentPassword"]')).toHaveCount(0);

    await returnToOwner(page);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: traineeId },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  test("Signing a personnel document is refused while acting as the employee it belongs to", async ({ page }) => {
    const template = await prisma.documentTemplate.create({
      data: {
        title: `Attr Sweep Template ${RUN_ID}`,
        bodyText: "Test body",
        createdById: adminId,
      },
    });
    const doc = await prisma.signedDocument.create({
      data: { templateId: template.id, employeeId: traineeId, fieldValues: {}, createdById: adminId },
    });

    await actAs(page, traineeId);
    await page.goto(`/documents/personnel/${doc.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Signing is unavailable while viewing and acting as another user.")).toBeVisible();
    await expect(page.locator('input[name="signedName"]')).toHaveCount(0);

    const stillUnsigned = await prisma.signedDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(stillUnsigned.signedAt).toBeNull();

    await returnToOwner(page);
  });
});
