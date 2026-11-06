import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Item 2a: a one-click "Mark follow-up done" action on a lead's detail page.
// It clears ONLY that lead's followUpDueAt, leaves a LeadNote recording what
// was cleared and when, never touches other leads, and is never triggered
// automatically by a Won/Lost stage change.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

test.describe.serial("Mark follow-up done", () => {
  let leadWithDateId: string;
  let leadNoDateId: string;
  let leadOtherId: string;
  const followUpDate = daysFromNow(2);
  const otherFollowUpDate = daysFromNow(5);

  test.beforeAll(async () => {
    const [leadWithDate, leadNoDate, leadOther] = await Promise.all([
      prisma.lead.create({
        data: {
          firstName: `MarkDone${RUN_ID}`,
          lastName: "HasDate",
          email: `mark-done-${RUN_ID}@example.com`,
          phone: "9495557771",
          source: "WEBSITE_FORM",
          stage: "CONTACTED",
          followUpDueAt: followUpDate,
        },
      }),
      prisma.lead.create({
        data: {
          firstName: `MarkDone${RUN_ID}`,
          lastName: "NoDate",
          email: `mark-done-nodate-${RUN_ID}@example.com`,
          phone: "9495557772",
          source: "WEBSITE_FORM",
          stage: "CONTACTED",
        },
      }),
      prisma.lead.create({
        data: {
          firstName: `MarkDone${RUN_ID}`,
          lastName: "OtherLead",
          email: `mark-done-other-${RUN_ID}@example.com`,
          phone: "9495557773",
          source: "WEBSITE_FORM",
          stage: "CONTACTED",
          followUpDueAt: otherFollowUpDate,
        },
      }),
    ]);
    leadWithDateId = leadWithDate.id;
    leadNoDateId = leadNoDate.id;
    leadOtherId = leadOther.id;
  });

  test.afterAll(async () => {
    await prisma.leadNote.deleteMany({ where: { leadId: { in: [leadWithDateId, leadNoDateId, leadOtherId] } } });
    await prisma.leadStageChange.deleteMany({ where: { leadId: { in: [leadWithDateId, leadNoDateId, leadOtherId] } } });
    await prisma.lead.deleteMany({ where: { id: { in: [leadWithDateId, leadNoDateId, leadOtherId] } } });
    await prisma.$disconnect();
  });

  test("button hidden when there is no follow-up date", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadNoDateId}`);
    await expect(page.getByRole("button", { name: "Mark follow-up done" })).toHaveCount(0);
  });

  test("clicking the button clears the date, leaves a note, and hides itself after reload", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadWithDateId}`);

    const button = page.getByRole("button", { name: "Mark follow-up done" });
    await expect(button).toBeVisible();
    await button.click();

    // Wait for the server action to actually complete (DB write), not just
    // for the button's own label to change to its pending state.
    await expect
      .poll(
        async () => (await prisma.lead.findUniqueOrThrow({ where: { id: leadWithDateId } })).followUpDueAt,
        { timeout: 10_000 }
      )
      .toBeNull();

    // After the server action resolves, the client re-renders with the
    // cleared date and the button disappears (no reload needed).
    await expect(page.getByRole("button", { name: "Mark follow-up done" })).toHaveCount(0, { timeout: 10_000 });

    const leadAfter = await prisma.lead.findUniqueOrThrow({ where: { id: leadWithDateId } });
    expect(leadAfter.followUpDueAt).toBeNull();

    const note = await prisma.leadNote.findFirst({
      where: { leadId: leadWithDateId },
      orderBy: { createdAt: "desc" },
    });
    expect(note).not.toBeNull();
    expect(note!.body).toContain("marked done");
    expect(note!.body).toContain(followUpDate.toLocaleDateString());

    // Reload: no follow-up date shown, button still hidden.
    await page.reload();
    await expect(page.getByRole("button", { name: "Mark follow-up done" })).toHaveCount(0);
  });

  test("does not affect a different lead's own follow-up date", async () => {
    const otherAfter = await prisma.lead.findUniqueOrThrow({ where: { id: leadOtherId } });
    expect(otherAfter.followUpDueAt).not.toBeNull();
    expect(otherAfter.followUpDueAt!.getTime()).toBe(otherFollowUpDate.getTime());
  });

  test("marking a lead Lost does not auto-clear an existing follow-up date", async ({ page }) => {
    // leadOther still has its follow-up date set — move it to Lost via the
    // existing UI flow and confirm followUpDueAt survives untouched.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadOtherId}`);

    await page.getByRole("button", { name: "Move to: Lost" }).click();
    await page.locator('input[name="lostReason"]').fill("Went with a competitor");
    await page.getByRole("button", { name: "Mark Lost" }).click();

    await expect
      .poll(
        async () => (await prisma.lead.findUniqueOrThrow({ where: { id: leadOtherId } })).stage,
        { timeout: 10_000 }
      )
      .toBe("LOST");

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadOtherId } });
    expect(after.stage).toBe("LOST");
    expect(after.followUpDueAt).not.toBeNull();
    expect(after.followUpDueAt!.getTime()).toBe(otherFollowUpDate.getTime());
  });
});
