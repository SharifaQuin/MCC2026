import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Nav already hid the Modules/Progress/Glossary links from an Office
// Assistant whose Training grant is "No access", but none of those page
// routes (or the lesson-watched/quiz-submission routes beneath them)
// enforced the grant server-side — a direct URL bypassed it entirely. An
// Office Assistant WITH Training access (Pedro's real case) must keep full
// access; every other role is untouched by this change.
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Office Assistant Training grant enforced on direct URLs", () => {
  let adminId: string;
  let oaWithTrainingId: string;
  let oaNoTrainingId: string;
  let traineeId: string;
  const oaWithTrainingEmail = `url-oa-training-${RUN_ID}@example.com`;
  const oaNoTrainingEmail = `url-oa-no-training-${RUN_ID}@example.com`;
  const traineeEmail = `url-trainee-${RUN_ID}@example.com`;
  let moduleSlug: string;
  let lessonOrder: number;
  let lessonId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const firstModule = await prisma.module.findFirstOrThrow({
      where: { published: true },
      orderBy: { order: "asc" },
    });
    moduleSlug = firstModule.slug;

    const firstLesson = await prisma.lesson.findFirstOrThrow({
      where: { moduleId: firstModule.id },
      orderBy: { order: "asc" },
    });
    lessonOrder = firstLesson.order;
    lessonId = firstLesson.id;

    const oaWithTraining = await prisma.user.create({
      data: {
        email: oaWithTrainingEmail,
        name: `URL Enforce OA Training ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: { create: [{ area: "TRAINING", canEdit: true }] },
      },
    });
    oaWithTrainingId = oaWithTraining.id;

    const oaNoTraining = await prisma.user.create({
      data: {
        email: oaNoTrainingEmail,
        name: `URL Enforce OA No Training ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: { create: [{ area: "HR_SUMMARY", canEdit: false }] },
      },
    });
    oaNoTrainingId = oaNoTraining.id;

    const trainee = await prisma.user.create({
      data: {
        email: traineeEmail,
        name: `URL Enforce Trainee ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
      },
    });
    traineeId = trainee.id;
  });

  test.afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { userId: { in: [oaWithTrainingId, oaNoTrainingId, traineeId] } } });
    await prisma.areaAccess.deleteMany({ where: { userId: { in: [oaWithTrainingId, oaNoTrainingId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [oaWithTrainingId, oaNoTrainingId, traineeId] } } });
    await prisma.$disconnect();
  });

  test("OA with Training access: full access to every training route, by direct URL", async ({ page }) => {
    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    expect((await page.goto(`/modules`))?.status()).toBe(200);
    expect((await page.goto(`/modules/${moduleSlug}`))?.status()).toBe(200);
    expect((await page.goto(`/modules/${moduleSlug}/lesson/${lessonOrder}`))?.status()).toBe(200);
    expect((await page.goto(`/progress`))?.status()).toBe(200);
    expect((await page.goto(`/glossary`))?.status()).toBe(200);
  });

  test("OA with Training access: lesson-watched API still works", async ({ page }) => {
    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    const res = await page.request.post(`/api/lessons/${lessonId}/watched`, { data: {} });
    expect(res.ok()).toBeTruthy();
  });

  test("OA with Training set to No access: every training route redirects away, not rendered", async ({ page }) => {
    await loginAs(page, oaNoTrainingEmail, PASSWORD);
    await page.goto(`/modules`);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto(`/modules/${moduleSlug}`);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto(`/modules/${moduleSlug}/lesson/${lessonOrder}`);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto(`/progress`);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto(`/glossary`);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("OA with Training set to No access: lesson-watched API rejects with 403", async ({ page }) => {
    await loginAs(page, oaNoTrainingEmail, PASSWORD);
    const res = await page.request.post(`/api/lessons/${lessonId}/watched`, { data: {} });
    expect(res.status()).toBe(403);
  });

  test("Trainee (non-Office-Assistant role): completely unaffected, full access as before", async ({ page }) => {
    await loginAs(page, traineeEmail, PASSWORD);
    expect((await page.goto(`/modules`))?.status()).toBe(200);
    expect((await page.goto(`/progress`))?.status()).toBe(200);
    expect((await page.goto(`/glossary`))?.status()).toBe(200);
  });
});
