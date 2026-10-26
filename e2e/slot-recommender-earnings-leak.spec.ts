import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for the "slot recommender exposes internal earnings/hr data to
// non-owner viewers" production follow-up. windowValuePerHour and the
// "this window earns $X/hr" narration clause in recommendSlots()/
// getNextOpenSlots() must only ever reach an ADMIN session — never a
// SALES_REP, and never a non-ADMIN manager either (isManager / Management
// department view is a broader boundary than ADMIN and must not leak
// owner-only earnings data). Availability, route/drive-tier, repeat-visit,
// and quote fields must keep working for every role. Uses a real, loaded
// SlotFeedMonth fixture so recommendSlots()/getNextOpenSlots() exercise the
// live engine, not the "no capacity feed loaded" fallback path.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const SALES_REP_EMAIL = `earn-salesrep-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";
const SM_EMAIL = `earn-sm-${RUN_ID}@example.com`;
const SM_PASSWORD = "Test-Password-123!";

const TEST_CITY = "Irvine";
const TEST_ADDRESS = `100 Leak Test Ln, ${TEST_CITY}, CA 92614`;
const TEST_WINDOW = "8am-10am";
// A distinctive, non-round rate: unlikely to collide with any other number
// rendered elsewhere on the page, and an integer so the rendered ("~$X/hr",
// rounded) and raw-JSON ("windowValuePerHour":X) representations match
// exactly, which keeps the leak-detection checks below precise.
const TEST_RATE = 173;

const prisma = new PrismaClient();

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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

// Scans raw HTML/JSON text for the literal field name followed (anywhere
// within a short window) by the rate's digits — tolerant of whatever
// escaping Next.js's RSC flight payload uses, since it only looks at raw
// characters rather than trying to parse the embedded JSON itself.
function leaksEarningsNear(haystack: string, rate: number): boolean {
  const needle = "windowValuePerHour";
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const window = haystack.slice(idx, idx + 60);
    if (window.includes(String(rate))) return true;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return false;
}

