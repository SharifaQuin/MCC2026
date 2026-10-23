import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { hashPassword } from "../src/lib/password";
import { assignDefaultOnboardingDocuments, backfillDefaultDocumentToTrainees } from "../src/lib/onboarding";
import {
  findErroneousDefaultAssignments,
  buildSnapshot,
  deleteAssignmentsFromSnapshot,
  restoreAssignmentsFromSnapshot,
  type AuditedAssignmentRow,
} from "../scripts/lib/onboardingAssignmentAudit";

const CLI_PATH = path.join(__dirname, "..", "scripts", "onboardingAssignmentCleanup.ts");
function runCli(args: string[]) {
  return spawnSync("npx", ["tsx", CLI_PATH, ...args], { encoding: "utf-8" });
}

// Covers the fix for Pedro Paez's account (created as TRAINEE — the only
// roles Staff > Add Employee offers — then switched to OFFICE_ASSISTANT,
// leaving the default Cleaning Technician onboarding packet assigned to
// him): assignDefaultOnboardingDocuments and backfillDefaultDocumentToTrainees
// (src/lib/onboarding.ts) now only ever target TRAINEE, no matter what a
// caller does or forgets, and the audit/cleanup/restore tooling
// (scripts/lib/onboardingAssignmentAudit.ts) only ever removes verified
// unsigned default-document rows, leaving signed rows, unrelated
// assignments, and every other user's rows untouched. Library calls talk
// to Prisma directly — no browser needed for those — except the role-change
// regression test, which drives the real Permissions screen UI. Fixtures
// are tagged with a unique run id and removed in afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function makeUser(role: "TRAINEE" | "TRAINER" | "SERVICE_MANAGER" | "OFFICE_ASSISTANT" | "ADMIN", label: string) {
  return prisma.user.create({
    data: {
      email: `onb-guard-${label}-${RUN_ID}@example.com`,
      name: `Onb Guard ${label} ${RUN_ID}`,
      role,
      active: true,
    },
  });
}

