import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

// Only TRAINEEs go through onboarding paperwork before training — staff
// (Admin/Trainer/Service Manager) previewing /modules etc. are never gated.
export async function getPendingOnboardingCount(userId: string): Promise<number> {
  return prisma.onboardingAssignment.count({ where: { userId, signedAt: null } });
}

// Called right after a new employee is created (single or bulk invite) so
// they land on the documents they're supposed to sign without Shar having
// to manually assign each one after every invite.
//
// Default documents are the Cleaning Technician onboarding packet —
// TRAINEE only. Every current caller already checks the new user's role
// before calling this, but that check lived at each call site rather than
// here, which is exactly how a Trainee-created-then-switched-to-Office-
// Assistant account (or any future direct non-Trainee creation path) could
// end up with technician paperwork assigned: whoever writes the next
// caller has to remember to re-add the same guard. Checking the role here
// too makes it structurally impossible to call this for a non-Trainee,
// regardless of what any caller does or forgets.
export async function assignDefaultOnboardingDocuments(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "TRAINEE") return;

  const defaults = await prisma.onboardingDocument.findMany({
    where: { assignByDefault: true },
    select: { id: true },
  });
  if (!defaults.length) return;
  await prisma.onboardingAssignment.createMany({
    data: defaults.map((d) => ({ documentId: d.id, userId })),
    skipDuplicates: true,
  });
}

// Shared by both "create a default-assigned document" paths (single and
// bulk upload) in src/app/(portal)/admin/documents/actions.ts — assigning a
// newly-marked-default document to every *current* Trainee, not just future
// invites. Centralized here (rather than each call site re-querying
// `role: "TRAINEE"` itself) so this backfill can't drift from
// assignDefaultOnboardingDocuments' own TRAINEE-only rule.
export async function backfillDefaultDocumentToTrainees(documentId: string): Promise<void> {
  const trainees = await prisma.user.findMany({ where: { role: "TRAINEE" }, select: { id: true } });
  if (!trainees.length) return;
  await prisma.onboardingAssignment.createMany({
    data: trainees.map((u) => ({ documentId, userId: u.id })),
    skipDuplicates: true,
  });
}

// Call at the top of any Trainee-facing training page (modules, lessons,
// quiz, progress, glossary) — redirects to /documents if anything assigned
// to them is still unsigned. A no-op for any role other than TRAINEE.
export async function requireOnboardingComplete(session: SessionPayload | null) {
  if (!session || session.role !== "TRAINEE") return;
  const pending = await getPendingOnboardingCount(session.sub);
  if (pending > 0) redirect("/documents");
}

export interface OnboardingDocSummary {
  assignmentId: string;
  documentId: string;
  title: string;
  order: number;
  signedAt: Date | null;
  signedName: string | null;
}

export async function getOnboardingDocumentsForUser(userId: string): Promise<OnboardingDocSummary[]> {
  const assignments = await prisma.onboardingAssignment.findMany({
    where: { userId },
    include: { document: { select: { title: true, order: true } } },
    orderBy: { document: { order: "asc" } },
  });
  return assignments.map((a) => ({
    assignmentId: a.id,
    documentId: a.documentId,
    title: a.document.title,
    order: a.document.order,
    signedAt: a.signedAt,
    signedName: a.signedName,
  }));
}

export interface OnboardingAssignmentDetail {
  assignmentId: string;
  documentId: string;
  title: string;
  contentText: string | null;
  fileDataUrl: string | null;
  fileName: string | null;
  signedAt: Date | null;
  signedName: string | null;
  signedPdfDataUrl: string | null;
}

// Returns null if the assignment doesn't exist or doesn't belong to this
// user — callers should notFound() in that case, not leak whose it is.
export async function getOnboardingAssignmentDetail(
  assignmentId: string,
  userId: string
): Promise<OnboardingAssignmentDetail | null> {
  const assignment = await prisma.onboardingAssignment.findUnique({
    where: { id: assignmentId },
    include: { document: true },
  });
  if (!assignment || assignment.userId !== userId) return null;

  return {
    assignmentId: assignment.id,
    documentId: assignment.documentId,
    title: assignment.document.title,
    contentText: assignment.document.contentText,
    fileDataUrl: assignment.document.fileDataUrl,
    fileName: assignment.document.fileName,
    signedAt: assignment.signedAt,
    signedName: assignment.signedName,
    signedPdfDataUrl: assignment.signedPdfDataUrl,
  };
}
