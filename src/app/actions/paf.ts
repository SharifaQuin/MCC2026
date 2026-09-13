"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { PafActionType } from "@prisma/client";

export interface PafState {
  error?: string;
  success?: boolean;
}

// Creating/approving a PAF is ADMIN-only — the record that actually
// authorizes payroll to act — unlike the general Pair/Promotion/Milestone
// tools, which any SERVICE_MANAGER can also edit.
async function requirePafAdminAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
}

const VALID_ACTION_TYPES = new Set(["PROMOTION", "PAY_CHANGE", "TRANSFER", "TITLE_CHANGE", "TERMINATION", "OTHER"]);

export async function createPafAction(
  employeeId: string,
  _prevState: PafState,
  formData: FormData
): Promise<PafState> {
  let session;
  try {
    session = await requirePafAdminAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const actionTypeRaw = String(formData.get("actionType") ?? "");
  const actionType = VALID_ACTION_TYPES.has(actionTypeRaw) ? (actionTypeRaw as PafActionType) : null;
  const effectiveDateRaw = String(formData.get("effectiveDate") ?? "");
  const effectiveDate = effectiveDateRaw ? new Date(effectiveDateRaw) : null;

  if (!actionType || !effectiveDate) {
    return { error: "Please choose an action type and an effective date." };
  }

  const str = (name: string) => String(formData.get(name) ?? "").trim() || null;
  const num = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw ? Number(raw) : null;
  };

  await prisma.personnelActionForm.create({
    data: {
      employeeId,
      actionType,
      effectiveDate,
      priorTitle: str("priorTitle"),
      newTitle: str("newTitle"),
      priorPay: num("priorPay"),
      newPay: num("newPay"),
      priorDepartment: str("priorDepartment"),
      newDepartment: str("newDepartment"),
      reason: str("reason"),
      createdById: session.sub,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function approvePafAction(pafId: string, employeeId: string) {
  const session = await requirePafAdminAccess();
  const result = await prisma.personnelActionForm.updateMany({
    where: { id: pafId, status: "DRAFT" },
    data: { status: "APPROVED", approvedById: session.sub, approvedAt: new Date() },
  });
  if (result.count === 0) throw new Error("PAF not found or not in draft status.");
  revalidateEmployeeViews(employeeId);
}

export async function executePafAction(pafId: string, employeeId: string) {
  await requirePafAdminAccess();
  const result = await prisma.personnelActionForm.updateMany({
    where: { id: pafId, status: "APPROVED" },
    data: { status: "EXECUTED" },
  });
  if (result.count === 0) throw new Error("PAF not found or not yet approved.");
  revalidateEmployeeViews(employeeId);
}

// Only a still-Draft PAF can be deleted — once Approved/Executed it's an
// audit record, not a mistake to erase.
export async function deletePafAction(pafId: string, employeeId: string) {
  await requirePafAdminAccess();
  await prisma.personnelActionForm.deleteMany({ where: { id: pafId, status: "DRAFT" } });
  revalidateEmployeeViews(employeeId);
}
