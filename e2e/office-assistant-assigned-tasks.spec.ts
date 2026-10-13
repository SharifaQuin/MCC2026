import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Office Assistant's Home "Your Tasks" / checklist sidebar must honor the
// owner-configured ASSIGNED_TASKS area grant the same way /todo already
// does: None means the task is never fetched or returned at all (no task
// text/notes leave the server); View renders it read-only; Edit allows the
// normal mark-done control. A permission change takes effect on the very
// next request, with no re-login required.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_EMAIL = `oa-tasks-e2e-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Office Assistant Home — ASSIGNED_TASKS area gating", () => {
  let officeAssistantId: string;
  let taskId: string;

  test.beforeAll(async () => {
    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `OA Tasks E2E ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        // Deliberately no AreaAccess rows at all yet — ASSIGNED_TASKS starts
        // at None.
      },
    });
    officeAssistantId = oa.id;

    const task = await prisma.checklistTask.create({
      data: {
        frequency: "ONE_TIME",
        task: `OA Home task ${RUN_ID}`,
        owner: "TEAM",
        visibility: "TEAM",
        assigneeId: officeAssistantId,
      },
    });
    taskId = task.id;
  });

  test.afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({ where: { actorId: officeAssistantId } });
    await prisma.checklistTask.delete({ where: { id: taskId } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.delete({ where: { id: officeAssistantId } });
    await prisma.$disconnect();
  });

  // One continuous session/page throughout — logging in only once below —
  // is what actually proves each permission change takes effect on the
  // very next request without a fresh login, rather than coincidentally
  // picking up a changed grant because a new session happened to log in
  // after the change.
  test("Home honors None → View → Edit → None for ASSIGNED_TASKS, all without re-login", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);

    // None (starting state): never fetched or shown at all.
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(await page.content()).not.toContain(`OA Home task ${RUN_ID}`);

    // View: the owner grants View-only — simulated directly, as the
    // Permissions screen would do — then the same open session reloads.
    await prisma.areaAccess.create({ data: { userId: officeAssistantId, area: "ASSIGNED_TASKS", canEdit: false } });
    await page.goto("/");
    expect(await page.content()).toContain(`OA Home task ${RUN_ID}`);
    const row = page.locator("div.py-1\\.5", { hasText: `OA Home task ${RUN_ID}` }).first();
    const button = row.locator("button").first();
    await expect(button).toBeDisabled();
    // A forged attempt to toggle it anyway must still fail server-side —
    // the disabled control is not the real security boundary.
    await button.click({ force: true });
    await page.waitForTimeout(500);
    let unchanged = await prisma.checklistTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(unchanged.status).toBe("NOT_STARTED");

    // Edit: the owner grants Edit — the control enables and actually works.
    await prisma.areaAccess.updateMany({
      where: { userId: officeAssistantId, area: "ASSIGNED_TASKS" },
      data: { canEdit: true },
    });
    await page.goto("/");
    expect(await page.content()).toContain(`OA Home task ${RUN_ID}`);
    const row2 = page.locator("div.py-1\\.5", { hasText: `OA Home task ${RUN_ID}` }).first();
    const button2 = row2.locator("button").first();
    await expect(button2).toBeEnabled();
    await button2.click();
    await page.waitForTimeout(800);
    const afterEdit = await prisma.checklistTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(afterEdit.status).toBe("IN_PROGRESS");

    // Back to None: revoking hides it again on the very next request.
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId, area: "ASSIGNED_TASKS" } });
    await page.goto("/");
    expect(await page.content()).not.toContain(`OA Home task ${RUN_ID}`);
  });
});
