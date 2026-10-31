import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Coverage for "clarify the booking hours field": the Estimated hours input
// on the manual booking form (src/app/(portal)/sales/NextOpenSlotsCard.tsx)
// is combined staff hours, not elapsed time (2 cleaners x 2.5 hours = 5),
// which wasn't clear from the old "Estimated hours" label alone. The label
// is now "Total staff hours" with short helper text, on the one shared
// component both the plain call-in booking form AND the lead-prefilled
// "Book Open Slot" flow render — so fixing it there covers both surfaces.
// Capacity math, the stored value, and validation are untouched.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();

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

test.describe.serial("Booking hours field is clearly labeled as combined staff hours", () => {
  let leadId: string;
  let feedMonthId: string;
  const testDate = addDaysIso(8);
  const testMonth = testDate.slice(0, 7);
  const TEST_WINDOW = "9am-11am";

  test.beforeAll(async () => {
    const lead = await prisma.lead.create({
      data: {
        firstName: `HoursLabel${RUN_ID}`,
        lastName: "Lead",
        email: `hours-label-lead-${RUN_ID}@example.com`,
        phone: "9495551111",
        source: "WEBSITE_FORM",
        stage: "QUOTED",
        address: `300 Hours Label Ln ${RUN_ID}, Irvine, CA 92614`,
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
              blocks: { Morning: { open: 3, windows: [TEST_WINDOW] } },
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
    await prisma.$disconnect();
  });

  test("Plain call-in booking form: label and helper text explain combined staff hours", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales/open-slots");

    const slotRow = page.locator("li", { hasText: TEST_WINDOW }).first();
    await slotRow.getByRole("button", { name: "Book for a call-in client" }).click();

    await expect(slotRow.getByText("Total staff hours", { exact: true })).toBeVisible();
    await expect(slotRow.getByText(/Combined hours for everyone on the job/i)).toBeVisible();
    await expect(slotRow.getByText(/2 people × 2\.5 hours = 5/i)).toBeVisible();
    // No label text still says the old, ambiguous wording.
    await expect(slotRow.getByText("Estimated hours", { exact: true })).toHaveCount(0);
  });

  test("Booking from a lead: same label and helper text show on the prefilled form", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/open-slots?leadId=${leadId}`);

    const slotRow = page.locator("li", { hasText: TEST_WINDOW }).first();
    await slotRow.getByRole("button", { name: /Book Open Slot for HoursLabel/ }).click();

    await expect(slotRow.getByText("Total staff hours", { exact: true })).toBeVisible();
    await expect(slotRow.getByText(/2 people × 2\.5 hours = 5/i)).toBeVisible();

    // The clarified label doesn't change validation/stored value: entering
    // a combined-hours number still books normally.
    await slotRow.locator('input[name="personHours"]').fill("5");
    await slotRow.locator('input[name="price"]').fill("300");
    await slotRow.getByRole("button", { name: "Confirm Booking" }).click();
    await expect(slotRow.getByText(/Held, releases in 15 min/)).toBeVisible({ timeout: 5000 });

    const booking = await prisma.slotBooking.findFirstOrThrow({ where: { month: testMonth, leadId } });
    expect(booking.personHours).toBe(5);
  });
});
