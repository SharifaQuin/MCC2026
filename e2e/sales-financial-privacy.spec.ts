import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Only ADMIN should ever receive or see the entire "Completed Cleaning
// Revenue" card on /sales — not just its Labor/"Revenue less entered
// labor" rows, but also its own revenue row, heading, source/coverage/
// status metadata, reporting-month selector, and entry forms (no automatic
// upper-management exception: isAdmin only, never isManager/SERVICE_MANAGER).
// This is distinct from the separate "This Month" goal-tracking section
// above it, whose own first tile is ALSO a dollar figure labeled "Actual
// Revenue" once actuals.entered is true — assertions below scope to the
// Completed Cleaning Revenue card's own heading/copy/form-input-ids/
// data-testid specifically, never a bare dollar-amount search, so they
// can't produce a false pass/fail against the wrong card. Also covers the
// generic /api/sales/storage "get" op, which previously returned the raw
// {revenue, labor} JSON for sales:actuals:<month> (now labor-only) to
// anyone with Sales access. A non-admin SALES_REP and a non-admin
// SERVICE_MANAGER with Sales access are both tested.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonthUtc(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0));
}

const REVENUE = 48213;
const LABOR = 19321;
const PRIVATE_SOURCE = `Fin Privacy Internal Source ${RUN_ID}`;

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Sales financial privacy: Completed Cleaning Revenue card is ADMIN-only", () => {
  let salesRepId: string;
  let smId: string;
  let adminId: string;
  const salesRepEmail = `fin-privacy-rep-${RUN_ID}@example.com`;
  const smEmail = `fin-privacy-sm-${RUN_ID}@example.com`;
  const monthKey = currentMonthKey();

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        name: `Fin Privacy Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const sm = await prisma.user.create({
      data: {
        email: smEmail,
        name: `Fin Privacy SM ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    smId = sm.id;

    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    adminId = admin.id;

    await prisma.salesRevenueSnapshot.upsert({
      where: { monthKey },
      create: {
        monthKey,
        revenue: REVENUE,
        source: PRIVATE_SOURCE,
        coverage: "FULL_MONTH",
        coverageThrough: lastDayOfMonthUtc(monthKey),
        sourceAsOf: new Date(),
        status: "PROVISIONAL",
        enteredById: adminId,
      },
      update: {
        revenue: REVENUE,
        source: PRIVATE_SOURCE,
        coverage: "FULL_MONTH",
        coverageThrough: lastDayOfMonthUtc(monthKey),
        sourceAsOf: new Date(),
        status: "PROVISIONAL",
        enteredById: adminId,
      },
    });

    await prisma.salesToolData.upsert({
      where: { key: `sales:actuals:${monthKey}` },
      create: { key: `sales:actuals:${monthKey}`, value: JSON.stringify({ labor: LABOR }) },
      update: { value: JSON.stringify({ labor: LABOR }) },
    });
  });

  test.afterAll(async () => {
    await prisma.salesRevenueSnapshot.deleteMany({ where: { monthKey } });
    await prisma.salesToolData.deleteMany({ where: { key: `sales:actuals:${monthKey}` } });
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: [salesRepId, smId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, smId] } } });
    await prisma.$disconnect();
  });

  test("ADMIN: /sales shows the entire Completed Cleaning Revenue card", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const html = await (await page.request.get("/sales")).text();
    expect(html).toContain("Completed Cleaning Revenue");
    expect(html).toContain("not cash collected");
    expect(html).toContain('data-testid="completed-cleaning-revenue-card"');
    expect(html).toContain("Completed Cleaning Charges");
    expect(html).toContain("Labor");
    expect(html).toContain("Revenue less entered labor");
    expect(html).toContain('id="revenue"');
    expect(html).toContain('id="labor"');
    expect(html).toContain('name="month"');
    expect(html).toContain(PRIVATE_SOURCE);
    expect(html).toContain(LABOR.toLocaleString());
  });

  test("SALES_REP: /sales never contains the Completed Cleaning Revenue card at all — not even its own revenue row, source, or edit forms", async ({
    page,
  }) => {
    await loginAs(page, salesRepEmail, PASSWORD);
    const html = await (await page.request.get("/sales")).text();
    expect(html).not.toContain("Completed Cleaning Revenue");
    expect(html).not.toContain('data-testid="completed-cleaning-revenue-card"');
    expect(html).not.toContain("Completed Cleaning Charges");
    expect(html).not.toContain("Revenue less entered labor");
    expect(html).not.toContain('id="revenue"');
    expect(html).not.toContain('id="labor"');
    expect(html).not.toContain(PRIVATE_SOURCE);
    expect(html).not.toContain(String(LABOR));
    // The separate, already-shared-safe goal-tracking section above it
    // stays visible — note its own first tile is ALSO a dollar figure
    // (labeled "Actual Revenue" once actuals.entered is true, as it is
    // here), which is exactly why none of the assertions above use a bare
    // dollar-amount search.
    expect(html).toContain("This Month");
    expect(html).toContain(REVENUE.toLocaleString());
  });

  test("non-admin SERVICE_MANAGER (Sales access, not Admin): same restriction as a Sales Rep — isAdmin only, never isManager", async ({
    page,
  }) => {
    await loginAs(page, smEmail, PASSWORD);
    const html = await (await page.request.get("/sales")).text();
    expect(html).not.toContain("Completed Cleaning Revenue");
    expect(html).not.toContain('data-testid="completed-cleaning-revenue-card"');
    expect(html).not.toContain("Revenue less entered labor");
    expect(html).not.toContain('id="revenue"');
    expect(html).not.toContain('id="labor"');
    expect(html).not.toContain(PRIVATE_SOURCE);
    expect(html).not.toContain(String(LABOR));
  });

  test("SALES_REP: /api/sales/storage get on sales:actuals:<month> is denied, never returns labor", async ({
    page,
  }) => {
    await loginAs(page, salesRepEmail, PASSWORD);
    const res = await page.request.post("/api/sales/storage", {
      data: { op: "get", key: `sales:actuals:${monthKey}` },
    });
    expect(res.status()).toBe(403);
    const raw = await res.text();
    expect(raw).not.toContain(String(LABOR));
  });

  test("ADMIN: /api/sales/storage get on sales:actuals:<month> still returns the real value", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.request.post("/api/sales/storage", {
      data: { op: "get", key: `sales:actuals:${monthKey}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const parsed = JSON.parse(body.value);
    expect(parsed.labor).toBe(LABOR);
  });
});
