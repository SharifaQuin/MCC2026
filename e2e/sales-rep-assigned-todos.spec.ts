import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for "Sales Rep can't see her own assigned to-dos anywhere in her
// account": a SALES_REP lands on /sales (never Home, which redirects her
// away before its assigned-task logic ever runs — see
// src/app/(portal)/page.tsx), so her assigned checklist tasks must now also
// surface on /sales itself, plus a persistent /todo nav link and page (which
// already worked once reached directly — this proves that explicitly).
// Nothing about the access boundary (requireChecklistTaskEditAccess) should
// have changed, so a non-assignee's forged attempt must still be refused.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const ASSIGNEE_EMAIL = `sr-todo-assignee-${RUN_ID}@example.com`;
const OTHER_REP_EMAIL = `sr-todo-other-${RUN_ID}@example.com`;
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

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
  });
}

test.describe.serial("Sales Rep sees her assigned to-dos on /sales and /todo", () => {
  let assigneeId: string;
  let otherRepId: string;
  let assignedTaskId: string;
  let teamTaskId: string;
  const TASK_TEXT = `SR assigned task ${RUN_ID}`;
  const TEAM_TASK_TEXT = `SR team task ${RUN_ID}`;

  test.beforeAll(async () => {
    const assignee = await prisma.user.create({
      data: {
        email: ASSIGNEE_EMAIL,
        name: `SR Todo Assignee ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    assigneeId = assignee.id;

    const otherRep = await prisma.user.create({
      data: {
        email: OTHER_REP_EMAIL,
        name: `SR Todo Other Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    otherRepId = otherRep.id;
  });

  test.afterAll(async () => {
    await prisma.checklistTask.deleteMany({ where: { id: { in: [assignedTaskId, teamTaskId] } } });
    await prisma.checklistTask.deleteMany({ where: { task: { contains: `ACTION-CAPTURE-SR ${RUN_ID}` } } });
    await prisma.auditLogEntry.deleteMany({ where: { actorId: { in: [assigneeId, otherRepId] } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: [assigneeId, otherRepId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [assigneeId, otherRepId] } } });
    await prisma.$disconnect();
  });

  test("ADMIN assigns a checklist task to the Sales Rep; it shows in her own /todo list", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    await page.click('button:has-text("+ Add a task")');
    await page.fill('input[name="task"]', TASK_TEXT);
    await page.selectOption('select[name="visibility"]', "TEAM");
    await page.selectOption('select[name="assigneeId"]', assigneeId);
    await page.click('button:has-text("Add task")');
    await page.waitForTimeout(1000);

    const created = await prisma.checklistTask.findFirstOrThrow({ where: { task: TASK_TEXT } });
    assignedTaskId = created.id;
    expect(created.assigneeId).toBe(assigneeId);

    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    const res = await page.goto("/todo");
    expect(res?.status()).toBe(200);
    expect(await page.content()).toContain(TASK_TEXT);
  });

  test("The /todo nav link is present for the Sales Rep", async ({ page }) => {
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/sales");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    const todoLink = sidebar.getByRole("link", { name: "To-Do List" });
    await expect(todoLink).toBeVisible();
    await expect(todoLink).toHaveAttribute("href", "/todo");
  });

  test("Visiting /sales shows the assigned task in a dedicated section", async ({ page }) => {
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Your Assigned Tasks" })).toBeVisible();
    const html = await page.content();
    expect(html).toContain(TASK_TEXT);
  });

  test("Toggling the task's status from the /sales widget persists and is reflected on /todo", async ({ page }) => {
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/sales");

    const row = page.locator("div.rounded-md.border", { hasText: new RegExp(`^${TASK_TEXT}`) }).first();
    await row.locator("button.rounded-full").click(); // NOT_STARTED -> IN_PROGRESS
    await page.waitForTimeout(1000);

    await page.goto("/sales");
    const rowAfterReload = page.locator("div.rounded-md.border", { hasText: new RegExp(`^${TASK_TEXT}`) }).first();
    await expect(rowAfterReload).toContainText("In Progress");

    const dbTask = await prisma.checklistTask.findUniqueOrThrow({ where: { id: assignedTaskId } });
    expect(dbTask.status).toBe("IN_PROGRESS");

    await page.goto("/todo");
    const todoRow = page.locator("div.rounded-md.border", { hasText: new RegExp(`^${TASK_TEXT}`) }).first();
    await expect(todoRow).toContainText("In Progress");
  });

  test("A different Sales Rep's forged toggle against this assigned task is refused", async ({ page }) => {
    const teamTask = await prisma.checklistTask.create({
      data: { frequency: "ONE_TIME", task: TEAM_TASK_TEXT, owner: "TEAM", visibility: "TEAM" },
    });
    teamTaskId = teamTask.id;

    await loginAs(page, OTHER_REP_EMAIL, PASSWORD);
    await page.goto("/todo");

    const toggleActionId = await captureActionId(page, async () => {
      const row = page.locator("div.rounded-md.border", { hasText: TEAM_TASK_TEXT }).first();
      await row.locator("button.rounded-full").click();
    });

    const before = await prisma.checklistTask.findUniqueOrThrow({ where: { id: assignedTaskId } });
    await forgeAction(page, "/todo", toggleActionId, [assignedTaskId, "DONE"]);
    await page.waitForTimeout(500);
    const after = await prisma.checklistTask.findUniqueOrThrow({ where: { id: assignedTaskId } });
    expect(after.status).toBe(before.status);
  });
});
