"use server";

import { revalidatePath } from "next/cache";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { setSalesGoal, setSalesActuals } from "@/lib/salesDashboard";
import { setLeadSourceSpendAmount } from "@/lib/leads";
import type { LeadSource } from "@prisma/client";

const VALID_LEAD_SOURCES = new Set(["WEBSITE_FORM", "PHONE_CALL", "WALK_IN", "REFERRAL", "GOOGLE_ADS", "FACEBOOK_ADS", "OTHER"]);

function toMoney(formData: FormData, field: string): number {
  const raw = String(formData.get(field) ?? "").replace(/[^0-9.]/g, "");
  return Math.max(0, Math.round((parseFloat(raw) || 0) * 100) / 100);
}

export async function setSalesGoalAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const revenueGoal = toMoney(formData, "revenueGoal");

  await setSalesGoal(revenueGoal);
  revalidatePath("/sales");
  revalidatePath("/");
}

export async function setSalesActualsAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const revenue = toMoney(formData, "actualRevenue");
  const labor = toMoney(formData, "actualLabor");

  await setSalesActuals(revenue, labor);
  revalidatePath("/sales");
  revalidatePath("/");
}

export async function setLeadSourceSpendAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const sourceRaw = String(formData.get("source") ?? "");
  if (!VALID_LEAD_SOURCES.has(sourceRaw)) return;
  const amountSpent = toMoney(formData, "amountSpent");

  await setLeadSourceSpendAmount(sourceRaw as LeadSource, amountSpent);
  revalidatePath("/sales");
}
