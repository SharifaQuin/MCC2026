"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { setSalesGoal, setSalesActuals } from "@/lib/salesDashboard";
import { setLeadSourceSpendAmount } from "@/lib/leads";
import type { LeadSource } from "@prisma/client";

// Sales goals, actuals, and ad spend are owner-only to set — a Sales
// department `canEdit` grant (which a Sales Rep or Service Manager can
// have) is NOT enough, and the owner explicitly asked for no delegated
// finance-edit permission in this pass. Checked here, inside the action
// itself, not just by hiding the form's inputs/buttons in the page — a
// forged direct call must be refused the same way a role without the
// Sales department grant at all already would be.
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized.");
  return session;
}

const VALID_LEAD_SOURCES = new Set([
  "WEBSITE_FORM",
  "PHONE_CALL",
  "WALK_IN",
  "REFERRAL",
  "GOOGLE_ADS",
  "FACEBOOK_ADS",
  "NEXTDOOR",
  "INSTAGRAM",
  "OTHER",
]);

function toMoney(formData: FormData, field: string): number {
  const raw = String(formData.get(field) ?? "").replace(/[^0-9.]/g, "");
  return Math.max(0, Math.round((parseFloat(raw) || 0) * 100) / 100);
}

export async function setSalesGoalAction(formData: FormData) {
  await requireAdmin();

  const revenueGoal = toMoney(formData, "revenueGoal");

  await setSalesGoal(revenueGoal);
  revalidatePath("/sales");
  revalidatePath("/");
}

export async function setSalesActualsAction(formData: FormData) {
  await requireAdmin();

  const revenue = toMoney(formData, "actualRevenue");
  const labor = toMoney(formData, "actualLabor");

  await setSalesActuals(revenue, labor);
  revalidatePath("/sales");
  revalidatePath("/");
}

export async function setLeadSourceSpendAction(
  formData: FormData
): Promise<{ ok: true; amountSpent: number } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { ok: false, error: "Only the owner can edit ad spend." };
  }

  const sourceRaw = String(formData.get("source") ?? "");
  if (!VALID_LEAD_SOURCES.has(sourceRaw)) {
    return { ok: false, error: `"${sourceRaw}" isn't a recognized ad-spend source.` };
  }
  const amountSpent = toMoney(formData, "amountSpent");

  await setLeadSourceSpendAmount(sourceRaw as LeadSource, amountSpent);
  revalidatePath("/sales");
  return { ok: true, amountSpent };
}
