"use server";

import { revalidatePath } from "next/cache";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { setSalesGoal } from "@/lib/salesDashboard";

export async function setSalesGoalAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const raw = String(formData.get("revenueGoal") ?? "").replace(/[^0-9.]/g, "");
  const revenueGoal = Math.max(0, Math.round(parseFloat(raw) || 0));

  await setSalesGoal(revenueGoal);
  revalidatePath("/sales");
  revalidatePath("/hr");
}
