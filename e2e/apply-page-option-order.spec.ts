import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// /apply/[slug] (src/app/apply/[slug]/page.tsx) fetches each prescreen
// question's options with `include: { options: true }` — with no
// `orderBy`, Postgres is free to return them in whatever order it likes
// (in practice, usually insertion order), not necessarily each option's
// own `order` column. This reproduces that directly: options are created
// in a deliberately scrambled insertion sequence relative to their stored
// `order` value, so the bug would show up as "stored correctly, displayed
// out of order" exactly as reported.
const RUN_ID = Date.now().toString();
const prisma = new PrismaClient();

test.describe("Apply page renders answer options in their stored order", () => {
  let postingId: string;
  let slug: string;

  test.beforeAll(async () => {
    slug = `option-order-fixture-${RUN_ID}`;
    const posting = await prisma.jobPosting.create({
      data: {
        slug,
        titleEn: `Option Order Fixture ${RUN_ID}`,
        descriptionEn: "fixture",
        active: true,
      },
    });
    postingId = posting.id;

    const question = await prisma.prescreenQuestion.create({
      data: {
        jobPostingId: postingId,
        order: 1,
        stepLabel: "About You",
        category: "APPLICATION",
        type: "SINGLE_SELECT",
        required: true,
        textEn: "Pick one",
      },
    });
    // Inserted in scrambled order relative to their own `order` column —
    // third, first, second — the same way a prior edit/reorder in the
    // admin editor could leave rows in a different insertion sequence
    // than their intended display order.
    await prisma.prescreenOption.create({ data: { questionId: question.id, order: 3, textEn: "Third" } });
    await prisma.prescreenOption.create({ data: { questionId: question.id, order: 1, textEn: "First" } });
    await prisma.prescreenOption.create({ data: { questionId: question.id, order: 2, textEn: "Second" } });
  });

  test.afterAll(async () => {
    await prisma.prescreenQuestion.deleteMany({ where: { jobPostingId: postingId } });
    await prisma.jobPosting.delete({ where: { id: postingId } });
    await prisma.$disconnect();
  });

  test("options render First, Second, Third — by their order column, not insertion order", async ({ page }) => {
    await page.goto(`/apply/${slug}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Continue" }).click();

    const questionP = page.locator("p", { hasText: "Pick one" }).first();
    const optionsContainer = questionP.locator("xpath=following-sibling::div[1]");
    const labels = await optionsContainer.locator("label").allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(["First", "Second", "Third"]);
  });
});
