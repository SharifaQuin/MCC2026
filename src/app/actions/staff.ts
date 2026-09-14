"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { EmploymentType } from "@prisma/client";

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
}

const VALID_EMPLOYMENT_TYPES = new Set(["FULL_TIME", "PART_TIME"]);

export async function setEmployeeProfileFieldsAction(userId: string, formData: FormData) {
  await requireHrAccess();

  const str = (name: string) => String(formData.get(name) ?? "").trim() || null;
  const employmentTypeRaw = String(formData.get("employmentType") ?? "");
  const employmentType = VALID_EMPLOYMENT_TYPES.has(employmentTypeRaw)
    ? (employmentTypeRaw as EmploymentType)
    : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: str("phone"),
      address: str("address"),
      employmentType,
      officeLocation: str("officeLocation"),
      crewType: str("crewType"),
      managerName: str("managerName"),
    },
  });

  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
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
