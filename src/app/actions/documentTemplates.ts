"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { DocumentFieldType } from "@prisma/client";

export interface DocumentTemplateState {
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

export interface FieldInput {
  key: string;
  label: string;
  fieldType: DocumentFieldType;
  required: boolean;
}

const VALID_FIELD_TYPES = new Set(["TEXT", "DATE", "NUMBER", "CHECKBOX"]);

function parseFieldsJson(raw: string): { fields: FieldInput[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { fields: [], error: "Field data was malformed — please try again." };
  }
  if (!Array.isArray(parsed)) return { fields: [], error: "Field data was malformed — please try again." };

  const seenKeys = new Set<string>();
  const fields: FieldInput[] = [];
  for (const entry of parsed) {
    const key = String((entry as Record<string, unknown>)?.key ?? "").trim();
    const label = String((entry as Record<string, unknown>)?.label ?? "").trim();
    const fieldTypeRaw = String((entry as Record<string, unknown>)?.fieldType ?? "TEXT");
    const fieldType = (VALID_FIELD_TYPES.has(fieldTypeRaw) ? fieldTypeRaw : "TEXT") as DocumentFieldType;
    const required = Boolean((entry as Record<string, unknown>)?.required);
    if (!key || !label) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return { fields: [], error: `Field key "${key}" must start with a letter and contain only letters, numbers, or underscores.` };
    }
    if (seenKeys.has(key)) {
      return { fields: [], error: `Field key "${key}" is used more than once.` };
    }
    seenKeys.add(key);
    fields.push({ key, label, fieldType, required });
  }
  if (fields.length === 0) return { fields: [], error: "Add at least one field." };
  return { fields };
}

export async function createDocumentTemplateAction(
  _prevState: DocumentTemplateState,
  formData: FormData
): Promise<DocumentTemplateState> {
  let session;
  try {
    session = await requireDocumentAdminAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const fieldsRaw = String(formData.get("fieldsJson") ?? "[]");

  if (!title || !bodyText) {
    return { error: "Title and body text are required." };
  }

  const { fields, error } = parseFieldsJson(fieldsRaw);
  if (error) return { error };

  await prisma.documentTemplate.create({
    data: {
      title,
      description,
      bodyText,
      createdById: session.sub,
      fields: {
        create: fields.map((f, i) => ({ key: f.key, label: f.label, fieldType: f.fieldType, required: f.required, order: i })),
      },
    },
  });

  revalidatePath("/staff/document-templates");
  return { success: true };
}

export async function updateDocumentTemplateAction(
  templateId: string,
  _prevState: DocumentTemplateState,
  formData: FormData
): Promise<DocumentTemplateState> {
  try {
    await requireDocumentAdminAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const fieldsRaw = String(formData.get("fieldsJson") ?? "[]");

  if (!title || !bodyText) {
    return { error: "Title and body text are required." };
  }

  const { fields, error } = parseFieldsJson(fieldsRaw);
  if (error) return { error };

  // Fields aren't referenced by id anywhere else (SignedDocument.fieldValues
  // is keyed by the field's `key` string, not its row id), so replacing the
  // whole set on every edit is safe and keeps this simple.
  await prisma.$transaction([
    prisma.documentTemplateField.deleteMany({ where: { templateId } }),
    prisma.documentTemplate.update({
      where: { id: templateId },
      data: {
        title,
        description,
        bodyText,
        fields: {
          create: fields.map((f, i) => ({ key: f.key, label: f.label, fieldType: f.fieldType, required: f.required, order: i })),
        },
      },
    }),
  ]);

  revalidatePath("/staff/document-templates");
  return { success: true };
}

export async function setDocumentTemplateActiveAction(templateId: string, active: boolean) {
  await requireDocumentAdminAccess();
  await prisma.documentTemplate.update({ where: { id: templateId }, data: { active } });
  revalidatePath("/staff/document-templates");
}

export async function deleteDocumentTemplateAction(templateId: string) {
  await requireDocumentAdminAccess();
  const usedCount = await prisma.signedDocument.count({ where: { templateId } });
  if (usedCount > 0) {
    throw new Error("This template has been used to generate documents and can't be deleted — deactivate it instead.");
  }
  await prisma.documentTemplate.delete({ where: { id: templateId } });
  revalidatePath("/staff/document-templates");
}
