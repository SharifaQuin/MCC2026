"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasDepartmentAccess } from "@/lib/departments";
import { formatWeeklyUpdate, nextMondayFrom, WEEKLY_UPDATE_REMINDER_TASK_ID } from "@/lib/weeklyUpdate";
import type { WeeklyUpdateFields } from "@/lib/weeklyUpdate";
import { postToSlackTeamChannel } from "@/lib/slack";

async function requireManagementEditAccess() {
  const session = await getSession();
  if (!session) throw new Error("Not authorized");

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const access = hasDepartmentAccess(session.role, grants, "MANAGEMENT");
  if (!access.canEdit) throw new Error("Not authorized");

  return session;
}

function str(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function requiredNum(formData: FormData, field: string): number {
  const raw = formData.get(field);
  const value = Number(raw);
  if (raw === null || raw === "" || Number.isNaN(value)) {
    throw new Error(`Missing or invalid value for ${field}`);
  }
  return value;
}

// Creates or updates the draft for a given week (defaults to next Monday).
// Re-saving an already-approved week resets it back to draft, same as the
// original template's ON CONFLICT behavior — an edit means "review me again."
export async function saveWeeklyUpdateDraftAction(formData: FormData) {
  const session = await requireManagementEditAccess();

  const fields: WeeklyUpdateFields = {
    spotlightName: str(formData, "spotlightName"),
    spotlightReason: str(formData, "spotlightReason"),
    homesCleaned: requiredNum(formData, "homesCleaned"),
    commercialServiced: Number(formData.get("commercialServiced") ?? 0) || 0,
    avgRating: requiredNum(formData, "avgRating"),
    clientShoutout: str(formData, "clientShoutout") || null,
    companyUpdates: str(formData, "companyUpdates") || null,
    weeklyGoal: str(formData, "weeklyGoal"),
    coreValue: str(formData, "coreValue"),
    coreValueDescription: str(formData, "coreValueDescription"),
  };

  if (
    !fields.spotlightName ||
    !fields.spotlightReason ||
    !fields.weeklyGoal ||
    !fields.coreValue ||
    !fields.coreValueDescription
  ) {
    throw new Error("Please fill in all required fields.");
  }

  const weekOfRaw = str(formData, "weekOf");
  const weekOf = weekOfRaw ? new Date(weekOfRaw) : nextMondayFrom();
  const formattedMessage = formatWeeklyUpdate(fields);

  await prisma.weeklyUpdate.upsert({
    where: { weekOf },
    create: {
      weekOf,
      ...fields,
      formattedMessage,
      status: "DRAFT",
      createdById: session.sub,
    },
    update: {
      ...fields,
      formattedMessage,
      status: "DRAFT",
      approvedAt: null,
      approvedById: null,
      sentAt: null,
      createdById: session.sub,
    },
  });

  // Best-effort — the reminder task may not exist in every environment.
  await prisma.checklistTask.updateMany({
    where: { id: WEEKLY_UPDATE_REMINDER_TASK_ID },
    data: { status: "DONE", completedAt: new Date() },
  });

  revalidatePath("/management");
  revalidatePath("/todo");
  revalidatePath("/");
}

export async function approveWeeklyUpdateAction(id: string) {
  const session = await requireManagementEditAccess();
  const result = await prisma.weeklyUpdate.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: session.sub },
  });
  if (result.count === 0) throw new Error("Update not found or not in draft status.");
  revalidatePath("/management");
}

export async function revertWeeklyUpdateToDraftAction(id: string) {
  await requireManagementEditAccess();
  await prisma.weeklyUpdate.updateMany({
    where: { id, status: "APPROVED" },
    data: { status: "DRAFT", approvedAt: null, approvedById: null },
  });
  revalidatePath("/management");
}

// Manual fallback alongside the scheduled Monday 8:05am send — in case that
// check is ever missed (e.g. a restart at exactly the wrong moment), or she
// just wants it posted sooner than Monday.
export async function sendWeeklyUpdateNowAction(id: string) {
  await requireManagementEditAccess();

  const update = await prisma.weeklyUpdate.findUnique({ where: { id } });
  if (!update) throw new Error("Update not found.");
  if (update.status !== "APPROVED") throw new Error("Only an approved update can be sent.");

  try {
    await postToSlackTeamChannel(update.formattedMessage);
    await prisma.weeklyUpdate.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (err) {
    await prisma.weeklyUpdate.update({ where: { id }, data: { status: "FAILED" } });
    revalidatePath("/management");
    throw err;
  }

  revalidatePath("/management");
}