test.describe.serial("Slot recommender earnings/performance data is ADMIN-only", () => {
  let salesRepId: string;
  let smId: string;
  let feedMonthId: string;
  const testDates = [3, 4, 5, 6, 7, 8].map(addDaysIso);
  const testMonth = testDates[0].slice(0, 7);

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Earnings Leak Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    // isManager (Management department view) without ADMIN — the exact
    // boundary the owner flagged as too broad for earnings data.
    const sm = await prisma.user.create({
      data: {
        email: SM_EMAIL,
        name: `Earnings Leak SM ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(SM_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: {
          create: [
            { department: "SALES", canEdit: true },
            { department: "MANAGEMENT", canEdit: true },
          ],
        },
      },
    });
    smId = sm.id;

    const feedMonth = await prisma.slotFeedMonth.create({
      data: {
        month: testMonth,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: { pace_per_person_hour: 50, min_lead_days: 1 },
        windowValuePerHour: { [TEST_WINDOW]: TEST_RATE },
        routeBoard: {},
        dates: {
          create: testDates.map((date) => ({
            date: new Date(date + "T00:00:00Z"),
            weekday: new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
              weekday: "long",
              timeZone: "UTC",
            }),
            status: "Open",
            openPersonHours: 20,
            openDollars: 2000,
            blocks: { Morning: { open: 2, windows: [TEST_WINDOW] } },
            bookedJobs: [],
          })),
        },
      },
    });
    feedMonthId = feedMonth.id;
  });

  test.afterAll(async () => {
    await prisma.slotFeedMonth.delete({ where: { id: feedMonthId } }).catch(() => {});
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: [salesRepId, smId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, smId] } } });
    await prisma.$disconnect();
  });

  // ---------- /api/sales/slot-recommender/recommend ----------

  test("ADMIN: recommend API retains windowValuePerHour and the earnings reason clause, plus manager-only fields", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.request.post("/api/sales/slot-recommender/recommend", {
      data: { month: testMonth, address: TEST_ADDRESS, price: 300, frequency: "onetime" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.isManager).toBe(true);
    expect(body.results.some((c: any) => c.windowValuePerHour === TEST_RATE)).toBe(true);
    expect(body.results.some((c: any) => typeof c.reason === "string" && c.reason.includes(`earns $${TEST_RATE}/hr`))).toBe(
      true
    );
    expect(body.results[0]).toHaveProperty("score");
    expect(body.results[0]).toHaveProperty("estDriveCost");
    expect(body.results[0]).toHaveProperty("dayStatus");
    await logout(page);
  });

  test("SALES_REP: recommend API never exposes earnings data anywhere in the raw response, but availability/route/quote fields still work", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    const res = await page.request.post("/api/sales/slot-recommender/recommend", {
      data: { month: testMonth, address: TEST_ADDRESS, price: 300, frequency: "onetime" },
    });
    expect(res.ok()).toBeTruthy();
    const raw = await res.text();
    expect(raw).not.toContain("earns $");
    expect(raw).not.toMatch(new RegExp(`"windowValuePerHour"\\s*:\\s*${TEST_RATE}\\b`));
    const body = JSON.parse(raw);
    expect(body.isManager).toBe(false);
    expect(body.results.length).toBeGreaterThan(0);
    for (const c of body.results) {
      expect(c.windowValuePerHour == null).toBe(true);
      expect(c).not.toHaveProperty("score");
      expect(c).not.toHaveProperty("estDriveCost");
      expect(c).not.toHaveProperty("dayStatus");
      expect(c).not.toHaveProperty("dayOpenHours");
      // Rep-facing fields keep working — this is not a blanket lockdown.
      expect(c.headline).toBeTruthy();
      expect(c.routeTier).toBeTruthy();
      expect(c.script).toBeTruthy();
      expect(typeof c.reason).toBe("string");
      expect(c.reason.length).toBeGreaterThan(0);
    }
    await logout(page);
  });

  test("SERVICE_MANAGER (isManager, non-ADMIN): keeps score/driveCost/dayStatus but never earnings data — isManager no longer leaks owner-only data", async ({
    page,
  }) => {
    await loginAs(page, SM_EMAIL, SM_PASSWORD);
    const res = await page.request.post("/api/sales/slot-recommender/recommend", {
      data: { month: testMonth, address: TEST_ADDRESS, price: 300, frequency: "onetime" },
    });
    expect(res.ok()).toBeTruthy();
    const raw = await res.text();
    expect(raw).not.toContain("earns $");
    expect(raw).not.toMatch(new RegExp(`"windowValuePerHour"\\s*:\\s*${TEST_RATE}\\b`));
    const body = JSON.parse(raw);
    expect(body.isManager).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    for (const c of body.results) {
      expect(c.windowValuePerHour == null).toBe(true);
      expect(c).toHaveProperty("score");
      expect(c).toHaveProperty("estDriveCost");
      expect(c).toHaveProperty("dayStatus");
    }
    await logout(page);
  });

  // ---------- /sales dashboard + /sales/open-slots (Next Open Slots card) ----------

  test("ADMIN: /sales dashboard and /sales/open-slots carry real earnings data for the Next Open Slots card", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const dashHtml = await (await page.request.get("/sales")).text();
    expect(dashHtml).toContain(`~$${TEST_RATE}/hr`);
    expect(leaksEarningsNear(dashHtml, TEST_RATE)).toBe(true);

    const openHtml = await (await page.request.get("/sales/open-slots")).text();
    expect(openHtml).toContain(`~$${TEST_RATE}/hr`);
    expect(leaksEarningsNear(openHtml, TEST_RATE)).toBe(true);

    await logout(page);
  });

  test("SALES_REP: /sales dashboard and /sales/open-slots never render or embed earnings data in the Next Open Slots card", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);

    const dashHtml = await (await page.request.get("/sales")).text();
    expect(dashHtml).not.toContain(`$${TEST_RATE}/hr`);
    expect(leaksEarningsNear(dashHtml, TEST_RATE)).toBe(false);

    const openHtml = await (await page.request.get("/sales/open-slots")).text();
    expect(openHtml).not.toContain(`$${TEST_RATE}/hr`);
    expect(leaksEarningsNear(openHtml, TEST_RATE)).toBe(false);

    await logout(page);
  });
});
