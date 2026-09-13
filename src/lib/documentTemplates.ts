import { prisma } from "@/lib/prisma";
import type { DocumentFieldType } from "@prisma/client";

export const DOCUMENT_FIELD_TYPE_LABELS: Record<DocumentFieldType, string> = {
  TEXT: "Text",
  DATE: "Date",
  NUMBER: "Number",
  CHECKBOX: "Checkbox (Yes/No)",
};

export interface TemplateFieldMeta {
  key: string;
  label: string;
  fieldType: DocumentFieldType;
  required: boolean;
}

export type FieldValues = Record<string, string | number | boolean | null>;

function formatFieldValue(value: unknown, fieldType: DocumentFieldType): string {
  if (value === null || value === undefined || value === "") return "___________";
  switch (fieldType) {
    case "DATE":
      return new Date(String(value)).toLocaleDateString();
    case "CHECKBOX":
      return value ? "Yes" : "No";
    case "NUMBER":
      return String(value);
    default:
      return String(value);
  }
}

// Replaces every {{key}} placeholder in a template's bodyText with the
// formatted value for that field — used both for the on-screen preview
// before signing and as the final text baked into the stamped PDF.
export function renderTemplateBody(
  bodyText: string,
  fields: TemplateFieldMeta[],
  values: FieldValues
): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return bodyText.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const field = byKey.get(key);
    if (!field) return match;
    return formatFieldValue(values[key], field.fieldType);
  });
}

export interface ParsedFieldValues {
  values: FieldValues;
  error?: string;
}

// Reads field_<key> entries out of a submitted form, per the field's type,
// enforcing "required" server-side (mirrors how PromotionAssessment/PAF
// validate their own dynamic-ish inputs rather than trusting the client).
export function parseFieldValuesFromFormData(fields: TemplateFieldMeta[], formData: FormData): ParsedFieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    const raw = formData.get(`field_${field.key}`);
    if (field.fieldType === "CHECKBOX") {
      values[field.key] = raw === "on" || raw === "true";
      continue;
    }
    const str = String(raw ?? "").trim();
    if (!str) {
      if (field.required) {
        return { values, error: `"${field.label}" is required.` };
      }
      values[field.key] = null;
      continue;
    }
    if (field.fieldType === "NUMBER") {
      const num = Number(str);
      if (Number.isNaN(num)) {
        return { values, error: `"${field.label}" must be a number.` };
      }
      values[field.key] = num;
    } else if (field.fieldType === "DATE") {
      const date = new Date(str);
      if (Number.isNaN(date.getTime())) {
        return { values, error: `"${field.label}" is not a valid date.` };
      }
      values[field.key] = date.toISOString();
    } else {
      values[field.key] = str;
    }
  }
  return { values };
}

// The "documents needing my signature" hub (/documents) lists these
// alongside OnboardingAssignment rows — every logged-in employee can have
// personnel documents, not just trainees, so this isn't role-restricted.
export async function getSignedDocumentsForUser(userId: string) {
  const rows = await prisma.signedDocument.findMany({
    where: { employeeId: userId },
    include: { template: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.template.title,
    signedAt: r.signedAt,
  }));
}

export async function getSignedDocumentForSigning(documentId: string, userId: string) {
  const doc = await prisma.signedDocument.findUnique({
    where: { id: documentId },
    include: { template: { include: { fields: { orderBy: { order: "asc" } } } } },
  });
  if (!doc || doc.employeeId !== userId) return null;

  const fieldsMeta: TemplateFieldMeta[] = doc.template.fields.map((f) => ({
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    required: f.required,
  }));
  const renderedBody = renderTemplateBody(doc.template.bodyText, fieldsMeta, doc.fieldValues as FieldValues);

  return {
    id: doc.id,
    title: doc.template.title,
    renderedBody,
    signedAt: doc.signedAt,
    signedName: doc.signedName,
    pdfDataUrl: doc.pdfDataUrl,
  };
}
