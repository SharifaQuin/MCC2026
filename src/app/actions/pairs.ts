"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface PairState {
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

function revalidateEmployeeViews(employeeId: string, partnerId?: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
  if (partnerId) {
    revalidatePath(`/staff/${partnerId}`);
    revalidatePath(`/admin/employees/${partnerId}`);
  }
}

// Creates a new pair for `employeeId`, playing the given role, with the
// chosen partner — closing out whichever prior active pair(s) that leaves
// either side of (a Lead can only have one active Assistant, and vice versa)
// so the partial unique indexes on Pair never get a chance to reject the
// insert. History is preserved: the old row is closed (active:false,
// endDate), never deleted or overwritten.
export async function createPairAction(
  employeeId: string,
  employeeRole: "LEAD" | "ASSISTANT",
  _prevState: PairState,
  formData: FormData
): Promise<PairState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();

  if (!partnerId) {
    return { error: "Please choose a partner." };
  }
  if (partnerId === employeeId) {
    return { error: "An employee can't be paired with themselves." };
  }

  const partner = await prisma.user.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) {
    return { error: "That partner could not be found." };
  }

  const leadId = employeeRole === "LEAD" ? employeeId : partnerId;
  const assistantId = employeeRole === "LEAD" ? partnerId : employeeId;

  await prisma.$transaction([
    prisma.pair.updateMany({
      where: { leadId, active: true },
      data: { active: false, endDate: startDate },
    }),
    prisma.pair.updateMany({
      where: { assistantId, active: true },
      data: { active: false, endDate: startDate },
    }),
    prisma.pair.create({
      data: { leadId, assistantId, startDate, createdById: session.sub },
    }),
  ]);

  revalidateEmployeeViews(employeeId, partnerId);
  return { success: true };
}

// Ends a pair without starting a replacement (e.g. the pairing dissolved and
// no new partner is assigned yet).
export async function endPairAction(pairId: string, employeeId: string, partnerId: string) {
  await requireHrAccess();
  await prisma.pair.update({
    where: { id: pairId },
    data: { active: false, endDate: new Date() },
  });
  revalidateEmployeeViews(employeeId, partnerId);
}
