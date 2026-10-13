import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { ProblemReportCategory } from "@prisma/client";

async function requireOwnerAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

// Any logged-in role can file one — this is intentionally wide open, unlike
// the queue that reads them back.
export async function submitProblemReport(category: ProblemReportCategory, description: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authorized");
  const trimmed = description.trim();
  if (!trimmed) throw new Error("Please describe what happened.");

  await prisma.problemReport.create({
    data: {
      reporterId: session.sub,
      reporterName: session.name,
      reporterRole: session.role,
      category,
      description: trimmed,
    },
  });
}

// ADMIN (the Owner) only — not Service Manager, since a report might be
// about a Service Manager, and this is explicitly "my owner dashboard," not
// a general management queue like Pending Approvals.
export async function getProblemReportsForOwner() {
  await requireOwnerAccess();
  return prisma.problemReport.findMany({ orderBy: { createdAt: "desc" } });
}

export async function setProblemReportStatus(id: string, status: "OPEN" | "RESOLVED") {
  await requireOwnerAccess();
  await prisma.problemReport.update({ where: { id }, data: { status } });
}
