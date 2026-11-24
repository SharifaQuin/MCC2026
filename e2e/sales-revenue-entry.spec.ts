import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getSalesActuals, setSalesLabor } from "../src/lib/salesDashboard";
import { businessMonthKey } from "../src/lib/timezone";
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

// Captures a real Server Action request's exact wire bytes (action id,
// raw POST body, and content-type) as the browser actually sent them —
// NOT a hand-reconstructed JSON.stringify of the call's arguments. When an
// action's argument is a FormData (every action in this file), the real
// request body is multipart/form-data, not JSON; JSON.stringify(FormData)
// serializes to "{}" (FormData has no enumerable own properties), so a
// forged call built that way sends an empty, malformed payload — any
// rejection it gets could be the server refusing bad input, not enforcing
// authorization. Capturing and replaying the genuine bytes verbatim (under
// a different session's cookies) keeps the payload exactly as
// well-formed as the original authorized call, so a rejection can only be
// about who's asking, never what was asked.
interface CapturedAction {
  actionId: string;
  body: Buffer;
  contentType: string;
}

async function captureAction(page: Page, trigger: () => Promise<void>): Promise<CapturedAction> {
  let captured: CapturedAction | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) {
      captured = {
        actionId: header,
        body: req.postDataBuffer() ?? Buffer.alloc(0),
        contentType: req.headers()["content-type"] ?? "text/plain;charset=UTF-8",
      };
    }
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action request — trigger() didn't fire one.");
  return captured;
}

async function replayAction(page: Page, path: string, captured: CapturedAction) {
  return page.request.post(path, {
    headers: { "next-action": captured.actionId, "content-type": captured.contentType },
    data: captured.body,
  });
}

