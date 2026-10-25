import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getPairingCandidates } from "../src/lib/pairing";
import { getTrainerCandidates } from "../src/lib/trainingAssignment";
import { getChecklistAssigneeCandidates } from "../src/lib/financials";
import { getAssignableRolesForInviter } from "../src/lib/roleAssignment";

// Coverage for the new fixed role selector (adding SALES_REP alongside the
// existing four roles) per the brief:
//   - creation of every selectable role via the Add Employee form + CSV
//     bulk invite, ADMIN never offered/assignable
//   - a less-privileged (SERVICE_MANAGER) inviter cannot grant
//     SERVICE_MANAGER/OFFICE_ASSISTANT/ADMIN, via a tampered <select> or a
//     tampered CSV role column, not just a hidden UI option
//   - only TRAINEE invites/bulk-rows get the default onboarding documents
//   - Sales Reps are listed in their own directory section, never folded
//     into the technician Staff Directory/pairing/training-candidate lists
//   - Sales None/View/Edit works for a Sales Rep exactly like it already
//     does for every other non-Admin, non-Office-Assistant role
//   - role changes on the (ADMIN-only) Permissions screen, and that a stale
//     DepartmentAccess/AreaAccess grant from a prior role is never silently
//     reactivated by a role change
// Fixtures only, tagged with a unique run id and removed in afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const MANAGER_EMAIL = `rolesel-manager-e2e-${RUN_ID}@example.com`;
const MANAGER_PASSWORD = "Test-Password-123!";
const SALES_REP_EMAIL = `rolesel-salesrep-e2e-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  await page.evaluate(() => fetch("/logout", { method: "POST" }));
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

async function openAddEmployeePanel(page: Page) {
  await page.goto("/staff");
  await page.click('button:has-text("+ Add Employee")');
}

// Both the single-invite and bulk-CSV-invite forms share an
// input[name="sendInviteNow"] checkbox — scope by each form's own
// distinguishing field rather than that shared name, which otherwise
// resolves ambiguously across the two simultaneously-rendered forms.
function singleInviteForm(page: Page) {
  return page.locator("form", { has: page.locator('input[name="email"]') });
}

function bulkInviteForm(page: Page) {
  return page.locator("form", { has: page.locator('input[name="csvFile"]') });
}

async function selectRoleIncludingUnlisted(page: Page, value: string) {
  // Simulates a tampered <select> (e.g. via devtools) choosing a role the
  // real dropdown never renders for this inviter — proves the server, not
  // just the UI, is the real boundary.
  await page.evaluate((v) => {
    const select = document.querySelector('select[name="role"]') as HTMLSelectElement;
    if (!select.querySelector(`option[value="${v}"]`)) {
      const opt = document.createElement("option");
      opt.value = v;
      select.appendChild(opt);
    }
    select.value = v;
  }, value);
}

test.describe.serial("Role selector + Sales Rep role (browser)", () => {
  let adminId: string;
  let managerId: string;
  let defaultDocId: string;
  const createdUserIds: string[] = [];
  const createdEmails: string[] = [];

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const manager = await prisma.user.create({
      data: {
        email: MANAGER_EMAIL,
        name: `Role Selector Manager E2E ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    managerId = manager.id;
    createdUserIds.push(managerId);

    const doc = await prisma.onboardingDocument.create({
      data: { title: `Role Selector Default Doc ${RUN_ID}`, assignByDefault: true, order: 9600 },
    });
    defaultDocId = doc.id;
  });

  test.afterAll(async () => {
    await prisma.onboardingAssignment.deleteMany({ where: { documentId: defaultDocId } });
    await prisma.onboardingDocument.delete({ where: { id: defaultDocId } });
    const byEmail = await prisma.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    const allIds = [...new Set([...createdUserIds, ...byEmail.map((u) => u.id)])];
    await prisma.onboardingAssignment.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.areaAccess.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: allIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allIds } } });
    await prisma.$disconnect();
  });

  test("ADMIN's role dropdown offers all five selectable roles, never ADMIN", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    const values = await page.$$eval('select[name="role"] option', (opts) =>
      opts.map((o) => (o as HTMLOptionElement).value)
    );
    expect(values.sort()).toEqual(
      ["OFFICE_ASSISTANT", "SALES_REP", "SERVICE_MANAGER", "TRAINEE", "TRAINER"].sort()
    );
    expect(values).not.toContain("ADMIN");
    await logout(page);
  });

  test("SERVICE_MANAGER's role dropdown offers only Trainee/Trainer/Sales Rep", async ({ page }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await openAddEmployeePanel(page);
    const values = await page.$$eval('select[name="role"] option', (opts) =>
      opts.map((o) => (o as HTMLOptionElement).value)
    );
    expect(values.sort()).toEqual(["SALES_REP", "TRAINEE", "TRAINER"].sort());
    await logout(page);
  });

  test("ADMIN can create a Sales Rep via the invite form, with no onboarding documents assigned", async ({
    page,
  }) => {
    const email = `rolesel-create-sr-${RUN_ID}@example.com`;
    createdEmails.push(email);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    await page.fill('input[name="name"]', "Create Sales Rep E2E");
    await page.fill('input[name="email"]', email);
    await page.selectOption('select[name="role"]', "SALES_REP");
    await singleInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
    await page.click('button:has-text("Create Invite")');
    await expect(page.getByText("Added to the roster")).toBeVisible();

    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(created.role).toBe("SALES_REP");
    const assignments = await prisma.onboardingAssignment.findMany({ where: { userId: created.id } });
    expect(assignments.length).toBe(0);
    await logout(page);
  });

  test("ADMIN can create a Service Manager and an Office Assistant via the invite form", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    for (const role of ["SERVICE_MANAGER", "OFFICE_ASSISTANT"] as const) {
      const email = `rolesel-create-${role.toLowerCase()}-${RUN_ID}@example.com`;
      createdEmails.push(email);
      await openAddEmployeePanel(page);
      await page.fill('input[name="name"]', `Create ${role} E2E`);
      await page.fill('input[name="email"]', email);
      await page.selectOption('select[name="role"]', role);
      await singleInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
      await page.click('button:has-text("Create Invite")');
      await expect(page.getByText("Added to the roster")).toBeVisible();

      const created = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(created.role).toBe(role);
      const assignments = await prisma.onboardingAssignment.findMany({ where: { userId: created.id } });
      expect(assignments.length).toBe(0);
    }
    await logout(page);
  });

  test("A Trainee invited the same way still gets the default onboarding documents", async ({ page }) => {
    const email = `rolesel-create-trainee-${RUN_ID}@example.com`;
    createdEmails.push(email);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    await page.fill('input[name="name"]', "Create Trainee E2E");
    await page.fill('input[name="email"]', email);
    await page.selectOption('select[name="role"]', "TRAINEE");
    await singleInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
    await page.click('button:has-text("Create Invite")');
    await expect(page.getByText("Added to the roster")).toBeVisible();

    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(created.role).toBe("TRAINEE");
    const assignments = await prisma.onboardingAssignment.findMany({ where: { userId: created.id } });
    expect(assignments.map((a) => a.documentId)).toContain(defaultDocId);
    await logout(page);
  });

  test("SERVICE_MANAGER tampering the dropdown to grant Service Manager or Office Assistant is refused — no account created", async ({
    page,
  }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    for (const attempted of ["SERVICE_MANAGER", "OFFICE_ASSISTANT", "ADMIN"]) {
      const email = `rolesel-sm-escalate-${attempted.toLowerCase()}-${RUN_ID}@example.com`;
      createdEmails.push(email);
      await openAddEmployeePanel(page);
      await page.fill('input[name="name"]', `SM Escalate ${attempted} E2E`);
      await page.fill('input[name="email"]', email);
      await selectRoleIncludingUnlisted(page, attempted);
      await singleInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
      await page.click('button:has-text("Create Invite")');
      await expect(page.getByText("You aren't authorized to assign that role.")).toBeVisible();
      await expect(page.getByText("Added to the roster")).toHaveCount(0);

      const created = await prisma.user.findUnique({ where: { email } });
      expect(created).toBeNull();
    }
    await logout(page);
  });

  test("ADMIN tampering the dropdown to grant ADMIN is refused — no account created", async ({ page }) => {
    const email = `rolesel-admin-escalate-${RUN_ID}@example.com`;
    createdEmails.push(email);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    await page.fill('input[name="name"]', "Admin Escalate E2E");
    await page.fill('input[name="email"]', email);
    await selectRoleIncludingUnlisted(page, "ADMIN");
    await singleInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
    await page.click('button:has-text("Create Invite")');
    await expect(page.getByText("You aren't authorized to assign that role.")).toBeVisible();
    await expect(page.getByText("Added to the roster")).toHaveCount(0);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).toBeNull();
    await logout(page);
  });

  test("An unrecognized role string on the single-invite form is refused — no account created", async ({
    page,
  }) => {
    const email = `rolesel-unknown-role-${RUN_ID}@example.com`;
    createdEmails.push(email);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    await page.fill('input[name="name"]', "Unknown Role E2E");
    await page.fill('input[name="email"]', email);
    await selectRoleIncludingUnlisted(page, "SUPERADMIN");
    await singleInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
    await page.click('button:has-text("Create Invite")');
    await expect(page.getByText("You aren't authorized to assign that role.")).toBeVisible();

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).toBeNull();
    const assignments = created ? await prisma.onboardingAssignment.findMany({ where: { userId: created.id } }) : [];
    expect(assignments.length).toBe(0);
    await logout(page);
  });

  test("Bulk CSV invite: Sales Rep role works for both ADMIN and SERVICE_MANAGER inviters, with no onboarding documents", async ({
    page,
  }) => {
    for (const [email, password] of [
      [ADMIN_EMAIL, ADMIN_PASSWORD],
      [MANAGER_EMAIL, MANAGER_PASSWORD],
    ]) {
      const rowEmail = `rolesel-csv-sr-${email === ADMIN_EMAIL ? "admin" : "mgr"}-${RUN_ID}@example.com`;
      createdEmails.push(rowEmail);
      await loginAs(page, email, password);
      await openAddEmployeePanel(page);
      const csv = `name,email,role\nCSV Sales Rep,${rowEmail},SALES_REP\n`;
      await page.setInputFiles('input[name="csvFile"]', {
        name: "reps.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
      await bulkInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
      await page.click('button:has-text("Upload & Create Invites")');
      await expect(page.getByText("Added to roster (no invite sent)")).toBeVisible();

      const created = await prisma.user.findUniqueOrThrow({ where: { email: rowEmail } });
      expect(created.role).toBe("SALES_REP");
      const assignments = await prisma.onboardingAssignment.findMany({ where: { userId: created.id } });
      expect(assignments.length).toBe(0);
      await logout(page);
    }
  });

  test("Bulk CSV invite: SERVICE_MANAGER cannot grant Service Manager or Office Assistant via a CSV row — the row is rejected, nothing created", async ({
    page,
  }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);

    for (const attempted of ["SERVICE_MANAGER", "OFFICE_ASSISTANT"]) {
      const rowEmail = `rolesel-csv-sm-escalate-${attempted.toLowerCase()}-${RUN_ID}@example.com`;
      createdEmails.push(rowEmail);
      await openAddEmployeePanel(page);
      const csv = `name,email,role\nCSV Escalate ${attempted},${rowEmail},${attempted}\n`;
      await page.setInputFiles('input[name="csvFile"]', {
        name: "escalate.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
      await bulkInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
      await page.click('button:has-text("Upload & Create Invites")');
      await expect(
        page.getByText(`"${attempted}" isn't a role you're authorized to assign`)
      ).toBeVisible();
      await expect(page.getByText("Added to roster (no invite sent)")).toHaveCount(0);

      const created = await prisma.user.findUnique({ where: { email: rowEmail } });
      expect(created).toBeNull();
    }
    await logout(page);
  });

  test("Bulk CSV invite: an unrecognized role string rejects just that row, nothing created", async ({
    page,
  }) => {
    const rowEmail = `rolesel-csv-unknown-role-${RUN_ID}@example.com`;
    createdEmails.push(rowEmail);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    const csv = `name,email,role\nCSV Unknown Role,${rowEmail},SUPERADMIN\n`;
    await page.setInputFiles('input[name="csvFile"]', {
      name: "unknown-role.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await bulkInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
    await page.click('button:has-text("Upload & Create Invites")');
    await expect(page.getByText(`"SUPERADMIN" isn't a role you're authorized to assign`)).toBeVisible();

    const created = await prisma.user.findUnique({ where: { email: rowEmail } });
    expect(created).toBeNull();
    await logout(page);
  });

  test("Bulk CSV invite: ADMIN *can* grant Service Manager via a CSV row", async ({ page }) => {
    const rowEmail = `rolesel-csv-admin-sm-${RUN_ID}@example.com`;
    createdEmails.push(rowEmail);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAddEmployeePanel(page);
    const csv = `name,email,role\nCSV Admin SM,${rowEmail},SERVICE_MANAGER\n`;
    await page.setInputFiles('input[name="csvFile"]', {
      name: "admin-sm.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await bulkInviteForm(page).locator('input[name="sendInviteNow"]').uncheck();
    await page.click('button:has-text("Upload & Create Invites")');
    await expect(page.getByText("Added to roster (no invite sent)")).toBeVisible();

    const created = await prisma.user.findUniqueOrThrow({ where: { email: rowEmail } });
    expect(created.role).toBe("SERVICE_MANAGER");
    await logout(page);
  });

  test("Sales Reps are listed in their own Staff directory section, with Manage Access for ADMIN, and not shown as technicians", async ({
    page,
  }) => {
    const rep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Directory Sales Rep E2E ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date("2024-06-01"),
      },
    });
    createdUserIds.push(rep.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");

    const salesRepsSection = page.locator("h2", { hasText: "Sales Reps" }).locator("..");
    const repRow = salesRepsSection.locator("tr", { has: page.getByText(rep.name) });
    await expect(repRow).toBeVisible();
    await expect(repRow.getByRole("link", { name: "Manage Access →" })).toBeVisible();

    // Not folded into the technician Staff Directory table above it (that
    // table's rows are each a Link with the person's name as its text).
    const technicianDirectoryLink = page.getByRole("link", { name: rep.name });
    await expect(technicianDirectoryLink).toHaveCount(0);

    await logout(page);
  });

  test("Sales Reps are excluded from technician pairing/training-candidate and checklist-assignee pools", async () => {
    const rep = await prisma.user.findUniqueOrThrow({ where: { email: SALES_REP_EMAIL } });

    const pairingCandidates = await getPairingCandidates("nonexistent-exclude-id");
    expect(pairingCandidates.map((c) => c.id)).not.toContain(rep.id);

    const trainerCandidates = await getTrainerCandidates();
    expect(trainerCandidates.map((c) => c.id)).not.toContain(rep.id);

    // A Sales Rep CAN be handed a to-do checklist task, same as every other
    // non-Admin role — this pool is deliberately broader than the
    // technician-only lists above.
    const checklistCandidates = await getChecklistAssigneeCandidates();
    expect(checklistCandidates.map((c) => c.id)).toContain(rep.id);
  });

  test("Sales access None/View/Edit works for a Sales Rep exactly like any other granted role", async ({
    page,
  }) => {
    const rep = await prisma.user.findUniqueOrThrow({ where: { email: SALES_REP_EMAIL } });

    // NONE (default, no DepartmentAccess row): redirected away from Sales.
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");
    await expect(page).toHaveURL("/");
    await logout(page);

    // VIEW: can see the lead pipeline, but no "Add Lead" / "Form Settings" edit controls.
    await prisma.departmentAccess.upsert({
      where: { userId_department: { userId: rep.id, department: "SALES" } },
      create: { userId: rep.id, department: "SALES", canEdit: false },
      update: { canEdit: false },
    });
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");
    await expect(page).toHaveURL("/sales/leads");
    // A Sales Rep gets the Callbacks-first "Leads & Callbacks" view (see the
    // sales-rep corrections suite) rather than the pipeline board every
    // other granted role sees — same access gating, different page for her.
    await expect(page.getByRole("heading", { name: "Leads & Callbacks", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add Lead" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Form Settings" })).toHaveCount(0);
    await logout(page);

    // EDIT: the edit controls appear.
    await prisma.departmentAccess.update({
      where: { userId_department: { userId: rep.id, department: "SALES" } },
      data: { canEdit: true },
    });
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");
    await expect(page.getByRole("button", { name: "+ Add Lead" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Form Settings" })).toBeVisible();
    await logout(page);

    await prisma.departmentAccess.deleteMany({ where: { userId: rep.id, department: "SALES" } });
  });

  test("Navigation only shows a Sales department link once Sales access is actually granted", async ({
    page,
  }) => {
    const rep = await prisma.user.findUniqueOrThrow({ where: { email: SALES_REP_EMAIL } });

    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await expect(page.getByRole("link", { name: "Sales" })).toHaveCount(0);
    await logout(page);

    await prisma.departmentAccess.upsert({
      where: { userId_department: { userId: rep.id, department: "SALES" } },
      create: { userId: rep.id, department: "SALES", canEdit: false },
      update: { canEdit: false },
    });
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await expect(page.getByRole("link", { name: "Sales" }).first()).toBeVisible();
    await logout(page);

    await prisma.departmentAccess.deleteMany({ where: { userId: rep.id, department: "SALES" } });
  });

  test("SERVICE_MANAGER cannot reach the Permissions screen at all", async ({ page }) => {
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto("/admin/permissions");
    await expect(page).toHaveURL("/");
    await logout(page);
  });

  test("ADMIN can change an existing user's role to Sales Rep on the Permissions screen", async ({ page }) => {
    const target = await prisma.user.create({
      data: {
        email: `rolesel-permchange-${RUN_ID}@example.com`,
        name: `Permissions Role Change E2E ${RUN_ID}`,
        role: "TRAINER",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
      },
    });
    createdUserIds.push(target.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    const row = page.locator("tr", { has: page.getByText(target.email) });
    await row.locator('select').first().selectOption("SALES_REP");
    await page.waitForTimeout(500);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.role).toBe("SALES_REP");
    await logout(page);
  });

  test("A stale DepartmentAccess Sales grant from a prior role is never reactivated by a role change to Office Assistant", async ({
    page,
  }) => {
    const target = await prisma.user.create({
      data: {
        email: `rolesel-stale-grant-${RUN_ID}@example.com`,
        name: `Stale Grant E2E ${RUN_ID}`,
        role: "TRAINER",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
      },
    });
    createdUserIds.push(target.id);
    await prisma.departmentAccess.create({
      data: { userId: target.id, department: "SALES", canEdit: true },
    });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    const row = page.locator("tr", { has: page.getByText(target.email) });
    await row.locator('select').first().selectOption("OFFICE_ASSISTANT");
    await page.waitForTimeout(500);
    await logout(page);

    // Stale DepartmentAccess row still exists in the DB (never deleted by a
    // role change — same as every other existing role transition), but
    // getAreaAccessForUser only ever reads AreaAccess for OFFICE_ASSISTANT,
    // so it must grant nothing.
    const staleRow = await prisma.departmentAccess.findUnique({
      where: { userId_department: { userId: target.id, department: "SALES" } },
    });
    expect(staleRow).not.toBeNull();

    await loginAs(page, target.email, "Test-Password-123!");
    await page.goto("/sales/leads");
    await expect(page).toHaveURL("/");
    await logout(page);
  });

  test("A forged direct call to updateUserRoleAction from a SERVICE_MANAGER session is rejected", async ({
    page,
  }) => {
    const target = await prisma.user.create({
      data: {
        email: `rolesel-forge-target-${RUN_ID}@example.com`,
        name: `Forge Target E2E ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
      },
    });
    createdUserIds.push(target.id);

    // Capture updateUserRoleAction's real action id via a legitimate ADMIN
    // role change on a disposable second target, then replay it against the
    // first target while authenticated as a SERVICE_MANAGER.
    const throwaway = await prisma.user.create({
      data: {
        email: `rolesel-forge-throwaway-${RUN_ID}@example.com`,
        name: `Forge Throwaway E2E ${RUN_ID}`,
        role: "TRAINER",
        passwordHash: await hashPassword("Test-Password-123!"),
        mustSetPassword: false,
        active: true,
      },
    });
    createdUserIds.push(throwaway.id);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    const row = page.locator("tr", { has: page.getByText(throwaway.email) });
    const actionId = await captureActionId(page, async () => {
      await row.locator("select").first().selectOption("SALES_REP");
    });
    await logout(page);

    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await forgeAction(page, "/admin/permissions", actionId, [target.id, "SERVICE_MANAGER"]);
    await logout(page);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.role).toBe("TRAINEE");
  });
});

test.describe("Role selector + Sales Rep role (direct library calls)", () => {
  test("getAssignableRolesForInviter enforces the ADMIN vs SERVICE_MANAGER boundary, never offers ADMIN to anyone", () => {
    expect(getAssignableRolesForInviter("ADMIN").sort()).toEqual(
      ["OFFICE_ASSISTANT", "SALES_REP", "SERVICE_MANAGER", "TRAINEE", "TRAINER"].sort()
    );
    expect(getAssignableRolesForInviter("SERVICE_MANAGER").sort()).toEqual(
      ["SALES_REP", "TRAINEE", "TRAINER"].sort()
    );
    expect(getAssignableRolesForInviter("TRAINEE")).toEqual([]);
    expect(getAssignableRolesForInviter("TRAINER")).toEqual([]);
    expect(getAssignableRolesForInviter("OFFICE_ASSISTANT")).toEqual([]);
    expect(getAssignableRolesForInviter("SALES_REP")).toEqual([]);

    for (const role of ["ADMIN", "SERVICE_MANAGER", "TRAINEE", "TRAINER", "OFFICE_ASSISTANT", "SALES_REP"] as const) {
      expect(getAssignableRolesForInviter(role)).not.toContain("ADMIN");
    }
  });
});
