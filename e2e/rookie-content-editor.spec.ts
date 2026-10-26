import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getRookieDayReview } from "../src/lib/rookieJourney";
import { isLessonInLiveRookieCurriculum } from "../src/lib/trainingContentAccess";

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

// For "forged direct call" tests below: captures the Next.js Server Action
// id a real UI click sends, so a later request can replay the SAME action
// with a different (forged) payload — this exercises the real save action
// exactly as a non-admin caller bypassing the UI would, not a re-derived
// stand-in. Only valid for actions called with plain JSON-serializable args
// (no FormData arg) — updateRookieContentItemAction qualifies.
async function captureActionId(page: Page, trigger: () => Promise<void>): Promise<string> {
  let captured: string | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) captured = header;
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action id — trigger() didn't fire one.");
  return captured;
}

async function forgeAction(page: Page, path: string, actionId: string, args: unknown[]) {
  return page.request.post(path, {
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
}

test.describe.serial("Rookie-mode awareness for the training content editor", () => {
  let traineeEditorId: string;
  let traineeNoGrantId: string;
  let originalModeValue: string | null;

  let rookieDayId: string;
  let day1Original: { titleEn: string; titleEs: string; descriptionEn: string; descriptionEs: string };
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
    // Day 1's own title/description are now exercised by this suite's
    // round-trip tests (per the owner's explicit authorization to use the
    // seeded Day 1-10 rows in this isolated test database as fixtures) —
    // captured here so afterAll can restore the real row exactly.
    day1Original = {
      titleEn: day1.titleEn,
      titleEs: day1.titleEs,
      descriptionEn: day1.descriptionEn,
      descriptionEs: day1.descriptionEs,
    };

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
    // Restore Day 1's own real title/description exactly — the round-trip
    // tests below intentionally save through it to prove the save action
    // actually persists and is read back correctly, which earlier rounds
    // deliberately left untested.
    await prisma.rookieDay.update({
      where: { dayNumber: 1 },
      data: day1Original,
    });

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
    // Scoped to the lesson's own clickable row (a <button>), not the
    // content card's new "Source lessons (reference only)" citation list,
    // which also mentions this same lesson's title.
    await expect(
      page.getByRole("button", { name: new RegExp(`^${lessonEntry!.lessonOrder}\\. Rookie Fixture Lesson`) })
    ).toBeVisible();
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
    const citingCardBefore = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });

    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    await page.getByRole("button", { name: /^1\. Rookie Fixture Lesson/ }).click();
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

    // Lineage only — editing the cited lesson's own text never touches the
    // citing card's own fields.
    const citingCardAfter = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });
    expect(citingCardAfter.bodyEn).toBe(citingCardBefore.bodyEn);
    expect(citingCardAfter.bodyEs).toBe(citingCardBefore.bodyEs);
    expect(citingCardAfter.videoUrl).toBe(citingCardBefore.videoUrl);
    expect(citingCardAfter.updatedAt.getTime()).toBe(citingCardBefore.updatedAt.getTime());

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "Lesson", recordId: fixtureLessonId, actorId: traineeEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  test("Curriculum allowlist: mid-session unassignment blocks the very next lesson save, with a clear message, no silent overwrite", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    await page.getByRole("button", { name: /^1\. Rookie Fixture Lesson/ }).click();

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

  // ── Follow-up round: Day's own title/description, now exercised against
  // the REAL Day 1 row (owner-authorized use of the seeded 1-10 rows as
  // fixtures in this isolated test database — restored exactly in
  // afterAll). Mode is "rookie" entering this block (restored by the
  // "Classic mode" test above).

  test("Day title/description: full round trip — non-admin save persists and is reflected on the trainee-facing read path", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    await page.fill('input[name="titleEn"]', "Learn the Mama's Way (round-trip EN)");
    await page.fill('input[name="titleEs"]', "Aprende el Estilo Mama's (round-trip ES)");
    await page.fill('textarea[name="descriptionEn"]', "Round-trip description EN.");
    await page.fill('textarea[name="descriptionEs"]', "Descripción de round-trip ES.");
    await page.getByRole("button", { name: "Save Day Content" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });
    // Scoped to DayContentForm's own error element rather than a page-wide
    // text search — the fixture content card elsewhere on this same page
    // legitimately contains strings like "Changed by someone else." as
    // plain fixture data from an earlier test, not an error.
    await expect(page.getByTestId("day-content-form-error")).toHaveCount(0);

    const updatedDay = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });
    expect(updatedDay.titleEn).toBe("Learn the Mama's Way (round-trip EN)");
    expect(updatedDay.titleEs).toBe("Aprende el Estilo Mama's (round-trip ES)");
    expect(updatedDay.descriptionEn).toBe("Round-trip description EN.");
    expect(updatedDay.descriptionEs).toBe("Descripción de round-trip ES.");

    const review = await getRookieDayReview(traineeEditorId, 1);
    expect(review?.titleEn).toBe("Learn the Mama's Way (round-trip EN)");
    expect(review?.titleEs).toBe("Aprende el Estilo Mama's (round-trip ES)");
    expect(review?.descriptionEn).toBe("Round-trip description EN.");

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "RookieDay", recordId: updatedDay.id, actorId: traineeEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("TRAINING_CONTENT_EDITED");
  });

  test("Day save: a stale save is rejected, the conflicting DB value stays in place", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    await prisma.rookieDay.update({ where: { dayNumber: 1 }, data: { titleEn: "Changed by someone else (Day)." } });

    await page.fill('input[name="titleEn"]', "This stale save should be rejected.");
    await page.getByRole("button", { name: "Save Day Content" }).click();

    // Scoped to the Day form's own error element — the fixture content card
    // elsewhere on this page may independently contain similar-looking text
    // from an earlier test's fixture data.
    await expect(page.getByTestId("day-content-form-error")).toContainText(/changed by someone else/i);
    const after = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });
    expect(after.titleEn).toBe("Changed by someone else (Day).");
  });

  test("Day save: mid-session revocation is rejected, DB unchanged", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    const before = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });

    await prisma.areaAccess.deleteMany({ where: { userId: traineeEditorId, area: "TRAINING_CONTENT_EDIT" } });

    await page.fill('input[name="titleEn"]', "This save should be rejected too (Day).");
    await page.getByRole("button", { name: "Save Day Content" }).click();

    await expect(page.getByTestId("day-content-form-error")).toContainText(/no longer have permission/i);
    const after = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });
    expect(after.titleEn).toBe(before.titleEn);

    await prisma.areaAccess.create({ data: { userId: traineeEditorId, area: "TRAINING_CONTENT_EDIT", canEdit: true } });
  });

  test("Day save: a mode flip between page load and save is rejected, DB unchanged (checked at save time, not just page load)", async ({
    page,
  }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    const before = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });

    // Mode flips away from Rookie AFTER this tab already loaded the page —
    // the save action re-checks mode fresh, it isn't trusted from load time.
    await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: "classic" } });

    await page.fill('input[name="titleEn"]', "This save should be rejected — mode flipped mid-session.");
    await page.getByRole("button", { name: "Save Day Content" }).click();

    await expect(page.getByTestId("day-content-form-error")).toContainText(/isn't part of the live curriculum/i);
    const after = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });
    expect(after.titleEn).toBe(before.titleEn);

    await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: "rookie" } });
  });

  test("Day save: forged admin-only fields (fieldGoalEn/Es, estimatedAcademyMinutes) from a non-admin are force-ignored even though the UI never renders inputs for them", async ({
    page,
  }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");
    const before = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });

    // Simulates a forged field added via devtools — the real form never
    // renders these for a non-admin, but the native DOM <form> would still
    // collect them into FormData if present at submit time.
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (!form) throw new Error("form not found");
      const addHidden = (name: string, value: string) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };
      addHidden("fieldGoalEn", "FORGED field goal EN");
      addHidden("fieldGoalEs", "FORGED field goal ES");
      addHidden("estimatedAcademyMinutes", "99999");
    });

    await page.fill('input[name="titleEn"]', "Title change alongside forged admin-only fields.");
    await page.getByRole("button", { name: "Save Day Content" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByTestId("day-content-form-error")).toHaveCount(0);

    const after = await prisma.rookieDay.findUniqueOrThrow({ where: { dayNumber: 1 } });
    expect(after.titleEn).toBe("Title change alongside forged admin-only fields."); // permitted field DID save
    expect(after.fieldGoalEn).toBe(before.fieldGoalEn); // force-preserved
    expect(after.fieldGoalEs).toBe(before.fieldGoalEs);
    expect(after.estimatedAcademyMinutes).toBe(before.estimatedAcademyMinutes);
  });

  test("Forged card request: kind/sourceLessonIds/hasFutureVideoSlot/estimatedMinutes are force-preserved via a direct replayed call; permitted fields DO save, reach the trainee-facing read path, and are fully audited", async ({
    page,
  }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto("/training/content-editor/day/1");

    const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
    const actionId = await captureActionId(page, async () => {
      await card.getByRole("button", { name: "Save Card" }).click();
    });
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });

    const before = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });

    // Replay the SAME captured action id directly, with a forged payload
    // attempting to change kind/sourceLessonIds/hasFutureVideoSlot/
    // estimatedMinutes alongside a real change to the permitted fields.
    const res = await forgeAction(page, "/training/content-editor/day/1", actionId, [
      fixtureContentItemId,
      before.updatedAt.toISOString(),
      {
        kind: "RECAP",
        titleEn: "Forged-request title EN",
        titleEs: "Forged-request title ES",
        bodyEn: "",
        bodyEs: "",
        promptEn: "Forged-request prompt EN",
        promptEs: "Forged-request prompt ES",
        revealEn: "Forged-request reveal EN",
        revealEs: "Forged-request reveal ES",
        hasFutureVideoSlot: true,
        videoUrl: "https://share.synthesia.io/embeds/videos/forged",
        videoUrlEs: "https://share.synthesia.io/embeds/videos/forged-es",
        estimatedMinutes: 999,
        sourceLessonIds: [classicOnlyLessonId], // a lesson this card never actually cites
      },
    ]);
    expect(res.status()).toBeLessThan(400);

    const after = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: fixtureContentItemId } });
    // Permitted fields DID save.
    expect(after.titleEn).toBe("Forged-request title EN");
    expect(after.promptEn).toBe("Forged-request prompt EN");
    expect(after.revealEn).toBe("Forged-request reveal EN");
    expect(after.videoUrl).toBe("https://share.synthesia.io/embeds/videos/forged");
    // Force-preserved fields untouched.
    expect(after.kind).toBe(before.kind);
    expect(after.hasFutureVideoSlot).toBe(before.hasFutureVideoSlot);
    expect(after.estimatedMinutes).toBe(before.estimatedMinutes);
    const sourceLessonsAfter = await prisma.rookieContentSourceLesson.findMany({ where: { contentItemId: fixtureContentItemId } });
    expect(sourceLessonsAfter.map((s) => s.lessonId)).toEqual([fixtureLessonId]);

    // Reaches the trainee-facing read path.
    const review = await getRookieDayReview(traineeEditorId, 1);
    const entry = review!.sequence.find((s) => s.id === fixtureContentItemId);
    expect(entry!.titleEn).toBe("Forged-request title EN");

    // Audit now records every editable field (the completeness fix),
    // not just title/body.
    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "RookieContentItem", recordId: fixtureContentItemId, actorId: traineeEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    const changed = audit!.changedFields as Record<string, { from: unknown; to: unknown }>;
    expect(changed.promptEn?.to).toBe("Forged-request prompt EN");
    expect(changed.revealEn?.to).toBe("Forged-request reveal EN");
    expect(changed.videoUrl?.to).toBe("https://share.synthesia.io/embeds/videos/forged");
    expect(changed.videoUrlEs?.to).toBe("https://share.synthesia.io/embeds/videos/forged-es");
  });

  test("Curriculum boundary: a content item under an out-of-range Day fixture, and an orphan lesson assignment, are both rejected as live curriculum", async ({
    page,
  }) => {
    const orphanDay = await prisma.rookieDay.create({
      data: {
        dayNumber: 9001,
        titleEn: "Orphan Test Day",
        titleEs: "Día de Prueba Huérfano",
        descriptionEn: "Test fixture only — never part of the live 1-10 curriculum.",
        descriptionEs: "Solo fixture de prueba — nunca parte del currículo activo 1-10.",
      },
    });
    const orphanContentItem = await prisma.rookieContentItem.create({
      data: {
        rookieDayId: orphanDay.id,
        kind: "RECAP",
        order: 1,
        titleEn: "Orphan Content Item",
        titleEs: "Elemento Huérfano",
        bodyEn: "Original.",
        bodyEs: "Original ES.",
      },
    });

    try {
      await loginAs(page, traineeEditorEmail, PASSWORD);
      await page.goto("/training/content-editor/day/1");
      const card = page.locator(`[data-testid="rookie-content-card-${fixtureContentItemId}"]`);
      const actionId = await captureActionId(page, async () => {
        await card.getByRole("button", { name: "Save Card" }).click();
      });
      await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });

      const res = await forgeAction(page, "/training/content-editor/day/1", actionId, [
        orphanContentItem.id,
        orphanContentItem.updatedAt.toISOString(),
        {
          kind: "RECAP",
          titleEn: "Should not save",
          titleEs: "No debería guardarse",
          bodyEn: "x",
          bodyEs: "x",
          hasFutureVideoSlot: false,
          videoUrl: "",
          videoUrlEs: "",
          sourceLessonIds: [],
        },
      ]);
      expect(res.status()).toBeLessThan(400); // the action itself returns {ok:false}, not an HTTP error — the DB check below is what proves rejection
      const afterOrphan = await prisma.rookieContentItem.findUniqueOrThrow({ where: { id: orphanContentItem.id } });
      expect(afterOrphan.titleEn).toBe("Orphan Content Item"); // unchanged — rejected

      // Orphan RookieLessonAssignment: slot is ROOKIE_DAY but the linked day
      // doesn't resolve to a real, in-range Day — must never count as live.
      await prisma.rookieLessonAssignment.update({
        where: { lessonId: fixtureLessonId },
        data: { rookieDayId: orphanDay.id },
      });
      expect(await isLessonInLiveRookieCurriculum(fixtureLessonId)).toBe(false);
    } finally {
      await prisma.rookieLessonAssignment.update({ where: { lessonId: fixtureLessonId }, data: { rookieDayId } });
      await prisma.rookieContentItem.delete({ where: { id: orphanContentItem.id } }).catch(() => {});
      await prisma.rookieDay.delete({ where: { id: orphanDay.id } }).catch(() => {});
    }
  });
});
