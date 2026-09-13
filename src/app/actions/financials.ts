"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { ChecklistCategory, ChecklistOwner, ChecklistTaskStatus, ChecklistVisibility } from "@prisma/client";

async function requireOwnerAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

function num(formData: FormData, field: string): number {
  const raw = formData.get(field);
  const value = Number(raw);
  if (raw === null || raw === "" || Number.isNaN(value)) {
    throw new Error(`Missing or invalid value for ${field}`);
  }
  return value;
}

function optionalNum(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Invalid value for ${field}`);
  return value;
}

// New One-Time/Milestone tasks default to a 3-day due date when none is
// given explicitly (tighter than the one-time 7-day backfill everything
// else got, per the owner's "keep on top of things going forward" ask).
// Monthly is always computed as month-end and Daily/Weekly never use a due
// date at all (see getEffectiveTargetDate in lib/checklistDisplay.ts), so
// neither needs anything stored here.
function defaultTargetDateFor(frequency: string, explicit: Date | null): Date | null {
  if (explicit) return explicit;
  if (frequency === "ONE_TIME" || frequency === "MILESTONE") {
    return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  }
  return null;
}

// ADMIN only — every field is entered directly rather than derived from the
// others (see the note on the MonthlyFinancials model): her source
// spreadsheet's opex_total doesn't equal a simple sum of its own line items,
// so recomputing totals here would risk silently disagreeing with her numbers.
export async function upsertMonthlyFinancialsAction(formData: FormData) {
  await requireOwnerAccess();

  const month = String(formData.get("month") ?? "").trim();
  const monthLabel = String(formData.get("monthLabel") ?? "").trim();
  if (!month || !monthLabel) throw new Error("Month and month label are required.");

  const data = {
    monthLabel,
    revenueTotal: num(formData, "revenueTotal"),
    revenueCommercial: num(formData, "revenueCommercial"),
    revenueResidential: num(formData, "revenueResidential"),
    cleanerTipsMemo: optionalNum(formData, "cleanerTipsMemo"),
    technicianPayroll: num(formData, "technicianPayroll"),
    mileageReimbursements: num(formData, "mileageReimbursements"),
    supplies: num(formData, "supplies"),
    cogsTotal: num(formData, "cogsTotal"),
    grossProfit: num(formData, "grossProfit"),
    grossMarginPct: num(formData, "grossMarginPct"),
    adminPayroll: num(formData, "adminPayroll"),
    rent: num(formData, "rent"),
    hiringRecruiting: num(formData, "hiringRecruiting"),
    fuel: num(formData, "fuel"),
    insurance: num(formData, "insurance"),
    vehicle: num(formData, "vehicle"),
    marketing: num(formData, "marketing"),
    fees: num(formData, "fees"),
    misc: optionalNum(formData, "misc"),
    creditCard: num(formData, "creditCard"),
    loanPayoff: num(formData, "loanPayoff"),
    stripeCapitalInterest: num(formData, "stripeCapitalInterest"),
    equipmentFinancing: num(formData, "equipmentFinancing"),
    opexTotal: num(formData, "opexTotal"),
    netProfit: num(formData, "netProfit"),
    netMarginPct: num(formData, "netMarginPct"),
    target21pct: num(formData, "target21pct"),
    varianceToTarget: num(formData, "varianceToTarget"),
    ownerDraw: num(formData, "ownerDraw"),
    endingBankBalance: num(formData, "endingBankBalance"),
  };

  await prisma.monthlyFinancials.upsert({
    where: { month },
    create: { month, ...data },
    update: data,
  });

  revalidatePath("/financials");
  revalidatePath("/");
}

export async function updateDrawPolicyAction(formData: FormData) {
  await requireOwnerAccess();

  const value = {
    fixed_monthly_amount: num(formData, "fixedMonthlyAmount"),
    cash_floor_minimum: num(formData, "cashFloorMinimum"),
    note: String(formData.get("note") ?? "").trim(),
  };

  await prisma.ownerSetting.upsert({
    where: { key: "owner_draw_policy" },
    create: { key: "owner_draw_policy", value },
    update: { value },
  });

  revalidatePath("/financials");
}

export async function updateProfitabilityTargetAction(formData: FormData) {
  await requireOwnerAccess();

  const value = {
    target_net_margin_pct: num(formData, "targetNetMarginPct"),
    estimated_revenue_needed_monthly: num(formData, "estimatedRevenueNeededMonthly"),
    note: String(formData.get("note") ?? "").trim(),
  };

  await prisma.ownerSetting.upsert({
    where: { key: "profitability_target" },
    create: { key: "profitability_target", value },
    update: { value },
  });

  revalidatePath("/financials");
}

export async function addChecklistTaskAction(formData: FormData) {
  await requireOwnerAccess();

  const frequency = String(formData.get("frequency") ?? "");
  const task = String(formData.get("task") ?? "").trim();
  const owner = String(formData.get("owner") ?? "OWNER") as ChecklistOwner;
  const visibility = String(formData.get("visibility") ?? "OWNER_ONLY") as ChecklistVisibility;
  const category = String(formData.get("category") ?? "MANAGEMENT") as ChecklistCategory;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const targetDateRaw = String(formData.get("targetDate") ?? "");

  if (!task) throw new Error("Task text is required.");

  const count = await prisma.checklistTask.count();

  await prisma.checklistTask.create({
    data: {
      frequency: frequency as never,
      task,
      owner,
      visibility,
      category,
      notes,
      targetDate: defaultTargetDateFor(frequency, targetDateRaw ? new Date(targetDateRaw) : null),
      order: count,
    },
  });

  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

// ADMIN only — creates several tasks at once from a pasted list, each with
// its own (already-guessed, possibly owner-corrected) category, sharing one
// frequency/visibility for the whole batch.
export async function bulkAddChecklistTasksAction(
  items: { task: string; category: ChecklistCategory }[],
  frequency: string,
  visibility: ChecklistVisibility
) {
  await requireOwnerAccess();

  const cleaned = items.map((i) => ({ ...i, task: i.task.trim() })).filter((i) => i.task);
  if (cleaned.length === 0) return;

  const owner: ChecklistOwner = visibility === "TEAM" ? "TEAM" : "OWNER";
  const startOrder = await prisma.checklistTask.count();
  const targetDate = defaultTargetDateFor(frequency, null);

  await prisma.checklistTask.createMany({
    data: cleaned.map((item, i) => ({
      frequency: frequency as never,
      task: item.task,
      owner,
      visibility,
      category: item.category,
      targetDate,
      order: startOrder + i,
    })),
  });

  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

// ADMIN only — re-tag which category subsection a task shows under.
export async function setChecklistTaskCategoryAction(taskId: string, category: ChecklistCategory) {
  await requireOwnerAccess();
  await prisma.checklistTask.update({ where: { id: taskId }, data: { category } });
  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

// ADMIN only — edit a task's notes (shown when the task row is expanded).
export async function updateChecklistTaskNotesAction(taskId: string, notes: string) {
  await requireOwnerAccess();
  await prisma.checklistTask.update({ where: { id: taskId }, data: { notes: notes.trim() || null } });
  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

// ADMIN only — set, change, or clear (pass null) a task's due date.
export async function updateChecklistTaskTargetDateAction(taskId: string, targetDate: string | null) {
  await requireOwnerAccess();
  await prisma.checklistTask.update({
    where: { id: taskId },
    data: { targetDate: targetDate ? new Date(targetDate) : null },
  });
  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

export async function deleteChecklistTaskAction(taskId: string) {
  await requireOwnerAccess();
  await prisma.checklistTask.delete({ where: { id: taskId } });
  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

// SERVICE_MANAGER may only toggle TEAM-visibility tasks; ADMIN may toggle any.
export async function toggleChecklistTaskStatusAction(taskId: string, newStatus: ChecklistTaskStatus) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }

  const task = await prisma.checklistTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (session.role !== "ADMIN" && task.visibility !== "TEAM") {
    throw new Error("Not authorized");
  }

  await prisma.checklistTask.update({
    where: { id: taskId },
    data: { status: newStatus, completedAt: newStatus === "DONE" ? new Date() : null },
  });

  revalidatePath("/financials");
  revalidatePath("/todo");
  revalidatePath("/");
}

// ADMIN only — the owner updates a loan's current balance (and optionally
// its payment terms) periodically as new statements come in.
export async function updateLoanBalanceAction(loanId: string, formData: FormData) {
  await requireOwnerAccess();

  const currentBalance = num(formData, "currentBalance");
  const minimumPayment = optionalNum(formData, "minimumPayment");
  const minimumPaymentFrequency = String(formData.get("minimumPaymentFrequency") ?? "").trim() || null;

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      currentBalance,
      currentBalanceAsOf: new Date(),
      minimumPayment,
      minimumPaymentFrequency,
    },
  });

  revalidatePath("/financials");
  revalidatePath("/");
}

export async function closeLoanAction(loanId: string) {
  await requireOwnerAccess();
  await prisma.loan.update({
    where: { id: loanId },
    data: { status: "CLOSED", closedDate: new Date(), currentBalance: 0, currentBalanceAsOf: new Date() },
  });
  revalidatePath("/financials");
  revalidatePath("/");
}

export async function reopenLoanAction(loanId: string) {
  await requireOwnerAccess();
  await prisma.loan.update({
    where: { id: loanId },
    data: { status: "OPEN", closedDate: null },
  });
  revalidatePath("/financials");
  revalidatePath("/");
}
