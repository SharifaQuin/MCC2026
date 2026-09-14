"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { exportFilesToOneDrive, type OneDriveExportFile } from "@/lib/oneDriveExport";
import { renderSignedDocumentPdf } from "@/lib/documentPdf";
import { complianceDocLabel } from "@/lib/complianceDocs";

export interface OneDriveExportState {
  error?: string;
  success?: boolean;
  summary?: string;
}

export async function exportEmployeeDocumentsToOneDriveAction(
  employeeId: string
): Promise<OneDriveExportState> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { error: "Not authorized." };
  }

  const employee = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!employee) return { error: "Employee not found." };

  const rootFolder = [`MCC HR Documents`, `${employee.name} (${employee.employeeId ?? employee.id})`];
  const files: OneDriveExportFile[] = [];

  const signedDocs = await prisma.signedDocument.findMany({
    where: { employeeId, pdfDataUrl: { not: null } },
    include: { template: { select: { title: true } } },
  });
  for (const doc of signedDocs) {
    files.push({
      folderPath: [...rootFolder, "Personnel Documents"],
      fileName: `${doc.template.title} - ${doc.signedAt!.toISOString().slice(0, 10)}.pdf`,
      dataUrl: doc.pdfDataUrl!,
    });
  }

  const onboardingAssignments = await prisma.onboardingAssignment.findMany({
    where: { userId: employeeId, signedAt: { not: null } },
    include: { document: { select: { title: true, contentText: true } } },
  });
  for (const a of onboardingAssignments) {
    const pdfDataUrl = await renderSignedDocumentPdf({
      title: a.document.title,
      bodyText: a.document.contentText ?? "(See the original onboarding document for full content.)",
      employeeName: employee.name,
      signedName: a.signedName!,
      signedAt: a.signedAt!,
    });
    files.push({
      folderPath: [...rootFolder, "Onboarding Documents"],
      fileName: `${a.document.title} - ${a.signedAt!.toISOString().slice(0, 10)}.pdf`,
      dataUrl: pdfDataUrl,
    });
  }

  const complianceDocs = await prisma.complianceDocument.findMany({
    where: { employeeId, fileDataUrl: { not: null } },
  });
  for (const doc of complianceDocs) {
    const label = complianceDocLabel(doc.docType, doc.label);
    const ext = doc.fileName?.includes(".") ? doc.fileName.slice(doc.fileName.lastIndexOf(".")) : "";
    files.push({
      folderPath: [...rootFolder, "Compliance Documents"],
      fileName: `${label} - expires ${doc.expirationDate.toISOString().slice(0, 10)}${ext}`,
      dataUrl: doc.fileDataUrl!,
    });
  }

  if (files.length === 0) {
    return { success: true, summary: "Nothing to export — no signed or uploaded documents on file yet." };
  }

  const result = await exportFilesToOneDrive(files);
  if (!result.ok && result.uploaded === 0) {
    return { error: result.error ?? "OneDrive export failed." };
  }

  const parts = [`Uploaded ${result.uploaded} of ${files.length} document(s) to OneDrive.`];
  if (result.failed.length > 0) {
    parts.push(`${result.failed.length} failed: ${result.failed.map((f) => f.fileName).join(", ")}.`);
  }
  return { success: true, summary: parts.join(" ") };
}
