import type { PrismaClient } from "@prisma/client";

// "Default technician document" = an OnboardingAssignment whose document
// has assignByDefault: true — that's the only signal the data model has
// for "part of the Cleaning Technician onboarding packet" (see
// assignDefaultOnboardingDocuments in src/lib/onboarding.ts). An assignment
// is only ever considered erroneous here if it's BOTH for a default
// document AND still unsigned — a signed one is a real, completed record
// regardless of the user's current role, and is never touched.
//
// Critically, an unsigned default-document assignment is only erroneous
// for a user who ISN'T (currently) a TRAINEE — for an actual Trainee it's
// exactly the legitimate, in-progress Cleaning Technician onboarding packet
// assignDefaultOnboardingDocuments is supposed to assign. Both
// findErroneousDefaultAssignments (the audit) and
// deleteAssignmentsFromSnapshot (the cleanup) refuse outright — nothing
// deleted, no per-row skipping — the moment the LIVE role is TRAINEE, and
// cleanup re-checks that live role itself rather than trusting whatever
// role a saved snapshot recorded, so a snapshot taken while the user held
// a different role (or a stale/forged one) can never be used to delete a
// now-Trainee's real onboarding documents.
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "TRAINEE") {
    throw new Error(
      `User ${userId} is currently a TRAINEE — their unsigned default-document assignments are the legitimate onboarding packet, not erroneous. Refusing to audit.`
    );
  }

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

  // Re-check the LIVE role, never the role a snapshot happened to record —
  // a user who is (or became) a TRAINEE again by the time cleanup actually
  // runs must not have their now-legitimate onboarding documents deleted,
  // whether the snapshot is simply stale (taken before a later role
  // change) or was saved/edited to say something else entirely. Refuses
  // the whole run rather than skipping row-by-row, so nothing from this
  // snapshot is ever deleted for a currently-Trainee user.
  const liveUser = await prisma.user.findUnique({ where: { id: snapshot.userId }, select: { role: true } });
  if (liveUser?.role === "TRAINEE") {
    throw new Error(
      `User ${snapshot.userId} is currently a TRAINEE — refusing to delete any assignment from this snapshot.`
    );
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
