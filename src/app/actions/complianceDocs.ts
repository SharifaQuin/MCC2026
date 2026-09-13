"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { ComplianceDocType } from "@prisma/client";

export interface ComplianceDocState {
  error?: string;
  success?: boolean;
}

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/hr");
}

const VALID_DOC_TYPES = new Set(["DRIVERS_LICENSE", "AUTO_INSURANCE", "TB_TEST", "BACKGROUND_CHECK", "OTHER"]);

export async function createComplianceDocumentAction(
  employeeId: string,
  _prevState: ComplianceDocState,
  formData: FormData
): Promise<ComplianceDocState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const docTypeRaw = String(formData.get("docType") ?? "");
  const docType = VALID_DOC_TYPES.has(docTypeRaw) ? (docTypeRaw as ComplianceDocType) : null;
  const label = String(formData.get("label") ?? "").trim() || null;
  const expirationDateRaw = String(formData.get("expirationDate") ?? "");
  const expirationDate = expirationDateRaw ? new Date(expirationDateRaw) : null;
  const fileDataUrl = String(formData.get("fileDataUrl") ?? "") || null;
  const fileName = String(formData.get("fileName") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!docType || !expirationDate) {
    return { error: "Please choose a document type and an expiration date." };
  }
  if (docType === "OTHER" && !label) {
    return { error: 'Please name the document when the type is "Other".' };
  }

  await prisma.complianceDocument.create({
    data: {
      employeeId,
      docType,
      label,
      expirationDate,
      fileDataUrl,
      fileName,
      notes,
      createdById: session.sub,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function updateComplianceDocumentAction(
  docId: string,
  employeeId: string,
  _prevState: ComplianceDocState,
  formData: FormData
): Promise<ComplianceDocState> {
  try {
    await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const docTypeRaw = String(formData.get("docType") ?? "");
  const docType = VALID_DOC_TYPES.has(docTypeRaw) ? (docTypeRaw as ComplianceDocType) : null;
  const label = String(formData.get("label") ?? "").trim() || null;
  const expirationDateRaw = String(formData.get("expirationDate") ?? "");
  const expirationDate = expirationDateRaw ? new Date(expirationDateRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!docType || !expirationDate) {
    return { error: "Please choose a document type and an expiration date." };
  }
  if (docType === "OTHER" && !label) {
    return { error: 'Please name the document when the type is "Other".' };
  }

  await prisma.complianceDocument.update({
    where: { id: docId },
    data: { docType, label, expirationDate, notes },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function deleteComplianceDocumentAction(docId: string, employeeId: string) {
  await requireHrAccess();
  await prisma.complianceDocument.delete({ where: { id: docId } });
  revalidateEmployeeViews(employeeId);
}
