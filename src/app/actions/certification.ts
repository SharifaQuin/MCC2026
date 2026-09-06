"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface CertActionState {
  error?: string;
  success?: boolean;
}

async function requireTrainerOrAdmin() {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "ADMIN" && session.role !== "TRAINER" && session.role !== "SERVICE_MANAGER")
  ) {
    throw new Error("Not authorized");
  }
  return session;
}

// The final certify/decline call: Admin/Owner or a Service Manager, not a Trainer.
async function requireDecisionMaker() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(traineeId: string) {
  revalidatePath(`/admin/employees/${traineeId}`);
  revalidatePath(`/trainer/employees/${traineeId}`);
  revalidatePath("/admin/employees");
  revalidatePath("/trainer/employees");
  revalidatePath("/admin");
}

export async function recommendForCertificationAction(
  traineeId: string,
  _prevState: CertActionState,
  formData: FormData
): Promise<CertActionState> {
  let session;
  try {
    session = await requireTrainerOrAdmin();
  } catch {
    return { error: "Not authorized." };
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;

  await prisma.user.update({
    where: { id: traineeId },
    data: {
      certificationStatus: "PENDING",
      certRecommendedAt: new Date(),
      certRecommendedById: session.sub,
      certNotes: notes,
      certDecidedAt: null,
      certDecidedById: null,
    },
  });

  revalidateEmployeeViews(traineeId);
  return { success: true };
}

export async function certifyAction(traineeId: string): Promise<CertActionState> {
  try {
    await requireDecisionMaker();
  } catch {
    return { error: "Not authorized." };
  }

  await prisma.user.update({
    where: { id: traineeId },
    data: {
      certificationStatus: "CERTIFIED",
      certDecidedAt: new Date(),
      certDecidedById: (await getSession())!.sub,
    },
  });

  revalidateEmployeeViews(traineeId);
  return { success: true };
}

export async function declineAction(
  traineeId: string,
  _prevState: CertActionState,
  formData: FormData
): Promise<CertActionState> {
  let session;
  try {
    session = await requireDecisionMaker();
  } catch {
    return { error: "Not authorized." };
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!notes) {
    return { error: "Please give a reason so the trainer knows what to work on." };
  }

  await prisma.user.update({
    where: { id: traineeId },
    data: {
      certificationStatus: "DECLINED",
      certDecidedAt: new Date(),
      certDecidedById: session.sub,
      certNotes: notes,
    },
  });

  revalidateEmployeeViews(traineeId);
  return { success: true };
}

export async function revertCertificationAction(traineeId: string) {
  await requireDecisionMaker();
  await prisma.user.update({
    where: { id: traineeId },
    data: {
      certificationStatus: "NOT_RECOMMENDED",
      certRecommendedAt: null,
      certRecommendedById: null,
      certDecidedAt: null,
      certDecidedById: null,
      certNotes: null,
    },
  });
  revalidateEmployeeViews(traineeId);
}
