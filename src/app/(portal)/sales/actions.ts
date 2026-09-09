"use server";

import { revalidatePath } from "next/cache";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { setSalesGoal, setSalesActuals } from "@/lib/salesDashboard";

function toMoney(formData: FormData, field: string): number {
  const raw = String(formData.get(field) ?? "").replace(/[^0-9.]/g, "");
  return Math.max(0, Math.round((parseFloat(raw) || 0) * 100) / 100);
}

export async function setSalesGoalAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const revenueGoal = Math.round(toMoney(formData, "revenueGoal"));

  await setSalesGoal(revenueGoal);
  revalidatePath("/sales");
  revalidatePath("/hr");
}

export async function setSalesActualsAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const revenue = toMoney(formData, "actualRevenue");
  const labor = toMoney(formData, "actualLabor");

  await setSalesActuals(revenue, labor);
  revalidatePath("/sales");
  revalidatePath("/hr");
}
