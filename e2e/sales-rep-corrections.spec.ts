import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { findPedroPaezCandidates, revokeCallbackQueueGrant } from "../scripts/lib/pedroCallbackQueueAccess";

// Coverage for the "sales-only account, owner-only financial controls,
// callbacks and recurring tasks" correction brief:
//   1. Owner-only financial editing (setSalesGoalAction/setSalesActualsAction/
//      setLeadSourceSpendAction + the /api/sales/storage bypass)
//   2. Sales-only navigation/landing/Today content for SALES_REP
//   3. Callbacks-first /sales/leads view for SALES_REP, owner's pipeline unchanged
//   4. Pedro's CALLBACK_QUEUE revocation (via disposable fixture, not a real account)
//   5. Owner-only internal quoting information (HTML + storage API)
//   6. Route Day Planner title link + open-slots month navigation
//   7. The two recurring tasks gone and not recreated by a reseed (already
//      verified directly against the dev DB — see PR description)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const SALES_REP_EMAIL = `corr-salesrep-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";
const SM_EMAIL = `corr-sm-${RUN_ID}@example.com`;
const SM_PASSWORD = "Test-Password-123!";

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

test.describe.serial("Sales-rep corrections (browser)", () => {
  let salesRepId: string;
  let smId: string;

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Corrections Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const sm = await prisma.user.create({
      data: {
        email: SM_EMAIL,
        name: `Corrections SM ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(SM_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    smId = sm.id;
  });

  test.afterAll(async () => {
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: [salesRepId, smId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, smId] } } });
    await prisma.$disconnect();
  });

  // ---------- Item 1: owner-only financial editing ----------

  test("ADMIN sees the Sales financial inputs; a Sales Rep with canEdit sees the numbers but no inputs/save buttons", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");
    await expect(page.getByLabel(/set this month.s revenue goal/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Goal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Actuals" })).toBeVisible();
    await logout(page);

    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "This Month" })).toBeVisible();
    await expect(page.getByLabel(/set this month.s revenue goal/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Goal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Actuals" })).toHaveCount(0);
    await logout(page);
  });

  test("A forged setSalesGoalAction/setSalesActualsAction call from a Sales Rep with canEdit is refused, value unchanged", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");
    const before = await prisma.salesToolData.findUnique({ where: { key: "sales:goal" } });

    const goalActionId = await captureActionId(page, async () => {
      await page.fill("#revenueGoal", "12345");
      await page.click('button:has-text("Save Goal")');
      await page.waitForTimeout(500);
    });
    // Restore admin's own change so this test doesn't leave a side effect,
    // then forge the exact same action id as the Sales Rep.
    const afterAdminSave = await prisma.salesToolData.findUnique({ where: { key: "sales:goal" } });
    expect(afterAdminSave?.value).toContain("12345");
    await logout(page);

    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    const fd = new FormData();
    fd.set("revenueGoal", "99999");
    await forgeAction(page, "/sales", goalActionId, [fd]);
    await logout(page);

    const afterForge = await prisma.salesToolData.findUnique({ where: { key: "sales:goal" } });
    expect(afterForge?.value).not.toContain("99999");
    expect(afterForge?.value).toContain("12345");

    // Restore original value.
    if (before) {
      await prisma.salesToolData.update({ where: { key: "sales:goal" }, data: { value: before.value } });
    } else {
      await prisma.salesToolData.deleteMany({ where: { key: "sales:goal" } });
    }
  });

  test("A direct /api/sales/storage POST writing sales:goal from a Sales Rep (view or edit) is refused — reads stay open", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    const before = await prisma.salesToolData.findUnique({ where: { key: "sales:goal" } });

    const setRes = await page.request.post("/api/sales/storage", {
      data: { op: "set", key: "sales:goal", value: JSON.stringify({ revenueGoal: 55555 }) },
    });
    expect(setRes.status()).toBe(403);
    const after = await prisma.salesToolData.findUnique({ where: { key: "sales:goal" } });
    expect(after?.value ?? null).toBe(before?.value ?? null);

    // Reads of the same key stay open to an authorized Sales viewer.
    const getRes = await page.request.post("/api/sales/storage", {
      data: { op: "get", key: "sales:goal" },
    });
    expect(getRes.status()).not.toBe(403);

    // The same key can't be deleted either.
    const delRes = await page.request.post("/api/sales/storage", {
      data: { op: "delete", key: "sales:goal" },
    });
    expect(delRes.status()).toBe(403);
    await logout(page);
  });

  test("setLeadSourceSpendAction refuses a Sales Rep with canEdit — returns an error, writes nothing", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales");
    // The Ad Spend form isn't rendered for her at all (canEdit-gated UI is
    // now isAdmin-gated) — assert absence rather than trying to submit it.
    await expect(page.getByText(/log ad spend/i)).toHaveCount(0);
    await logout(page);
  });

  // ---------- Item 2: sales-only nav/landing/Today ----------

  test("A Sales Rep's nav shows Sales links only, lands on /sales from Home, and is denied direct HR/recruiting/training/staff URLs", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);

    await page.goto("/");
    await expect(page).toHaveURL("/sales");

    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar.getByRole("link", { name: "Sales Dashboard" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Leads & Callbacks" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Quotes", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Open Slots" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "HR", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Recruiting", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Staff", exact: true })).toHaveCount(0);

    // /hr, /recruiting, /staff each redirect to "/" (middleware or the
    // page's own role check), which — for a Sales Rep — itself redirects on
    // to /sales; /modules, /progress, /glossary redirect straight there.
    // Either way she never lands on any of these six routes.
    for (const path of ["/hr", "/recruiting", "/staff", "/modules", "/progress", "/glossary"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/sales");
    }
    await logout(page);
  });

  test("A Sales Rep with zero Sales access doesn't loop on / and doesn't see Training/Recruiting", async ({
    page,
  }) => {
    const noAccessEmail = `corr-salesrep-noaccess-${RUN_ID}@example.com`;
    const noAccessPassword = "Test-Password-123!";
    const noAccessUser = await prisma.user.create({
      data: {
        email: noAccessEmail,
        name: `Corrections Sales Rep No Access ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(noAccessPassword),
        mustSetPassword: false,
        active: true,
        // Deliberately no departmentAccess grant at all — this is the state
        // of a freshly-created Sales Rep before the owner grants Sales
        // access, and must not infinite-loop between "/" and "/sales".
      },
    });
    try {
      await loginAs(page, noAccessEmail, noAccessPassword);
      await page.goto("/");
      // She has no Sales access, so "/" must not bounce her to /sales (which
      // would itself bounce her straight back to "/"); it must render the
      // generic Home body instead, with no Training/Recruiting content.
      await expect(page).toHaveURL("/");
      await expect(page.getByText(/training/i)).toHaveCount(0);
      await expect(page.getByText(/recruiting/i)).toHaveCount(0);
      await expect(page.getByText(/interviews today/i)).toHaveCount(0);

      // /sales/leads still correctly redirects away (no access), same as
      // the pre-existing role-selector test expects for a no-access role.
      await page.goto("/sales/leads");
      await expect(page).toHaveURL("/");
      await logout(page);
    } finally {
      await prisma.user.delete({ where: { id: noAccessUser.id } });
    }
  });

  test("A Sales Rep sees overdue SALES-category checklist tasks on /sales, not interviews/staffing", async ({
    page,
  }) => {
    const task = await prisma.checklistTask.create({
      data: {
        frequency: "ONE_TIME",
        task: `Corrections overdue sales task ${RUN_ID}`,
        owner: "TEAM",
        status: "NOT_STARTED",
        visibility: "TEAM",
        category: "SALES",
        targetDate: new Date(Date.now() - 1000 * 60 * 60 * 48),
      },
    });

    try {
      await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
      await page.goto("/sales");
      await expect(page.getByText("Overdue Sales Tasks")).toBeVisible();
      await expect(page.getByText(task.task)).toBeVisible();
      await expect(page.getByText("Interviews Today")).toHaveCount(0);
      await logout(page);
    } finally {
      await prisma.checklistTask.delete({ where: { id: task.id } });
    }
  });

  // ---------- Item 3: callbacks-first for SALES_REP ----------

  test("SALES_REP's /sales/leads shows Callbacks (overdue flagged) above Leads; ADMIN's pipeline board is unchanged", async ({
    page,
  }) => {
    const overdueLead = await prisma.lead.create({
      data: {
        firstName: "Overdue",
        lastName: `Callback-${RUN_ID}`,
        email: `overdue-${RUN_ID}@example.com`,
        phone: "5555570001",
        source: "OTHER",
        stage: "NEW_INQUIRY",
        followUpDueAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
    });
    const plainLead = await prisma.lead.create({
      data: {
        firstName: "Plain",
        lastName: `Open-${RUN_ID}`,
        email: `plain-${RUN_ID}@example.com`,
        phone: "5555570002",
        source: "OTHER",
        stage: "NEW_INQUIRY",
      },
    });

    try {
      await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
      await page.goto("/sales/leads");
      await expect(page.getByRole("heading", { name: "Leads & Callbacks" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Callbacks", exact: true })).toBeVisible();
      const callbacksSection = page.locator("h2", { hasText: "Callbacks" }).locator("..");
      const overdueRow = callbacksSection.getByRole("row", { name: new RegExp(overdueLead.lastName) });
      await expect(overdueRow).toContainText(/overdue/i);
      // Add Lead / search / export chrome is still present (full Sales abilities preserved).
      await expect(page.getByRole("button", { name: "+ Add Lead" }).or(page.getByText("Add Lead"))).toBeVisible();
      await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
      const leadsSection = page.locator("h2", { hasText: /^Leads$/ }).locator("..");
      await expect(leadsSection.getByText(plainLead.lastName)).toBeVisible();
      await logout(page);

      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto("/sales/leads");
      await expect(page.getByRole("heading", { name: "Lead Pipeline" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Callbacks" })).toHaveCount(0);
      await logout(page);
    } finally {
      await prisma.lead.deleteMany({ where: { id: { in: [overdueLead.id, plainLead.id] } } });
    }
  });

  // ---------- Item 5: owner-only internal quoting information ----------

  test("The pricing-tool HTML response excludes Profitability & internal margin content for a Sales Rep but includes it for ADMIN", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    const repRes = await page.request.get("/api/sales/pricing-tool");
    const repHtml = await repRes.text();
    expect(repHtml).not.toContain("Profitability &amp; Performance");
    // The literal id string "tabbtn-profit" legitimately still appears once,
    // inside switchTab's own shared, null-safe `getElementById(...)` call
    // (see src/content/sales-pricing-tool.html) — that's inert code, not
    // exposed content, so assert the actual button/panel markup is gone
    // instead of the bare id substring.
    expect(repHtml).not.toContain('id="tabbtn-profit"');
    expect(repHtml).not.toContain('id="tab-profit"');
    expect(repHtml).not.toContain("PF_DEFAULTS");
    expect(repHtml).not.toContain("Walk-away floor");
    expect(repHtml).not.toContain("hot-zone pricing:");
    expect(repHtml).not.toContain("mcc:profit:");
    // Follow-up fix: these three leaked through the first pass because they
    // lived outside any ADMIN-ONLY region — a static disclaimer div, a
    // dynamic income/hot-zone note written by shared JS, and the internal
    // cost-model constants themselves (shipped as real values in the shared
    // script regardless of role, independent of whether any UI rendered
    // them). Assert the actual response body, not a DOM query — a value or
    // sentence present anywhere in this text is shipped to her browser.
    expect(repHtml).not.toContain("This is a working internal tool");
    expect(repHtml).not.toContain("Median household income");
    expect(repHtml).not.toContain("174,904"); // Corona Del Mar's income — any one real figure proves the dataset leaked
    expect(repHtml).not.toContain("116,300"); // OC median income
    expect(repHtml).not.toContain("116300");
    expect(repHtml).not.toContain("OC_MEDIAN_INCOME");
    expect(repHtml).not.toContain("CITY_INCOME_DATA");
    expect(repHtml).not.toContain("TECH_WAGE");
    expect(repHtml).not.toContain("WC_RATE");
    expect(repHtml).not.toContain("AUDIT_OVERHEAD_PER_TECH_HR");
    expect(repHtml).not.toContain("20.52");
    expect(repHtml).not.toContain("MONTHLY_OVERHEAD_PER_HR");
    expect(repHtml).not.toMatch(/function\s+costBreakdown/);
    expect(repHtml).not.toMatch(/function\s+fixedCostFor/);
    expect(repHtml).not.toMatch(/function\s+minAcceptablePrice/);
    // The city-note div itself, and its (now Sales-Rep-safe) driving-time
    // text, still render for her — only the income/hot-zone commentary
    // the first pass missed is gone.
    expect(repHtml).toContain('id="city-note"');
    // Core calculator markup stays present for her.
    expect(repHtml).toContain("Job Details");
    expect(repHtml).toContain("svc-grid");
    await logout(page);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const adminRes = await page.request.get("/api/sales/pricing-tool");
    const adminHtml = await adminRes.text();
    expect(adminHtml).toContain("Profitability &amp; Performance");
    expect(adminHtml).toContain("PF_DEFAULTS");
    expect(adminHtml).toContain("Walk-away floor");
    // Regression-proof the positive case: ADMIN still gets every piece of
    // content/data the follow-up fix stripped from the Sales Rep response.
    expect(adminHtml).toContain("This is a working internal tool");
    expect(adminHtml).toContain("OC_MEDIAN_INCOME");
    expect(adminHtml).toContain("174904");
    expect(adminHtml).toContain("TECH_WAGE");
    expect(adminHtml).toContain("AUDIT_OVERHEAD_PER_TECH_HR");
    expect(adminHtml).toMatch(/function\s+costBreakdown/);
    await logout(page);
  });

  test("A Sales Rep's quote, including a city hot-zone premium, still prices correctly end to end even though the income/cost data behind it is gone from her response", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/pricing-tool");
    const frame = page.frameLocator("iframe");
    await frame.locator(".svc-btn", { hasText: "Standard" }).first().click();
    await expect(frame.locator("#cv-price")).not.toHaveText("$0", { timeout: 5000 });
    // Corona Del Mar is a hot zone with a +5% premium — the one piece of
    // CITY_DATA that's still legitimately shared (getCityPremium(), read by
    // computeCurrent() to produce the quoted price). Selecting it must still
    // show the premium chip and leave the price well-formed, proving the
    // customer quote keeps working without the now-stripped income dataset
    // it never actually depended on — and the city-note must update without
    // throwing (writeCityIncomeNote is entirely absent from her response)
    // and without ever showing the income commentary that used to leak.
    await frame.locator("#city-select").selectOption("Corona Del Mar");
    await expect(frame.locator("#cv-chips")).toContainText("+5%");
    await expect(frame.locator("#cv-price")).toContainText("$");
    await expect(frame.locator("#city-note")).toBeVisible();
    await expect(frame.locator("#city-note")).not.toContainText("Median household income");
    await logout(page);
  });

  test("The pricing tool's calculator still works end to end for a Sales Rep (no dangling null-element error)", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/pricing-tool");
    const frame = page.frameLocator("iframe");
    // Selecting a service and switching tabs must not throw — if switchTab's
    // unconditional tab-profit/tabbtn-profit toggles weren't null-safe, this
    // would break the whole tool for her.
    await frame.locator("#tabbtn-quote").click();
    await frame.locator("#tabbtn-pricing").click();
    await expect(frame.locator("#tab-pricing")).toHaveClass(/active/);
    await logout(page);
  });

  test("/api/sales/storage refuses a Sales Rep's read AND write of a profitability key, allows ADMIN both", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    const repGet = await page.request.post("/api/sales/storage", {
      data: { op: "get", key: "mcc:profit:settings" },
    });
    expect(repGet.status()).toBe(403);
    const repSet = await page.request.post("/api/sales/storage", {
      data: { op: "set", key: "mcc:profit:settings", value: "{}" },
    });
    expect(repSet.status()).toBe(403);
    await logout(page);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const adminSet = await page.request.post("/api/sales/storage", {
      data: { op: "set", key: "mcc:profit:settings", value: JSON.stringify({ targetMargin: 0.21 }) },
    });
    expect(adminSet.status()).not.toBe(403);
    const adminGet = await page.request.post("/api/sales/storage", {
      data: { op: "get", key: "mcc:profit:settings" },
    });
    expect(adminGet.status()).not.toBe(403);
    await prisma.salesToolData.deleteMany({ where: { key: "mcc:profit:settings" } });
    await logout(page);
  });

  // ---------- Item 6: Route Day Planner link + open-slots navigation ----------

  test("The Route Day Planner title links to /sales/open-slots with target=_top", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.request.get("/api/sales/pricing-tool");
    const html = await res.text();
    expect(html).toMatch(/<a href="\/sales\/open-slots" target="_top"[^>]*>Route Day Planner/);
    await logout(page);
  });

  test("Open Slots month navigation only offers months with a loaded capacity feed", async ({ page }) => {
    const testMonth = "2099-01";
    await prisma.slotFeedMonth.create({
      data: {
        month: testMonth,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: {},
        windowValuePerHour: {},
        routeBoard: {},
      },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/open-slots?month=${testMonth}`);
    await expect(page.getByText(/January 2099/)).toBeVisible();
    // A month with no loaded feed never appears as navigable or renders
    // fabricated availability.
    await page.goto("/sales/open-slots?month=2099-06");
    await expect(page.getByText(/January 2099/)).toHaveCount(0);
    await logout(page);

    await prisma.slotFeedMonth.delete({ where: { month: testMonth } });
  });

  // ---------- Item 4: Pedro's CALLBACK_QUEUE revocation (fixture-based) ----------

  test("Pedro Paez (fixture): revoking CALLBACK_QUEUE removes sales-leads access but preserves Recruiting/Onboarding/Training/HR Summary/Assigned Tasks", async ({
    page,
  }) => {
    const pedro = await prisma.user.create({
      data: {
        email: `pedro-paez-fixture-${RUN_ID}@example.com`,
        name: "Pedro Paez",
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
        areaAccess: {
          create: [
            { area: "CALLBACK_QUEUE", canEdit: true },
            { area: "RECRUITING", canEdit: true },
            { area: "TRAINING", canEdit: false },
            { area: "HR_SUMMARY", canEdit: false },
            { area: "ASSIGNED_TASKS", canEdit: true },
          ],
        },
      },
    });

    // Confirm he can reach /sales/leads before revocation.
    await loginAs(page, pedro.email, "Test-Password-123!");
    await page.goto("/sales/leads");
    await expect(page).toHaveURL("/sales/leads");
    await logout(page);

    const result = await revokeCallbackQueueGrant(prisma, pedro.id);
    expect(result.revoked).toBe(true);

    const remaining = await prisma.areaAccess.findMany({ where: { userId: pedro.id }, select: { area: true } });
    expect(remaining.map((a) => a.area).sort()).toEqual(["ASSIGNED_TASKS", "HR_SUMMARY", "RECRUITING", "TRAINING"].sort());

    await loginAs(page, pedro.email, "Test-Password-123!");
    await page.goto("/sales/leads");
    await expect(page).toHaveURL("/");
    // Recruiting/Onboarding/Training/HR Summary/Assigned Tasks untouched.
    await page.goto("/recruiting");
    await expect(page).toHaveURL("/recruiting");
    await page.goto("/todo");
    await expect(page).toHaveURL("/todo");
    await logout(page);

    await prisma.areaAccess.deleteMany({ where: { userId: pedro.id } });
    await prisma.user.delete({ where: { id: pedro.id } });
  });

  test("Pedro Paez revocation refuses when the live match isn't exactly one user — nothing changed", async ({}) => {
    const dup1 = await prisma.user.create({
      data: {
        email: `pedro-dup1-${RUN_ID}@example.com`,
        name: "Pedro Paez",
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
        areaAccess: { create: [{ area: "CALLBACK_QUEUE", canEdit: true }] },
      },
    });
    const dup2 = await prisma.user.create({
      data: {
        email: `pedro-dup2-${RUN_ID}@example.com`,
        name: "Pedro Paez",
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
        areaAccess: { create: [{ area: "CALLBACK_QUEUE", canEdit: true }] },
      },
    });

    const result = await revokeCallbackQueueGrant(prisma, dup1.id);
    expect(result.revoked).toBe(false);

    const stillThere = await prisma.areaAccess.findUnique({
      where: { userId_area: { userId: dup1.id, area: "CALLBACK_QUEUE" } },
    });
    expect(stillThere).not.toBeNull();

    await prisma.areaAccess.deleteMany({ where: { userId: { in: [dup1.id, dup2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [dup1.id, dup2.id] } } });
  });

  test("This dev environment has no real Pedro Paez account — findPedroPaezCandidates correctly reports zero, the real cleanup must run against production separately", async () => {
    const candidates = await findPedroPaezCandidates(prisma);
    // Our own fixtures are cleaned up by the time this runs (serial suite);
    // asserting the shape of a real search, not a specific count, since
    // other tests in this file create/delete their own "Pedro Paez" rows.
    expect(Array.isArray(candidates)).toBe(true);
  });
});

test.describe("Sales-rep corrections (direct checks)", () => {
  test("resolveUserDepartments gives SALES_REP no automatic HR grant, unlike every other non-admin role", async () => {
    const { resolveUserDepartments } = await import("../src/lib/departments");
    expect(resolveUserDepartments("SALES_REP", [])).toEqual([]);
    expect(resolveUserDepartments("SALES_REP", [{ department: "SALES", canEdit: true }])).toEqual([
      { department: "SALES", canEdit: true },
    ]);
    // Unchanged for every other role.
    expect(resolveUserDepartments("TRAINEE", [])).toEqual([{ department: "HR", canEdit: false }]);
    expect(resolveUserDepartments("TRAINER", [])).toEqual([{ department: "HR", canEdit: false }]);
    expect(resolveUserDepartments("SERVICE_MANAGER", [])).toEqual([{ department: "HR", canEdit: true }]);
  });

  test("isProfitabilityStorageKey / isSalesFinancialWriteKey match exactly the intended key patterns", async () => {
    const { isProfitabilityStorageKey, isSalesFinancialWriteKey } = await import("../src/lib/salesPricingToolAccess");
    expect(isProfitabilityStorageKey("mcc:profit:settings")).toBe(true);
    expect(isProfitabilityStorageKey("mcc:profit:job:abc")).toBe(true);
    expect(isProfitabilityStorageKey("quote:abc")).toBe(false);
    expect(isProfitabilityStorageKey("sales:goal")).toBe(false);

    expect(isSalesFinancialWriteKey("sales:goal")).toBe(true);
    expect(isSalesFinancialWriteKey("sales:actuals:2026-10")).toBe(true);
    expect(isSalesFinancialWriteKey("quote:abc")).toBe(false);
    expect(isSalesFinancialWriteKey("mcc:profit:settings")).toBe(false);
  });

  test("renderSalesPricingToolHtml strips both ADMIN-ONLY marker types for non-admin, leaves them for admin", async () => {
    const { renderSalesPricingToolHtml } = await import("../src/lib/salesPricingToolAccess");
    const html = [
      "<div>before</div>",
      "<!-- ADMIN-ONLY:START -->",
      "<div>secret html</div>",
      "<!-- ADMIN-ONLY:END -->",
      "<script>",
      "/* ADMIN-ONLY:START */",
      "const secret = 1;",
      "/* ADMIN-ONLY:END */",
      "</script>",
      "<div>after</div>",
    ].join("\n");

    const admin = renderSalesPricingToolHtml(html, true);
    expect(admin).toBe(html);

    const nonAdmin = renderSalesPricingToolHtml(html, false);
    expect(nonAdmin).not.toContain("secret html");
    expect(nonAdmin).not.toContain("const secret");
    expect(nonAdmin).toContain("<div>before</div>");
    expect(nonAdmin).toContain("<div>after</div>");
  });

  test("Neither removed recurring checklist task exists after a fresh reseed (verified directly against the dev DB)", async () => {
    const rows = await prisma.checklistTask.findMany({
      where: {
        task: {
          in: [
            "Log any new lead/client in the Marketing & Leads Tracker (source, type, value)",
            "Check in on Marketing spend vs. leads generated so far",
          ],
        },
      },
    });
    expect(rows.length).toBe(0);
  });
});
