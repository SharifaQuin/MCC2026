import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getSalesActuals, setSalesLabor } from "../src/lib/salesDashboard";
import {
  saveRevenueSnapshot,
  getRevenueEntryForMonth,
  monthBoundsUtc,
  type RawRevenueSnapshotInput,
} from "../src/lib/salesRevenueSnapshot";

// Coverage for the owner-only "Completed Cleaning Revenue" entry (separate
// revenue/labor saves, a reporting-month picker, source/coverage/as-of/
// status metadata, a stale-as-of confirmation, and legacy-data safety).
// src/lib/salesRevenueSnapshot.ts's own comments explain the design; this
// file proves the behavior it promises. Staff-side privacy (labor/source
// never leaked in HTML/RSC) is covered by sales-financial-privacy.spec.ts,
// not duplicated here.
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

async function logout(page: Page) {
  await page.evaluate(() => fetch("/logout", { method: "POST" }));
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

// A valid baseline input, overridden per test case. Tolerates a
// deliberately blank/malformed monthKey (used to test that rejection
// itself) by falling back to a placeholder coverageThrough rather than
// letting monthBoundsUtc's own NaN-date arithmetic throw inside this test
// helper — saveRevenueSnapshot still validates monthKey from scratch
// regardless of what this placeholder computes.
function validInput(monthKey: string, overrides: Partial<RawRevenueSnapshotInput> = {}): RawRevenueSnapshotInput {
  let coverageThrough = "2020-01-31";
  try {
    const { last } = monthBoundsUtc(monthKey);
    if (!Number.isNaN(last.getTime())) coverageThrough = last.toISOString().slice(0, 10);
  } catch {
    // monthKey isn't well-formed — covered by the fallback above.
  }
  return {
    monthKey,
    revenue: "1000",
    source: "TCS completed-jobs export",
    coverage: "FULL_MONTH",
    coverageThrough,
    sourceAsOf: "2026-01-15T09:00",
    status: "PROVISIONAL",
    confirmStaleAsOf: false,
    ...overrides,
  };
}

test.describe("Sales revenue entry: validation and storage (direct lib calls)", () => {
  let adminId: string;
  const testMonths: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    adminId = admin.id;
  });

  test.afterAll(async () => {
    await prisma.salesRevenueSnapshot.deleteMany({ where: { monthKey: { in: testMonths } } });
    await prisma.salesToolData.deleteMany({
      where: { key: { in: testMonths.map((m) => `sales:actuals:${m}`) } },
    });
    await prisma.auditLogEntry.deleteMany({ where: { recordType: "SalesRevenueSnapshot", recordId: { in: testMonths } } });
    await prisma.$disconnect();
  });

  // Auto-incrementing, always-valid YYYY-MM keys, far enough in the past
  // (2000-2019) that they can never collide with "now" — so these can
  // never interact with the current-month goal tracker or with another
  // suite's current-month fixtures. A fresh key every call, so unrelated
  // cases in the same test never share a row.
  let monthCounter = Number(RUN_ID.slice(-4)) % 100;
  function freshMonth(): string {
    monthCounter++;
    const year = 2000 + (monthCounter % 20);
    const month = (monthCounter % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    testMonths.push(key);
    return key;
  }

  test("a revenue-only save preserves an existing labor value exactly", async () => {
    const monthKey = freshMonth();
    await setSalesLabor(4321, monthKey);

    const result = await saveRevenueSnapshot(validInput(monthKey, { revenue: "9000" }), adminId);
    expect(result.ok).toBe(true);

    const actuals = await getSalesActuals(monthKey);
    expect(actuals.revenue).toBe(9000);
    expect(actuals.labor).toBe(4321);
  });

  test("absent labor stays unknown (null), never zero", async () => {
    const monthKey = freshMonth();
    const result = await saveRevenueSnapshot(validInput(monthKey), adminId);
    expect(result.ok).toBe(true);

    const actuals = await getSalesActuals(monthKey);
    expect(actuals.labor).toBeNull();
    expect(actuals.profit).toBeNull();
  });

  test("an explicitly-entered zero labor is distinct from never-entered labor", async () => {
    const zeroMonth = freshMonth();
    const unknownMonth = freshMonth();
    await setSalesLabor(0, zeroMonth);

    const zeroActuals = await getSalesActuals(zeroMonth);
    const unknownActuals = await getSalesActuals(unknownMonth);

    expect(zeroActuals.labor).toBe(0);
    expect(zeroActuals.labor).not.toBeNull();
    expect(unknownActuals.labor).toBeNull();
  });

  test("a legacy combined {revenue, labor} row still reads correctly and is never rewritten", async () => {
    const monthKey = freshMonth();
    const legacyValue = JSON.stringify({ revenue: 777, labor: 222 });
    await prisma.salesToolData.create({ data: { key: `sales:actuals:${monthKey}`, value: legacyValue } });

    const entry = await getRevenueEntryForMonth(monthKey);
    expect(entry).toEqual({ kind: "legacy", revenue: 777 });

    const actuals = await getSalesActuals(monthKey);
    expect(actuals.revenue).toBe(777);
    expect(actuals.labor).toBe(222);
    expect(actuals.profit).toBe(555);
    expect(actuals.entered).toBe(true);

    const rowAfter = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${monthKey}` } });
    expect(rowAfter?.value).toBe(legacyValue);
  });

  test("invalid revenue input is rejected and writes nothing", async () => {
    const cases: [string, Partial<RawRevenueSnapshotInput>][] = [
      ["blank", { revenue: "" }],
      ["negative", { revenue: "-5" }],
      ["malformed", { revenue: "abc" }],
      ["infinite", { revenue: "Infinity" }],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [label, overrides] = cases[i];
      const monthKey = freshMonth();
      const result = await saveRevenueSnapshot(validInput(monthKey, overrides), adminId);
      expect(result.ok, `revenue case: ${label}`).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
      const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });
      expect(row, `no row written for revenue case: ${label}`).toBeNull();
    }
  });

  test("a blank source, bad coverage/status enum, and inconsistent coverage dates are all rejected and write nothing", async () => {
    const probeMonth = freshMonth();
    const { last } = monthBoundsUtc(probeMonth);
    const notLastDay = new Date(last.getTime() - 86400000).toISOString().slice(0, 10);
    const lastDay = last.toISOString().slice(0, 10);

    const cases: [string, Partial<RawRevenueSnapshotInput>][] = [
      ["blank source", { source: "" }],
      ["bad coverage enum", { coverage: "SOME_OTHER_THING" }],
      ["bad status enum", { status: "FINAL" }],
      ["FULL_MONTH not through month end", { coverage: "FULL_MONTH", coverageThrough: notLastDay }],
      ["MONTH_TO_DATE through month end", { coverage: "MONTH_TO_DATE", coverageThrough: lastDay }],
      ["coverage-through outside the selected month", { coverageThrough: "1999-01-01" }],
      ["blank source-as-of", { sourceAsOf: "" }],
    ];

    // Every case above targets the SAME reporting month on purpose — each
    // is independently rejected, so none of them should ever leave a row
    // behind; a stray successful write anywhere in the loop would surface
    // as a non-null row read after the loop.
    for (const [label, overrides] of cases) {
      const result = await saveRevenueSnapshot(validInput(probeMonth, overrides), adminId);
      expect(result.ok, `case: ${label}`).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
    }
    const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: probeMonth } });
    expect(row).toBeNull();

    // A blank or malformed reporting month is rejected on its own terms —
    // there's no row to check for since the key itself is the bad input.
    const blankMonth = await saveRevenueSnapshot(validInput("", {}), adminId);
    expect(blankMonth.ok).toBe(false);
    const malformedMonth = await saveRevenueSnapshot(validInput("2026-13", {}), adminId);
    expect(malformedMonth.ok).toBe(false);
  });

  test("October and November reporting months stay fully isolated", async () => {
    // Literal, deliberately-named Oct/Nov keys (not freshMonth's own
    // counter) — picked for readability here, but still a safely
    // historical year and still cleaned up via testMonths below.
    const octoberKey = "2009-10";
    const novemberKey = "2009-11";
    testMonths.push(octoberKey, novemberKey);

    await saveRevenueSnapshot(validInput(octoberKey, { revenue: "1000" }), adminId);
    await saveRevenueSnapshot(validInput(novemberKey, { revenue: "2000" }), adminId);

    const october = await getSalesActuals(octoberKey);
    const november = await getSalesActuals(novemberKey);
    expect(october.revenue).toBe(1000);
    expect(november.revenue).toBe(2000);

    // Saving November again with a much larger figure must never touch October.
    await saveRevenueSnapshot(validInput(novemberKey, { revenue: "5000", sourceAsOf: "2026-02-01T09:00" }), adminId);
    const octoberAfter = await getSalesActuals(octoberKey);
    expect(octoberAfter.revenue).toBe(1000);
  });

  test("a repeated save of the same snapshot replaces, never adds — one row, not a running total", async () => {
    const monthKey = freshMonth();
    await saveRevenueSnapshot(validInput(monthKey, { revenue: "500" }), adminId);
    await saveRevenueSnapshot(validInput(monthKey, { revenue: "500" }), adminId);
    await saveRevenueSnapshot(validInput(monthKey, { revenue: "500" }), adminId);

    const actuals = await getSalesActuals(monthKey);
    expect(actuals.revenue).toBe(500);

    const rows = await prisma.salesRevenueSnapshot.findMany({ where: { monthKey } });
    expect(rows).toHaveLength(1);

    // Still kept its own (small, owner-only) change record per save.
    const auditRows = await prisma.auditLogEntry.findMany({
      where: { recordType: "SalesRevenueSnapshot", recordId: monthKey },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(3);
  });

  test("a backwards as-of update is refused until explicitly confirmed, and never silently replaces newer data", async () => {
    const monthKey = freshMonth();
    const newerAsOf = "2026-06-10T09:00";
    const olderAsOf = "2026-06-01T09:00";

    const first = await saveRevenueSnapshot(validInput(monthKey, { revenue: "100", sourceAsOf: newerAsOf }), adminId);
    expect(first.ok).toBe(true);

    const staleAttempt = await saveRevenueSnapshot(
      validInput(monthKey, { revenue: "999", sourceAsOf: olderAsOf, confirmStaleAsOf: false }),
      adminId
    );
    expect(staleAttempt.ok).toBe(false);
    if (!staleAttempt.ok) expect(staleAttempt.code).toBe("STALE_AS_OF");

    // Refused — the newer data on file must be completely unchanged.
    const afterRefusal = await getSalesActuals(monthKey);
    expect(afterRefusal.revenue).toBe(100);

    const confirmed = await saveRevenueSnapshot(
      validInput(monthKey, { revenue: "999", sourceAsOf: olderAsOf, confirmStaleAsOf: true }),
      adminId
    );
    expect(confirmed.ok).toBe(true);
    const afterConfirm = await getSalesActuals(monthKey);
    expect(afterConfirm.revenue).toBe(999);
  });
});

test.describe.serial("Sales revenue entry: authorization and Home goal-tracker isolation (browser)", () => {
  let salesRepId: string;
  const salesRepEmail = `rev-entry-rep-${RUN_ID}@example.com`;
  const pastMonthKey = "2019-03";

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        name: `Revenue Entry Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;
  });

  test.afterAll(async () => {
    await prisma.salesRevenueSnapshot.deleteMany({ where: { monthKey: pastMonthKey } });
    await prisma.salesToolData.deleteMany({ where: { key: `sales:actuals:${pastMonthKey}` } });
    await prisma.auditLogEntry.deleteMany({ where: { recordType: "SalesRevenueSnapshot", recordId: pastMonthKey } });
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.user.deleteMany({ where: { id: salesRepId } });
    await prisma.$disconnect();
  });

  test("An unauthenticated forged saveRevenueSnapshotAction call is refused, writes nothing", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${pastMonthKey}`);

    const actionId = await captureActionId(page, async () => {
      await page.fill("#revenue", "42");
      await page.fill("#source", "forge-capture");
      await page.click('button:has-text("Save Revenue")');
      await page.waitForTimeout(500);
    });
    await logout(page);

    // A brand-new, never-logged-in context (Playwright gives each test its
    // own context by default) forges the exact same action id.
    const forgedFd = new FormData();
    forgedFd.set("monthKey", pastMonthKey);
    forgedFd.set("revenue", "999999");
    forgedFd.set("source", "forged-unauthenticated");
    forgedFd.set("coverage", "FULL_MONTH");
    await forgeAction(page, "/sales", actionId, [forgedFd]);

    const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(row?.source).not.toBe("forged-unauthenticated");
  });

  test("A forged saveRevenueSnapshotAction call from a Sales Rep with canEdit is refused, writes nothing", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${pastMonthKey}`);

    const actionId = await captureActionId(page, async () => {
      await page.fill("#revenue", "55");
      await page.fill("#source", "forge-capture-2");
      await page.click('button:has-text("Save Revenue")');
      await page.waitForTimeout(500);
    });
    // The legitimate admin save above must have gone through — captured
    // AFTER it, so the forgery check below compares against the real
    // current state, not whatever an earlier test in this serial file left.
    const before = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(before?.revenue).toBe(55);
    expect(before?.source).toBe("forge-capture-2");
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const fd = new FormData();
    fd.set("monthKey", pastMonthKey);
    fd.set("revenue", "888888");
    fd.set("source", "forged-sales-rep");
    fd.set("coverage", "FULL_MONTH");
    await forgeAction(page, "/sales", actionId, [fd]);
    await logout(page);

    const after = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(after?.source).not.toBe("forged-sales-rep");
    expect(after?.revenue).toBe(before?.revenue);
  });

  test("Home's current-month goal tracker is unaffected by entering a past reporting month's revenue", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const salesSection = page.locator("section", { has: page.getByRole("heading", { name: "Sales", exact: true }) });
    const before = await salesSection.innerText();

    const { last } = monthBoundsUtc(pastMonthKey);
    await page.goto(`/sales?month=${pastMonthKey}`);
    await page.fill("#revenue", "123456");
    await page.fill("#source", "home-isolation-check");
    await page.selectOption("#coverage", "FULL_MONTH");
    await page.fill("#coverageThrough", last.toISOString().slice(0, 10));
    // Deliberately far in the future — guaranteed later than whatever this
    // suite's earlier saves for this same month left on file, so this save
    // never trips the stale-as-of guard (which isn't being tested here).
    await page.fill("#sourceAsOf", "2030-01-01T09:00");
    await page.selectOption("#status", "RECONCILED");
    await page.click('button:has-text("Save Revenue")');
    await expect(page.getByText(/Saved Completed cleaning charges/)).toBeVisible();

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const after = await salesSection.innerText();
    expect(after).toBe(before);
  });
});
