"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { autoDetectPdfFields } from "@/lib/pdfFieldDetect";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

interface FieldColumns {
  sigFieldPage: number | null;
  sigFieldX: number | null;
  sigFieldY: number | null;
  dateFieldPage: number | null;
  dateFieldX: number | null;
  dateFieldY: number | null;
  fieldsAutoDetected: boolean;
}

// Runs once at upload time (and again whenever the file changes) so the sign
// flow can stamp the name/date directly onto the document, not just a
// trailing certificate page. Best-effort: a PDF pdfjs can't parse, or one
// with no recognizable Signature/Date labels (e.g. an informational
// pamphlet), simply gets no on-document fields — the certificate page still
// covers it.
async function detectFieldColumns(fileDataUrl: string): Promise<FieldColumns> {
  const empty: FieldColumns = {
    sigFieldPage: null,
    sigFieldX: null,
    sigFieldY: null,
    dateFieldPage: null,
    dateFieldX: null,
    dateFieldY: null,
    fieldsAutoDetected: false,
  };
  try {
    const base64 = fileDataUrl.split(",")[1];
    if (!base64) return empty;
    const bytes = Buffer.from(base64, "base64");
    const { signature, date } = await autoDetectPdfFields(bytes);
    return {
      sigFieldPage: signature?.page ?? null,
      sigFieldX: signature?.x ?? null,
      sigFieldY: signature?.y ?? null,
      dateFieldPage: date?.page ?? null,
      dateFieldX: date?.x ?? null,
      dateFieldY: date?.y ?? null,
      fieldsAutoDetected: true,
    };
  } catch {
    return empty;
  }
}

