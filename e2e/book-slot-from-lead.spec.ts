import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for ""Book Open Slot" action directly from a lead": the lead
// detail page's canEdit-gated "Book Open Slot →" link carries leadId to
// /sales/open-slots, which prefills the booking form's client name/address
// (still freely editable, never personHours/price) and threads leadId
// through manualBookSlotAction into holdSlot's existing leadId field —
// without touching holdSlot's own capacity-check/15-minute-hold logic at all.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const VIEW_ONLY_EMAIL = `book-slot-viewonly-${RUN_ID}@example.com`;
const PASSWORD = "Test-Password-123!";

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

test.describe.serial("Book Open Slot from a lead", () => {
  let viewOnlyId: string;
  let leadId: string;
  let feedMonthId: string;
  const testDate = addDaysIso(6);
  const testMonth = testDate.slice(0, 7);
  const TEST_WINDOW = "10am-12pm";
  const LEAD_ADDRESS = `200 Book Slot Ln ${RUN_ID}, Irvine, CA 92614`;

  test.beforeAll(async () => {
    const viewOnly = await prisma.user.create({
      data: {
        email: VIEW_ONLY_EMAIL,
        name: `Book Slot View Only ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: false }] },
      },
    });
    viewOnlyId = viewOnly.id;

    const lead = await prisma.lead.create({
      data: {
        firstName: `BookSlot${RUN_ID}`,
        lastName: "Lead",
        email: `book-slot-lead-${RUN_ID}@example.com`,
        phone: "9495559876",
        source: "WEBSITE_FORM",
        stage: "QUOTED",
        address: LEAD_ADDRESS,
      },
    });
    leadId = lead.id;

    const feedMonth = await prisma.slotFeedMonth.create({
      data: {
        month: testMonth,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: { pace_per_person_hour: 50, min_lead_days: 1 },
        windowValuePerHour: { [TEST_WINDOW]: 90 },
        routeBoard: {},
        dates: {
          create: [
            {
              date: new Date(testDate + "T00:00:00Z"),
              weekday: new Date(testDate + "T00:00:00Z").toLocaleDateString("en-US", {
                weekday: "long",
                timeZone: "UTC",
              }),
              status: "Open",
              openPersonHours: 20,
              openDollars: 2000,
              blocks: { Midday: { open: 2, windows: [TEST_WINDOW] } },
              bookedJobs: [],
            },
          ],
        },
      },
    });
    feedMonthId = feedMonth.id;
  });

  test.afterAll(async () => {
    await prisma.slotBooking.deleteMany({ where: { month: testMonth } });
    await prisma.slotFeedMonth.delete({ where: { id: feedMonthId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { id: leadId } });
    await prisma.departmentAccess.deleteMany({ where: { userId: viewOnlyId } });
    await prisma.user.deleteMany({ where: { id: viewOnlyId } });
    await prisma.$disconnect();
  });

  test("canEdit: false role doesn't see the 'Book Open Slot' link on the lead page", async ({ page }) => {
    await loginAs(page, VIEW_ONLY_EMAIL, PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await expect(page.getByRole("link", { name: "Book Open Slot →" })).toHaveCount(0);
  });

  test("Lead page link leads to the open-slots page with name/address prefilled, no typing required", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const link = page.getByRole("link", { name: "Book Open Slot →" });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(`**/sales/open-slots?leadId=${leadId}`);

    const slotRow = page.locator("li", { hasText: TEST_WINDOW }).first();
    await slotRow.getByRole("button", { name: /Book Open Slot for BookSlot/ }).click();

    const clientNameInput = slotRow.locator('input[name="clientName"]');
    const addressInput = slotRow.locator('input[name="addressOrCity"]');
    await expect(clientNameInput).toHaveValue(`BookSlot${RUN_ID} Lead`);
    await expect(addressInput).toHaveValue(LEAD_ADDRESS);

    // personHours/price must NOT be prefilled from anything on the lead.
    await expect(slotRow.locator('input[name="personHours"]')).toHaveValue("");
    await expect(slotRow.locator('input[name="price"]')).toHaveValue("");

    await slotRow.locator('input[name="personHours"]').fill("4");
    await slotRow.locator('input[name="price"]').fill("260");
    await slotRow.getByRole("button", { name: "Confirm Booking" }).click();
    await expect(slotRow.getByText(/Held, releases in 15 min/)).toBeVisible({ timeout: 5000 });

    const booking = await prisma.slotBooking.findFirstOrThrow({
      where: { month: testMonth, clientName: `BookSlot${RUN_ID} Lead` },
    });
    expect(booking.leadId).toBe(leadId);
    expect(booking.status).toBe("HOLD");
    expect(booking.holdExpiresAt).not.toBeNull();
    expect(booking.personHours).toBe(4);
  });

  test("/sales/bookings shows the booking linked to the lead", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/bookings");
    const row = page.locator("tr", { hasText: `BookSlot${RUN_ID} Lead` }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(TEST_WINDOW);
  });

  test("Visiting /sales/open-slots?leadId=<nonexistent> doesn't crash and behaves like a normal page", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.goto("/sales/open-slots?leadId=nonexistent-id-12345");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Open Time Slots" })).toBeVisible();
    // No prefill — the generic "Book for a call-in client" label still shows.
    const html = await page.content();
    expect(html).toContain("Book for a call-in client");
  });
});
