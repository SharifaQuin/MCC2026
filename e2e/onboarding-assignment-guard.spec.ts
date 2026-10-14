import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { assignDefaultOnboardingDocuments, backfillDefaultDocumentToTrainees } from "../src/lib/onboarding";
import {
  findErroneousDefaultAssignments,
  buildSnapshot,
  deleteAssignmentsFromSnapshot,
  restoreAssignmentsFromSnapshot,
} from "../scripts/lib/onboardingAssignmentAudit";

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
});
