import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for "assigned to-dos": the owner assigning a checklist task to a
// specific named team member (any staff role, not just Office Assistant).
// Assignment is a hard privacy boundary — an assigned task is visible/
// editable to exactly that person and the Owner, never any other team
// member or management role, regardless of the task's stored Owner-only/
// Team visibility (which only still matters while a task is unassigned).
// Server-side enforcement is checked both via real page navigation and via
// forged requests that replay the real Next.js Server Action protocol
// (captured via network interception during a legitimate click, then
// replayed with unauthorized arguments/sessions) rather than mocking
// anything. Fixtures only, tagged with a unique run id and removed in
// afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const ASSIGNEE_EMAIL = `assignee-e2e-${RUN_ID}@example.com`;
const BYSTANDER_EMAIL = `bystander-e2e-${RUN_ID}@example.com`;
const MANAGER_EMAIL = `manager-e2e-${RUN_ID}@example.com`;
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// Captures the real Next.js Server Action id for whichever action `trigger`
// invokes, by watching the network while it runs — then that id can be
// replayed with different arguments and a different session's cookies to
// simulate a forged request against the real server, not a mock.
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

async function forgeAction(page: Page, actionId: string, args: unknown[]) {
  return page.request.post("/todo", {
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(args),
  });
}

test.describe.serial("Assigned to-dos", () => {
  let assigneeId: string;
  let bystanderId: string;
  let managerId: string;
  let teamTaskId: string;
  let assignedTaskId: string;
  let ownerOnlyUnassignedTaskId: string;
  let assignedDespiteOwnerOnlyId: string;
  let reassignTaskId: string;

  test.beforeAll(async () => {
    const assignee = await prisma.user.create({
      data: {
        email: ASSIGNEE_EMAIL,
        name: `Assignee E2E ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    assigneeId = assignee.id;

    const bystander = await prisma.user.create({
      data: {
        email: BYSTANDER_EMAIL,
        name: `Bystander E2E ${RUN_ID}`,
        role: "TRAINER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    bystanderId = bystander.id;

    // A "management role" distinct from ADMIN — must be just as blocked
    // from someone else's assigned task as any other team member.
    const manager = await prisma.user.create({
      data: {
        email: MANAGER_EMAIL,
        name: `Manager E2E ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    managerId = manager.id;

    const teamTask = await prisma.checklistTask.create({
      data: { frequency: "ONE_TIME", task: `Team task ${RUN_ID}`, owner: "TEAM", visibility: "TEAM" },
    });
    teamTaskId = teamTask.id;

    const assignedTask = await prisma.checklistTask.create({
      data: {
        frequency: "ONE_TIME",
        task: `Assigned task ${RUN_ID}`,
        owner: "TEAM",
        visibility: "TEAM",
        assigneeId,
      },
    });
    assignedTaskId = assignedTask.id;

    const ownerOnlyUnassigned = await prisma.checklistTask.create({
      data: { frequency: "ONE_TIME", task: `Owner-only task ${RUN_ID}`, owner: "OWNER", visibility: "OWNER_ONLY" },
    });
    ownerOnlyUnassignedTaskId = ownerOnlyUnassigned.id;

    // Assignment overrides visibility entirely: even stored as Owner-only,
    // the assignee (and only the assignee) sees this.
    const assignedDespiteOwnerOnly = await prisma.checklistTask.create({
      data: {
        frequency: "ONE_TIME",
        task: `Assigned despite owner-only task ${RUN_ID}`,
        owner: "OWNER",
        visibility: "OWNER_ONLY",
        assigneeId,
      },
    });
    assignedDespiteOwnerOnlyId = assignedDespiteOwnerOnly.id;

    const reassignTask = await prisma.checklistTask.create({
      data: {
        frequency: "ONE_TIME",
        task: `Reassign-flow task ${RUN_ID}`,
        owner: "TEAM",
        visibility: "TEAM",
        assigneeId,
      },
    });
    reassignTaskId = reassignTask.id;
  });

  test.afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({ where: { actorId: { in: [assigneeId, bystanderId, managerId] } } });
    await prisma.checklistTask.deleteMany({
      where: {
        id: {
          in: [
            teamTaskId,
            assignedTaskId,
            ownerOnlyUnassignedTaskId,
            assignedDespiteOwnerOnlyId,
            reassignTaskId,
          ],
        },
      },
    });
    await prisma.checklistTask.deleteMany({ where: { task: { contains: `ACTION-ID-CAPTURE ${RUN_ID}` } } });
    await prisma.user.deleteMany({ where: { id: { in: [assigneeId, bystanderId, managerId] } } });
    await prisma.$disconnect();
  });

  test("Owner can create a task and assign it to a named team member via the picker", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    await page.click('button:has-text("+ Add a task")');
    await page.fill('input[name="task"]', `Created-and-assigned ${RUN_ID}`);
    await page.selectOption('select[name="visibility"]', "TEAM");
    await page.selectOption('select[name="assigneeId"]', assigneeId);
    await page.click('button:has-text("Add task")');
    await page.waitForTimeout(1000);

    const created = await prisma.checklistTask.findFirstOrThrow({ where: { task: `Created-and-assigned ${RUN_ID}` } });
    expect(created.assigneeId).toBe(assigneeId);
    expect(created.visibility).toBe("TEAM");
    await prisma.checklistTask.delete({ where: { id: created.id } });
  });

  test("The Owner sees every task, including both private ones", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    const html = await page.content();
    expect(html).toContain(`Team task ${RUN_ID}`);
    expect(html).toContain(`Assigned task ${RUN_ID}`);
    expect(html).toContain(`Owner-only task ${RUN_ID}`);
    expect(html).toContain(`Assigned despite owner-only task ${RUN_ID}`);
  });

  test("The assignee sees their own assigned tasks (even an Owner-only one) and shared tasks, never someone else's Owner-only task", async ({ page }) => {
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);

    const todoRes = await page.goto("/todo");
    expect(todoRes?.status()).toBe(200);
    const todoHtml = await page.content();
    expect(todoHtml).toContain(`Team task ${RUN_ID}`);
    expect(todoHtml).toContain(`Assigned task ${RUN_ID}`);
    expect(todoHtml).toContain(`Assigned despite owner-only task ${RUN_ID}`);
    expect(todoHtml).not.toContain(`Owner-only task ${RUN_ID}`);

    const homeRes = await page.goto("/");
    expect(homeRes?.status()).toBe(200);
    const homeHtml = await page.content();
    expect(homeHtml).toContain(`Team task ${RUN_ID}`);
    expect(homeHtml).toContain(`Assigned task ${RUN_ID}`);
    expect(homeHtml).toContain(`Assigned despite owner-only task ${RUN_ID}`);
    expect(homeHtml).not.toContain(`Owner-only task ${RUN_ID}`);
  });

  for (const [label, email] of [
    ["a different team member", BYSTANDER_EMAIL],
    ["a management role (Service Manager)", MANAGER_EMAIL],
  ] as const) {
    test(`Neither ${label} sees a task assigned to someone else, even one that's nominally Team-visible`, async ({ page }) => {
      await loginAs(page, email, PASSWORD);
      await page.goto("/todo");
      const html = await page.content();
      expect(html).toContain(`Team task ${RUN_ID}`); // unassigned + Team-visible: everyone sees this
      expect(html).not.toContain(`Assigned task ${RUN_ID}`);
      expect(html).not.toContain(`Owner-only task ${RUN_ID}`);
      expect(html).not.toContain(`Assigned despite owner-only task ${RUN_ID}`);

      await page.goto("/");
      const homeHtml = await page.content();
      expect(homeHtml).toContain(`Team task ${RUN_ID}`);
      expect(homeHtml).not.toContain(`Assigned task ${RUN_ID}`);
      expect(homeHtml).not.toContain(`Assigned despite owner-only task ${RUN_ID}`);
    });
  }

  test("The assignee can mark their task done and add a note; the owner sees the result", async ({ page }) => {
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/todo");

    const row = page.locator("div.rounded-md.border", { hasText: new RegExp(`^Assigned task ${RUN_ID}`) }).first();
    await row.locator("button.rounded-full").click();
    await row.locator("button.rounded-full").click();
    await page.waitForTimeout(1000);

    await row.click();
    const notesBox = row.locator("textarea");
    await notesBox.fill("Finished this up, no blockers.");
    await row.getByRole("button", { name: "Save notes" }).click();
    await page.waitForTimeout(1000);

    const after = await prisma.checklistTask.findUniqueOrThrow({ where: { id: assignedTaskId } });
    expect(after.status).toBe("DONE");
    expect(after.notes).toBe("Finished this up, no blockers.");

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    // A DONE one-time task archives itself — expand the archived section
    // (then the row itself, to see notes) same as an owner would have to.
    await page.click("text=/Show archived/");
    const adminRow = page.locator("div.rounded-md.border", { hasText: new RegExp(`^Assigned task ${RUN_ID}`) }).first();
    await expect(adminRow).toContainText("Done");
    await adminRow.click();
    await expect(adminRow.locator("textarea")).toHaveValue("Finished this up, no blockers.");
  });

  test("Reassigning moves access from the old assignee to the new one; unassigning reverts to the stored visibility", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    const row = page.locator("div.rounded-md.border", { hasText: new RegExp(`^Reassign-flow task ${RUN_ID}`) }).first();
    await row.click();
    await row.locator("label:has-text('Assign to') + select").selectOption(bystanderId);
    await page.waitForTimeout(800);
    await expect(row).toContainText("Reassigned");

    let after = await prisma.checklistTask.findUniqueOrThrow({ where: { id: reassignTaskId } });
    expect(after.assigneeId).toBe(bystanderId);

    // The old assignee lost access, the new one has it.
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/todo");
    expect(await page.content()).not.toContain(`Reassign-flow task ${RUN_ID}`);

    await loginAs(page, BYSTANDER_EMAIL, PASSWORD);
    await page.goto("/todo");
    expect(await page.content()).toContain(`Reassign-flow task ${RUN_ID}`);

    // Unassigning reverts it to its stored Team visibility — everyone sees
    // it again (it was created with visibility: TEAM).
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/todo");
    const row2 = page.locator("div.rounded-md.border", { hasText: new RegExp(`^Reassign-flow task ${RUN_ID}`) }).first();
    await row2.click();
    await row2.locator("label:has-text('Assign to') + select").selectOption("");
    await page.waitForTimeout(800);
    await expect(row2).toContainText("Unassigned");

    after = await prisma.checklistTask.findUniqueOrThrow({ where: { id: reassignTaskId } });
    expect(after.assigneeId).toBeNull();

    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/todo");
    expect(await page.content()).toContain(`Reassign-flow task ${RUN_ID}`);
    await loginAs(page, MANAGER_EMAIL, PASSWORD);
    await page.goto("/todo");
    expect(await page.content()).toContain(`Reassign-flow task ${RUN_ID}`);
  });

  test("Forged request: a bystander's real toggle action fails against someone else's assigned task and an Owner-only task", async ({ page }) => {
    await loginAs(page, BYSTANDER_EMAIL, PASSWORD);
    await page.goto("/todo");

    // Capture the real toggleChecklistTaskStatusAction id via a legitimate
    // click on the bystander's own visible (Team) task, then replay it with
    // the same session's cookies but targeting tasks they aren't authorized
    // for: an Owner-only task, and one privately assigned to someone else.
    const toggleActionId = await captureActionId(page, async () => {
      const row = page.locator("div.rounded-md.border", { hasText: `Team task ${RUN_ID}` }).first();
      await row.locator("button.rounded-full").click();
    });

    const beforeOwnerOnly = await prisma.checklistTask.findUniqueOrThrow({ where: { id: ownerOnlyUnassignedTaskId } });
    await forgeAction(page, toggleActionId, [ownerOnlyUnassignedTaskId, "DONE"]);
    await page.waitForTimeout(500);
    const afterOwnerOnly = await prisma.checklistTask.findUniqueOrThrow({ where: { id: ownerOnlyUnassignedTaskId } });
    expect(afterOwnerOnly.status).toBe(beforeOwnerOnly.status);

    const beforeAssigned = await prisma.checklistTask.findUniqueOrThrow({ where: { id: assignedTaskId } });
    await forgeAction(page, toggleActionId, [assignedTaskId, "DONE"]);
    await page.waitForTimeout(500);
    const afterAssigned = await prisma.checklistTask.findUniqueOrThrow({ where: { id: assignedTaskId } });
    expect(afterAssigned.status).toBe(beforeAssigned.status);
  });

  test("Forged request: a non-admin cannot delete or reassign a task, even replaying the real admin action id", async ({ page }) => {
    // Capture deleteChecklistTaskAction's and setChecklistTaskAssigneeAction's
    // real action ids as ADMIN (the only role whose UI exposes them), against
    // a disposable task, then replay both with the ASSIGNEE's session.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await prisma.checklistTask.create({
      data: { frequency: "ONE_TIME", task: `ACTION-ID-CAPTURE ${RUN_ID}`, owner: "TEAM", visibility: "TEAM" },
    });
    await page.goto("/todo");
    const captureRow = page.locator("div.rounded-md.border", { hasText: `ACTION-ID-CAPTURE ${RUN_ID}` }).first();

    const assignActionId = await captureActionId(page, async () => {
      await captureRow.click();
      await captureRow.locator("label:has-text('Assign to') + select").selectOption(bystanderId);
    });
    page.once("dialog", (d) => d.accept());
    const deleteActionId = await captureActionId(page, async () => {
      await captureRow.locator("button.text-red-600").click();
    });

    // Now switch to the assignee's session and replay both with real
    // targets: reassigning/deleting the team-visible task they can edit.
    await loginAs(page, ASSIGNEE_EMAIL, PASSWORD);
    await page.goto("/todo");

    const beforeAssignee = await prisma.checklistTask.findUniqueOrThrow({ where: { id: teamTaskId } });
    await forgeAction(page, assignActionId, [teamTaskId, assigneeId]);
    await page.waitForTimeout(500);
    const afterAssign = await prisma.checklistTask.findUniqueOrThrow({ where: { id: teamTaskId } });
    expect(afterAssign.assigneeId).toBe(beforeAssignee.assigneeId);

    await forgeAction(page, deleteActionId, [teamTaskId]);
    await page.waitForTimeout(500);
    const stillExists = await prisma.checklistTask.findUnique({ where: { id: teamTaskId } });
    expect(stillExists).not.toBeNull();
  });
});
