"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface AttendanceEventState {
  error?: string;
  success?: boolean;
}

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin");
}

const VALID_KINDS = new Set(["TARDY", "ABSENCE", "NO_CALL_NO_SHOW"]);
const VALID_REASONS = new Set(["ILLNESS", "EMERGENCY", "FAMILY_EMERGENCY", "TRANSPORTATION", "OTHER"]);

export async function createAttendanceEventAction(
  employeeId: string,
  _prevState: AttendanceEventState,
  formData: FormData
): Promise<AttendanceEventState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const kindRaw = String(formData.get("kind") ?? "");
  const kind = VALID_KINDS.has(kindRaw) ? (kindRaw as "TARDY" | "ABSENCE" | "NO_CALL_NO_SHOW") : null;
  const reasonRaw = String(formData.get("reasonCategory") ?? "");
  const reasonCategory = VALID_REASONS.has(reasonRaw)
    ? (reasonRaw as "ILLNESS" | "EMERGENCY" | "FAMILY_EMERGENCY" | "TRANSPORTATION" | "OTHER")
    : null;
  const eventDateRaw = String(formData.get("eventDate") ?? "");
  const eventDate = eventDateRaw ? new Date(eventDateRaw) : new Date();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!kind) {
    return { error: "Please choose an event type." };
  }
  if (kind === "ABSENCE" && !reasonCategory) {
    return { error: "Please choose a reason for the absence." };
  }

  await prisma.attendanceEvent.create({
    data: {
      employeeId,
      loggedById: session.sub,
      kind,
      reasonCategory: kind === "ABSENCE" ? reasonCategory : null,
      eventDate,
      notes,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function deleteAttendanceEventAction(eventId: string, employeeId: string) {
  await requireHrAccess();
  await prisma.attendanceEvent.delete({ where: { id: eventId } });
  revalidateEmployeeViews(employeeId);
}