// What "refused" actually looks like on the wire, confirmed empirically
// (not guessed) for this app's two distinct unauthorized shapes — Next.js
// server actions don't use HTTP error status codes the way a REST API
// would, so a bare status check can't tell a refusal from a success:
//  - Signed-out: the portal layout's own getSession()-redirect fires
//    before the action ever runs, so the response is a 200 carrying the
//    rendered /login page's HTML (never the action's own result) — the
//    reliable tell is the login form's password field.
//  - Authenticated non-admin: the request reaches saveRevenueSnapshotAction/
//    saveSalesLaborAction, whose requireAdmin() throws — Next.js reports
//    that as a 500 with an RSC error payload carrying a "digest".
async function expectRefusedResponse(res: Awaited<ReturnType<typeof replayAction>>, as: "signed-out" | "non-admin") {
  if (as === "signed-out") {
    const text = await res.text();
    expect(text, "signed-out replay must render the login page, not the action's own result").toContain(
      'name="password"'
    );
  } else {
    expect(res.status(), "non-admin replay must surface the thrown Not-authorized error").toBe(500);
    const text = await res.text();
    expect(text).toContain('"digest"');
  }
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

  test("replacing a legacy month's revenue records its real previous figure in the audit entry, not absent — and leaves the legacy row untouched", async () => {
    const monthKey = freshMonth();
    const legacyValue = JSON.stringify({ revenue: 4000, labor: 1500 });
    await prisma.salesToolData.create({ data: { key: `sales:actuals:${monthKey}`, value: legacyValue } });

    const result = await saveRevenueSnapshot(validInput(monthKey, { revenue: "6000" }), adminId);
    expect(result.ok).toBe(true);

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "SalesRevenueSnapshot", recordId: monthKey },
      orderBy: { createdAt: "desc" },
    });
    const changedFields = audit?.changedFields as { revenue?: { from?: number; to?: number } } | null;
    expect(changedFields?.revenue?.from).toBe(4000);
    expect(changedFields?.revenue?.to).toBe(6000);

    // The legacy row itself is still exactly as it was — read, never
    // migrated or rewritten.
    const legacyRowAfter = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${monthKey}` } });
    expect(legacyRowAfter?.value).toBe(legacyValue);

    // The new snapshot is now the one source of truth for this month's
    // revenue going forward — and the legacy labor is still untouched.
    const actuals = await getSalesActuals(monthKey);
    expect(actuals.revenue).toBe(6000);
    expect(actuals.labor).toBe(1500);
  });

  test("the snapshot write and its audit entry succeed or fail together — a successful save always has exactly one matching audit row", async () => {
    const monthKey = freshMonth();
    const result = await saveRevenueSnapshot(validInput(monthKey, { revenue: "250" }), adminId);
    expect(result.ok).toBe(true);

    const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });
    expect(row).not.toBeNull();
    const auditCount = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: monthKey, action: "SALES_REVENUE_SNAPSHOT_CREATED" },
    });
    expect(auditCount).toBe(1);
  });

  test("invalid revenue input, including non-money formats, is rejected and writes neither a snapshot nor an audit entry", async () => {
    const cases: [string, Partial<RawRevenueSnapshotInput>][] = [
      ["blank", { revenue: "" }],
      ["negative", { revenue: "-5" }],
      ["malformed", { revenue: "abc" }],
      ["infinite", { revenue: "Infinity" }],
      ["hexadecimal", { revenue: "0x10" }],
      ["scientific notation", { revenue: "1e5" }],
      ["leading plus sign", { revenue: "+100" }],
      ["thousands separator", { revenue: "1,000" }],
    ];
    for (const [label, overrides] of cases) {
      const monthKey = freshMonth();
      const result = await saveRevenueSnapshot(validInput(monthKey, overrides), adminId);
      expect(result.ok, `revenue case: ${label}`).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
      const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });
      expect(row, `no snapshot written for revenue case: ${label}`).toBeNull();
      const auditCount = await prisma.auditLogEntry.count({
        where: { recordType: "SalesRevenueSnapshot", recordId: monthKey },
      });
      expect(auditCount, `no audit entry written for revenue case: ${label}`).toBe(0);
    }
  });

  test("a nonexistent calendar date or an out-of-range/date-only source-as-of is rejected, writing neither a snapshot nor an audit entry", async () => {
    const cases: [string, Partial<RawRevenueSnapshotInput>][] = [
      // Feb 30th doesn't exist in any year — Date.UTC would otherwise
      // silently roll it into early March, which is exactly the kind of
      // normalization this must not allow.
      ["nonexistent calendar date (Feb 30)", { sourceAsOf: "2026-02-30T09:00" }],
      // Hour 25 / minute 99 would otherwise roll into the next day(s).
      ["out-of-range time (25:99)", { sourceAsOf: "2026-01-15T25:99" }],
      // A bare date with no time component — must not be silently read as
      // midnight.
      ["date-only, no time", { sourceAsOf: "2026-01-15" }],
    ];
    for (const [label, overrides] of cases) {
      const monthKey = freshMonth();
      const result = await saveRevenueSnapshot(validInput(monthKey, overrides), adminId);
      expect(result.ok, `source-as-of case: ${label}`).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
      const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });
      expect(row, `no snapshot written for source-as-of case: ${label}`).toBeNull();
      const auditCount = await prisma.auditLogEntry.count({
        where: { recordType: "SalesRevenueSnapshot", recordId: monthKey },
      });
      expect(auditCount, `no audit entry written for source-as-of case: ${label}`).toBe(0);
    }
  });

  test("a source-as-of earlier than the coverage-through date is rejected, writing neither a snapshot nor an audit entry", async () => {
    const monthKey = freshMonth();
    const { first } = monthBoundsUtc(monthKey);
    // Day 15 of the month for coverage-through, day 5 for source-as-of —
    // both safely inside any calendar month, with source-as-of clearly
    // before the period it's supposedly reporting on even finishes.
    const coverageThrough = new Date(first.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    const sourceAsOf = `${new Date(first.getTime() + 4 * 86400000).toISOString().slice(0, 10)}T09:00`;

    const result = await saveRevenueSnapshot(
      validInput(monthKey, { coverage: "MONTH_TO_DATE", coverageThrough, sourceAsOf }),
      adminId
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });
    expect(row).toBeNull();
    const auditCount = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: monthKey },
    });
    expect(auditCount).toBe(0);
  });

  test("a source-as-of that's still the evening before in America/Los_Angeles is rejected, even though its UTC instant already falls on the coverage-through day", async () => {
    // Feb 1, 8pm Pacific (PST, UTC-8 — February is never DST) converts to
    // Feb 2, 4am UTC — on or after coverage-through's UTC midnight, which
    // is exactly what a raw-instant comparison would wrongly accept. Its
    // own Pacific calendar date is still Feb 1, a day before Feb 2, which
    // is what must be compared.
    const monthKey = "2014-02";
    testMonths.push(monthKey);
    const coverageThrough = "2014-02-02";
    const sourceAsOf = "2014-02-01T20:00";
    expect(new Date(`${coverageThrough}T00:00:00Z`).getTime()).toBeLessThan(
      new Date(`${sourceAsOf}:00-08:00`).getTime()
    );

    await setSalesLabor(500, monthKey);

    const result = await saveRevenueSnapshot(
      validInput(monthKey, { coverage: "MONTH_TO_DATE", coverageThrough, sourceAsOf }),
      adminId
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");

    const row = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });
    expect(row, "no snapshot written").toBeNull();
    const auditCount = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: monthKey },
    });
    expect(auditCount, "no audit entry written").toBe(0);
    const actuals = await getSalesActuals(monthKey);
    expect(actuals.labor, "the unrelated labor figure already on file is untouched").toBe(500);
    expect(actuals.revenue, "no revenue was ever entered for this month").toBe(0);
    expect(actuals.entered).toBe(false);
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

  test("the reporting-month default, actuals reads, and Home's tracker all key off one America/Los_Angeles business month — proven at the UTC/Pacific boundary", async () => {
    // Dec 1, 03:00 UTC is still Nov 30 evening in America/Los_Angeles —
    // the month default must agree it's still November, not silently
    // read "December" from a naive UTC calendar check.
    expect(businessMonthKey(new Date("2026-12-01T03:00:00Z"))).toBe("2026-11");
    // Jan 1, 06:00 UTC is still Dec 31 evening in America/Los_Angeles —
    // same boundary, crossing a year too.
    expect(businessMonthKey(new Date("2027-01-01T06:00:00Z"))).toBe("2026-12");

    // getSalesActuals()'s own default (used by loadSalesDashboard, which
    // backs Home's tracker) must be the exact same key the reporting-month
    // selector's own default resolves to "right now" — not two
    // independently-derived "current month"s that could disagree near
    // this same boundary.
    const defaultActuals = await getSalesActuals();
    const explicitActuals = await getSalesActuals(businessMonthKey());
    expect(defaultActuals).toEqual(explicitActuals);
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

  test("A correctly-encoded saveRevenueSnapshotAction request succeeds for the owner, and an explicit-unauthorized response with no write results when the exact same bytes are replayed by a signed-out or non-admin caller", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${pastMonthKey}`);

    // The capture itself is a real, legitimate, well-formed owner
    // submission — control: it must actually have written, so a later
    // "no write" result for the replay can only mean authorization
    // refused it, not that the payload was bad.
    const captured = await captureAction(page, async () => {
      await page.fill("#revenue", "42");
      await page.fill("#source", "replay-capture");
      await page.click('button:has-text("Save Revenue")');
      await page.waitForTimeout(500);
    });
    const afterOwnerSave = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(afterOwnerSave?.revenue, "control: the owner's own real submission must have written").toBe(42);
    expect(afterOwnerSave?.source).toBe("replay-capture");
    const auditCountAfterOwnerSave = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: pastMonthKey },
    });
    await logout(page);

    // Signed-out replay of the exact same well-formed bytes.
    const unauthRes = await replayAction(page, "/sales", captured);
    await expectRefusedResponse(unauthRes, "signed-out");
    const afterUnauth = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(afterUnauth?.revenue).toBe(42);
    expect(afterUnauth?.source).toBe("replay-capture");
    const auditCountAfterUnauth = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: pastMonthKey },
    });
    expect(auditCountAfterUnauth).toBe(auditCountAfterOwnerSave);

    // Non-admin (Sales Rep, with real Sales canEdit) replay of the same bytes.
    await loginAs(page, salesRepEmail, PASSWORD);
    const nonAdminRes = await replayAction(page, "/sales", captured);
    await expectRefusedResponse(nonAdminRes, "non-admin");
    await logout(page);
    const afterNonAdmin = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(afterNonAdmin?.revenue).toBe(42);
    expect(afterNonAdmin?.source).toBe("replay-capture");
    const auditCountAfterNonAdmin = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: pastMonthKey },
    });
    expect(auditCountAfterNonAdmin).toBe(auditCountAfterOwnerSave);
  });

  test("A correctly-encoded, confirmed-override saveRevenueSnapshotAction request succeeds for the owner, and is refused with no write when replayed by a signed-out or non-admin caller", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${pastMonthKey}`);

    // Engineer a real stale-as-of conflict first (a later source-as-of
    // already on file from the previous test), then submit an older one
    // and actually click "Confirm and save anyway" — so the captured
    // request's own bytes genuinely carry confirmStaleAsOf=on, not a
    // hand-added field. Must still be on/after coverage-through (this
    // month's default prefill is its last day, 2019-03-31) — "stale
    // relative to what's on file" and "internally consistent with its own
    // coverage-through" are independent checks, both have to hold here.
    await page.fill("#revenue", "77");
    await page.fill("#source", "replay-capture-override");
    await page.fill("#sourceAsOf", "2020-06-01T09:00");
    await page.click('button:has-text("Save Revenue")');
    await expect(page.getByText(/Confirm to replace it anyway/)).toBeVisible();

    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Confirm and save anyway")');
      await page.waitForTimeout(500);
    });
    const afterOwnerSave = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(afterOwnerSave?.revenue, "control: the owner's confirmed override must have written").toBe(77);
    expect(afterOwnerSave?.source).toBe("replay-capture-override");
    const auditCountAfterOwnerSave = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: pastMonthKey },
    });
    await logout(page);

    const unauthRes = await replayAction(page, "/sales", captured);
    await expectRefusedResponse(unauthRes, "signed-out");
    const afterUnauth = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(afterUnauth?.revenue).toBe(77);
    expect(afterUnauth?.source).toBe("replay-capture-override");

    await loginAs(page, salesRepEmail, PASSWORD);
    const nonAdminRes = await replayAction(page, "/sales", captured);
    await expectRefusedResponse(nonAdminRes, "non-admin");
    await logout(page);
    const afterNonAdmin = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey: pastMonthKey } });
    expect(afterNonAdmin?.revenue).toBe(77);
    expect(afterNonAdmin?.source).toBe("replay-capture-override");
    const auditCountAfterNonAdmin = await prisma.auditLogEntry.count({
      where: { recordType: "SalesRevenueSnapshot", recordId: pastMonthKey },
    });
    expect(auditCountAfterNonAdmin).toBe(auditCountAfterOwnerSave);
  });

  test("A correctly-encoded saveSalesLaborAction request succeeds for the owner, and is refused with no write when replayed by a signed-out or non-admin caller", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${pastMonthKey}`);

    const captured = await captureAction(page, async () => {
      await page.fill("#labor", "1");
      await page.click('button:has-text("Save Labor")');
      await page.waitForTimeout(500);
    });
    const afterOwnerSave = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${pastMonthKey}` } });
    expect(afterOwnerSave?.value, "control: the owner's own real submission must have written").toContain('"labor":1');
    await logout(page);

    const unauthRes = await replayAction(page, "/sales", captured);
    await expectRefusedResponse(unauthRes, "signed-out");
    const afterUnauth = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${pastMonthKey}` } });
    expect(afterUnauth?.value).toBe(afterOwnerSave?.value);

    await loginAs(page, salesRepEmail, PASSWORD);
    const nonAdminRes = await replayAction(page, "/sales", captured);
    await expectRefusedResponse(nonAdminRes, "non-admin");
    await logout(page);
    const afterNonAdmin = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${pastMonthKey}` } });
    expect(afterNonAdmin?.value).toBe(afterOwnerSave?.value);
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

test.describe("Sales revenue entry: Completed Cleaning Revenue card phone layout", () => {
  const monthKey = "2012-07";

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    await saveRevenueSnapshot(
      validInput(monthKey, { revenue: "1234567.89", source: "phone-layout-check" }),
      admin.id
    );
    await setSalesLabor(234567.89, monthKey);
  });

  test.afterAll(async () => {
    await prisma.salesRevenueSnapshot.deleteMany({ where: { monthKey } });
    await prisma.salesToolData.deleteMany({ where: { key: `sales:actuals:${monthKey}` } });
    await prisma.auditLogEntry.deleteMany({ where: { recordType: "SalesRevenueSnapshot", recordId: monthKey } });
    await prisma.$disconnect();
  });

  test("the card stacks to full-width rows at 390px — no clipped labels or amounts, even for a large dollar figure", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${monthKey}`);
    await page.waitForLoadState("networkidle");

    const card = page.locator('[data-testid="completed-cleaning-revenue-card"]');
    await expect(card).toBeVisible();
    const stats = page.locator('[data-testid="completed-cleaning-stats"]');
    await expect(stats.getByText("Completed Cleaning Charges", { exact: true })).toBeVisible();
    await expect(stats.getByText("$1,234,567.89")).toBeVisible();
    await expect(stats.getByText("Labor", { exact: true })).toBeVisible();
    await expect(stats.getByText("$234,567.89")).toBeVisible();
    await expect(stats.getByText("Revenue less entered labor", { exact: true })).toBeVisible();
    await expect(stats.getByText("$1,000,000.00")).toBeVisible();

    // The whole page, not just the card, must fit the viewport width — the
    // same horizontal-overflow check used elsewhere in this app (a single
    // oversized child can force the page to scroll sideways even if it
    // isn't the element you're looking at).
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("the card still shows all three stat tiles side by side on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales?month=${monthKey}`);
    await page.waitForLoadState("networkidle");

    const tiles = page.locator('[data-testid="completed-cleaning-stats"] > div');
    expect(await tiles.count()).toBe(3);
    const tops = await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    // Side by side means all three start at the same vertical position —
    // stacked (the mobile layout) would show increasing tops instead.
    expect(new Set(tops).size).toBe(1);
  });
});
