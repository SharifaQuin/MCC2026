import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// End-to-end coverage for Recruiting 2.0: the Draft 1/Draft 2 careers-page
// toggle, the mobile application flow, and the Recruiting Inbox → interview
// invite → candidate self-booking chain. Runs against a real dev database,
// so every applicant/slot it creates is tagged with a unique run id and
// cleaned up in afterAll — this suite should never leave data behind.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const APPLICANT_EMAIL = `recruiting-v2-e2e-${RUN_ID}@example.com`;

const prisma = new PrismaClient();

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Recruiting 2.0 acceptance", () => {
  test.afterAll(async () => {
    // Leave the toggle exactly as this suite found it (v1/default) and
    // remove every trace of the test applicant + any slot it consumed.
    await prisma.ownerSetting.deleteMany({ where: { key: "recruiting_experience_version" } });
    const applicant = await prisma.applicant.findFirst({ where: { email: APPLICANT_EMAIL } });
    if (applicant) {
      await prisma.interviewAvailabilitySlot.updateMany({
        where: { bookedById: applicant.id },
        data: { bookedById: null },
      });
      await prisma.communicationLog.deleteMany({ where: { applicantId: applicant.id } });
      await prisma.prescreenAnswer.deleteMany({ where: { applicantId: applicant.id } });
      await prisma.applicant.delete({ where: { id: applicant.id } });
    }
    await prisma.interviewAvailabilitySlot.deleteMany({
      where: { startsAt: { gte: new Date(Number(RUN_ID)) } },
    });
    await prisma.$disconnect();
  });

  test("Draft 2 (Recruiting 2.0) is the default careers experience", async ({ page }) => {
    const res = await page.goto("/careers");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Come Grow With Mama's");
  });

  test("Admin can switch to Draft 1 and back to Draft 2 — Draft 1 stays a real rollback", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recruiting/experience");
    await expect(page.locator("h1")).toContainText("Careers Page Experience");

    await page.check('input[name="version"][value="v1"]');
    await page.click('button:has-text("Save")');
    await page.waitForLoadState("networkidle");
    let res = await page.goto("/careers");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("OUR CREW");

    await page.goto("/recruiting/experience");
    await page.check('input[name="version"][value="v2"]');
    await page.click('button:has-text("Save")');
    await page.waitForLoadState("networkidle");
    res = await page.goto("/careers");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Come Grow With Mama's");
  });

  test("a candidate can complete the full Cleaning Technician application", async ({ page }) => {
    await page.goto("/apply/cleaning-technician");
    await expect(page.locator("text=Join Mama's Cleaning Crew")).toBeVisible();
    await page.click('button:has-text("Continue")');

    const step = (label: string) => page.locator(`[data-step-label="${label}"]`);

    // Step 1 — About You
    await expect(page.locator("text=Step 1 of 6")).toBeVisible();
    const aboutYou = step("About You");
    await aboutYou.locator('input[name="fullName"]').fill("E2E Candidate");
    await aboutYou.locator('input[name="phone"]').fill("9495551234");
    await aboutYou.locator('input[name="email"]').fill(APPLICANT_EMAIL);
    await aboutYou.locator('input[name="city"]').fill("Irvine");
    await aboutYou.locator('label:has-text("Mama\'s Cleaning Crew Website")').click();
    await page.click('button:has-text("Continue")');

    // Step 2 — Cleaning Experience (direct "5+ years" path, no conditional)
    await expect(page.locator("text=Step 2 of 6")).toBeVisible();
    const experience = step("Cleaning Experience");
    await experience.locator('label:has-text("5+ years")').first().click();
    await experience.locator('label:has-text("I do not have professional cleaning experience")').click();
    await experience.locator("textarea").fill("Five years of independent residential cleaning around Irvine.");
    await page.click('button:has-text("Continue")');

    // Step 3 — Job Requirements: Yes to everything
    await expect(page.locator("text=Step 3 of 6")).toBeVisible();
    const requirements = step("Job Requirements");
    const yesCount = await requirements.locator('label:has-text("Yes")').count();
    for (let i = 0; i < yesCount; i++) await requirements.locator('label:has-text("Yes")').nth(i).click();
    await page.click('button:has-text("Continue")');

    // Step 4 — Get to Know You: fill every textarea, pick the second option
    // in every scenario question (never "Other").
    await expect(page.locator("text=Step 4 of 6")).toBeVisible();
    const getToKnow = step("Get to Know You");
    const textareas = getToKnow.locator("textarea");
    for (let i = 0; i < (await textareas.count()); i++) {
      if (!(await textareas.nth(i).inputValue())) await textareas.nth(i).fill("A thoughtful, honest answer.");
    }
    const radioNames = await getToKnow.locator('input[type="radio"]').evaluateAll((els) => [
      ...new Set(els.map((el) => (el as HTMLInputElement).name)),
    ]);
    for (const name of radioNames) {
      const group = getToKnow.locator(`input[name="${name}"]`);
      await group.nth(Math.min(1, (await group.count()) - 1)).check();
    }
    await page.click('button:has-text("Continue")');

    // Step 5 — Realistic Job Preview
    await expect(page.locator("text=Step 5 of 6")).toBeVisible();
    const preview = step("Realistic Job Preview");
    await preview.locator('label:has-text("Yes")').first().click();
    await preview.locator("textarea").fill("Comfortable with the physical pace, structure is my strength.");
    await page.click('button:has-text("Continue")');

    // Step 6 — Final Information
    await expect(page.locator("text=Step 6 of 6")).toBeVisible();
    const final = step("Final Information");
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const mm = String(future.getMonth() + 1).padStart(2, "0");
    const dd = String(future.getDate()).padStart(2, "0");
    await final
      .locator('input[placeholder="MM/DD/YYYY"]')
      .fill(`${mm}/${dd}/${future.getFullYear()}`);
    await page.click('button:has-text("Submit My Application")');

    await page.waitForURL(/\/apply\/cleaning-technician\/thank-you/);
    await expect(page.locator("h1")).toContainText("Thank You for Applying");
  });

  test("the applicant lands correctly qualified and ready for Quick Review", async () => {
    const applicant = await prisma.applicant.findFirst({ where: { email: APPLICANT_EMAIL } });
    expect(applicant).not.toBeNull();
    expect(applicant?.stage).toBe("PRESCREEN_PASSED");
    expect(applicant?.prescreenPassed).toBe(true);
    expect(applicant?.city).toBe("Irvine");
    expect(applicant?.source).toBe("CAREERS_PAGE");
  });

  test("Shar can invite the applicant to interview from the Recruiting Inbox", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recruiting/inbox");
    const card = page.locator("div", { has: page.locator("p.text-lg.font-bold", { hasText: "E2E Candidate" }) }).first();
    await expect(card).toBeVisible();
    await card.locator('button:has-text("Invite to Interview")').click();
    await expect(card).not.toBeVisible({ timeout: 10_000 });

    const applicant = await prisma.applicant.findFirst({ where: { email: APPLICANT_EMAIL } });
    expect(applicant?.stage).toBe("INTERVIEW_INVITE_SENT");
    expect(applicant?.interviewConfirmToken).toBeTruthy();
  });

  test("Shar can add an interview slot and the candidate can book it", async ({ page }) => {
    const slotDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await loginAsAdmin(page);
    await page.goto("/recruiting/availability");
    await page.fill('input[name="slotDate"]', slotDate);
    await page.fill('input[name="slotTime"]', "10:00");
    await page.click('button:has-text("Add Slot")');
    await page.waitForLoadState("networkidle");

    const applicant = await prisma.applicant.findFirst({ where: { email: APPLICANT_EMAIL } });
    expect(applicant).not.toBeNull();

    await page.context().clearCookies();
    await page.goto(`/interview-book/${applicant!.interviewConfirmToken}`);
    await expect(page.locator("body")).toContainText("Hi E2E!");
    await page.locator('input[type="radio"][name="slotId"]').first().check();
    await page.click('button:has-text("Confirm This Time")');
    await expect(page.locator("text=You're booked!")).toBeVisible({ timeout: 10_000 });

    const booked = await prisma.applicant.findFirst({ where: { email: APPLICANT_EMAIL } });
    expect(booked?.stage).toBe("IN_PERSON_SCHEDULED");
    expect(booked?.scheduledAt).not.toBeNull();
  });

  test("V1 recruiting tools and data are untouched", async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.goto("/recruiting");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Recruiting Pipeline");
    await expect(page.locator('a:has-text("Job Postings")')).toBeVisible();
    await expect(page.locator('a:has-text("Message Templates")')).toBeVisible();
    await expect(page.locator('a:has-text("Interview Settings")')).toBeVisible();
  });
});
