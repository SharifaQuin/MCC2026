import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Member-specific "Training content editing" permission: a separate
// TRAINING_CONTENT_EDIT grant, settable per-member on the Permissions screen
// regardless of role, distinct from the existing TRAINING (operational/
// learning) grant. A permitted non-admin member can edit existing module/
// lesson text and quiz Q&A through a narrowly-scoped route
// (/training/content-editor), reusing the same editor components and save
// actions as the real ADMIN-only /admin/content, but with create/delete/
// publish/seed controls hidden and rejected server-side. Covers: two
// distinct non-admin roles with the grant, one without it, mid-session
// revocation blocking the next save, and a stale-save conflict.
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

test.describe.serial("Member-specific training-content editing permission", () => {
  let adminId: string;
  let traineeEditorId: string;
  let smEditorId: string;
  let traineeNoGrantId: string;
  let salesRepEditorId: string;
  let moduleId: string;
  let moduleSlug: string;
  let lessonId: string;
  let questionId: string;
  let originalModeValue: string | null;

  const traineeEditorEmail = `content-edit-trainee-${RUN_ID}@example.com`;
  const smEditorEmail = `content-edit-sm-${RUN_ID}@example.com`;
  const traineeNoGrantEmail = `content-edit-no-grant-${RUN_ID}@example.com`;
  const salesRepEditorEmail = `content-edit-salesrep-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    // This suite exercises the CLASSIC catalog's non-admin editor pathway —
    // the classic 25-module catalog is only the live curriculum (and so
    // only reachable to a non-admin granted editor) while Classic is the
    // active training mode (see src/lib/rookieJourney.ts). Production
    // defaults to Rookie when unset, so force Classic for this suite's
    // duration and restore whatever was there before in afterAll.
    const existingSetting = await prisma.ownerSetting.findUnique({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    originalModeValue = typeof existingSetting?.value === "string" ? existingSetting.value : null;
    await prisma.ownerSetting.upsert({
      where: { key: TRAINING_EXPERIENCE_VERSION_KEY },
      create: { key: TRAINING_EXPERIENCE_VERSION_KEY, value: "classic" },
      update: { value: "classic" },
    });

    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    moduleSlug = `test-content-edit-${RUN_ID}`;
    const testModule = await prisma.module.create({
      data: {
        titleEn: `Content Edit Test Module ${RUN_ID}`,
        slug: moduleSlug,
        order: 9001,
        published: true,
        lessons: {
          create: [{ order: 1, titleEn: "Test Lesson", contentEn: "Original lesson content." }],
        },
        quizQuestions: {
          create: [
            {
              order: 1,
              textEn: "Original question text?",
              options: {
                create: [
                  { order: 1, textEn: "A", isCorrect: true },
                  { order: 2, textEn: "B", isCorrect: false },
                ],
              },
            },
          ],
        },
      },
      include: { lessons: true, quizQuestions: true },
    });
    moduleId = testModule.id;
    lessonId = testModule.lessons[0].id;
    questionId = testModule.quizQuestions[0].id;

    const traineeEditor = await prisma.user.create({
      data: {
        email: traineeEditorEmail,
        name: `Content Edit Trainee ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
        areaAccess: { create: [{ area: "TRAINING_CONTENT_EDIT", canEdit: true }] },
      },
    });
    traineeEditorId = traineeEditor.id;

    const smEditor = await prisma.user.create({
      data: {
        email: smEditorEmail,
        name: `Content Edit SM ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        areaAccess: { create: [{ area: "TRAINING_CONTENT_EDIT", canEdit: true }] },
      },
    });
    smEditorId = smEditor.id;

    const traineeNoGrant = await prisma.user.create({
      data: {
        email: traineeNoGrantEmail,
        name: `Content Edit No Grant ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
      },
    });
    traineeNoGrantId = traineeNoGrant.id;

    // A role /modules itself redirects away from entirely (SALES_REP), used
    // to prove the new sidebar link is the only path such a granted member
    // needs — and that it grants nothing else (no Modules/Progress/Glossary).
    const salesRepEditor = await prisma.user.create({
      data: {
        email: salesRepEditorEmail,
        name: `Content Edit Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
        areaAccess: { create: [{ area: "TRAINING_CONTENT_EDIT", canEdit: true }] },
      },
    });
    salesRepEditorId = salesRepEditor.id;
  });

  test.afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: [moduleId, lessonId, questionId] } } });
    await prisma.module.delete({ where: { id: moduleId } }).catch(() => {});
    await prisma.areaAccess.deleteMany({ where: { userId: { in: [traineeEditorId, smEditorId, salesRepEditorId] } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepEditorId } });
    await prisma.user.deleteMany({
      where: { id: { in: [traineeEditorId, smEditorId, traineeNoGrantId, salesRepEditorId] } },
    });

    if (originalModeValue === null) {
      await prisma.ownerSetting.deleteMany({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    } else {
      await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: originalModeValue } });
    }
    await prisma.$disconnect();
  });

  test("Permissions screen: an always-visible Training Content Editing control exists for a non-Office-Assistant member", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    await expect(page.getByRole("columnheader", { name: "Training Content Editing" })).toBeVisible();
    const row = page.locator("tr", { hasText: `Content Edit Trainee ${RUN_ID}` });
    await expect(row).toBeVisible();
    const select = row.locator("td").last().locator("select");
    await expect(select).toHaveValue("EDIT");
  });

  test("TRAINEE without the grant: redirected away from the content editor", async ({ page }) => {
    await loginAs(page, traineeNoGrantEmail, PASSWORD);
    await page.goto("/training/content-editor");
    expect(new URL(page.url()).pathname).toBe("/");
    await page.goto(`/training/content-editor/${moduleSlug}`);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("TRAINEE with the grant: can open the editor, sees text fields, but admin-only controls are hidden", async ({
    page,
  }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    const res = await page.goto(`/training/content-editor/${moduleSlug}`);
    expect(res?.status()).toBe(200);

    // Module-level admin-only controls hidden.
    await expect(page.getByText("Published (visible to trainees)")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete Module" })).toHaveCount(0);
    await expect(page.getByText("Saving here changes published content immediately").first()).toBeVisible();

    // Expand the lesson row — Delete and the Published checkbox are hidden.
    await page.getByText("1. Test Lesson").click();
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Add Lesson" })).toHaveCount(0);

    // Expand the quiz question — same hiding.
    await page.getByText("1. Original question text?").click();
    await expect(page.getByRole("button", { name: "+ Add Question" })).toHaveCount(0);
  });

  test("TRAINEE with the grant: saving a lesson text edit persists and is audited", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto(`/training/content-editor/${moduleSlug}`);
    await page.getByText("1. Test Lesson").click();
    const contentField = page.locator('textarea[name="contentEn"]');
    await contentField.fill("Edited by trainee editor.");
    await page.getByRole("button", { name: "Save Lesson" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });

    const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(updated.contentEn).toBe("Edited by trainee editor.");
    expect(updated.published).toBe(true); // untouched — non-admin can never flip this

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "Lesson", recordId: lessonId, actorId: traineeEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("TRAINING_CONTENT_EDITED");
  });

  test("SERVICE_MANAGER with the grant (second distinct role): saving a quiz question edit persists and is audited", async ({
    page,
  }) => {
    await loginAs(page, smEditorEmail, PASSWORD);
    await page.goto(`/training/content-editor/${moduleSlug}`);
    await page.getByText("1. Original question text?").click();
    const questionField = page.locator('input[name="textEn"]');
    await questionField.fill("Edited by service manager editor?");
    await page.getByRole("button", { name: "Save Question" }).click();
    await expect(page.getByText("Saving...")).toHaveCount(0, { timeout: 5000 });

    const updated = await prisma.quizQuestion.findUniqueOrThrow({ where: { id: questionId } });
    expect(updated.textEn).toBe("Edited by service manager editor?");

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordType: "QuizQuestion", recordId: questionId, actorId: smEditorId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  test("Mid-session revocation blocks the very next save, with a clear message, and does not overwrite content", async ({
    page,
  }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto(`/training/content-editor/${moduleSlug}`);
    await page.getByText("1. Test Lesson").click();

    const before = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });

    // Revoke the grant while the editor tab is already open — simulates an
    // owner pulling access mid-session, without the user reloading.
    await prisma.areaAccess.deleteMany({ where: { userId: traineeEditorId, area: "TRAINING_CONTENT_EDIT" } });

    const contentField = page.locator('textarea[name="contentEn"]');
    await contentField.fill("This save should be rejected.");
    await page.getByRole("button", { name: "Save Lesson" }).click();

    await expect(page.getByText(/no longer have permission/i)).toBeVisible();
    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(after.contentEn).toBe(before.contentEn);

    // Restore the grant for the stale-save test below.
    await prisma.areaAccess.create({ data: { userId: traineeEditorId, area: "TRAINING_CONTENT_EDIT", canEdit: true } });
  });

  test("Stale save: a concurrent edit from elsewhere is caught, not silently overwritten", async ({ page }) => {
    await loginAs(page, traineeEditorEmail, PASSWORD);
    await page.goto(`/training/content-editor/${moduleSlug}`);
    await page.getByText("1. Test Lesson").click();

    // Simulate another editor's save landing between this page load and
    // this submit, bumping updatedAt past what the open form still holds.
    await prisma.lesson.update({ where: { id: lessonId }, data: { contentEn: "Changed by someone else." } });

    const contentField = page.locator('textarea[name="contentEn"]');
    await contentField.fill("This stale save should be rejected.");
    await page.getByRole("button", { name: "Save Lesson" }).click();

    await expect(page.getByText(/changed by someone else/i)).toBeVisible();
    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(after.contentEn).toBe("Changed by someone else.");
  });

  test("Non-admin editor cannot create, delete, publish, or seed transcripts — controls stay hidden across a fresh grant", async ({
    page,
  }) => {
    await loginAs(page, smEditorEmail, PASSWORD);
    await page.goto(`/training/content-editor/${moduleSlug}`);
    await expect(page.getByRole("button", { name: "Delete Module" })).toHaveCount(0);
    await expect(page.getByText("Published (visible to trainees)")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Add Lesson" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Add Question" })).toHaveCount(0);
    // The real admin surface and its create/delete/publish/seed controls
    // are unreachable at all — middleware redirects any non-ADMIN away from
    // /admin/content before this page's own code runs.
    const res = await page.goto("/admin/content");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(res?.status()).toBeLessThan(400);
  });

  test("SALES_REP granted the permission: sidebar shows a working 'Training Content Editor' link, but no Modules/Progress/Glossary", async ({
    page,
  }) => {
    await loginAs(page, salesRepEditorEmail, PASSWORD);
    await page.goto("/sales");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    const editorLink = sidebar.getByRole("link", { name: "Training Content Editor" });
    await expect(editorLink).toBeVisible();
    await expect(editorLink).toHaveAttribute("href", "/training/content-editor");

    // Grants nothing else — a Sales Rep still has no training nav at all.
    await expect(sidebar.getByRole("link", { name: "Modules" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "My Progress" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Glossary" })).toHaveCount(0);

    await editorLink.click();
    await page.waitForURL("**/training/content-editor");
    await expect(page.getByRole("heading", { name: "Training Content Editor" })).toBeVisible();

    // /modules itself is still blocked for this role, unaffected by the grant.
    await page.goto("/modules");
    expect(new URL(page.url()).pathname).toBe("/sales");
  });

  test("Revoked grant: the 'Training Content Editor' nav link disappears", async ({ page }) => {
    await prisma.areaAccess.deleteMany({ where: { userId: salesRepEditorId, area: "TRAINING_CONTENT_EDIT" } });
    await loginAs(page, salesRepEditorEmail, PASSWORD);
    await page.goto("/sales");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Training Content Editor" })).toHaveCount(0);

    // Restore for afterAll's generic cleanup/assertions to stay consistent.
    await prisma.areaAccess.create({
      data: { userId: salesRepEditorId, area: "TRAINING_CONTENT_EDIT", canEdit: true },
    });
  });

  test("ADMIN: real /admin/content route is unaffected, full controls still present", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.goto(`/admin/content/${moduleSlug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Published (visible to trainees)").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete Module" })).toBeVisible();
  });
});
