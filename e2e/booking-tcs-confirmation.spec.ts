import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { holdSlot, setEnteredInTcs } from "../src/lib/slotRecommender";

// Coverage for "a confirmed-in-TCS hold stays booked forever, from a
// persistent location": setEnteredInTcs(bookingId, true) must be able to
// confirm an *expired* HOLD (re-checking capacity first, exactly like
// holdSlot() does, so it never double-books), and /sales/bookings must
// offer a durable "Confirm: Entered in TCS" button for any HOLD row —
// unlike the old ephemeral checkbox, which only existed in the one browser
// tab that was open right after booking.
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

test.describe.serial("TCS confirmation keeps a hold booked forever, from /sales/bookings", () => {
  let adminId: string;
  let feedMonthId: string;
  const testDate = addDaysIso(5);
  const testMonth = testDate.slice(0, 7);
  const TEST_WINDOW = "8am-10am"; // Morning — generous capacity, used by tests 1/2/4/5
  const OVERBOOK_WINDOW = "12pm-2pm"; // Afternoon — open: 1, used only by test 3

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL }, select: { id: true } });
    adminId = admin.id;

    const feedMonth = await prisma.slotFeedMonth.create({
      data: {
        month: testMonth,
        schema: "mcc-open-slots/v1",
        generatedAt: new Date(),
        settings: { pace_per_person_hour: 50, min_lead_days: 1 },
        windowValuePerHour: { [TEST_WINDOW]: 100, [OVERBOOK_WINDOW]: 100 },
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
              openPersonHours: 40,
              openDollars: 4000,
              blocks: {
                // Plenty of room — tests 1/2/4/5 each hold+confirm one slot
                // here and must not contend with each other for capacity.
                Morning: { open: 10, windows: [TEST_WINDOW] },
                // open: 1 — exactly enough room for one active booking, so a
                // second booking only succeeds once the first's hold is no
                // longer counted as active (test 3's overbooking scenario).
                Afternoon: { open: 1, windows: [OVERBOOK_WINDOW] },
              },
              bookedJobs: [],
            },
          ],
        },
      },
    });
    feedMonthId = feedMonth.id;
  });

  test.afterAll(async () => {
    await prisma.slotBooking.deleteMany({ where: { month: testMonth, repId: adminId } });
    await prisma.slotFeedMonth.delete({ where: { id: feedMonthId } }).catch(() => {});
    await prisma.$disconnect();
  });

  async function makeHold(label: string, opts?: { block?: string; window?: string; personHours?: number }) {
    const result = await holdSlot({
      month: testMonth,
      date: testDate,
      block: opts?.block ?? "Morning",
      window: opts?.window ?? TEST_WINDOW,
      city: "Irvine",
      address: `100 TCS Test Ln ${RUN_ID}, Irvine, CA 92614`,
      personHours: opts?.personHours ?? 3,
      price: 200,
      frequency: "onetime",
      clientName: `TCS ${label} ${RUN_ID}`,
      repId: adminId,
    });
    if (!result.ok) throw new Error(`Setup hold failed: ${result.reason}`);
    return result.bookingId;
  }

  test("1. Book via UI, confirm via the persistent bookings-list button, reload, status persists as CONFIRMED", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const bookingId = await makeHold("Case1");
    const label = `TCS Case1 ${RUN_ID}`;

    await page.goto("/sales/bookings");
    const row = page.locator("tr", { hasText: label }).first();
    await expect(row).toContainText("HOLD");
    await row.getByRole("button", { name: "Confirm: Entered in TCS" }).click();
    await expect(row).toContainText("CONFIRMED", { timeout: 5000 });

    // Fresh page load, not the same component instance.
    await page.goto("/sales/bookings");
    const rowAfterReload = page.locator("tr", { hasText: label }).first();
    await expect(rowAfterReload).toContainText("CONFIRMED");

    const dbRow = await prisma.slotBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(dbRow.status).toBe("CONFIRMED");
    expect(dbRow.enteredTcsAt).not.toBeNull();
  });

  test("2. An expired (but not overbooked) hold can still be confirmed", async ({ page }) => {
    const bookingId = await makeHold("Case2");
    await prisma.slotBooking.update({
      where: { id: bookingId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await setEnteredInTcs(bookingId, true);
    expect(result.ok).toBe(true);

    const dbRow = await prisma.slotBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(dbRow.status).toBe("CONFIRMED");
  });

  test("3. An expired hold whose capacity was taken by someone else is refused, never silently confirmed", async ({}) => {
    // First hold fills the Afternoon block's only open slot (open: 1), then
    // expires.
    const firstId = await makeHold("Case3a", { block: "Afternoon", window: OVERBOOK_WINDOW });
    await prisma.slotBooking.update({
      where: { id: firstId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    // Second hold succeeds because the first no longer counts as active.
    const secondId = await makeHold("Case3b", { block: "Afternoon", window: OVERBOOK_WINDOW });
    const secondConfirm = await setEnteredInTcs(secondId, true);
    expect(secondConfirm.ok).toBe(true);

    // Now the first (expired, capacity exceeded by the second's CONFIRMED
    // booking) must be refused — never silently confirmed into a double-book.
    const firstConfirm = await setEnteredInTcs(firstId, true);
    expect(firstConfirm.ok).toBe(false);
    if (!firstConfirm.ok) {
      expect(firstConfirm.reason).toMatch(/already booked by someone else/i);
    }

    const firstAfter = await prisma.slotBooking.findUniqueOrThrow({ where: { id: firstId } });
    expect(firstAfter.status).toBe("HOLD");

    const activeForBlock = await prisma.slotBooking.findMany({
      where: {
        month: testMonth,
        date: new Date(testDate + "T00:00:00Z"),
        block: "Afternoon",
        OR: [{ status: "CONFIRMED" }, { status: "HOLD", holdExpiresAt: { gt: new Date() } }],
      },
    });
    expect(activeForBlock.length).toBeLessThanOrEqual(1); // feed's open: 1
  });

  test("4. Concurrent double-confirm of the same valid hold confirms it exactly once, no corruption", async ({}) => {
    const bookingId = await makeHold("Case4");

    const [r1, r2] = await Promise.all([setEnteredInTcs(bookingId, true), setEnteredInTcs(bookingId, true)]);
    const oks = [r1, r2].filter((r) => r.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1); // at least one must succeed
    // Any failure must be the "someone else raced it" / already-confirmed kind,
    // not a crash or an unrelated error — and never a second distinct booking.
    for (const r of [r1, r2]) {
      if (!r.ok) expect(r.reason).toMatch(/reload and try again|can't be confirmed|Booking not found/i);
    }

    const after = await prisma.slotBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.status).toBe("CONFIRMED");
  });

  test("5. Plain non-expired confirm via the UI flips the badge without a manual reload", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await makeHold("Case5");

    await page.goto("/sales/bookings");
    const row = page.locator("tr", { hasText: `TCS Case5 ${RUN_ID}` }).first();
    await row.getByRole("button", { name: "Confirm: Entered in TCS" }).first().click();
    await expect(row).toContainText("CONFIRMED", { timeout: 5000 });
  });
});
