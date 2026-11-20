import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { applyPartTimeHouseCleanerPrescreenFix } from "../src/lib/recruiting";

// Verifies applyPartTimeHouseCleanerPrescreenFix (src/lib/recruiting.ts) —
// the exact function scripts/fix-part-time-cleaner-prescreen.ts calls
// against the real production postings (cmwpehomm00n8exng5u8qed5e /
// cmuflxjv20002108dp6bw74ar, which don't exist in this dev database). This
// file builds two fresh, dev-only fixtures SHAPED like those real
// postings — a "Cleaning Technician (fixture)" source with the step
// structure described in the task (About You with a "How did you hear…"
// question and one conditional follow-up, a 5-question Cleaning
// Experience step at orders 3–7, Job Requirements with the Monday–Friday
// availability and transportation questions, Get to Know You with a
// scenario + follow-up, Realistic Job Preview, Final Information), and a
// broken "Part-Time House Cleaner (fixture)" target with 19 questions, all
// stepLabel=null (today's actual broken state) — then runs the real fix
// function against them and verifies both the resulting data AND the live
// /apply/[slug] flow end to end, including one full submission.
const RUN_ID = Date.now().toString();
const prisma = new PrismaClient();

async function createQuestion(
  jobPostingId: string,
  data: {
    order: number;
    stepLabel: string;
    category: string;
    type: "SINGLE_SELECT" | "TEXT";
    required: boolean;
    textEn: string;
    options?: [string, number][];
    conditionalOnOptionId?: string;
  }
) {
  const question = await prisma.prescreenQuestion.create({
    data: {
      jobPostingId,
      order: data.order,
      stepLabel: data.stepLabel,
      category: data.category as never,
      type: data.type,
      required: data.required,
      textEn: data.textEn,
      conditionalOnOptionId: data.conditionalOnOptionId,
    },
  });
  const optionsByText = new Map<string, string>();
  if (data.options) {
    for (let i = 0; i < data.options.length; i++) {
      const [textEn, points] = data.options[i];
      const option = await prisma.prescreenOption.create({
        data: { questionId: question.id, order: i + 1, textEn, points },
      });
      optionsByText.set(textEn, option.id);
    }
  }
  return { question, optionsByText };
}

// Scopes a radio/checkbox click to one specific question's own option
// list, never a bare `label:has-text(...)` — ApplyPageV2 keeps every
// step's fields mounted (just hidden) at once, and several fixture
// questions below deliberately share plain option text ("Yes"/"No"), so an
// unscoped text match would hit more than one element.
async function selectOption(page: Page, questionText: string, optionText: string) {
  const questionP = page.locator("p", { hasText: questionText }).first();
  const optionsContainer = questionP.locator("xpath=following-sibling::div[1]");
  await optionsContainer.locator("label", { hasText: optionText }).locator("input").click();
}

