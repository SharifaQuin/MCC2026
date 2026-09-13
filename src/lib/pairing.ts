import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/staff";

export async function getPairingCandidates(excludeUserId: string) {
  return prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, active: true, id: { not: excludeUserId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getCurrentPairForEmployee(userId: string) {
  const asLead = await prisma.pair.findFirst({
    where: { leadId: userId, active: true },
    include: { assistant: { select: { id: true, name: true } } },
  });
  if (asLead) return { role: "LEAD" as const, pair: asLead, partner: asLead.assistant };

  const asAssistant = await prisma.pair.findFirst({
    where: { assistantId: userId, active: true },
    include: { lead: { select: { id: true, name: true } } },
  });
  if (asAssistant) return { role: "ASSISTANT" as const, pair: asAssistant, partner: asAssistant.lead };

  return null;
}

export interface PairHistoryRow {
  id: string;
  role: "LEAD" | "ASSISTANT";
  partnerName: string;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  createdByName: string;
}

// Pairing history is manager/admin only — never shown to the paired
// employees themselves. Callers must gate access before calling this.
export async function getPairHistoryForEmployee(userId: string): Promise<PairHistoryRow[]> {
  const rows = await prisma.pair.findMany({
    where: { OR: [{ leadId: userId }, { assistantId: userId }] },
    include: {
      lead: { select: { id: true, name: true } },
      assistant: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.leadId === userId ? "LEAD" : "ASSISTANT",
    partnerName: r.leadId === userId ? r.assistant.name : r.lead.name,
    startDate: r.startDate,
    endDate: r.endDate,
    active: r.active,
    createdByName: r.createdBy.name,
  }));
}
