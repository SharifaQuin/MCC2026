"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseFieldValuesFromFormData, renderTemplateBody, type TemplateFieldMeta, type FieldValues } from "@/lib/documentTemplates";
import { renderSignedDocumentPdf } from "@/lib/documentPdf";

export interface SignedDocumentState {
  error?: string;
  success?: boolean;
}

async function requireDocumentAdminAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/documents");
}

export async function createSignedDocumentAction(
  employeeId: string,
  templateId: string,
  _prevState: SignedDocumentState,
  formData: FormData
): Promise<SignedDocumentState> {
  let session;
  try {
    session = await requireDocumentAdminAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const template = await prisma.documentTemplate.findUnique({
    where: { id: templateId },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!template || !template.active) {
    return { error: "That template is no longer available." };
  }

  const fieldsMeta: TemplateFieldMeta[] = template.fields.map((f) => ({
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    required: f.required,
  }));
  const { values, error } = parseFieldValuesFromFormData(fieldsMeta, formData);
  if (error) return { error };

  await prisma.signedDocument.create({
    data: {
      templateId,
      employeeId,
      fieldValues: values,
      createdById: session.sub,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function deleteSignedDocumentAction(documentId: string, employeeId: string) {
  await requireDocumentAdminAccess();
  await prisma.signedDocument.deleteMany({ where: { id: documentId, signedAt: null } });
  revalidateEmployeeViews(employeeId);
}

export interface SignDocumentState {
  error?: string;
  success?: boolean;
}

// Signing is the one action here that isn't gated to ADMIN — it's the
// employee's own e-signature, so only the person the document is about may
// perform it, matching the "you sign for yourself" rule already used for
// OnboardingAssignment.
export async function signDocumentAction(
  documentId: string,
  _prevState: SignDocumentState,
  formData: FormData
): Promise<SignDocumentState> {
  const session = await getSession();
  if (!session) return { error: "Not authorized." };

  const doc = await prisma.signedDocument.findUnique({
    where: { id: documentId },
    include: {
      template: { include: { fields: { orderBy: { order: "asc" } } } },
      employee: { select: { id: true, name: true } },
    },
  });
  if (!doc) return { error: "Document not found." };
  if (doc.employeeId !== session.sub) return { error: "Not authorized." };
  if (doc.signedAt) return { error: "This document has already been signed." };

  const signedName = String(formData.get("signedName") ?? "").trim();
  const agreed = formData.get("agreed") === "on";
  if (!signedName || !agreed) {
    return { error: "Please type your full name and confirm the acknowledgment." };
  }

  const fieldsMeta: TemplateFieldMeta[] = doc.template.fields.map((f) => ({
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    required: f.required,
  }));
  const bodyText = renderTemplateBody(doc.template.bodyText, fieldsMeta, doc.fieldValues as FieldValues);
  const signedAt = new Date();
  const pdfDataUrl = await renderSignedDocumentPdf({
    title: doc.template.title,
    bodyText,
    employeeName: doc.employee.name,
    signedName,
    signedAt,
  });

  await prisma.signedDocument.update({
    where: { id: documentId },
    data: { signedAt, signedName, pdfDataUrl },
  });

  revalidatePath(`/staff/${doc.employeeId}`);
  revalidatePath(`/admin/employees/${doc.employeeId}`);
  revalidatePath("/documents");
  revalidatePath(`/documents/personnel/${documentId}`);
  return { success: true };
}