export async function createOnboardingDocumentAction(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const contentText = String(formData.get("contentText") ?? "").trim();
  const fileDataUrl = String(formData.get("fileDataUrl") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim();
  const assignByDefault = formData.get("assignByDefault") === "on";

  const count = await prisma.onboardingDocument.count();
  const fieldColumns = fileDataUrl ? await detectFieldColumns(fileDataUrl) : null;
  const doc = await prisma.onboardingDocument.create({
    data: {
      title,
      contentText: contentText || null,
      fileDataUrl: fileDataUrl || null,
      fileName: fileName || null,
      assignByDefault,
      order: count + 1,
      ...fieldColumns,
    },
  });

  // Backfill: if this document is meant to apply to everyone by default,
  // assign it to every existing employee too, not just future invites.
  if (assignByDefault) {
    const users = await prisma.user.findMany({ where: { role: "TRAINEE" }, select: { id: true } });
    if (users.length) {
      await prisma.onboardingAssignment.createMany({
        data: users.map((u) => ({ documentId: doc.id, userId: u.id })),
        skipDuplicates: true,
      });
    }
  }

  revalidatePath("/admin/documents");
}

export interface BulkOnboardingDocumentInput {
  title: string;
  fileDataUrl: string;
  fileName: string;
  assignByDefault: boolean;
}

// Bulk-upload submits one document per call (see BulkAddDocumentsForm) rather
// than batching every file's base64 data into a single request — a handful
// of real PDFs together easily exceeds the server actions body size limit,
// while any one file comfortably fits.
export async function createOnboardingDocumentFromDraftAction(item: BulkOnboardingDocumentInput) {
  await requireAdmin();
  if (!item.fileDataUrl) return;

  const count = await prisma.onboardingDocument.count();
  const fieldColumns = await detectFieldColumns(item.fileDataUrl);
  const doc = await prisma.onboardingDocument.create({
    data: {
      title: item.title.trim() || item.fileName || "Untitled Document",
      fileDataUrl: item.fileDataUrl,
      fileName: item.fileName || null,
      assignByDefault: item.assignByDefault,
      order: count + 1,
      ...fieldColumns,
    },
  });

  // Same backfill as the single-document path: assigning by default applies
  // to every current employee immediately, not just future invites.
  if (doc.assignByDefault) {
    const users = await prisma.user.findMany({ where: { role: "TRAINEE" }, select: { id: true } });
    if (users.length) {
      await prisma.onboardingAssignment.createMany({
        data: users.map((u) => ({ documentId: doc.id, userId: u.id })),
        skipDuplicates: true,
      });
    }
  }

  revalidatePath("/admin/documents");
}

export async function updateOnboardingDocumentAction(documentId: string, formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const contentText = String(formData.get("contentText") ?? "").trim();
  const fileDataUrl = String(formData.get("fileDataUrl") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim();
  const assignByDefault = formData.get("assignByDefault") === "on";

  const existing = await prisma.onboardingDocument.findUnique({
    where: { id: documentId },
    select: { fileDataUrl: true },
  });
  const fileChanged = fileDataUrl !== (existing?.fileDataUrl ?? "");
  const fieldColumns = fileChanged
    ? fileDataUrl
      ? await detectFieldColumns(fileDataUrl)
      : {
          sigFieldPage: null,
          sigFieldX: null,
          sigFieldY: null,
          dateFieldPage: null,
          dateFieldX: null,
          dateFieldY: null,
          fieldsAutoDetected: false,
        }
    : null;

  await prisma.onboardingDocument.update({
    where: { id: documentId },
    data: {
      title,
      contentText: contentText || null,
      fileDataUrl: fileDataUrl || null,
      fileName: fileName || null,
      assignByDefault,
      ...fieldColumns,
    },
  });

  revalidatePath("/admin/documents");
  revalidatePath(`/admin/documents/${documentId}`);
}

export async function deleteOnboardingDocumentAction(documentId: string) {
  await requireAdmin();
  await prisma.onboardingDocument.delete({ where: { id: documentId } });
  revalidatePath("/admin/documents");
}

export async function assignOnboardingDocumentAction(documentId: string, userId: string) {
  await requireAdmin();
  await prisma.onboardingAssignment.upsert({
    where: { documentId_userId: { documentId, userId } },
    create: { documentId, userId },
    update: {},
  });
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath(`/admin/employees/${userId}`);
}

export async function unassignOnboardingDocumentAction(documentId: string, userId: string) {
  await requireAdmin();
  await prisma.onboardingAssignment
    .delete({ where: { documentId_userId: { documentId, userId } } })
    .catch(() => {});
  revalidatePath(`/admin/documents/${documentId}`);
  revalidatePath(`/admin/employees/${userId}`);
}

// --- Signature/Date field placement (manual override for auto-detect) ---

export interface DocumentTextLine {
  page: number;
  x: number;
  y: number;
  width: number;
  text: string;
}

// Fetched on demand (not on every page load) since extracting text from a
// long pamphlet's every page is only needed while an admin has the
// placement panel open.
export async function getDocumentTextLinesAction(documentId: string): Promise<DocumentTextLine[]> {
  await requireAdmin();
  const doc = await prisma.onboardingDocument.findUnique({
    where: { id: documentId },
    select: { fileDataUrl: true },
  });
  if (!doc?.fileDataUrl) return [];
  const base64 = doc.fileDataUrl.split(",")[1];
  if (!base64) return [];
  const { extractPdfLines } = await import("@/lib/pdfFieldDetect");
  try {
    return await extractPdfLines(Buffer.from(base64, "base64"));
  } catch {
    return [];
  }
}

export async function setDocumentFieldAction(
  documentId: string,
  field: "signature" | "date",
  line: DocumentTextLine
) {
  await requireAdmin();
  const x = line.x + line.width + 4;
  const y = line.y + 2;
  await prisma.onboardingDocument.update({
    where: { id: documentId },
    data:
      field === "signature"
        ? { sigFieldPage: line.page, sigFieldX: x, sigFieldY: y }
        : { dateFieldPage: line.page, dateFieldX: x, dateFieldY: y },
  });
  revalidatePath(`/admin/documents/${documentId}`);
}

export async function clearDocumentFieldAction(documentId: string, field: "signature" | "date") {
  await requireAdmin();
  await prisma.onboardingDocument.update({
    where: { id: documentId },
    data:
      field === "signature"
        ? { sigFieldPage: null, sigFieldX: null, sigFieldY: null }
        : { dateFieldPage: null, dateFieldX: null, dateFieldY: null },
  });
  revalidatePath(`/admin/documents/${documentId}`);
}

export async function rerunAutoDetectAction(documentId: string) {
  await requireAdmin();
  const doc = await prisma.onboardingDocument.findUnique({
    where: { id: documentId },
    select: { fileDataUrl: true },
  });
  if (!doc?.fileDataUrl) return;
  const fieldColumns = await detectFieldColumns(doc.fileDataUrl);
  await prisma.onboardingDocument.update({ where: { id: documentId }, data: fieldColumns });
  revalidatePath(`/admin/documents/${documentId}`);
}
