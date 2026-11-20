import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Covers the posting question editor's new Step/Type/Category/Required/Max
// length/Short label fields (src/app/(portal)/recruiting/postings/[id]/
// PrescreenQuestionEditor.tsx), the new-question defaults (last step label
// + SINGLE_SELECT), hiding answer-choice inputs for TEXT/DATE, and the
// "Duplicate posting" bonus feature — all against fresh, isolated fixtures
// cleaned up afterward.
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

function questionRow(page: Page, questionText: string) {
  return page.locator("div.rounded-lg.border.border-neutral-200.bg-white.p-4").filter({ hasText: questionText });
}

test.describe.serial("Posting question editor: Step/Type/Category fields, defaults, and Duplicate posting", () => {
  let postingId: string;
  const QUESTION_TEXT = `Fixture Single-Select Question ${RUN_ID}`;

  test.beforeAll(async () => {
    const posting = await prisma.jobPosting.create({
      data: {
        slug: `editor-fixture-${RUN_ID}`,
        titleEn: `Editor Fixture Posting ${RUN_ID}`,
        descriptionEn: "fixture",
        active: false,
      },
    });
    postingId = posting.id;

    const question = await prisma.prescreenQuestion.create({
      data: {
        jobPostingId: postingId,
        order: 1,
        stepLabel: "About You",
        category: "REQUIRED",
        type: "SINGLE_SELECT",
        required: true,
        textEn: QUESTION_TEXT,
      },
    });
    await prisma.prescreenOption.createMany({
      data: [
        { questionId: question.id, order: 1, textEn: "Yes", points: 1 },
        { questionId: question.id, order: 2, textEn: "No", points: 0 },
      ],
    });

    // Phone-screen and interview questions too, so the Duplicate test can
    // confirm all three banks get copied.
    await prisma.phoneScreenQuestion.create({
      data: { jobPostingId: postingId, order: 1, textEn: "Fixture phone-screen question" },
    });
    await prisma.interviewQuestion.create({
      data: {
        jobPostingId: postingId,
        order: 1,
        competency: "Integrity & Trust",
        textEn: "Fixture interview question",
      },
    });
  });

  test.afterAll(async () => {
    const postings = await prisma.jobPosting.findMany({
      where: { slug: { contains: RUN_ID } },
      select: { id: true },
    });
    const postingIds = postings.map((p) => p.id);
    await prisma.prescreenQuestion.deleteMany({ where: { jobPostingId: { in: postingIds } } });
    await prisma.phoneScreenQuestion.deleteMany({ where: { jobPostingId: { in: postingIds } } });
    await prisma.interviewQuestion.deleteMany({ where: { jobPostingId: { in: postingIds } } });
    await prisma.jobPosting.deleteMany({ where: { id: { in: postingIds } } });
    await prisma.$disconnect();
  });

  test("Editing a question's Step/Type/Category/Required/Max length/Short label through the real controls persists them", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/postings/${postingId}`);
    await page.waitForLoadState("networkidle");

    const row = questionRow(page, QUESTION_TEXT);
    await row.getByRole("button", { name: /Edit/ }).click();

    await row.locator('input[name="stepLabel"]').fill("Job Requirements");
    await row.locator('select[name="category"]').selectOption("QUALIFICATION");
    await row.locator('input[name="shortLabel"]').fill("Fixture Label");
    await row.locator('input[name="maxLength"]').fill("150");
    const requiredCheckbox = row.locator('input[name="required"]');
    await expect(requiredCheckbox).toBeChecked(); // started required — uncheck it
    await requiredCheckbox.uncheck();
    await row.getByRole("button", { name: "Save Question" }).click();
    await page.waitForTimeout(500);

    const saved = await prisma.prescreenQuestion.findUniqueOrThrow({
      where: { id: (await prisma.prescreenQuestion.findFirstOrThrow({ where: { jobPostingId: postingId, textEn: QUESTION_TEXT } })).id },
    });
    expect(saved.stepLabel).toBe("Job Requirements");
    expect(saved.category).toBe("QUALIFICATION");
    expect(saved.shortLabel).toBe("Fixture Label");
    expect(saved.maxLength).toBe(150);
    expect(saved.required).toBe(false);
  });

  test("New question defaults to the posting's last step label and to SINGLE_SELECT", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/postings/${postingId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "+ Add Prescreening Question" }).click();
    await page.waitForTimeout(500);

    const newQuestion = await prisma.prescreenQuestion.findFirstOrThrow({
      where: { jobPostingId: postingId, textEn: "New question" },
    });
    // The fixture question is currently the posting's only (and therefore
    // last) question, now with stepLabel "Job Requirements" from the
    // previous test.
    expect(newQuestion.stepLabel).toBe("Job Requirements");
    expect(newQuestion.type).toBe("SINGLE_SELECT");
  });

  test("Switching a question's Type to TEXT hides the answer-choice inputs in the editor", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/recruiting/postings/${postingId}`);
    await page.waitForLoadState("networkidle");

    const row = questionRow(page, QUESTION_TEXT);
    await row.getByRole("button", { name: /Edit/ }).click();
    await expect(row.locator("text=Answer choices")).toBeVisible();

    await row.locator('select[name="type"]').selectOption("TEXT");
    await expect(row.locator("text=Answer choices")).toHaveCount(0);

    // Switch back and confirm the original Yes/No options are still there
    // (hiding the inputs must never have blanked them out).
    await row.locator('select[name="type"]').selectOption("SINGLE_SELECT");
    await expect(row.locator("text=Answer choices")).toBeVisible();
    await expect(row.locator('input[name^="option_"][name$="_text"]').first()).toHaveValue("Yes");
  });

  test("Duplicate posting copies the posting and all of its question banks, starts inactive, with a new slug", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/recruiting/postings");
    await page.waitForLoadState("networkidle");

    const sourceTitle = (await prisma.jobPosting.findUniqueOrThrow({ where: { id: postingId } })).titleEn;
    const listItem = page.locator("li").filter({ hasText: sourceTitle });
    await listItem.getByRole("button", { name: "Duplicate" }).click();
    await page.waitForURL((url) => /\/recruiting\/postings\/[a-z0-9]+$/.test(url.pathname));

    const copyId = page.url().split("/").pop()!;
    const copy = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: copyId },
      include: { prescreenQuestions: { include: { options: true } }, phoneScreenQuestions: true, interviewQuestions: true },
    });

    expect(copy.titleEn).toBe(`${sourceTitle} (Copy)`);
    expect(copy.slug).not.toBe((await prisma.jobPosting.findUniqueOrThrow({ where: { id: postingId } })).slug);
    expect(copy.active).toBe(false);
    expect(copy.prescreenQuestions.length).toBe(2); // the fixture question + the "New question" added above
    expect(copy.phoneScreenQuestions.length).toBe(1);
    expect(copy.interviewQuestions.length).toBe(1);
    // Copied question ids are genuinely new, never the originals'.
    const sourceQuestionIds = new Set(
      (await prisma.prescreenQuestion.findMany({ where: { jobPostingId: postingId } })).map((q) => q.id)
    );
    expect(copy.prescreenQuestions.every((q) => !sourceQuestionIds.has(q.id))).toBe(true);
  });
});
