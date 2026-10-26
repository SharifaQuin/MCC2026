import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getRookieDayReview } from "../src/lib/rookieJourney";

// Rookie-mode awareness for the granted TRAINING_CONTENT_EDIT editor
// (/training/content-editor). Production runs Rookie Journey mode, so the
// editor must branch on getTrainingExperienceVersion() and only ever let a
// non-admin touch the LIVE curriculum — the classic 25-module catalog
// (admin/content/actions.ts) stays unreachable while Rookie is active, and
// Rookie Day content stays unreachable while Classic is active.
//
// Every row this suite edits is a throwaway fixture attached to a real
// RookieDay (RookieDay rows themselves are fixed at 1-10 by schema/route
// design and are real trainee-facing content) — the Day's own
// title/description/fieldGoal fields and its real pre-existing
// lessons/content items are never touched or saved to. Cleanup removes
// every fixture row in afterAll; the training-mode OwnerSetting is restored
// to whatever it was before this suite ran.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";
const TRAINING_EXPERIENCE_VERSION_KEY = "training_experience_version";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Rookie-mode awareness for the training content editor", () => {
  let traineeEditorId: string;
  let traineeNoGrantId: string;
  let originalModeValue: string | null;

  let rookieDayId: string;
  let fixtureModuleId: string;
  let fixtureModuleSlug: string;
  let fixtureLessonId: string;
  let fixtureContentItemId: string;

  let classicOnlyModuleId: string;
  let classicOnlyModuleSlug: string;
  let classicOnlyLessonId: string;

  const traineeEditorEmail = `rookie-edit-trainee-${RUN_ID}@example.com`;
  const traineeNoGrantEmail = `rookie-edit-no-grant-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const existingSetting = await prisma.ownerSetting.findUnique({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    originalModeValue = typeof existingSetting?.value === "string" ? existingSetting.value : null;
    await prisma.ownerSetting.upsert({
      where: { key: TRAINING_EXPERIENCE_VERSION_KEY },
      create: { key: TRAINING_EXPERIENCE_VERSION_KEY, value: "rookie" },
      update: { value: "rookie" },
    });

    const day1 = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });
    rookieDayId = day1.id;

    fixtureModuleSlug = `test-rookie-edit-${RUN_ID}`;
    const fixtureModule = await prisma.module.create({
      data: {
        titleEn: `Rookie Fixture Module ${RUN_ID}`,
        slug: fixtureModuleSlug,
        order: 9001,
        published: true,
        lessons: { create: [{ order: 1, titleEn: "Rookie Fixture Lesson", contentEn: "Original fixture lesson content." }] },
      },
      include: { lessons: true },
    });
    fixtureModuleId = fixtureModule.id;
    fixtureLessonId = fixtureModule.lessons[0].id;

    await prisma.rookieLessonAssignment.create({
      data: { lessonId: fixtureLessonId, rookieDayId, slot: "ROOKIE_DAY", order: 9001 },
    });

    const fixtureContentItem = await prisma.rookieContentItem.create({
      data: {
        rookieDayId,
        kind: "SCENARIO",
        order: 9002,
        titleEn: "Rookie Fixture Scenario",
        titleEs: "Escenario de Prueba Rookie",
        bodyEn: "",
        bodyEs: "",
        promptEn: "Original prompt EN?",
        promptEs: "Pregunta original ES?",
        revealEn: "Original reveal EN.",
        revealEs: "Revelación original ES.",
        videoUrl: "https://share.synthesia.io/embeds/videos/original-en",
        videoUrlEs: "https://share.synthesia.io/embeds/videos/original-es",
        sourceLessons: { create: [{ lessonId: fixtureLessonId }] },
      },
    });
    fixtureContentItemId = fixtureContentItem.id;

    classicOnlyModuleSlug = `test-rookie-classic-${RUN_ID}`;
    const classicOnlyModule = await prisma.module.create({
      data: {
        titleEn: `Rookie Fixture Classic-Only Module ${RUN_ID}`,
        slug: classicOnlyModuleSlug,
        order: 9002,
        published: true,
        lessons: { create: [{ order: 1, titleEn: "Classic-Only Lesson", contentEn: "Never assigned to Rookie." }] },
      },
      include: { lessons: true },
    });
    classicOnlyModuleId = classicOnlyModule.id;
    classicOnlyLessonId = classicOnlyModule.lessons[0].id;

    const traineeEditor = await prisma.user.create({
      data: {
        email: traineeEditorEmail,
        name: `Rookie Edit Trainee ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
        areaAccess: { create: [{ area: "TRAINING_CONTENT_EDIT", canEdit: true }] },
      },
    });
    traineeEditorId = traineeEditor.id;

    const traineeNoGrant = await prisma.user.create({
      data: {
        email: traineeNoGrantEmail,
        name: `Rookie Edit No Grant ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
      },
    });
    traineeNoGrantId = traineeNoGrant.id;
  });

  test.afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({
      where: { recordId: { in: [fixtureLessonId, fixtureContentItemId, classicOnlyLessonId] } },
    });
    await prisma.rookieContentSourceLesson.deleteMany({ where: { contentItemId: fixtureContentItemId } });
    await prisma.rookieContentItem.delete({ where: { id: fixtureContentItemId } }).catch(() => {});
    await prisma.rookieLessonAssignment.deleteMany({ where: { lessonId: fixtureLessonId } });
    await prisma.module.delete({ where: { id: fixtureModuleId } }).catch(() => {});
    await prisma.module.delete({ where: { id: classicOnlyModuleId } }).catch(() => {});
    await prisma.areaAccess.deleteMany({ where: { userId: traineeEditorId } });
    await prisma.user.deleteMany({ where: { id: { in: [traineeEditorId, traineeNoGrantId] } } });

    if (originalModeValue === null) {
      await prisma.ownerSetting.deleteMany({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    } else {
      await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: originalModeValue } });
    }
    await prisma.$disconnect();
  });

  test("TRAINEE without the grant: redirected away from the Rookie day editor route too", async ({ page }) => {
    await loginAs(page, traineeNoGrantEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("Rookie active: list page shows Rookie Days 1-10, never the classic module catalog", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    const res = await page.goto("/training/content-editor");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("link", { name: /Day 1\b/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Day 10\b/ })).toBeVisible();
    // Links all point at Rookie days, never a classic module slug.
    const hrefs = await page.getByRole("link").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    for (const href of hrefs) {
      if (href?.startsWith("/training/content-editor/") && href !== "/training/content-editor") {
        expect(href).toMatch(/^\/training\/content-editor\/day\/\d+$/);
      }
    }
  });

  test("Rookie active: classic module slug is redirected away at page load, not shown", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto(`/training/content-editor/${classicOnlyModuleSlug}`);
    expect(new URL(page.url()).pathname).toBe("/training/content-editor");
  });

  test("Rookie active: Day view renders the mixed sequence — assigned lesson tagged, scenario card kind-tagged, lesson before content card", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    const res = await page.goto("/training/content-editor/day/1");
    expect(res?.status()).toBe(200);

    const lessonLabel = page.getByText(`Assigned lesson — Module ${(await prisma.module.findUniqueOrThrow({ where: { id: fixtureModuleId } })).order}: Rookie Fixture Module ${RUN_ID}`);
    await expect(lessonLabel).toBeVisible();
    const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
    await expect(card.getByText("SCENARIO")).toBeVisible();
    await expect(card.getByLabel("Title (EN)")).toHaveValue("Rookie Fixture Scenario");

    // Fixture lesson (order 9001) precedes the fixture content card (order 9002).
    const html = await page.content();
    expect(html.indexOf("Rookie Fixture Lesson")).toBeLessThan(html.indexOf(`rookie-content-card-${fixtureContentItemId}`));

    // Non-admin: Day's own admin-only schedule fields are hidden.
    await expect(page.getByText("Estimated Academy Time (minutes)")).toHaveCount(0);
    await expect(page.getByText("Field Goal (English)")).toHaveCount(0);
  });

  test("Fidelity: the editor's Rookie view matches getRookieDayReview's field-for-field data for the same day/fixture", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    const review = await getRookieDayReview(traineeEditorId, 1);
    expect(review).toBeTruthy();
    const scenarioEntry = review!.sequence.find((s) => s.id === fixtureContentItemId);
    expect(scenarioEntry).toBeTruthy();
    expect(scenarioEntry!.titleEn).toBe("Rookie Fixture Scenario");
    expect(scenarioEntry!.promptEn).toBe("Original prompt EN?");
    expect(scenarioEntry!.revealEn).toBe("Original reveal EN.");

    const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
    await expect(card.getByLabel("Title (EN)")).toHaveValue(scenarioEntry!.titleEn);
    await expect(card.getByLabel(/Prompt \/ /)).toHaveValue(scenarioEntry!.promptEn!);
    await expect(card.getByLabel(/Reveal \/ /)).toHaveValue(scenarioEntry!.revealEn!);

    const lessonEntry = review!.sequence.find((s) => s.id === fixtureLessonId);
    expect(lessonEntry).toBeTruthy();
    expect(lessonEntry!.kind).toBe("LESSON");
    await expect(page.getByText(`${lessonEntry!.lessonOrder}. Rookie Fixture Lesson`)).toBeVisible();
  });

  test("RookieContentItem: EN/ES save persists to the exact row a trainee reads, kind/sourceLessonIds untouched even if forged", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
    await card.getByLabel(/Prompt \/ /).fill("Edited prompt EN by granted editor.");
    await card.getByLabel("Prompt (ES)").fill("Pregunta editada ES.");
    await card.getByLabel(/Reveal \/ /).fill("Edited reveal EN.");
    await card.getByRole("button", { name: "Save Card" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText(/Could not save|no longer have permission|changed by someone else/i)).toHaveCount(0);

    const updated = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });
    expect(updated.promptEn).toBe("Edited prompt EN by granted editor.");
    expect(updated.promptEs).toBe("Pregunta editada ES.");
    expect(updated.revealEn).toBe("Edited reveal EN.");
    expect(updated.kind).toBe("SCENARIO"); // force-preserved, never offered in this UI

    const sourceLessons = await prisma.rookieContentSourceLesson.findMany({ where: { contentItemId: fixtureContentItemId } });
    expect(sourceLessons.map((s) => s.lessonId)).toEqual([fixtureLessonId]); // untouched

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "RookieContentItem", recordId: fixtureContentItemId, actorId: traineeEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("TRAINING_CONTENT_EDITED");
  });

  test("Assigned Lesson: save hits the real Lesson row without altering citing RookieContentSourceLesson rows", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    await page.getByText("1. Rookie Fixture Lesson").click();
    await page.locator('textarea[name="contentEn"]').fill("Edited by granted Rookie-day editor.");
    await page.getByRole("button", { name: "Save Lesson" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });

    const updatedLesson = await prisma.lesson.findUniqueOrThrow({ where: { id: fixtureLessonId } });
    expect(updatedLesson.contentEn).toBe("Edited by granted Rookie-day editor.");
    expect(updatedLesson.published).toBe(true); // force-preserved — non-admin never flips this

    const stillCiting = await prisma.rookieContentSourceLesson.findFirst({
      where: { contentItemId: fixtureContentItemId, lessonId: fixtureLessonId },
    });
    expect(stillCiting).toBeTruthy();

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "Lesson", recordId: fixtureLessonId, actorId: traineeEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  test("Curriculum allowlist: mid-session unassignment blocks the very next lesson save, with a clear message, no silent overwrite", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    await page.getByText(/^1\. Rookie Fixture Lesson$/).click();

    const before = await prisma.lesson.findUniqueOrThrow({ where: { id: fixtureLessonId } });

    // Simulate an admin reassigning the lesson away mid-session, without the
    // open tab reloading — computed fresh at save time, never cached.
    await prisma.rookieLessonAssignment.deleteMany({ where: { lessonId: fixtureLessonId } });

    await page.locator('textarea[name="contentEn"]').fill("This save should be rejected — no longer live curriculum.");
    await page.getByRole("button", { name: "Save Lesson" }).click();

    await expect(page.getByText(/isn't part of the live curriculum/i)).toBeVisible();
    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: fixtureLessonId } });
    expect(after.contentEn).toBe(before.contentEn);

    // Restore the assignment for later tests in this file.
    await prisma.rookieLessonAssignment.create({
      data: { lessonId: fixtureLessonId, rookieDayId, slot: "ROOKIE_DAY", order: 9001 },
    });
  });

  test("Stale save: a concurrent edit from elsewhere on a RookieContentItem is caught, not silently overwritten", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    await prisma.rookieContentItem.update({
      where: { id: fixtureContentItemId },
      data: { promptEn: "Changed by someone else." },
    });

    const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
    await card.getByLabel(/Prompt \/ /).fill("This stale save should be rejected.");
    await card.getByRole("button", { name: "Save Card" }).click();

    await expect(page.getByText(/changed by someone else/i)).toBeVisible();
    const after = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });
    expect(after.promptEn).toBe("Changed by someone else.");
  });

  test("Mid-session revocation blocks the next RookieContentItem save, with a clear message", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    const before = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });

    await prisma.areaAccess.deleteMany({ where: { userId: traineeEditorId, area: "TRAINING_CONTENT_EDIT" } });

    const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
    await card.getByLabel(/Prompt \/ /).fill("This save should be rejected too.");
    await card.getByRole("button", { name: "Save Card" }).click();

    await expect(page.getByText(/no longer have permission/i)).toBeVisible();
    const after = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });
    expect(after.promptEn).toBe(before.promptEn);

    await prisma.areaAccess.create({ data: { userId: traineeEditorId, area: "TRAINING_CONTENT_EDIT", canEdit: true } });
  });

  test("Classic mode: granted editor's view flips back to the classic catalog, and the Rookie day route is now off-limits", async ({ page }) => {
    await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: "classic" } });

    await loginAs(page, traineeEditorEmail, PASSWORD);
    const listRes = await page.goto("/training/content-editor");
    expect(listRes?.status()).toBe(200);
    await expect(page.getByRole("link", { name: new RegExp(`Rookie Fixture Classic-Only Module ${RUN_ID}`) })).toBeVisible();
    await expect(page.getByRole("link", { name: /Day 1\b/ })).toHaveCount(0);

    await page.goto("/training/content-editor/day/1");
    expect(new URL(page.url()).pathname).toBe("/training/content-editor");

    // Classic actions stay unrestricted among classic records while Classic
    // is active (PR17's original behavior — no new restriction here).
    const detailRes = await page.goto(`/training/content-editor/${classicOnlyModuleSlug}`);
    expect(detailRes?.status()).toBe(200);
    await page.getByText("1. Classic-Only Lesson").click();
    await page.locator('textarea[name="contentEn"]').fill("Edited while Classic is active.");
    await page.getByRole("button", { name: "Save Lesson" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });
    const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: classicOnlyLessonId } });
    expect(updated.contentEn).toBe("Edited while Classic is active.");

    await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: "rookie" } });
  });

  test("ADMIN: /admin/rookie-journey and /admin/content remain fully unaffected by the mode-aware granted-editor routes", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const rookieRes = await page.goto("/admin/rookie-journey/1");
    expect(rookieRes?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Day 1 —/ })).toBeVisible();

    const contentRes = await page.goto(`/admin/content/${fixtureModuleSlug}`);
    expect(contentRes?.status()).toBe(200);
    await expect(page.getByText("Published (visible to trainees)").first()).toBeVisible();
  });

  test("ADMIN via the granted-editor route: full admin power on a Rookie day, unaffected by the non-admin curriculum allowlist", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.goto("/training/content-editor/day/1");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Estimated Academy Time (minutes)")).toBeVisible();
  });
});
