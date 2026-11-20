import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// prisma/seed.ts seeds two unassigned TEAM-visibility checklist tasks about
// the Marketing & Leads Tracker — work a Trainee has no part in and no
// access to that tracker for. getChecklistTasksForRole (src/lib/
// financials.ts) now excludes exactly those two (matched by exact task text
// + frequency, since a per-install seeded task's id isn't stable) from
// TRAINEE results only. Every other role, every other TEAM task, and a task
// actually assigned to a Trainee must keep working exactly as before.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const TRAINEE_EMAIL = `trainee-marketing-e2e-${RUN_ID}@example.com`;
const OA_EMAIL = `oa-marketing-e2e-${RUN_ID}@example.com`;
const PASSWORD = "Test-Password-123!";

const DAILY_MARKETING_TASK = "Log any new lead/client in the Marketing & Leads Tracker (source, type, value)";
const WEEKLY_MARKETING_TASK = "Check in on Marketing spend vs. leads generated so far";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Trainee marketing-task exclusion", () => {
  let traineeId: string;
  let oaId: string;
  const taskIds: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });

    const trainee = await prisma.user.create({
      data: {
        email: TRAINEE_EMAIL,
        name: `Trainee Marketing E2E ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
      },
    });
    traineeId = trainee.id;

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `OA Marketing E2E ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "ASSIGNED_TASKS", canEdit: true }] },
      },
    });
    oaId = oa.id;

    // An unrelated TEAM-visibility task (not seeded by default — every
    // other seeded TEAM task is one of the two Marketing ones under test —
    // to prove the exclusion is scoped to exactly those two, not TEAM tasks
    // generally.
    const unrelatedTeamTask = await prisma.checklistTask.create({
      data: {
        frequency: "DAILY",
        task: `Unrelated TEAM task ${RUN_ID}`,
        owner: "TEAM",
        visibility: "TEAM",
        category: "MANAGEMENT",
      },
    });
    taskIds.push(unrelatedTeamTask.id);

    // A task legitimately assigned directly to this Trainee.
    const assignedTraineeTask = await prisma.checklistTask.create({
      data: {
        frequency: "WEEKLY",
        task: `Assigned-to-trainee task ${RUN_ID}`,
        owner: "TEAM",
        visibility: "OWNER_ONLY",
        category: "MANAGEMENT",
        assigneeId: traineeId,
      },
    });
    taskIds.push(assignedTraineeTask.id);
  });

  test.afterAll(async () => {
    await prisma.checklistTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.areaAccess.deleteMany({ where: { userId: oaId } });
    await prisma.user.deleteMany({ where: { id: { in: [traineeId, oaId] } } });
    await prisma.$disconnect();
  });

  test("Trainee does not see either Marketing task, but does see an unrelated TEAM task and their own assigned task", async ({
    page,
  }) => {
    await loginAs(page, TRAINEE_EMAIL, PASSWORD);
    await page.goto("/todo");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(DAILY_MARKETING_TASK)).toHaveCount(0);
    await expect(page.getByText(WEEKLY_MARKETING_TASK)).toHaveCount(0);
    await expect(page.getByText(`Unrelated TEAM task ${RUN_ID}`)).toBeVisible();
    await expect(page.getByText(`Assigned-to-trainee task ${RUN_ID}`)).toBeVisible();
  });

  test("Office Assistant (with Assigned Tasks access) still sees both Marketing tasks", async ({ page }) => {
    await loginAs(page, OA_EMAIL, PASSWORD);
    await page.goto("/todo");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(DAILY_MARKETING_TASK)).toBeVisible();
    await expect(page.getByText(WEEKLY_MARKETING_TASK)).toBeVisible();
    await expect(page.getByText(`Unrelated TEAM task ${RUN_ID}`)).toBeVisible();
  });

  test("Owner (Admin) still sees both Marketing tasks", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(DAILY_MARKETING_TASK)).toBeVisible();
    await expect(page.getByText(WEEKLY_MARKETING_TASK)).toBeVisible();
  });
});
