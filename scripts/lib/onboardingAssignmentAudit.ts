import type { PrismaClient } from "@prisma/client";

// "Default technician document" = an OnboardingAssignment whose document
// has assignByDefault: true — that's the only signal the data model has
// for "part of the Cleaning Technician onboarding packet" (see
// assignDefaultOnboardingDocuments in src/lib/onboarding.ts). An assignment
// is only ever considered erroneous here if it's BOTH for a default
// document AND still unsigned — a signed one is a real, completed record
// regardless of the user's current role, and is never touched.
export interface AuditedAssignmentRow {
  id: string;
  documentId: string;
  documentTitle: string;
  userId: string;
  signedAt: string | null;
  signedName: string | null;
  signedPdfDataUrl: string | null;
  createdAt: string;
}

export interface OnboardingAssignmentSnapshot {
  generatedAt: string;
  userId: string;
  user: { email: string; name: string; role: string; createdAt: string } | null;
  criteria: string;
  rows: AuditedAssignmentRow[];
}

export async function findErroneousDefaultAssignments(
  prisma: PrismaClient,
  userId: string
): Promise<AuditedAssignmentRow[]> {
  const rows = await prisma.onboardingAssignment.findMany({
    where: { userId, signedAt: null, document: { assignByDefault: true } },
    include: { document: { select: { title: true } } },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    documentTitle: r.document.title,
    userId: r.userId,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    signedName: r.signedName,
    signedPdfDataUrl: r.signedPdfDataUrl,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function buildSnapshot(
  prisma: PrismaClient,
  userId: string,
  rows: AuditedAssignmentRow[]
): Promise<OnboardingAssignmentSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, role: true, createdAt: true },
  });

  return {
    generatedAt: new Date().toISOString(),
    userId,
    user: user
      ? { email: user.email, name: user.name, role: user.role, createdAt: user.createdAt.toISOString() }
      : null,
    criteria: "document.assignByDefault = true AND signedAt IS NULL",
    rows,
  };
}

export interface CleanupResult {
  deleted: string[];
  skipped: Array<{ id: string; reason: string }>;
}

// Re-verifies every row against the LIVE database immediately before
// deleting it — never trusts the snapshot alone. A row that's since been
// signed, had its document un-marked assignByDefault, or no longer exists
// is skipped rather than deleted, so this can never destroy something that
// stopped being erroneous after the snapshot was taken.
export async function deleteAssignmentsFromSnapshot(
  prisma: PrismaClient,
  snapshot: OnboardingAssignmentSnapshot,
  { confirm }: { confirm: boolean }
): Promise<CleanupResult> {
  if (!confirm) {
    throw new Error("Refusing to delete without explicit confirm:true (pass --confirm on the CLI).");
  }

  const deleted: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const row of snapshot.rows) {
    const live = await prisma.onboardingAssignment.findUnique({
      where: { id: row.id },
      include: { document: { select: { assignByDefault: true } } },
    });
    if (!live) {
      skipped.push({ id: row.id, reason: "no longer exists" });
      continue;
    }
    if (live.userId !== snapshot.userId) {
      skipped.push({ id: row.id, reason: "userId no longer matches the snapshot — never touching another user's row" });
      continue;
    }
    if (live.signedAt) {
      skipped.push({ id: row.id, reason: "now signed — no longer erroneous" });
      continue;
    }
    if (!live.document.assignByDefault) {
      skipped.push({ id: row.id, reason: "document is no longer assignByDefault" });
      continue;
    }
    await prisma.onboardingAssignment.delete({ where: { id: row.id } });
    deleted.push(row.id);
  }

  return { deleted, skipped };
}

export interface RestoreResult {
  restored: string[];
  skipped: string[];
}

// Re-creates rows exactly as captured in the snapshot, including their
// original id/createdAt — a full undo of deleteAssignmentsFromSnapshot.
// skipDuplicates means re-running restore is harmless if some rows were
// never actually deleted (or already restored).
export async function restoreAssignmentsFromSnapshot(
  prisma: PrismaClient,
  snapshot: OnboardingAssignmentSnapshot
): Promise<RestoreResult> {
  const existingIds = new Set(
    (
      await prisma.onboardingAssignment.findMany({
        where: { id: { in: snapshot.rows.map((r) => r.id) } },
        select: { id: true },
      })
    ).map((r) => r.id)
  );

  const toRestore = snapshot.rows.filter((r) => !existingIds.has(r.id));
  if (toRestore.length) {
    await prisma.onboardingAssignment.createMany({
      data: toRestore.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        userId: r.userId,
        signedAt: r.signedAt ? new Date(r.signedAt) : null,
        signedName: r.signedName,
        signedPdfDataUrl: r.signedPdfDataUrl,
        createdAt: new Date(r.createdAt),
      })),
      skipDuplicates: true,
    });
  }

  return {
    restored: toRestore.map((r) => r.id),
    skipped: snapshot.rows.filter((r) => existingIds.has(r.id)).map((r) => r.id),
  };
}