test.describe.serial("Onboarding-assignment TRAINEE-only guard", () => {
  let defaultDocId: string;
  const createdUserIds: string[] = [];

  test.beforeAll(async () => {
    const doc = await prisma.onboardingDocument.create({
      data: { title: `Guard Test Default Doc ${RUN_ID}`, assignByDefault: true, order: 9500 },
    });
    defaultDocId = doc.id;
  });

  test.afterAll(async () => {
    await prisma.onboardingAssignment.deleteMany({ where: { documentId: defaultDocId } });
    await prisma.onboardingDocument.delete({ where: { id: defaultDocId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  test("assignDefaultOnboardingDocuments assigns a Trainee but no-ops for every other role", async () => {
    const trainee = await makeUser("TRAINEE", "trainee");
    const officeAssistant = await makeUser("OFFICE_ASSISTANT", "oa");
    const trainer = await makeUser("TRAINER", "trainer");
    const manager = await makeUser("SERVICE_MANAGER", "manager");
    const admin = await makeUser("ADMIN", "admin");
    createdUserIds.push(trainee.id, officeAssistant.id, trainer.id, manager.id, admin.id);

    await assignDefaultOnboardingDocuments(trainee.id);
    await assignDefaultOnboardingDocuments(officeAssistant.id);
    await assignDefaultOnboardingDocuments(trainer.id);
    await assignDefaultOnboardingDocuments(manager.id);
    await assignDefaultOnboardingDocuments(admin.id);

    const counts = await prisma.onboardingAssignment.groupBy({
      by: ["userId"],
      where: { documentId: defaultDocId, userId: { in: createdUserIds } },
      _count: true,
    });
    const byUser = Object.fromEntries(counts.map((c) => [c.userId, c._count]));

    expect(byUser[trainee.id]).toBe(1);
    expect(byUser[officeAssistant.id]).toBeUndefined();
    expect(byUser[trainer.id]).toBeUndefined();
    expect(byUser[manager.id]).toBeUndefined();
    expect(byUser[admin.id]).toBeUndefined();
  });

  test("backfillDefaultDocumentToTrainees only assigns current Trainees", async () => {
    const trainee = await makeUser("TRAINEE", "backfill-trainee");
    const officeAssistant = await makeUser("OFFICE_ASSISTANT", "backfill-oa");
    createdUserIds.push(trainee.id, officeAssistant.id);

    const freshDoc = await prisma.onboardingDocument.create({
      data: { title: `Guard Backfill Doc ${RUN_ID}`, assignByDefault: true, order: 9501 },
    });

    await backfillDefaultDocumentToTrainees(freshDoc.id);

    const assignments = await prisma.onboardingAssignment.findMany({ where: { documentId: freshDoc.id } });
    const assignedUserIds = assignments.map((a) => a.userId);
    expect(assignedUserIds).toContain(trainee.id);
    expect(assignedUserIds).not.toContain(officeAssistant.id);

    await prisma.onboardingAssignment.deleteMany({ where: { documentId: freshDoc.id } });
    await prisma.onboardingDocument.delete({ where: { id: freshDoc.id } });
  });

  test("Changing a user's role on the Permissions screen does not delete their existing onboarding assignments", async ({
    page,
  }) => {
    const user = await makeUser("TRAINEE", "rolechange");
    createdUserIds.push(user.id);
    await assignDefaultOnboardingDocuments(user.id);
    const before = await prisma.onboardingAssignment.count({ where: { userId: user.id } });
    expect(before).toBe(1);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/permissions");
    const row = page.locator("tr", { hasText: user.email });
    await row.locator("select").first().selectOption("OFFICE_ASSISTANT");
    await page.waitForTimeout(500);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.role).toBe("OFFICE_ASSISTANT");

    const after = await prisma.onboardingAssignment.count({ where: { userId: user.id } });
    expect(after).toBe(1);
  });

  test("Audit/cleanup/restore: removes only the verified unsigned default rows, preserves signed/unrelated/other-users' rows, and is fully reversible", async () => {
    const pedroLike = await makeUser("OFFICE_ASSISTANT", "pedrolike");
    const otherUser = await makeUser("TRAINEE", "bystander");
    createdUserIds.push(pedroLike.id, otherUser.id);

    const nonDefaultDoc = await prisma.onboardingDocument.create({
      data: { title: `Guard Unrelated Doc ${RUN_ID}`, assignByDefault: false, order: 9502 },
    });

    const unsigned = await prisma.onboardingAssignment.create({
      data: { documentId: defaultDocId, userId: pedroLike.id },
    });
    const signed = await prisma.onboardingAssignment.create({
      data: {
        documentId: defaultDocId,
        userId: otherUser.id,
        signedAt: new Date(),
        signedName: "Bystander",
      },
    });
    const unrelated = await prisma.onboardingAssignment.create({
      data: { documentId: nonDefaultDoc.id, userId: pedroLike.id },
    });
    // The bystander already holds a signed row on defaultDocId above, so
    // their own unsigned default row needs a second default document.
    const secondDefaultDoc = await prisma.onboardingDocument.create({
      data: { title: `Guard Second Default Doc ${RUN_ID}`, assignByDefault: true, order: 9503 },
    });
    const otherUsersUnsigned = await prisma.onboardingAssignment.create({
      data: { documentId: secondDefaultDoc.id, userId: otherUser.id },
    });

    const found = await findErroneousDefaultAssignments(prisma, pedroLike.id);
    expect(found.map((r) => r.id)).toEqual([unsigned.id]);

    const snapshot = await buildSnapshot(prisma, pedroLike.id, found);
    expect(snapshot.rows.length).toBe(1);

    const cleanupResult = await deleteAssignmentsFromSnapshot(prisma, snapshot, { confirm: true });
    expect(cleanupResult.deleted).toEqual([unsigned.id]);
    expect(cleanupResult.skipped).toEqual([]);

    // Deleted.
    expect(await prisma.onboardingAssignment.findUnique({ where: { id: unsigned.id } })).toBeNull();
    // Preserved: signed (even though for a Trainee it's irrelevant here —
    // the point is signedAt gates it), unrelated, and the other user's own
    // unsigned default row.
    expect(await prisma.onboardingAssignment.findUnique({ where: { id: signed.id } })).not.toBeNull();
    expect(await prisma.onboardingAssignment.findUnique({ where: { id: unrelated.id } })).not.toBeNull();
    expect(await prisma.onboardingAssignment.findUnique({ where: { id: otherUsersUnsigned.id } })).not.toBeNull();

    // cleanup refuses to run without confirm:true.
    await expect(deleteAssignmentsFromSnapshot(prisma, snapshot, { confirm: false })).rejects.toThrow();

    const restoreResult = await restoreAssignmentsFromSnapshot(prisma, snapshot);
    expect(restoreResult.restored).toEqual([unsigned.id]);
    const restored = await prisma.onboardingAssignment.findUnique({ where: { id: unsigned.id } });
    expect(restored).not.toBeNull();
    expect(restored?.userId).toBe(pedroLike.id);
    expect(restored?.documentId).toBe(defaultDocId);
    expect(restored?.signedAt).toBeNull();

    await prisma.onboardingAssignment.deleteMany({ where: { documentId: { in: [nonDefaultDoc.id, secondDefaultDoc.id] } } });
    await prisma.onboardingDocument.deleteMany({ where: { id: { in: [nonDefaultDoc.id, secondDefaultDoc.id] } } });
  });

  test("Audit and cleanup both refuse for an active Trainee, preserving all of their assignments", async () => {
    const trainee = await makeUser("TRAINEE", "active-trainee");
    createdUserIds.push(trainee.id);
    // The normal, legitimate path — exactly what the onboarding guard is
    // supposed to produce for a real Trainee.
    await assignDefaultOnboardingDocuments(trainee.id);
    const assignment = await prisma.onboardingAssignment.findFirstOrThrow({
      where: { userId: trainee.id, documentId: defaultDocId },
    });

    // Audit itself refuses — it never even gets to list this as
    // "erroneous", let alone write a snapshot of it.
    await expect(findErroneousDefaultAssignments(prisma, trainee.id)).rejects.toThrow(/TRAINEE/);

    // Cleanup refuses independently too, even given a snapshot that
    // someone assembled some other way (e.g. a hand-edited file, or one
    // from before this guard existed) rather than through the now-guarded
    // audit function above.
    const forgedRow: AuditedAssignmentRow = {
      id: assignment.id,
      documentId: assignment.documentId,
      documentTitle: "Guard Test Default Doc",
      userId: trainee.id,
      signedAt: null,
      signedName: null,
      signedPdfDataUrl: null,
      createdAt: assignment.createdAt.toISOString(),
    };
    const forgedSnapshot = await buildSnapshot(prisma, trainee.id, [forgedRow]);
    await expect(deleteAssignmentsFromSnapshot(prisma, forgedSnapshot, { confirm: true })).rejects.toThrow(/TRAINEE/);

    // Nothing was deleted by either attempt.
    const stillThere = await prisma.onboardingAssignment.findUnique({ where: { id: assignment.id } });
    expect(stillThere).not.toBeNull();

    // The real CLI entry point refuses the same way — a clear message,
    // non-zero exit, and (since it never gets past the audit call) no
    // snapshot file written.
    const cliResult = runCli(["audit", trainee.id]);
    expect(cliResult.status).not.toBe(0);
    expect(cliResult.stderr).toMatch(/TRAINEE/);
  });

  test("Cleanup refuses if the user became a Trainee after the snapshot was created", async () => {
    // Pedro-like at audit time: a real erroneous row, found and
    // snapshotted while NOT a Trainee.
    const user = await makeUser("OFFICE_ASSISTANT", "became-trainee");
    createdUserIds.push(user.id);
    const erroneous = await prisma.onboardingAssignment.create({
      data: { documentId: defaultDocId, userId: user.id },
    });

    const found = await findErroneousDefaultAssignments(prisma, user.id);
    expect(found.map((r) => r.id)).toEqual([erroneous.id]);
    const snapshot = await buildSnapshot(prisma, user.id, found);
    expect(snapshot.user?.role).toBe("OFFICE_ASSISTANT");

    // The user is switched back to TRAINEE before cleanup ever runs —
    // e.g. a corrected role assignment, or simply time passing between the
    // audit and the cleanup step. The snapshot still says OFFICE_ASSISTANT;
    // only the LIVE role must decide this.
    await prisma.user.update({ where: { id: user.id }, data: { role: "TRAINEE" } });

    await expect(deleteAssignmentsFromSnapshot(prisma, snapshot, { confirm: true })).rejects.toThrow(/TRAINEE/);

    const stillThere = await prisma.onboardingAssignment.findUnique({ where: { id: erroneous.id } });
    expect(stillThere).not.toBeNull();
  });
});
