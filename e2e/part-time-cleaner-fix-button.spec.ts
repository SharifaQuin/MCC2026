import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { runPartTimeHouseCleanerFix } from "../src/lib/recruiting";

// Covers the actual button the owner will click in production — not just
// the underlying applyPartTimeHouseCleanerPrescreenFix function (see
// e2e/part-time-cleaner-posting-fix.spec.ts for that). runPartTimeHouseCleanerFix
// and isPartTimeHouseCleanerFixNeeded (src/lib/recruiting.ts) have the real
// posting ids baked in, so this test creates its dev-only fixtures with
// those EXACT ids (a separate local database from production — this never
// touches the real postings) to exercise the real code path end to end:
// the banner appearing for an Owner/Admin, the button actually running the
// fix, the banner disappearing afterward, and a Service Manager never
// seeing it at all.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const SOURCE_POSTING_ID = "cmuflxjv20002108dp6bw74ar";
const TARGET_POSTING_ID = "cmwpehomm00n8exng5u8qed5e";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Part-Time House Cleaner one-time fix: the actual dashboard button", () => {
  const SERVICE_MANAGER_EMAIL = `fix-button-sm-${RUN_ID}@example.com`;
  let serviceManagerId: string;

  test.beforeAll(async () => {
    // A minimal source posting at the real Cleaning Technician id, with
    // just enough of a question (including the two the fix must locate)
    // to prove the real fix function runs correctly end to end.
    const source = await prisma.jobPosting.create({
      data: {
        id: SOURCE_POSTING_ID,
        slug: `cleaning-technician-button-fixture-${RUN_ID}`,
        titleEn: "Cleaning Technician (button-test fixture)",
        descriptionEn: "fixture",
        passThresholdPct: 100,
        active: true,
      },
    });
    const heardAbout = await prisma.prescreenQuestion.create({
      data: {
        jobPostingId: source.id,
        order: 1,
        stepLabel: "About You",
        category: "APPLICATION",
        type: "SINGLE_SELECT",
        required: true,
        textEn: "How did you hear about Mama's Cleaning Crew?",
      },
    });
    await prisma.prescreenOption.createMany({
      data: [{ questionId: heardAbout.id, order: 1, textEn: "Indeed", points: 0 }],
    });
    for (let i = 0; i < 5; i++) {
      await prisma.prescreenQuestion.create({
        data: {
          jobPostingId: source.id,
          order: 2 + i,
          stepLabel: "Cleaning Experience",
          category: "QUALIFICATION",
          type: "SINGLE_SELECT",
          required: true,
          textEn: `Cleaning Experience Q${i + 1}`,
        },
      });
    }
    const availability = await prisma.prescreenQuestion.create({
      data: {
        jobPostingId: source.id,
        order: 7,
        stepLabel: "Job Requirements",
        category: "REQUIRED",
        type: "SINGLE_SELECT",
        required: true,
        textEn: "Are you available to work Monday through Friday between 8:00 AM and 6:00 PM?",
      },
    });
    await prisma.prescreenOption.createMany({
      data: [
        { questionId: availability.id, order: 1, textEn: "Yes", points: 1 },
        { questionId: availability.id, order: 2, textEn: "No", points: 0 },
      ],
    });
    const transportation = await prisma.prescreenQuestion.create({
      data: {
        jobPostingId: source.id,
        order: 8,
        stepLabel: "Job Requirements",
        category: "REQUIRED",
        type: "SINGLE_SELECT",
        required: true,
        textEn: "Do you have reliable transportation that you can use for work?",
      },
    });
    await prisma.prescreenOption.createMany({
      data: [
        { questionId: transportation.id, order: 1, textEn: "Yes", points: 1 },
        { questionId: transportation.id, order: 2, textEn: "No", points: 0 },
      ],
    });

    // The broken target, at the real Part-Time House Cleaner id.
    const target = await prisma.jobPosting.create({
      data: {
        id: TARGET_POSTING_ID,
        slug: `part-time-house-cleaner-button-fixture-${RUN_ID}`,
        titleEn: "Part-Time House Cleaner (button-test fixture)",
        descriptionEn: "fixture",
        passThresholdPct: 70,
        active: true,
      },
    });
    for (let i = 1; i <= 19; i++) {
      await prisma.prescreenQuestion.create({
        data: { jobPostingId: target.id, order: i, textEn: `Broken Q${i}` },
      });
    }

    const serviceManager = await prisma.user.create({
      data: {
        email: SERVICE_MANAGER_EMAIL,
        name: `Fix Button SM ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
      },
    });
    serviceManagerId = serviceManager.id;
  });

  test.afterAll(async () => {
    const postingIds = [SOURCE_POSTING_ID, TARGET_POSTING_ID];
    await prisma.prescreenQuestion.deleteMany({ where: { jobPostingId: { in: postingIds } } });
    await prisma.jobPosting.deleteMany({ where: { id: { in: postingIds } } });
    await prisma.user.deleteMany({ where: { id: serviceManagerId } });
    await prisma.$disconnect();
  });

  test("A Service Manager viewing the posting never sees the fix banner", async ({ page }) => {
    await loginAs(page, SERVICE_MANAGER_EMAIL, "Test-Password-123!");
    await page.goto(`/recruiting/postings/${TARGET_POSTING_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Run one-time fix")).toHaveCount(0);
  });

  test("Owner/Admin sees the fix banner, the button runs the real fix, and the banner disappears afterward", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/postings/${TARGET_POSTING_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=This posting's application is broken")).toBeVisible();
    await page.getByRole("button", { name: "Run one-time fix" }).click();
    await expect(page.locator("text=Fixed —")).toBeVisible({ timeout: 10_000 });

    const target = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: TARGET_POSTING_ID },
      include: { prescreenQuestions: true },
    });
    expect(target.prescreenQuestions.some((q) => q.stepLabel === "About You")).toBe(true);
    expect(target.prescreenQuestions.some((q) => q.stepLabel === "Cleaning Experience")).toBe(false);
    expect(target.passThresholdPct).toBe(100);
    expect(target.active).toBe(false);

    // The source (Cleaning Technician) posting itself was never touched.
    const source = await prisma.jobPosting.findUniqueOrThrow({ where: { id: SOURCE_POSTING_ID } });
    expect(source.active).toBe(true);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=This posting's application is broken")).toHaveCount(0);
    await expect(page.locator("text=Run one-time fix")).toHaveCount(0);
  });

  test("Running it again is refused — it no longer looks like the broken state", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/postings/${TARGET_POSTING_ID}`);
    await page.waitForLoadState("networkidle");
    // The banner (and its button) are gone now that the fix already ran —
    // confirmed by the previous test. Directly re-invoke the guarded
    // function to prove the "already fixed" guard itself holds, since the
    // UI no longer offers a way to even attempt it.
    await expect(runPartTimeHouseCleanerFix()).rejects.toThrow(/already been fixed|doesn't look like/);
  });
});
