"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface ComplaintState {
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

export async function createComplaintAction(
  employeeId: string,
  _prevState: ComplaintState,
  formData: FormData
): Promise<ComplaintState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const clientName = String(formData.get("clientName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const incidentDateRaw = String(formData.get("incidentDate") ?? "");
  const incidentDate = incidentDateRaw ? new Date(incidentDateRaw) : null;

  if (!clientName || !description) {
    return { error: "Please fill in the client name and a description." };
  }

  await prisma.complaint.create({
    data: {
      employeeId,
      loggedById: session.sub,
      clientName,
      description,
      incidentDate,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

export async function setComplaintStatusAction(
  complaintId: string,
  employeeId: string,
  status: "OPEN" | "VALID" | "DISMISSED",
  resolutionNotes: string
) {
  await requireHrAccess();

  await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status,
      resolutionNotes: resolutionNotes.trim() || null,
      resolvedAt: status === "OPEN" ? null : new Date(),
    },
  });

  revalidateEmployeeViews(employeeId);
}

export async function deleteComplaintAction(complaintId: string, employeeId: string) {
  await requireHrAccess();
  await prisma.complaint.delete({ where: { id: complaintId } });
  revalidateEmployeeViews(employeeId);
}
