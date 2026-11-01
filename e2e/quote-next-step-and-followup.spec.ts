import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Item 3: open (pending) quotes can be given a free-text "next step" and a
// follow-up date — fields that don't exist on a quote until someone sets
// them, never backfilled or invented. A /sales/quotes visibility aid
// surfaces pending quotes missing either field; won/lost quotes are
// read-only and never counted there.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const VIEW_ONLY_EMAIL = `quote-nextstep-viewonly-${RUN_ID}@example.com`;
const VIEW_ONLY_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

function makeQuote(overrides: Record<string, unknown>) {
  return {
    clientName: "Quote NextStep Test",
    id: overrides.id,
    phone: "9495559991",
    clientEmail: "quote-nextstep@example.com",
    service: "standard",
    frequency: "One-Time",
    low: "250",
    high: "300",
    savedAt: new Date().toISOString(),
    status: "pending",
    sentAt: null,
    ...overrides,
  };
}

test.describe.serial("Quote next step and follow-up date", () => {
  let viewOnlyId: string;
  const pendingQuoteId = `nextstep-pending-${RUN_ID}`;
  const wonQuoteId = `nextstep-won-${RUN_ID}`;
  const untouchedQuoteId = `nextstep-untouched-${RUN_ID}`;
  const pendingKey = `quote:${pendingQuoteId}`;
  const wonKey = `quote:${wonQuoteId}`;
  const untouchedKey = `quote:${untouchedQuoteId}`;
  // Captured exactly as created, so the "nothing else changed" assertion
  // compares against the real original object rather than a freshly
  // reconstructed one with a different savedAt instant.
  const pendingQuoteOriginal = makeQuote({ id: pendingQuoteId, clientName: `PendingNS${RUN_ID}` });

  test.beforeAll(async () => {
    const viewOnly = await prisma.user.create({
      data: {
        email: VIEW_ONLY_EMAIL,
        name: `Quote NextStep View Only ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(VIEW_ONLY_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: false }] },
      },
    });
    viewOnlyId = viewOnly.id;

    await prisma.salesToolData.createMany({
      data: [
        { key: pendingKey, value: JSON.stringify(pendingQuoteOriginal) },
        {
          key: wonKey,
          value: JSON.stringify(makeQuote({ id: wonQuoteId, clientName: `WonNS${RUN_ID}`, status: "won" })),
        },
        {
          key: untouchedKey,
          value: JSON.stringify(makeQuote({ id: untouchedQuoteId, clientName: `UntouchedNS${RUN_ID}` })),
        },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.salesToolData.deleteMany({ where: { key: { in: [pendingKey, wonKey, untouchedKey] } } });
    await prisma.user.delete({ where: { id: viewOnlyId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("a pending quote with nothing set shows in the needs-scheduling aid, with an editable form", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/quotes");

    const aidBanner = page
      .getByText(/need.*a next step scheduled/i)
      .locator("xpath=..");
    await expect(aidBanner).toBeVisible();
    await expect(aidBanner.getByRole("link", { name: `PendingNS${RUN_ID}`, exact: true })).toBeVisible();

    const row = page.locator("tr", { hasText: `PendingNS${RUN_ID}` });
    await expect(row.locator('input[name="nextStep"]')).toBeVisible();
    await expect(row.locator('input[name="followUpDate"]')).toBeVisible();
  });

  test("filling in and saving nextStep/followUpDate persists and drops the quote out of the needs-scheduling list", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/quotes");

    const row = page.locator("tr", { hasText: `PendingNS${RUN_ID}` });
    await row.locator('input[name="nextStep"]').fill("Call to confirm Tuesday");
    await row.locator('input[name="followUpDate"]').fill("2026-12-15");
    await row.getByRole("button", { name: "Save" }).click();

    await expect
      .poll(async () => {
        const saved = await prisma.salesToolData.findUniqueOrThrow({ where: { key: pendingKey } });
        return JSON.parse(saved.value).nextStep;
      }, { timeout: 10_000 })
      .toBe("Call to confirm Tuesday");

    const savedRow = await prisma.salesToolData.findUniqueOrThrow({ where: { key: pendingKey } });
    const savedData = JSON.parse(savedRow.value);
    expect(savedData.nextStep).toBe("Call to confirm Tuesday");
    expect(savedData.followUpDate).toBe("2026-12-15");

    // Reload: values still show as text in the (still-editable) form inputs.
    await page.reload();
    const reloadedRow = page.locator("tr", { hasText: `PendingNS${RUN_ID}` });
    await expect(reloadedRow.locator('input[name="nextStep"]')).toHaveValue("Call to confirm Tuesday");
    await expect(reloadedRow.locator('input[name="followUpDate"]')).toHaveValue("2026-12-15");

    // No longer in the needs-scheduling aid (the aid itself may now be gone
    // entirely if this was the only quote missing something).
    const aidBanner = page.getByText(/need.*a next step scheduled/i).locator("xpath=..");
    if (await aidBanner.count()) {
      await expect(aidBanner.getByRole("link", { name: `PendingNS${RUN_ID}`, exact: true })).toHaveCount(0);
    }
  });

  test("a won quote's Next Step/Follow-up cells are read-only and it's never in the needs-scheduling aid", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/quotes");

    const row = page.locator("tr", { hasText: `WonNS${RUN_ID}` });
    await expect(row).toBeVisible();
    await expect(row.locator("input")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Save" })).toHaveCount(0);

    const aidBanner = page.getByText(/need.*a next step scheduled/i).locator("xpath=..");
    await expect(aidBanner.getByRole("link", { name: `WonNS${RUN_ID}`, exact: true })).toHaveCount(0);
  });

  test("a canEdit:false viewer sees stored values but no editable form on a pending quote", async ({ page }) => {
    await loginAs(page, VIEW_ONLY_EMAIL, VIEW_ONLY_PASSWORD);
    await page.goto("/sales/quotes");

    const row = page.locator("tr", { hasText: `PendingNS${RUN_ID}` });
    await expect(row).toContainText("Call to confirm Tuesday");
    await expect(row.locator("input")).toHaveCount(0);
  });

  test("saving nextStep/followUpDate doesn't alter any other field on the quote", async () => {
    const saved = await prisma.salesToolData.findUniqueOrThrow({ where: { key: pendingKey } });
    const data = JSON.parse(saved.value);
    const { nextStep, followUpDate, ...rest } = data;
    expect(rest).toEqual(pendingQuoteOriginal);
  });

  test("an untouched quote fixture still renders '—' for Next Step/Follow-up Date — nothing backfilled", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/quotes");

    // Untouched is pending + canEdit, so it has the editable form — assert
    // the inputs are simply empty, not pre-filled with an invented value.
    const row = page.locator("tr", { hasText: `UntouchedNS${RUN_ID}` });
    await expect(row.locator('input[name="nextStep"]')).toHaveValue("");
    await expect(row.locator('input[name="followUpDate"]')).toHaveValue("");

    const stored = await prisma.salesToolData.findUniqueOrThrow({ where: { key: untouchedKey } });
    const data = JSON.parse(stored.value);
    expect(data.nextStep).toBeUndefined();
    expect(data.followUpDate).toBeUndefined();
  });
});
