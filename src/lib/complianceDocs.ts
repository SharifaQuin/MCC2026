import type { ComplianceDocType } from "@prisma/client";

export const COMPLIANCE_DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  DRIVERS_LICENSE: "Driver's License",
  AUTO_INSURANCE: "Auto Insurance",
  TB_TEST: "TB Test",
  BACKGROUND_CHECK: "Background Check",
  OTHER: "Other",
};

export type ComplianceDocStatus = "EXPIRED" | "EXPIRING_SOON" | "OK";

const EXPIRING_SOON_WINDOW_DAYS = 30;

export function getComplianceDocStatus(expirationDate: Date, now: Date = new Date()): ComplianceDocStatus {
  const daysUntilExpiration = Math.round((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiration < 0) return "EXPIRED";
  if (daysUntilExpiration <= EXPIRING_SOON_WINDOW_DAYS) return "EXPIRING_SOON";
  return "OK";
}

export function complianceDocLabel(docType: ComplianceDocType, label: string | null): string {
  if (docType === "OTHER" && label) return label;
  return COMPLIANCE_DOC_TYPE_LABELS[docType];
}
