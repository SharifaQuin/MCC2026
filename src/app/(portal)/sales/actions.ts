"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { setSalesGoal, setSalesLabor } from "@/lib/salesDashboard";
import { saveRevenueSnapshot, parseStrictMoney, type SaveRevenueSnapshotResult } from "@/lib/salesRevenueSnapshot";
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

// Revenue ("Completed cleaning charges") and labor are saved through two
// entirely separate actions on purpose — see saveRevenueSnapshot's own
// comment. Neither one can read or touch the other's stored value: a
// revenue-only save can't blank out labor by never mentioning it, and a
// labor-only save can't touch whatever revenue figure is on file.
export async function saveRevenueSnapshotAction(formData: FormData): Promise<SaveRevenueSnapshotResult> {
  const session = await requireAdmin();

  const result = await saveRevenueSnapshot(
    {
      monthKey: String(formData.get("monthKey") ?? ""),
      revenue: String(formData.get("revenue") ?? ""),
      source: String(formData.get("source") ?? ""),
      coverage: String(formData.get("coverage") ?? ""),
      coverageThrough: String(formData.get("coverageThrough") ?? ""),
      sourceAsOf: String(formData.get("sourceAsOf") ?? ""),
      status: String(formData.get("status") ?? ""),
      confirmStaleAsOf: formData.get("confirmStaleAsOf") === "on",
    },
    session.sub
  );

  if (result.ok) {
    revalidatePath("/sales");
    revalidatePath("/");
  }
  return result;
}

// Labor has no source/coverage/as-of metadata to validate — just a plain
// dollar figure for the same reporting month. A blank submission is
// refused rather than silently recorded as 0, so "never entered" and
// "entered as exactly $0" stay distinguishable (see getSalesActuals).
export async function saveSalesLaborAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const monthKey = String(formData.get("monthKey") ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    return { ok: false, error: "Reporting month must be a valid YYYY-MM value." };
  }

  const raw = String(formData.get("labor") ?? "").trim();
  if (raw === "") {
    return { ok: false, error: "Labor is required — enter 0 if there was none, rather than leaving it blank." };
  }
  const labor = parseStrictMoney(raw);
  if (labor === null) {
    return {
      ok: false,
      error: "Labor must be a plain non-negative amount like 1234.56 — no hex, scientific notation, or other formats.",
    };
  }

  await setSalesLabor(labor, monthKey);
  revalidatePath("/sales");
  revalidatePath("/");
  return { ok: true };
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
