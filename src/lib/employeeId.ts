import { prisma } from "@/lib/prisma";

export async function generateNextEmployeeId(): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('employee_id_seq')`;
  return `MCC-${rows[0].nextval.toString().padStart(4, "0")}`;
}
