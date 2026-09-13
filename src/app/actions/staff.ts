"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
}

export async function setHireDateAction(userId: string, formData: FormData) {
  await requireHrAccess();

  const hireDateRaw = String(formData.get("hireDate") ?? "");
  if (!hireDateRaw) return;

  await prisma.user.update({
    where: { id: userId },
    data: { hireDate: new Date(hireDateRaw) },
  });

  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
}
