"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
  return session;
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
  const doc = await prisma.onboardingDocument.create({
    data: {
      title,
      contentText: contentText || null,
      fileDataUrl: fileDataUrl || null,
      fileName: fileName || null,
      assignByDefault,
      order: count + 1,
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

export async function updateOnboardingDocumentAction(documentId: string, formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const contentText = String(formData.get("contentText") ?? "").trim();
  const fileDataUrl = String(formData.get("fileDataUrl") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim();
  const assignByDefault = formData.get("assignByDefault") === "on";

  await prisma.onboardingDocument.update({
    where: { id: documentId },
    data: {
      title,
      contentText: contentText || null,
      fileDataUrl: fileDataUrl || null,
      fileName: fileName || null,
      assignByDefault,
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
