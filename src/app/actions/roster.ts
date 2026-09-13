"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface DepartureState {
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
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/staff");
  revalidatePath("/admin/employees");
}

// Departed is a distinct HR-recorded roster status, not just a plain
// active=false toggle — it also auto-drafts a Termination PAF (mirroring
// how a Promote decision auto-drafts a Promotion PAF) so payroll has an
// execution record to approve rather than someone having to remember to
// create one separately.
export async function markEmployeeDepartedAction(
  employeeId: string,
  _prevState: DepartureState,
  formData: FormData
): Promise<DepartureState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const lastDayRaw = String(formData.get("lastDay") ?? "");
  const lastDay = lastDayRaw ? new Date(lastDayRaw) : null;
  const departureReason = String(formData.get("departureReason") ?? "").trim() || null;
  const rehireEligibleRaw = String(formData.get("rehireEligible") ?? "");
  const rehireEligible = rehireEligibleRaw === "true" ? true : rehireEligibleRaw === "false" ? false : null;
  const exitInterviewNotes = String(formData.get("exitInterviewNotes") ?? "").trim() || null;
  const exitInterviewCompleted = formData.get("exitInterviewCompleted") === "on";

  if (!lastDay) {
    return { error: "Please provide a last day." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: employeeId },
      data: {
        active: false,
        lastDay,
        departureReason,
        departureRecordedById: session.sub,
        rehireEligible,
        exitInterviewNotes,
        exitInterviewCompletedAt: exitInterviewCompleted ? new Date() : null,
      },
    }),
    prisma.personnelActionForm.create({
      data: {
        employeeId,
        actionType: "TERMINATION",
        effectiveDate: lastDay,
        reason: departureReason ?? "Auto-generated when this employee was marked Departed.",
        createdById: session.sub,
      },
    }),
  ]);

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function reinstateEmployeeAction(employeeId: string) {
  await requireHrAccess();
  await prisma.user.update({
    where: { id: employeeId },
    data: {
      active: true,
      lastDay: null,
      departureReason: null,
      departureRecordedById: null,
      rehireEligible: null,
      exitInterviewNotes: null,
      exitInterviewCompletedAt: null,
    },
  });
  revalidateEmployeeViews(employeeId);
}

// Exit interviews often happen days after someone's last day, not at the
// moment they're marked departed — this lets HR come back and fill in or
// correct rehire eligibility / exit interview notes on an already-departed
// employee without touching lastDay/departureReason.
export async function updateExitInfoAction(
  employeeId: string,
  _prevState: DepartureState,
  formData: FormData
): Promise<DepartureState> {
  try {
    await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { lastDay: true, exitInterviewCompletedAt: true },
  });
  if (!employee?.lastDay) {
    return { error: "This employee isn't marked Departed." };
  }

  const rehireEligibleRaw = String(formData.get("rehireEligible") ?? "");
  const rehireEligible = rehireEligibleRaw === "true" ? true : rehireEligibleRaw === "false" ? false : null;
  const exitInterviewNotes = String(formData.get("exitInterviewNotes") ?? "").trim() || null;
  const exitInterviewCompleted = formData.get("exitInterviewCompleted") === "on";

  await prisma.user.update({
    where: { id: employeeId },
    data: {
      rehireEligible,
      exitInterviewNotes,
      // Keep the original completion timestamp if it was already completed
      // and still is — only set/clear it on an actual state transition.
      exitInterviewCompletedAt: exitInterviewCompleted ? (employee.exitInterviewCompletedAt ?? new Date()) : null,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}