test.describe.serial("Part-Time House Cleaner posting: prescreen question fix", () => {
  let sourcePostingId: string;
  let targetPostingId: string;
  let targetSlug: string;

  test.beforeAll(async () => {
    const source = await prisma.jobPosting.create({
      data: {
        slug: `cleaning-technician-fixture-${RUN_ID}`,
        titleEn: "Cleaning Technician (fixture)",
        descriptionEn: "fixture",
        passThresholdPct: 100,
        active: true,
      },
    });
    sourcePostingId = source.id;

    const heardAbout = await createQuestion(sourcePostingId, {
      order: 1,
      stepLabel: "About You",
      category: "APPLICATION",
      type: "SINGLE_SELECT",
      required: true,
      textEn: "How did you hear about Mama's Cleaning Crew?",
      options: [
        ["Indeed", 0],
        ["Referral", 0],
        ["Facebook", 0],
        ["Other", 0],
      ],
    });
    await createQuestion(sourcePostingId, {
      order: 2,
      stepLabel: "About You",
      category: "APPLICATION",
      type: "TEXT",
      required: false,
      textEn: "Please tell us who referred you or where else you heard about us",
      conditionalOnOptionId: heardAbout.optionsByText.get("Other"),
    });

    for (let i = 0; i < 5; i++) {
      await createQuestion(sourcePostingId, {
        order: 3 + i,
        stepLabel: "Cleaning Experience",
        category: "QUALIFICATION",
        type: "SINGLE_SELECT",
        required: true,
        textEn: `Cleaning Experience Q${i + 1}`,
        options: [
          ["Yes", 1],
          ["No", 0],
        ],
      });
    }

    await createQuestion(sourcePostingId, {
      order: 8,
      stepLabel: "Job Requirements",
      category: "REQUIRED",
      type: "SINGLE_SELECT",
      required: true,
      textEn: "Are you at least 18 years old?",
      options: [
        ["Yes", 1],
        ["No", 0],
      ],
    });
    await createQuestion(sourcePostingId, {
      order: 9,
      stepLabel: "Job Requirements",
      category: "REQUIRED",
      type: "SINGLE_SELECT",
      required: true,
      textEn: "Are you available to work Monday through Friday between 8:00 AM and 6:00 PM?",
      options: [
        ["Yes", 1],
        ["No", 0],
      ],
    });
    await createQuestion(sourcePostingId, {
      order: 10,
      stepLabel: "Job Requirements",
      category: "REQUIRED",
      type: "SINGLE_SELECT",
      required: true,
      textEn: "Do you have reliable transportation that you can use for work?",
      options: [
        ["Yes", 1],
        ["No", 0],
      ],
    });

    const scenario = await createQuestion(sourcePostingId, {
      order: 11,
      stepLabel: "Get to Know You",
      category: "CULTURE_BEHAVIORAL",
      type: "SINGLE_SELECT",
      required: true,
      textEn: "Scenario: a client is unhappy with a cleaning. What do you do?",
      options: [
        ["A", 0],
        ["B", 0],
        ["C", 0],
      ],
    });
    await createQuestion(sourcePostingId, {
      order: 12,
      stepLabel: "Get to Know You",
      category: "CULTURE_BEHAVIORAL",
      type: "TEXT",
      required: false,
      textEn: "Tell us more about your choice",
      conditionalOnOptionId: scenario.optionsByText.get("C"),
    });

    await createQuestion(sourcePostingId, {
      order: 13,
      stepLabel: "Realistic Job Preview",
      category: "REQUIRED",
      type: "SINGLE_SELECT",
      required: true,
      textEn: "Does this sound like work you're ready to take on?",
      options: [
        ["Yes", 1],
        ["No", 0],
      ],
    });
    await createQuestion(sourcePostingId, {
      order: 14,
      stepLabel: "Final Information",
      category: "OPTIONAL",
      type: "TEXT",
      required: false,
      textEn: "Anything else you'd like us to know?",
    });

    // The broken target: 19 questions, every one with stepLabel=null —
    // today's actual bug. passThresholdPct and active are deliberately
    // "wrong" here too, to prove the fix corrects both.
    targetSlug = `part-time-house-cleaner-fixture-${RUN_ID}`;
    const target = await prisma.jobPosting.create({
      data: {
        slug: targetSlug,
        titleEn: "Part-Time House Cleaner (fixture)",
        descriptionEn: "fixture",
        passThresholdPct: 70,
        active: true,
      },
    });
    targetPostingId = target.id;
    for (let i = 1; i <= 19; i++) {
      const q = await prisma.prescreenQuestion.create({
        data: { jobPostingId: targetPostingId, order: i, textEn: `Broken Q${i}` },
      });
      await prisma.prescreenOption.createMany({
        data: [
          { questionId: q.id, order: 1, textEn: "Yes", points: 1 },
          { questionId: q.id, order: 2, textEn: "No", points: 0 },
        ],
      });
    }
  });

  test.afterAll(async () => {
    const postingIds = [sourcePostingId, targetPostingId];
    const applicantIds = (
      await prisma.applicant.findMany({ where: { jobPostingId: { in: postingIds } }, select: { id: true } })
    ).map((a) => a.id);
    await prisma.prescreenAnswer.deleteMany({ where: { applicantId: { in: applicantIds } } });
    await prisma.applicant.deleteMany({ where: { id: { in: applicantIds } } });
    await prisma.prescreenQuestion.deleteMany({ where: { jobPostingId: { in: postingIds } } });
    await prisma.jobPosting.deleteMany({ where: { id: { in: postingIds } } });
    await prisma.$disconnect();
  });

  test("applyPartTimeHouseCleanerPrescreenFix produces the expected question set", async () => {
    await prisma.$transaction((tx) => applyPartTimeHouseCleanerPrescreenFix(tx, sourcePostingId, targetPostingId));

    const posting = await prisma.jobPosting.findUniqueOrThrow({
      where: { id: targetPostingId },
      include: {
        prescreenQuestions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      },
    });

    // Pass threshold stays 100, posting stays inactive.
    expect(posting.passThresholdPct).toBe(100);
    expect(posting.active).toBe(false);

    // The Cleaning Experience step is gone entirely.
    expect(posting.prescreenQuestions.some((q) => q.stepLabel === "Cleaning Experience")).toBe(false);
    expect(posting.prescreenQuestions.some((q) => q.textEn.startsWith("Cleaning Experience Q"))).toBe(false);

    // None of the old broken placeholder questions survive.
    expect(posting.prescreenQuestions.some((q) => q.textEn.startsWith("Broken Q"))).toBe(false);

    const stepOrder: string[] = [];
    for (const q of posting.prescreenQuestions) {
      if (q.stepLabel && !stepOrder.includes(q.stepLabel)) stepOrder.push(q.stepLabel);
    }
    expect(stepOrder).toEqual(["About You", "Job Requirements", "Get to Know You", "Realistic Job Preview", "Final Information"]);

    // The new Experience question sits right after "How did you hear…" and
    // its follow-up, still within "About You."
    const heardAboutIdx = posting.prescreenQuestions.findIndex(
      (q) => q.textEn === "How did you hear about Mama's Cleaning Crew?"
    );
    const followUpIdx = posting.prescreenQuestions.findIndex(
      (q) => q.textEn === "Please tell us who referred you or where else you heard about us"
    );
    const experienceIdx = posting.prescreenQuestions.findIndex((q) =>
      q.textEn.startsWith("Do you have any house cleaning experience?")
    );
    expect(heardAboutIdx).toBeGreaterThanOrEqual(0);
    expect(followUpIdx).toBe(heardAboutIdx + 1);
    expect(experienceIdx).toBe(followUpIdx + 1);

    const experienceQ = posting.prescreenQuestions[experienceIdx];
    expect(experienceQ.stepLabel).toBe("About You");
    expect(experienceQ.category).toBe("APPLICATION");
    expect(experienceQ.type).toBe("SINGLE_SELECT");
    expect(experienceQ.shortLabel).toBe("Experience");
    expect(experienceQ.options.map((o) => o.textEn)).toEqual([
      "No experience yet",
      "Less than 1 year",
      "1–2 years",
      "3+ years",
    ]);
    expect(experienceQ.options.every((o) => o.points === 0)).toBe(true);

    // The follow-up's conditionalOnOptionId was remapped to the NEW
    // copy's "Other" option id, not left pointing at the source's.
    const heardAboutQ = posting.prescreenQuestions[heardAboutIdx];
    const followUpQ = posting.prescreenQuestions[followUpIdx];
    const newOtherOption = heardAboutQ.options.find((o) => o.textEn === "Other");
    expect(newOtherOption).toBeTruthy();
    expect(followUpQ.conditionalOnOptionId).toBe(newOtherOption!.id);
    expect(followUpQ.conditionalOnOptionId).not.toBe(
      (
        await prisma.prescreenOption.findFirst({
          where: { question: { jobPostingId: sourcePostingId }, textEn: "Other" },
        })
      )?.id
    );

    // The schedule question replaced the Monday–Friday availability
    // question, in the Job Requirements step.
    const scheduleQ = posting.prescreenQuestions.find(
      (q) => q.textEn === "Which part-time schedule can you commit to every week?"
    );
    expect(scheduleQ).toBeTruthy();
    expect(scheduleQ!.stepLabel).toBe("Job Requirements");
    expect(scheduleQ!.category).toBe("QUALIFICATION");
    expect(scheduleQ!.type).toBe("SINGLE_SELECT");
    expect(scheduleQ!.shortLabel).toBe("Part-Time Availability");
    expect(scheduleQ!.options.map((o) => [o.textEn, o.points])).toEqual([
      ["School hours, Monday–Friday (about 9:00 AM–2:30 PM)", 1],
      ["2–3 set full weekdays (between 8:00 AM and 6:00 PM)", 1],
      ["Either one works for me", 1],
      ["I can't commit to a fixed weekly schedule right now", 0],
    ]);
    expect(
      posting.prescreenQuestions.some(
        (q) => q.textEn === "Are you available to work Monday through Friday between 8:00 AM and 6:00 PM?"
      )
    ).toBe(false);

    // The transportation question kept its slot/options, just reworded.
    const carQ = posting.prescreenQuestions.find(
      (q) => q.textEn === "Do you have your own reliable car that you can use for work?"
    );
    expect(carQ).toBeTruthy();
    expect(carQ!.options.map((o) => o.textEn)).toEqual(["Yes", "No"]);
    expect(
      posting.prescreenQuestions.some(
        (q) => q.textEn === "Do you have reliable transportation that you can use for work?"
      )
    ).toBe(false);

    // Everything else carried over untouched.
    expect(
      posting.prescreenQuestions.some(
        (q) => q.textEn === "Scenario: a client is unhappy with a cleaning. What do you do?"
      )
    ).toBe(true);
    expect(
      posting.prescreenQuestions.some((q) => q.textEn === "Does this sound like work you're ready to take on?")
    ).toBe(true);
    expect(posting.prescreenQuestions.some((q) => q.textEn === "Anything else you'd like us to know?")).toBe(true);

    // The source (Cleaning Technician fixture) posting itself was never
    // touched.
    const sourceAfter = await prisma.prescreenQuestion.count({ where: { jobPostingId: sourcePostingId } });
    expect(sourceAfter).toBe(14);
  });

  test("/apply/<slug> shows the same step flow as the Cleaning Technician posting, and a fully-correct submission scores 100% and passes", async ({
    page,
  }) => {
    // Temporarily activate for this verification only — the fix itself
    // leaves the posting inactive, and this restores that at the end.
    await prisma.jobPosting.update({ where: { id: targetPostingId }, data: { active: true } });

    try {
      await page.goto(`/apply/${targetSlug}`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 1: About You — identity fields, "How did you hear", the new
      // Experience question. No Cleaning Experience step exists at all.
      await expect(page.locator("text=Step 1 of")).toContainText("About You");
      await page.fill('input[name="fullName"]', "Test Applicant");
      await page.fill('input[name="phone"]', "5555551234");
      await page.fill('input[name="email"]', `test-applicant-${RUN_ID}@example.com`);
      await page.fill('input[name="city"]', "Anytown");
      await selectOption(page, "How did you hear about Mama's Cleaning Crew?", "Indeed");
      await selectOption(page, "Do you have any house cleaning experience?", "No experience yet");
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 2: Job Requirements — the part-time schedule question, not
      // the old Monday–Friday one.
      await expect(page.locator("text=Step 2 of")).toContainText("Job Requirements");
      await expect(page.locator("body")).not.toContainText(
        "Are you available to work Monday through Friday between 8:00 AM and 6:00 PM?"
      );
      await selectOption(page, "Are you at least 18 years old?", "Yes");
      await selectOption(
        page,
        "Which part-time schedule can you commit to every week?",
        "Either one works for me"
      );
      await selectOption(page, "Do you have your own reliable car that you can use for work?", "Yes");
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 3: Get to Know You
      await expect(page.locator("text=Step 3 of")).toContainText("Get to Know You");
      await selectOption(page, "Scenario: a client is unhappy with a cleaning. What do you do?", "A");
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 4: Realistic Job Preview
      await expect(page.locator("text=Step 4 of")).toContainText("Realistic Job Preview");
      await selectOption(page, "Does this sound like work you're ready to take on?", "Yes");
      await page.getByRole("button", { name: "Continue" }).click();

      // Step 5: Final Information — leave the optional text blank, submit.
      await expect(page.locator("text=Step 5 of")).toContainText("Final Information");
      await page.getByRole("button", { name: "Submit My Application" }).click();
      await page.waitForURL((url) => url.pathname.includes("/thank-you"));

      const applicant = await prisma.applicant.findFirstOrThrow({
        where: { jobPostingId: targetPostingId, email: `test-applicant-${RUN_ID}@example.com` },
      });
      expect(applicant.prescreenScore).toBe(applicant.prescreenMaxScore);
      expect(applicant.prescreenMaxScore).toBeGreaterThan(0);
      expect(applicant.prescreenPassed).toBe(true);
      expect(applicant.stage).toBe("PRESCREEN_PASSED");
    } finally {
      await prisma.jobPosting.update({ where: { id: targetPostingId }, data: { active: false } });
    }
  });
});
