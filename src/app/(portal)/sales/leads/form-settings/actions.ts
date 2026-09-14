"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getLeadFormConfig, setLeadFormConfig, DEFAULT_LEAD_FORM_CONFIG } from "@/lib/leads";
import type { LeadFormFieldType } from "@prisma/client";

const VALID_FIELD_TYPES = new Set(["TEXT", "TEXTAREA", "SELECT"]);

export async function setLeadFormConfigAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const str = (name: string, fallback: string) =>
    String(formData.get(name) ?? "").trim() || fallback;
  const bool = (name: string) => formData.get(name) === "on";

  await setLeadFormConfig({
    headline: str("headline", DEFAULT_LEAD_FORM_CONFIG.headline),
    intro: str("intro", DEFAULT_LEAD_FORM_CONFIG.intro),
    submitLabel: str("submitLabel", DEFAULT_LEAD_FORM_CONFIG.submitLabel),
    addressEnabled: bool("addressEnabled"),
    addressRequired: bool("addressRequired"),
    addressLabel: str("addressLabel", DEFAULT_LEAD_FORM_CONFIG.addressLabel),
    serviceInterestEnabled: bool("serviceInterestEnabled"),
    serviceInterestRequired: bool("serviceInterestRequired"),
    serviceInterestLabel: str("serviceInterestLabel", DEFAULT_LEAD_FORM_CONFIG.serviceInterestLabel),
    messageEnabled: bool("messageEnabled"),
    messageRequired: bool("messageRequired"),
    messageLabel: str("messageLabel", DEFAULT_LEAD_FORM_CONFIG.messageLabel),
  });

  revalidatePath("/sales/leads/form-settings");
  revalidatePath("/lead-form");
}

export async function addLeadFormFieldAction() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const count = await prisma.leadFormField.count();
  await prisma.leadFormField.create({
    data: { label: "New question", fieldType: "TEXT", order: count + 1 },
  });
  revalidatePath("/sales/leads/form-settings");
  revalidatePath("/lead-form");
}

export async function saveLeadFormFieldAction(fieldId: string, formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const label = String(formData.get("label") ?? "").trim() || "Untitled question";
  const fieldTypeRaw = String(formData.get("fieldType") ?? "");
  const fieldType = VALID_FIELD_TYPES.has(fieldTypeRaw) ? (fieldTypeRaw as LeadFormFieldType) : "TEXT";
  const placeholder = String(formData.get("placeholder") ?? "").trim() || null;
  const required = formData.get("required") === "on";
  const options = String(formData.get("options") ?? "").trim() || null;

  await prisma.leadFormField.update({
    where: { id: fieldId },
    data: { label, fieldType, placeholder, required, options },
  });

  revalidatePath("/sales/leads/form-settings");
  revalidatePath("/lead-form");
}

export async function deleteLeadFormFieldAction(fieldId: string) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  await prisma.leadFormField.delete({ where: { id: fieldId } });
  revalidatePath("/sales/leads/form-settings");
  revalidatePath("/lead-form");
}

export async function moveLeadFormFieldAction(fieldId: string, direction: "up" | "down") {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const fields = await prisma.leadFormField.findMany({ orderBy: { order: "asc" } });
  const index = fields.findIndex((f) => f.id === fieldId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= fields.length) return;

  await prisma.$transaction([
    prisma.leadFormField.update({ where: { id: fields[index].id }, data: { order: fields[swapWith].order } }),
    prisma.leadFormField.update({ where: { id: fields[swapWith].id }, data: { order: fields[index].order } }),
  ]);

  revalidatePath("/sales/leads/form-settings");
  revalidatePath("/lead-form");
}
