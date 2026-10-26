import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Two links that led to a page the current viewer can't open: HR Summary's
// "View Staff Directory" (Office Assistant without the STAFF_DIRECTORY
// grant) and Recruiting's "Edit Careers Page Copy" (anyone but ADMIN, since
// /recruiting/careers-content is strictly ADMIN-only). Both links must only
// render when the viewer can actually use the destination, without
// broadening anyone's real access — an Office Assistant WITH the
// STAFF_DIRECTORY grant must keep seeing the link (regression case).
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

test.describe.serial("Pedro's dead-end links: HR Summary + Recruiting", () => {
  let adminId: string;
  let oaNoStaffDirId: string;
  let oaWithStaffDirId: string;
  let smId: string;
  const oaNoStaffDirEmail = `oa-no-staffdir-${RUN_ID}@example.com`;
  const oaWithStaffDirEmail = `oa-with-staffdir-${RUN_ID}@example.com`;
  const smEmail = `links-sm-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const oaNoStaffDir = await prisma.user.create({
      data: {
        email: oaNoStaffDirEmail,
        name: `Pedro Links OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: { create: [{ area: "HR_SUMMARY", canEdit: false }] },
      },
    });
    oaNoStaffDirId = oaNoStaffDir.id;

    const oaWithStaffDir = await prisma.user.create({
      data: {
        email: oaWithStaffDirEmail,
        name: `OA With Staff Dir ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: {
          create: [
            { area: "HR_SUMMARY", canEdit: false },
            { area: "STAFF_DIRECTORY", canEdit: false },
          ],
        },
      },
    });
    oaWithStaffDirId = oaWithStaffDir.id;

    const sm = await prisma.user.create({
      data: {
        email: smEmail,
        name: `Links SM ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    smId = sm.id;
  });

  test.afterAll(async () => {
    await prisma.areaAccess.deleteMany({ where: { userId: { in: [oaNoStaffDirId, oaWithStaffDirId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [oaNoStaffDirId, oaWithStaffDirId, smId] } } });
    await prisma.$disconnect();
  });

  test("OA without STAFF_DIRECTORY grant: HR Summary has no 'View Staff Directory' link", async ({ page }) => {
    await loginAs(page, oaNoStaffDirEmail, PASSWORD);
    await page.goto("/hr");
    await expect(page.getByRole("heading", { name: "HR Summary" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Staff Directory" })).toHaveCount(0);
  });

  test("OA with STAFF_DIRECTORY grant: HR Summary still shows the link, and it works", async ({ page }) => {
    await loginAs(page, oaWithStaffDirEmail, PASSWORD);
    await page.goto("/hr");
    const link = page.getByRole("link", { name: "View Staff Directory" });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/staff");
    await expect(page.getByText(/staff|directory/i).first()).toBeVisible();
  });

  test("SERVICE_MANAGER (non-ADMIN): Recruiting has no 'Edit Careers Page Copy' link", async ({ page }) => {
    await loginAs(page, smEmail, PASSWORD);
    await page.goto("/recruiting");
    await expect(page.getByRole("link", { name: "Edit Careers Page Copy" })).toHaveCount(0);
  });

  test("ADMIN: Recruiting still shows 'Edit Careers Page Copy', and it works", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting");
    const link = page.getByRole("link", { name: "Edit Careers Page Copy" });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/recruiting/careers-content**");
  });
});
